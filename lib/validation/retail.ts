import { z } from "zod";
import { quantitySchema } from "./inventory";

export const retailSaleSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  clientId: z.preprocess((value) => value || undefined, z.uuid().optional()),
  quantity: quantitySchema(false),
  expectedUnitPrice: z.coerce.number().int().positive().max(2_147_483_647),
  method: z.enum(["cash", "orange_money", "mtn_momo"]),
  soldAt: z.coerce
    .date()
    .refine((date) => date.getTime() <= Date.now() + 60_000, "La date ne peut pas être future."),
});
