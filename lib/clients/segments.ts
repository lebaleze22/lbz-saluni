import type { Prisma } from "@prisma/client";
import { addCalendarDays, startOfDoualaDay, todayInDouala } from "../dates";
import type { ClientFilters } from "../validation/clients";

export function clientSegmentWhere(
  segment: ClientFilters["segment"],
  days: number,
  now = new Date(),
): Prisma.ClientWhereInput {
  const cutoff = startOfDoualaDay(addCalendarDays(todayInDouala(now), -days));
  const anyVisit = { isDeleted: false, status: "completed" as const };
  const recentVisit = { ...anyVisit, startTime: { gte: cutoff } };
  if (segment === "never") return { appointments: { none: anyVisit } };
  if (segment === "recent") return { appointments: { some: recentVisit } };
  if (segment === "inactive") {
    return { AND: [{ appointments: { some: anyVisit } }, { appointments: { none: recentVisit } }] };
  }
  return {};
}
