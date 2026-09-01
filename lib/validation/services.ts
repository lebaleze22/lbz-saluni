import { z } from "zod";

const optionalCategoryId = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().uuid("La catégorie sélectionnée est invalide.").optional(),
);

const optionalNewCategory = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().max(120, "Le nom de la catégorie est trop long.").optional(),
);

export const serviceInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Le nom de la prestation est requis.")
      .max(120, "Le nom de la prestation est trop long."),
    defaultPrice: z.coerce
      .number()
      .int("Le prix doit être un montant entier.")
      .positive("Le prix doit être supérieur à zéro.")
      .max(2_147_483_647, "Le prix renseigné est trop élevé."),
    categoryId: optionalCategoryId,
    newCategory: optionalNewCategory,
  })
  .superRefine((value, context) => {
    if (!value.categoryId && !value.newCategory) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Sélectionnez ou créez une catégorie.",
      });
    }
    if (value.categoryId && value.newCategory) {
      context.addIssue({
        code: "custom",
        path: ["newCategory"],
        message: "Sélectionnez une catégorie existante ou créez-en une nouvelle, pas les deux.",
      });
    }
  });

export const serviceMutationSchema = serviceInputSchema.safeExtend({
  id: z.string().uuid("La prestation est invalide."),
});

export const serviceStatusSchema = z.object({
  id: z.string().uuid("La prestation est invalide."),
  operation: z.enum(["activate", "deactivate", "archive", "restore"]),
});

export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type ServiceStatusOperation = z.infer<typeof serviceStatusSchema>["operation"];
