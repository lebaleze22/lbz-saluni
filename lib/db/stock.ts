import type { Prisma, StockMovementType } from "@prisma/client";
import type { RlsIdentity } from "./rls-session";
import {
  planConsumption,
  quantityToThousandths,
  thousandthsToQuantity,
} from "../inventory/quantities";

export class InventoryDataError extends Error {}

export async function lockProduct(
  tx: Prisma.TransactionClient,
  tenantId: string,
  productId: string,
) {
  await tx.$queryRaw`SELECT id FROM products WHERE id = ${productId}::uuid AND tenant_id = ${tenantId}::uuid FOR UPDATE`;
  const product = await tx.product.findFirst({
    where: { id: productId, tenantId, active: true, isDeleted: false },
  });
  if (!product) throw new InventoryDataError("Ce produit est introuvable ou archivé.");
  return product;
}

export async function recordStockChange(
  tx: Prisma.TransactionClient,
  identity: RlsIdentity,
  input: {
    productId: string;
    type: StockMovementType;
    quantity: string;
    reason: string;
    appointmentId?: string;
  },
) {
  const product = await lockProduct(tx, identity.tenantId, input.productId);
  const current = quantityToThousandths(product.stockQuantity.toString());
  const amount = quantityToThousandths(input.quantity);
  const delta =
    input.type === "adjustment" ? amount - current : input.type === "restock" ? amount : -amount;
  if (delta === 0) throw new InventoryDataError("Le stock correspond déjà à cette quantité.");
  const after = current + delta;
  if (after < 0)
    throw new InventoryDataError(
      `Stock insuffisant pour « ${product.name} » : ${product.stockQuantity.toString()} ${product.unit} disponible(s).`,
    );
  let balance: string;
  try {
    balance = thousandthsToQuantity(after);
  } catch {
    throw new InventoryDataError("Le stock résultant dépasse la quantité maximale autorisée.");
  }

  // The row lock is held until the enclosing tenant transaction commits. Balance and
  // audit entry are committed together, including automatic consumption and visit data.
  await tx.product.update({ where: { id: product.id }, data: { stockQuantity: balance } });
  return tx.stockMovement.create({
    data: {
      tenantId: identity.tenantId,
      productId: product.id,
      recordedById: identity.userId,
      appointmentId: input.appointmentId,
      type: input.type,
      quantity: thousandthsToQuantity(delta),
      balanceAfter: balance,
      productName: product.name,
      unit: product.unit,
      unitCost: product.costPrice,
      reason: input.reason,
    },
    select: { id: true },
  });
}

export async function consumeVisitProducts(
  tx: Prisma.TransactionClient,
  identity: RlsIdentity,
  appointmentId: string,
  serviceIds: string[],
) {
  const recipes = await tx.serviceProduct.findMany({
    where: { tenantId: identity.tenantId, serviceId: { in: serviceIds } },
    select: { productId: true, quantity: true },
  });
  let plan: ReturnType<typeof planConsumption>;
  try {
    plan = planConsumption(recipes.map((row) => ({ ...row, quantity: row.quantity.toString() })));
  } catch {
    throw new InventoryDataError("La consommation configurée dépasse les quantités autorisées.");
  }
  // Stable lock order prevents two visits consuming shared products from deadlocking.
  for (const item of plan) {
    await recordStockChange(tx, identity, {
      ...item,
      type: "consumption",
      appointmentId,
      reason: "Consommation des prestations de la visite",
    });
  }
}
