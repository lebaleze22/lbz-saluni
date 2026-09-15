import { z } from "zod";
import { dateStringSchema } from "./common";
import { clientInputSchema } from "./clients";

export const registerFiltersSchema = z.object({
  date: dateStringSchema,
  staffId: z.string().uuid("Le filtre de personnel est invalide.").optional(),
  clientId: z.string().uuid("Le client est invalide.").optional(),
});

const serviceLineSchema = z.object({
  serviceId: z.string().uuid("Service invalide."),
  price: z.coerce
    .number()
    .int("Le prix doit être un montant entier.")
    .positive("Le prix doit être supérieur à zéro.")
    .max(2_147_483_647, "Le montant est trop élevé."),
});

export const registerEntrySchema = z
  .object({
    entryMode: z.enum(["completed_visit", "appointment"]).default("completed_visit"),
    clientId: z.preprocess(
      (value) => value || undefined,
      z.uuid("Le client est invalide.").optional(),
    ),
    clientName: z
      .string()
      .trim()
      .min(1, "Le nom du client est requis.")
      .max(120, "Le nom du client est trop long."),
    email: clientInputSchema.shape.email,
    phone: z
      .string()
      .trim()
      .max(30, "Le numéro de téléphone est trop long.")
      .optional()
      .transform((value) => value || undefined),
    sex: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.enum(["homme", "femme"]).optional(),
    ),
    staffId: z.string().uuid("Sélectionnez un membre du personnel."),
    source: z.enum(["reservation", "walk_in"], {
      message: "Choisissez réservation ou passage.",
    }),
    startTime: z.coerce.date({ message: "L’heure renseignée est invalide." }),
    durationMinutes: z.coerce.number().int().min(5).max(720).default(60),
    services: z.array(serviceLineSchema).min(1, "Ajoutez au moins une prestation.").max(100),
    paymentAmount: z.coerce
      .number()
      .int("Le montant doit être un entier.")
      .min(0, "Le montant ne peut pas être négatif.")
      .max(2_147_483_647, "Le montant total est trop élevé."),
    paymentMethod: z.preprocess(
      (value) => value || undefined,
      z.enum(["cash", "orange_money", "mtn_momo"]).optional(),
    ),
  })
  .superRefine((value, context) => {
    const servicesTotal = value.services.reduce((sum, service) => sum + service.price, 0);

    if (value.entryMode === "completed_visit" && value.paymentAmount !== servicesTotal) {
      context.addIssue({
        code: "custom",
        path: ["paymentAmount"],
        message: "Le montant payé doit correspondre au total des prestations.",
      });
    }

    if (value.entryMode === "appointment" && value.paymentAmount > servicesTotal) {
      context.addIssue({
        code: "custom",
        path: ["paymentAmount"],
        message: "L’acompte ne peut pas dépasser le total prévu.",
      });
    }

    if (value.paymentAmount > 0 && !value.paymentMethod) {
      context.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Sélectionnez une méthode de paiement.",
      });
    }

    const uniqueServices = new Set(value.services.map(({ serviceId }) => serviceId));
    if (uniqueServices.size !== value.services.length) {
      context.addIssue({
        code: "custom",
        path: ["services"],
        message: "Une même prestation ne peut apparaître qu’une fois.",
      });
    }
  });

export type RegisterEntryInput = z.infer<typeof registerEntrySchema>;
