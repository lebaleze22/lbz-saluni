import type { ReportDateRange, ReportPeriod } from "@/types/reports";

const DOUALA_OFFSET = "+01:00";

export function dateTimeInDouala(now = new Date()): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
}

export function doualaInputToIso(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(`${value}:00${DOUALA_OFFSET}`);
  if (Number.isNaN(date.getTime()) || dateTimeInDouala(date) !== value) return "";
  return date.toISOString();
}

export function todayInDouala(now = new Date()): string {
  return new Intl.DateTimeFormat("fr-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Africa/Douala",
  }).format(now);
}

export function startOfDoualaDay(date: string): Date {
  return new Date(`${date}T00:00:00${DOUALA_OFFSET}`);
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function getDayRange(date: string): { start: Date; end: Date } {
  return {
    start: startOfDoualaDay(date),
    end: startOfDoualaDay(addCalendarDays(date, 1)),
  };
}

function monthName(month: number): string {
  const date = new Date(Date.UTC(2024, month - 1, 1));
  return new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(date);
}

export function getReportDateRange(period: ReportPeriod, referenceDate: string): ReportDateRange {
  const [year, month] = referenceDate.split("-").map(Number);
  let startDate: string;
  let endDate: string;
  let label: string;

  if (period === "week") {
    const weekday = new Date(`${referenceDate}T12:00:00Z`).getUTCDay();
    const sinceMonday = weekday === 0 ? 6 : weekday - 1;
    startDate = addCalendarDays(referenceDate, -sinceMonday);
    endDate = addCalendarDays(startDate, 7);
    label = `Du ${new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(`${startDate}T12:00:00Z`))} au ${new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(`${addCalendarDays(endDate, -1)}T12:00:00Z`))}`;
  } else if (period === "month") {
    startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1));
    endDate = nextMonth.toISOString().slice(0, 10);
    label = `${monthName(month)} ${year}`;
  } else {
    const quarter = Math.floor((month - 1) / 3) + 1;
    const firstMonth = (quarter - 1) * 3 + 1;
    startDate = `${year}-${String(firstMonth).padStart(2, "0")}-01`;
    const nextQuarter = new Date(Date.UTC(year, firstMonth - 1 + 3, 1));
    endDate = nextQuarter.toISOString().slice(0, 10);
    label = `${quarter}ᵉ trimestre ${year}`;
  }

  return {
    period,
    referenceDate,
    start: startOfDoualaDay(startDate),
    end: startOfDoualaDay(endDate),
    label,
  };
}
