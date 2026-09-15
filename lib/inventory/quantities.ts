// Fixed thousandths avoid cumulative floating-point errors for ml/g and fractional units.
export const MAX_QUANTITY = 999_999_999_999;

export function quantityToThousandths(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(normalized))
    throw new Error("Quantité invalide (3 décimales maximum).");
  const [whole, fraction = ""] = normalized.split(".");
  return Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
}

export function thousandthsToQuantity(value: number): string {
  if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_QUANTITY)
    throw new Error("Quantité hors limites.");
  const absolute = Math.abs(value);
  return `${value < 0 ? "-" : ""}${Math.floor(absolute / 1000)}.${String(absolute % 1000).padStart(3, "0")}`;
}

export function planConsumption(rows: { productId: string; quantity: string }[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const amount = quantityToThousandths(row.quantity);
    if (amount <= 0) throw new Error("La consommation doit être positive.");
    totals.set(row.productId, (totals.get(row.productId) ?? 0) + amount);
  }
  return Array.from(totals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, amount]) => ({
      productId,
      quantity: thousandthsToQuantity(amount),
    }));
}

export function formatQuantity(value: string | number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(Number(value));
}
