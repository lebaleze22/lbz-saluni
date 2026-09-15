import { z } from "zod";

const optionalText = (maximum: number, message: string) =>
  z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && value.trim() === "") ? undefined : value,
    z.string().trim().max(maximum, message).optional(),
  );

const optionalUuid = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  z.string().uuid("Le poste principal est invalide.").optional(),
);

const optionalPassword = z.preprocess(
  (value) => (value == null || value === "" ? undefined : value),
  z.string().optional(),
);

const jobTitleIdsSchema = z
  .array(z.string().uuid("Un poste sélectionné est invalide."))
  .max(20, "Vous ne pouvez pas attribuer plus de 20 postes.");

const staffTitlesSchema = {
  jobTitleIds: jobTitleIdsSchema,
  primaryJobTitleId: optionalUuid,
};

export const staffCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis.").max(120, "Le nom est trop long."),
    sex: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["homme", "femme"]).optional(),
    ),
    phone: optionalText(30, "Le numéro de téléphone est trop long."),
    residence: optionalText(160, "La résidence est trop longue."),
    idType: z.preprocess(
      (value) => (value == null || value === "" ? undefined : value),
      z.enum(["cni", "passeport"]).optional(),
    ),
    idNumber: optionalText(80, "Le numéro de pièce est trop long."),
    yearsOfExperience: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce.number().int("Le nombre d’années doit être entier.").min(0).max(80).optional(),
    ),
    ...staffTitlesSchema,
    newJobTitle: optionalText(120, "Le poste est trop long."),
    newJobTitleIsPrimary: z.preprocess(
      (value) => value === true || value === "true" || value === "on",
      z.boolean(),
    ),
    payType: z.enum(["fixed_salary", "commission"], {
      message: "Choisissez un type de paie.",
    }),
    payAmount: z.coerce.number().positive("Le montant doit être supérieur à zéro."),
    systemRole: z.enum(["none", "director", "manager"]),
    email: optionalText(254, "L’adresse e-mail est trop longue."),
    password: optionalPassword,
  })
  .superRefine((value, context) => {
    if (value.systemRole === "manager") {
      context.addIssue({
        code: "custom",
        path: ["systemRole"],
        message:
          "L’espace Manager n’est pas encore disponible. Choisissez Director ou aucun accès.",
      });
    }
    const selected = new Set(value.jobTitleIds);
    if (selected.size !== value.jobTitleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["jobTitleIds"],
        message: "Un poste est sélectionné plusieurs fois.",
      });
    }
    if (
      (selected.size > 0 || value.newJobTitle) &&
      !value.primaryJobTitleId &&
      !value.newJobTitleIsPrimary
    ) {
      context.addIssue({
        code: "custom",
        path: ["primaryJobTitleId"],
        message: "Désignez un poste principal.",
      });
    }
    if (value.primaryJobTitleId && !selected.has(value.primaryJobTitleId)) {
      context.addIssue({
        code: "custom",
        path: ["primaryJobTitleId"],
        message: "Le poste principal doit faire partie des postes sélectionnés.",
      });
    }
    if (value.newJobTitleIsPrimary && !value.newJobTitle) {
      context.addIssue({
        code: "custom",
        path: ["newJobTitle"],
        message: "Saisissez le nouveau poste principal.",
      });
    }
    if (value.primaryJobTitleId && value.newJobTitleIsPrimary) {
      context.addIssue({
        code: "custom",
        path: ["primaryJobTitleId"],
        message: "Un seul poste principal peut être désigné.",
      });
    }
    if ((value.idType && !value.idNumber) || (!value.idType && value.idNumber)) {
      context.addIssue({
        code: "custom",
        path: value.idType ? ["idNumber"] : ["idType"],
        message: "Le type et le numéro de pièce doivent être renseignés ensemble.",
      });
    }
    if (value.payType === "commission" && value.payAmount > 100) {
      context.addIssue({
        code: "custom",
        path: ["payAmount"],
        message: "Le taux de commission ne peut pas dépasser 100 %.",
      });
    }
    if (value.payType === "fixed_salary" && !Number.isInteger(value.payAmount)) {
      context.addIssue({
        code: "custom",
        path: ["payAmount"],
        message: "Le salaire fixe doit être un montant entier en FCFA.",
      });
    }
    if (value.payType === "fixed_salary" && value.payAmount > 2_147_483_647) {
      context.addIssue({
        code: "custom",
        path: ["payAmount"],
        message: "Le salaire dépasse le montant autorisé.",
      });
    }
    if (value.systemRole !== "none") {
      if (!z.string().email().safeParse(value.email).success) {
        context.addIssue({
          code: "custom",
          path: ["email"],
          message: "Une adresse e-mail valide est requise.",
        });
      }
      if (!value.password || value.password.length < 10) {
        context.addIssue({
          code: "custom",
          path: ["password"],
          message: "Le mot de passe doit contenir au moins 10 caractères.",
        });
      }
    }
  });

export const staffUpdateSchema = z
  .object({
    id: z.string().uuid("Le membre est invalide."),
    name: z.string().trim().min(1, "Le nom est requis.").max(120, "Le nom est trop long."),
    ...staffTitlesSchema,
  })
  .superRefine((value, context) => {
    const selected = new Set(value.jobTitleIds);
    if (selected.size !== value.jobTitleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["jobTitleIds"],
        message: "Un poste est sélectionné plusieurs fois.",
      });
    }
    if (selected.size > 0 && !value.primaryJobTitleId) {
      context.addIssue({
        code: "custom",
        path: ["primaryJobTitleId"],
        message: "Désignez un poste principal.",
      });
    }
    if (value.primaryJobTitleId && !selected.has(value.primaryJobTitleId)) {
      context.addIssue({
        code: "custom",
        path: ["primaryJobTitleId"],
        message: "Le poste principal doit faire partie des postes sélectionnés.",
      });
    }
  });

export const staffStatusSchema = z.object({
  id: z.string().uuid("Le membre est invalide."),
  operation: z.enum(["activate", "deactivate", "archive", "restore"]),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type StaffStatusOperation = z.infer<typeof staffStatusSchema>["operation"];
