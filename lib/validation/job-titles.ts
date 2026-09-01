import { z } from "zod";

export const jobTitleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Le nom du poste est requis.")
    .max(120, "Le nom du poste est trop long."),
});

export const jobTitleUpdateSchema = jobTitleInputSchema.extend({ id: z.string().uuid() });
export const jobTitleStatusSchema = z.object({
  id: z.string().uuid(),
  operation: z.enum(["activate", "deactivate", "archive", "restore"]),
});

export type JobTitleStatusOperation = z.infer<typeof jobTitleStatusSchema>["operation"];
