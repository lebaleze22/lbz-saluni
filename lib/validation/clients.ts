import { z } from "zod";
import { DISCOVERY_VALUES } from "../clients/discovery";

export function optionalText(max: number) {
  return z.preprocess(
    (value) => (value === null || value === undefined || value === "" ? undefined : value),
    z.string().trim().max(max, `Limitez ce champ à ${max} caractères.`).optional(),
  );
}

export const clientInputSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom du client est requis.").max(120),
    phone: optionalText(30),
    email: z.preprocess(
      (value) =>
        value === null || value === undefined || value === ""
          ? undefined
          : typeof value === "string"
            ? value.trim().toLowerCase() || undefined
            : value,
      z.email("L’adresse e-mail est invalide.").max(254).optional(),
    ),
    sex: z.preprocess((value) => value || undefined, z.enum(["homme", "femme"]).optional()),
    notes: optionalText(4000),
    preferences: optionalText(2000),
    allergies: optionalText(2000),
    city: optionalText(120),
    neighbourhood: optionalText(120),
    addressDetails: optionalText(500),
    discoverySource: z.preprocess(
      (value) => value || undefined,
      z.enum(DISCOVERY_VALUES).optional(),
    ),
    discoveryDetails: optionalText(500),
    referredByClientId: z.preprocess((value) => value || undefined, z.uuid().optional()),
    referrerName: optionalText(120),
  })
  .superRefine((value, ctx) => {
    if (
      (value.referredByClientId || value.referrerName) &&
      value.discoverySource !== "recommendation"
    )
      ctx.addIssue({
        code: "custom",
        path: ["discoverySource"],
        message: "Choisissez Recommandation pour renseigner la personne qui recommande.",
      });
    if (value.referredByClientId && value.referrerName)
      ctx.addIssue({
        code: "custom",
        path: ["referrerName"],
        message: "Choisissez un client existant ou saisissez un nom, pas les deux.",
      });
  });

export const clientMutationSchema = clientInputSchema.safeExtend({ id: z.uuid() });
export const clientStatusSchema = z.object({
  id: z.uuid(),
  operation: z.enum(["archive", "restore"]),
});
export const clientFiltersSchema = z.object({
  q: z.string().trim().max(120).default(""),
  status: z.enum(["active", "archived"]).default("active"),
  segment: z.enum(["all", "recent", "inactive", "never"]).default("all"),
  discoverySource: z.enum(["all", ...DISCOVERY_VALUES]).default("all"),
  days: z.coerce.number().int().min(1).max(3650).default(90),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
export type ClientFilters = z.infer<typeof clientFiltersSchema>;
