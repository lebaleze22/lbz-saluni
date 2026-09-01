import { z } from "zod";
import { dateStringSchema } from "./common";

const optionalCategorySchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(120, "La catégorie est trop longue.").optional(),
);

export const expenseInputSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "La description est requise.")
    .max(240, "La description est trop longue."),
  amount: z.coerce
    .number()
    .int("Le montant doit être un nombre entier.")
    .positive("Le montant doit être supérieur à zéro.")
    .max(2_147_483_647, "Le montant renseigné est trop élevé."),
  category: optionalCategorySchema,
  occurredAt: dateStringSchema,
});

export const expenseMutationSchema = expenseInputSchema.extend({
  id: z.string().uuid("La dépense est invalide."),
});

export const expenseStatusSchema = z.object({
  id: z.string().uuid("La dépense est invalide."),
  operation: z.enum(["archive", "restore"]),
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type ExpenseStatusOperation = z.infer<typeof expenseStatusSchema>["operation"];
