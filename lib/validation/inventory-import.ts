import { z } from "zod";
import { productInputSchema, quantitySchema } from "./inventory";

export const inventoryImportRowSchema = productInputSchema.extend({
  id: z.preprocess((value) => (value === "" ? undefined : value), z.uuid().optional()),
  stockQuantity: quantitySchema(),
  status: z.enum(["active", "archived"]),
});

export type InventoryImportRow = z.infer<typeof inventoryImportRowSchema>;
