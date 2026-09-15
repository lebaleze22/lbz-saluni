import type { Prisma } from "@prisma/client";
import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { recordStockChange } from "./stock";
import { InventoryFileError, INVENTORY_ROW_LIMIT } from "../inventory/files";
import { quantityToThousandths } from "../inventory/quantities";
import { inventoryImportRowSchema, type InventoryImportRow } from "../validation/inventory-import";

type ExistingProduct = Prisma.ProductGetPayload<{
  include: { _count: { select: { movements: true; services: true } } };
}>;
type Plan = {
  row: InventoryImportRow;
  product?: ExistingProduct;
  action: "create" | "update" | "unchanged";
};

const sameQuantity = (left: string, right: { toString(): string }) =>
  quantityToThousandths(left) === quantityToThousandths(right.toString());

function planRows(rows: InventoryImportRow[], existing: ExistingProduct[]): Plan[] {
  const byId = new Map(existing.map((product) => [product.id, product]));
  const bySku = new Map<string, ExistingProduct[]>();
  for (const product of existing) {
    if (!product.sku) continue;
    const key = product.sku.toUpperCase();
    bySku.set(key, [...(bySku.get(key) ?? []), product]);
  }
  const targets = new Set<string>();
  const plans = rows.map((row, index): Plan => {
    let product: ExistingProduct | undefined;
    if (row.id) {
      product = byId.get(row.id);
      if (!product)
        throw new InventoryFileError(
          `Ligne ${index + 2} : l’ID produit est inconnu dans ce salon.`,
        );
    } else if (row.sku) {
      const matches = bySku.get(row.sku.toUpperCase()) ?? [];
      if (matches.length > 1)
        throw new InventoryFileError(
          `Ligne ${index + 2} : le SKU correspond à plusieurs produits.`,
        );
      product = matches[0];
    }
    if (product) {
      if (targets.has(product.id))
        throw new InventoryFileError(`Ligne ${index + 2} : ce produit est ciblé plusieurs fois.`);
      targets.add(product.id);
      if (row.unit !== product.unit && (product._count.movements || product._count.services))
        throw new InventoryFileError(
          `Ligne ${index + 2} : l’unité ne peut plus changer après un mouvement ou une consommation configurée.`,
        );
      if (row.status === "archived") {
        if (Number(row.stockQuantity) !== 0)
          throw new InventoryFileError(
            `Ligne ${index + 2} : un produit archivé doit avoir un stock nul.`,
          );
        if (product._count.services)
          throw new InventoryFileError(
            `Ligne ${index + 2} : retirez d’abord ce produit des consommations de prestations.`,
          );
      }
      const unchanged =
        row.name === product.name &&
        (row.sku ?? null) === product.sku &&
        row.unit === product.unit &&
        row.costPrice === product.costPrice &&
        row.salePrice === product.salePrice &&
        sameQuantity(row.lowStockThreshold, product.lowStockThreshold) &&
        sameQuantity(row.stockQuantity, product.stockQuantity) &&
        (row.status === "archived"
          ? product.isDeleted && !product.active
          : !product.isDeleted && product.active);
      return { row, product, action: unchanged ? "unchanged" : "update" };
    }
    if (!row.sku)
      throw new InventoryFileError(
        `Ligne ${index + 2} : le SKU est obligatoire pour créer un nouveau produit.`,
      );
    if (row.status === "archived" && Number(row.stockQuantity) !== 0)
      throw new InventoryFileError(
        `Ligne ${index + 2} : un nouveau produit archivé doit avoir un stock nul.`,
      );
    return { row, action: "create" };
  });

  const finalSkus = new Map<string, string>();
  const targeted = new Map(
    plans.flatMap((plan) => (plan.product ? [[plan.product.id, plan]] : [])),
  );
  for (const product of existing) {
    const sku =
      targeted.get(product.id)?.row.sku ?? (targets.has(product.id) ? undefined : product.sku);
    if (!sku) continue;
    const key = sku.toUpperCase();
    if (finalSkus.has(key))
      throw new InventoryFileError(`Le SKU « ${sku} » serait utilisé plusieurs fois.`);
    finalSkus.set(key, product.id);
  }
  plans.forEach((plan, index) => {
    if (plan.product || !plan.row.sku) return;
    const key = plan.row.sku.toUpperCase();
    if (finalSkus.has(key))
      throw new InventoryFileError(
        `Ligne ${index + 2} : le SKU « ${plan.row.sku} » est déjà utilisé.`,
      );
    finalSkus.set(key, `new-${index}`);
  });
  return plans;
}

