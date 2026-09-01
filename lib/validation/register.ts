import { z } from "zod";
import { dateStringSchema } from "./common";

export const registerFiltersSchema = z.object({
  date: dateStringSchema,
  staffId: z.string().uuid("Le filtre de personnel est invalide.").optional(),
});

const serviceLineSchema = z.object({
  serviceId: z.string().uuid("Service invalide."),
  price: z.coerce
    .number()
    .int("Le prix doit être un montant entier.")
    .positive("Le prix doit être supérieur à zéro."),
});

export const registerEntrySchema = z
  .object({
    clientName: z
      .string()
      .trim()
      .min(1, "Le nom du client est requis.")
      .max(120, "Le nom du client est trop long."),
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
    services: z.array(serviceLineSchema).min(1, "Ajoutez au moins une prestation."),
    paymentAmount: z.coerce
      .number()
      .int("Le montant doit être un entier.")
      .positive("Le montant doit être supérieur à zéro."),
    paymentMethod: z.enum(["cash", "orange_money", "mtn_momo"], {
      message: "Sélectionnez une méthode de paiement.",
    }),
  })
  .superRefine((value, context) => {
    const servicesTotal = value.services.reduce((sum, service) => sum + service.price, 0);

    if (value.paymentAmount !== servicesTotal) {
      context.addIssue({
        code: "custom",
        path: ["paymentAmount"],
        message: "Le montant payé doit correspondre au total des prestations.",
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
