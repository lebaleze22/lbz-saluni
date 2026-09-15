import { quantityToThousandths } from "../inventory/quantities";

export function retailTotal(quantity: string, unitPrice: number) {
  if (!Number.isInteger(unitPrice) || unitPrice <= 0 || unitPrice > 2_147_483_647) {
    throw new Error("Renseignez un prix de vente positif dans la fiche produit.");
  }
  const total =
    (BigInt(quantityToThousandths(quantity)) * BigInt(unitPrice) + BigInt(500)) / BigInt(1000);
  if (total <= BigInt(0) || total > BigInt(2_147_483_647)) {
    throw new Error("Le total doit être compris entre 1 et 2 147 483 647 FCFA.");
  }
  return Number(total);
}