export async function importInventory(inputs: InventoryImportRow[], commit: boolean) {
  const user = await requireAdminMember();
  if (!inputs.length || inputs.length > INVENTORY_ROW_LIMIT)
    throw new InventoryFileError("Import vide ou trop volumineux.");
  const rows = inputs.map((input) => inventoryImportRowSchema.parse(input));
  const identity = { userId: user.id, tenantId: user.tenantId, role: user.role };
  return runInTenantTransaction(identity, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"inventory-import:" + user.tenantId}, 0))`;
    const loadExisting = () =>
      tx.product.findMany({
        where: { tenantId: user.tenantId },
        include: { _count: { select: { movements: true, services: true } } },
      });
    let plans = planRows(rows, await loadExisting());
    const targetIds = plans.flatMap((plan) => (plan.product ? [plan.product.id] : [])).sort();
    if (targetIds.length) {
      await tx.$queryRaw`SELECT id FROM products WHERE tenant_id = ${user.tenantId}::uuid AND id = ANY(${targetIds}::uuid[]) ORDER BY id FOR UPDATE`;
      plans = planRows(rows, await loadExisting());
    }
    const counts = {
      created: plans.filter((plan) => plan.action === "create").length,
      updated: plans.filter((plan) => plan.action === "update").length,
      unchanged: plans.filter((plan) => plan.action === "unchanged").length,
      rejected: 0,
      total: plans.length,
    };
    const samples = plans.slice(0, 10).map((plan) => ({
      name: plan.row.name,
      sku: plan.row.sku,
      stockQuantity: plan.row.stockQuantity,
      action: plan.action,
    }));
    if (!commit) return { ...counts, samples };

    // Clear changing SKUs first so final assignments cannot collide during valid swaps.
    for (const plan of plans) {
      if (plan.product && plan.product.sku !== (plan.row.sku ?? null))
        await tx.product.update({ where: { id: plan.product.id }, data: { sku: null } });
    }
    for (const plan of plans) {
      if (plan.action === "unchanged") continue;
      const row = plan.row;
      if (!plan.product) {
        const product = await tx.product.create({
          data: {
            tenantId: user.tenantId,
            name: row.name,
            sku: row.sku ?? null,
            unit: row.unit,
            costPrice: row.costPrice,
            salePrice: row.salePrice,
            lowStockThreshold: row.lowStockThreshold,
            active: row.status === "active",
            isDeleted: row.status === "archived",
            deletedAt: row.status === "archived" ? new Date() : null,
          },
          select: { id: true },
        });
        if (Number(row.stockQuantity) > 0)
          await recordStockChange(tx, identity, {
            productId: product.id,
            type: "restock",
            quantity: row.stockQuantity,
            reason: "Import inventaire — stock initial",
          });
        continue;
      }
      const product = plan.product;
      const targetArchived = row.status === "archived";
      await tx.product.update({
        where: { id: product.id },
        data: {
          name: row.name,
          sku: row.sku ?? null,
          unit: row.unit,
          costPrice: row.costPrice,
          salePrice: row.salePrice,
          lowStockThreshold: row.lowStockThreshold,
          active: true,
          isDeleted: false,
          deletedAt: null,
        },
      });
      if (!sameQuantity(row.stockQuantity, product.stockQuantity))
        await recordStockChange(tx, identity, {
          productId: product.id,
          type: "adjustment",
          quantity: row.stockQuantity,
          reason: "Import inventaire — comptage physique",
        });
      if (targetArchived)
        await tx.product.update({
          where: { id: product.id },
          data: { active: false, isDeleted: true, deletedAt: new Date() },
        });
    }
    return { ...counts, samples: [] };
  });
}
