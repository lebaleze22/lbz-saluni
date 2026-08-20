import { z } from "zod";
import { dateStringSchema } from "@/lib/validation/common";

export const reportFiltersSchema = z.object({
  period: z.enum(["week", "month", "quarter"]).default("week"),
  date: dateStringSchema,
});

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
