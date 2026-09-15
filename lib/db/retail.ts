import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { InventoryDataError, lockProduct, recordStockChange } from "./stock";
import { retailSaleSchema } from "../validation/retail";
import { retailTotal } from "../retail/total";

export async function createRetailSale(input: unknown) {
  const user = await requireAdminMember();
  const parsed = retailSaleSchema.parse(input);
  const identity = { userId: user.id, tenantId: user.tenantId, role: user.role };
  return runInTenantTransaction(identity, async (tx) => {
    // A browser retry with the same receipt UUID must not charge or deduct twice.
    await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtextextended(${`retail:${user.tenantId}:${parsed.id}`}, 0))`;
    const previous = await tx.retailSale.findFirst({
      where: { id: parsed.id, tenantId: user.tenantId },
      select: { id: true },
    });
    if (previous) return previous;

    if (
      parsed.clientId &&
      !(await tx.client.findFirst({
        where: {
          id: parsed.clientId,
          tenantId: user.tenantId,
          active: true,
          isDeleted: false,
        },
        select: { id: true },
      }))
    ) {
      throw new InventoryDataError("Le client sélectionné est introuvable ou archivé.");
    }

    // Hold the product row through the price check, deduction and receipt creation.
    const product = await lockProduct(tx, user.tenantId, parsed.productId);
    if (product.salePrice !== parsed.expectedUnitPrice) {
      throw new InventoryDataError(
        "Le prix du produit a changé. Actualisez la page avant de confirmer.",
      );
    }
    let total: number;
    try {
      total = retailTotal(parsed.quantity, product.salePrice);
    } catch (error) {
      throw new InventoryDataError(error instanceof Error ? error.message : "Total invalide.");
    }

    const movement = await recordStockChange(tx, identity, {
      productId: product.id,
      type: "sale",
      quantity: parsed.quantity,
      reason: `Vente produit · reçu ${parsed.id}`,
    });
    return tx.retailSale.create({
      data: {
        id: parsed.id,
        tenantId: user.tenantId,
        clientId: parsed.clientId,
        productId: product.id,
        recordedById: user.id,
        stockMovementId: movement.id,
        productName: product.name,
        unit: product.unit,
        quantity: parsed.quantity,
        unitPrice: product.salePrice,
        total,
        method: parsed.method,
        soldAt: parsed.soldAt,
      },
      select: { id: true },
    });
  });
}

export async function getRetailPage(page = 1, clientId?: string) {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const where = { tenantId: user.tenantId, ...(clientId ? { clientId } : {}) };
      const total = await tx.retailSale.count({ where });
      const current = Math.min(page, Math.max(1, Math.ceil(total / 25)));
      const [sales, products, recentClients] = await Promise.all([
        tx.retailSale.findMany({
          where,
          orderBy: [{ soldAt: "desc" }, { id: "desc" }],
          take: 25,
          skip: (current - 1) * 25,
          include: { client: { select: { name: true } } },
        }),
        tx.product.findMany({
          where: {
            tenantId: user.tenantId,
            active: true,
            isDeleted: false,
            salePrice: { gt: 0 },
            stockQuantity: { gt: 0 },
          },
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            unit: true,
            salePrice: true,
            stockQuantity: true,
          },
        }),
        tx.client.findMany({
          where: { tenantId: user.tenantId, active: true, isDeleted: false },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: 100,
          select: { id: true, name: true, phone: true, email: true },
        }),
      ]);
      const clients = [...recentClients];
      if (clientId && !clients.some((client) => client.id === clientId)) {
        const selected = await tx.client.findFirst({
          where: { id: clientId, tenantId: user.tenantId, active: true, isDeleted: false },
          select: { id: true, name: true, phone: true, email: true },
        });
        if (selected) clients.unshift(selected);
      }
      return {
        sales,
        products: products.map((row) => ({
          ...row,
          stockQuantity: row.stockQuantity.toString(),
        })),
        clients,
        total,
        page: current,
      };
    },
  );
}

export async function getRetailReceipt(id: string) {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const sale = await tx.retailSale.findFirst({
        where: { id, tenantId: user.tenantId },
        include: {
          client: { select: { name: true } },
          recordedBy: { select: { fullName: true } },
        },
      });
      return sale ? { sale, salon: user.tenant.name } : null;
    },
  );
}
