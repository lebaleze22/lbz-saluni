import { z } from "zod";
import { clientInputSchema, optionalText } from "./clients";
import { dateStringSchema } from "./common";

const serviceLineSchema = z.object({
  serviceId: z.uuid("Service invalide."),
  price: z.coerce.number().int().positive().max(2_147_483_647),
});

const paymentMethodSchema = z.preprocess(
  (value) => value || undefined,
  z.enum(["cash", "orange_money", "mtn_momo"]).optional(),
);

export const appointmentInputSchema = z
  .object({
    clientId: z.preprocess((value) => value || undefined, z.uuid().optional()),
    clientName: z.string().trim().min(1, "Le nom du client est requis.").max(120),
    phone: clientInputSchema.shape.phone,
    email: clientInputSchema.shape.email,
    sex: clientInputSchema.shape.sex,
    staffId: z.uuid("Sélectionnez un membre du personnel."),
    startTime: z.coerce.date({ message: "La date ou l’heure est invalide." }),
    durationMinutes: z.coerce.number().int().min(5).max(720),
    notes: optionalText(1000),
    services: z.array(serviceLineSchema).min(1, "Ajoutez au moins une prestation.").max(50),
    paymentAmount: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
    paymentMethod: paymentMethodSchema,
  })
  .superRefine((value, context) => {
    if (new Set(value.services.map((line) => line.serviceId)).size !== value.services.length)
      context.addIssue({
        code: "custom",
        path: ["services"],
        message: "Une prestation est répétée.",
      });
    const total = value.services.reduce((sum, line) => sum + line.price, 0);
    if ((value.paymentAmount ?? 0) > total)
      context.addIssue({
        code: "custom",
        path: ["paymentAmount"],
        message: "L’acompte ne peut pas dépasser le total prévu.",
      });
    if ((value.paymentAmount ?? 0) > 0 && !value.paymentMethod)
      context.addIssue({
        code: "custom",
        path: ["paymentMethod"],
        message: "Choisissez la méthode de paiement de l’acompte.",
      });
  });

export const appointmentMutationSchema = appointmentInputSchema.extend({ id: z.uuid() });
export const appointmentStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(["confirmed", "arrived", "cancelled", "no_show"]),
});
export const appointmentCheckoutSchema = z.object({
  id: z.uuid(),
  paymentMethod: paymentMethodSchema,
});
export const appointmentPaymentSchema = z.object({
  id: z.uuid(),
  amount: z.coerce.number().int().positive().max(2_147_483_647),
  paymentMethod: z.enum(["cash", "orange_money", "mtn_momo"]),
});
export const calendarFiltersSchema = z.object({
  date: dateStringSchema,
  view: z.enum(["day", "week"]).default("day"),
  staffId: z.preprocess((value) => value || undefined, z.uuid().optional()),
  serviceId: z.preprocess((value) => value || undefined, z.uuid().optional()),
  status: z
    .enum(["all", "scheduled", "confirmed", "arrived", "completed", "cancelled", "no_show"])
    .default("all"),
});

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;
export type CalendarFilters = z.infer<typeof calendarFiltersSchema>;
