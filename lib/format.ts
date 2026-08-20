import type { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Espèces",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
};

export const SOURCE_LABELS = {
  reservation: "Réservation",
  walk_in: "Passage",
} as const;

export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/\s/g, " ")} FCFA`;
}

export function formatDateFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Africa/Douala",
  }).format(date);
}

export function formatTimeFr(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Douala",
  }).format(date);
}
