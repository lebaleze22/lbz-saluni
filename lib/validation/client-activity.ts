import { z } from "zod";
export const ACTIVITY_LABELS = {
  consultation: "Consultation",
  preference: "Préférence",
  follow_up: "Suivi",
  note: "Observation",
};
export const clientActivitySchema = z.object({
  clientId: z.uuid(),
  kind: z.enum(["consultation", "preference", "follow_up", "note"]),
  body: z.string().trim().min(1, "Renseignez le suivi.").max(4000),
  occurredAt: z.coerce
    .date()
    .refine(
      (date) => date.getTime() <= Date.now() + 60_000,
      "La date ne peut pas être dans le futur.",
    ),
});
