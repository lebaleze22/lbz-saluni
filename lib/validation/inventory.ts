import { z } from "zod";
import { optionalText } from "./clients";
import { quantityToThousandths, thousandthsToQuantity } from "../inventory/quantities";

export function quantitySchema(allowZero = true) {
  return z.union([z.string(), z.number()]).transform((value, ctx) => {
    try {
      const amount = quantityToThousandths(String(value));
      if (!allowZero && amount === 0) throw new Error("La quantité doit être supérieure à zéro.");
      return thousandthsToQuantity(amount);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Quantité invalide.",
      });
      return z.NEVER;
    }
  });
}

const money = z.coerce.number().int().min(0).max(2_147_483_647);
export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Le nom du produit est requis.").max(120),
  sku: optionalText(60).transform((value) => value?.toUpperCase()),
  unit: z.enum(["unité", "ml", "g"], { message: "Choisissez une unité de stock." }),
  costPrice: money,
  salePrice: money,
  lowStockThreshold: quantitySchema(),
});
export const productCreateSchema = productInputSchema.extend({ initialStock: quantitySchema() });
export const productMutationSchema = productInputSchema.extend({ id: z.uuid() });
export const productStatusSchema = z.object({
  id: z.uuid(),
  operation: z.enum(["archive", "restore"]),
});
export const stockMovementSchema = z
  .object({
    productId: z.uuid(),
    type: z.enum(["restock", "sale", "adjustment"]),
    quantity: quantitySchema(),
    reason: z.string().trim().min(3, "Précisez le motif du mouvement.").max(500),
  })
  .superRefine((value, ctx) => {
    if (value.type !== "adjustment" && Number(value.quantity) === 0)
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "La quantité doit être positive.",
      });
  });
export const serviceProductSchema = z.object({
  serviceId: z.uuid(),
  productId: z.uuid(),
  quantity: quantitySchema(false),
});
export const removeServiceProductSchema = z.object({ serviceId: z.uuid(), productId: z.uuid() });
export const inventoryFiltersSchema = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["active", "low", "archived"]).default("active"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type ProductInput = z.infer<typeof productInputSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type InventoryFilters = z.infer<typeof inventoryFiltersSchema>;
