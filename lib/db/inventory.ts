import type { Prisma } from "@prisma/client";
import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { InventoryDataError, lockProduct, recordStockChange } from "./stock";
import type { InventoryFilters, ProductInput, StockMovementInput } from "../validation/inventory";

export { InventoryDataError } from "./stock";
export const INVENTORY_PAGE_SIZE = 25;
export const MOVEMENT_PAGE_SIZE = 30;
const identity = (user: { id: string; tenantId: string; role: string }) => ({
  userId: user.id,
  tenantId: user.tenantId,
  role: user.role,
});
const serialProduct = <
  T extends { stockQuantity: Prisma.Decimal; lowStockThreshold: Prisma.Decimal },
>(
  product: T,
) => ({
  ...product,
  stockQuantity: product.stockQuantity.toString(),
  lowStockThreshold: product.lowStockThreshold.toString(),
});

export async function getInventoryPageData(filters: InventoryFilters) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    const active = { tenantId: user.tenantId, active: true, isDeleted: false };
    const low = { ...active, stockQuantity: { lte: tx.product.fields.lowStockThreshold } };
    const where: Prisma.ProductWhereInput = {
      ...(filters.status === "low"
        ? low
        : { tenantId: user.tenantId, isDeleted: filters.status === "archived" }),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { sku: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [total, activeCount, lowCount] = await Promise.all([
      tx.product.count({ where }),
      tx.product.count({ where: active }),
      tx.product.count({ where: low }),
    ]);
    const page = Math.min(filters.page, Math.max(1, Math.ceil(total / INVENTORY_PAGE_SIZE)));
    const products = await tx.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: INVENTORY_PAGE_SIZE,
      skip: (page - 1) * INVENTORY_PAGE_SIZE,
    });
    return { products: products.map(serialProduct), total, page, activeCount, lowCount };
  });
}

export async function getProductDetail(id: string, requestedPage = 1) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    const product = await tx.product.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!product) return null;
    const total = await tx.stockMovement.count({
      where: { tenantId: user.tenantId, productId: id },
    });
    const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / MOVEMENT_PAGE_SIZE)));
    const [movements, recipes] = await Promise.all([
      tx.stockMovement.findMany({
        where: { tenantId: user.tenantId, productId: id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MOVEMENT_PAGE_SIZE,
        skip: (page - 1) * MOVEMENT_PAGE_SIZE,
        include: {
          recordedBy: { select: { fullName: true } },
          appointment: { select: { clientId: true } },
        },
      }),
      tx.serviceProduct.findMany({
        where: { tenantId: user.tenantId, productId: id },
        include: { service: { select: { id: true, name: true } } },
      }),
    ]);
    return {
      product: serialProduct(product),
      page,
      total,
      movements: movements.map((movement) => ({
        ...movement,
        quantity: movement.quantity.toString(),
        balanceAfter: movement.balanceAfter.toString(),
      })),
      recipes: recipes.map((row) => ({ ...row, quantity: row.quantity.toString() })),
    };
  });
}

export async function createProduct(input: ProductInput & { initialStock: string }) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    const { initialStock, ...fields } = input;
    const product = await tx.product.create({
      data: { ...fields, sku: fields.sku || null, tenantId: user.tenantId },
      select: { id: true },
    });
    if (Number(initialStock) > 0)
      await recordStockChange(tx, identity(user), {
        productId: product.id,
        type: "restock",
        quantity: initialStock,
        reason: "Stock initial",
      });
    return product;
  });
}

export async function updateProduct(id: string, input: ProductInput) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    const product = await lockProduct(tx, user.tenantId, id);
    if (input.unit !== product.unit) {
      const [movements, recipes] = await Promise.all([
        tx.stockMovement.count({ where: { tenantId: user.tenantId, productId: id } }),
        tx.serviceProduct.count({ where: { tenantId: user.tenantId, productId: id } }),
      ]);
      if (movements || recipes)
        throw new InventoryDataError(
          "L’unité ne peut plus changer après un mouvement ou une association à une prestation.",
        );
    }
    return tx.product.update({
      where: { id },
      data: { ...input, sku: input.sku || null },
      select: { id: true },
    });
  });
}

export async function moveStock(input: StockMovementInput) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), (tx) =>
    recordStockChange(tx, identity(user), input),
  );
}

export async function changeProductStatus(id: string, operation: "archive" | "restore") {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid AND tenant_id = ${user.tenantId}::uuid FOR UPDATE`;
    const product = await tx.product.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!product || product.isDeleted !== (operation === "restore"))
      throw new InventoryDataError("L’état du produit a changé. Actualisez la page.");
    if (operation === "archive") {
      if (!product.stockQuantity.isZero())
        throw new InventoryDataError(
          "Enregistrez d’abord la sortie ou le comptage du stock restant.",
        );
      if (await tx.serviceProduct.count({ where: { tenantId: user.tenantId, productId: id } }))
        throw new InventoryDataError(
          "Retirez d’abord ce produit des consommations de prestations.",
        );
    }
    return tx.product.update({
      where: { id },
      data:
        operation === "archive"
          ? { active: false, isDeleted: true, deletedAt: new Date() }
          : { active: true, isDeleted: false, deletedAt: null },
      select: { id: true },
    });
  });
}

export async function getServiceProductsData(serviceId?: string) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    const [services, products] = await Promise.all([
      tx.service.findMany({
        where: { tenantId: user.tenantId },
        orderBy: [{ isDeleted: "asc" }, { name: "asc" }],
        select: { id: true, name: true, active: true, isDeleted: true },
      }),
      tx.product.findMany({
        where: { tenantId: user.tenantId, active: true, isDeleted: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, unit: true },
      }),
    ]);
    const selected = services.find((service) => service.id === serviceId) ?? services[0];
    const recipes = selected
      ? await tx.serviceProduct.findMany({
          where: { tenantId: user.tenantId, serviceId: selected.id },
          orderBy: { product: { name: "asc" } },
          include: { product: { select: { name: true, unit: true } } },
        })
      : [];
    return {
      services,
      products,
      selected,
      recipes: recipes.map((row) => ({ ...row, quantity: row.quantity.toString() })),
    };
  });
}

export async function saveServiceProduct(
  serviceId: string,
  productId: string,
  quantity: string | null,
) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    // Product locking also serializes recipe insertion with archiving/unit changes.
    await lockProduct(tx, user.tenantId, productId);
    const service = await tx.service.findFirst({
      where: {
        id: serviceId,
        tenantId: user.tenantId,
        ...(quantity === null ? {} : { isDeleted: false, active: true }),
      },
      select: { id: true },
    });
    if (!service) throw new InventoryDataError("Cette prestation est introuvable ou archivée.");
    if (quantity === null) {
      await tx.serviceProduct.deleteMany({
        where: { tenantId: user.tenantId, serviceId, productId },
      });
      return;
    }
    await tx.serviceProduct.upsert({
      where: { serviceId_productId: { serviceId, productId } },
      create: { tenantId: user.tenantId, serviceId, productId, quantity },
      update: { quantity },
    });
  });
}
