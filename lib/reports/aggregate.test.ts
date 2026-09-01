import { describe, expect, it } from "vitest";
import { aggregateReportRows } from "./aggregate";
import type { ReportRow } from "../../types/reports";

const start = new Date("2026-08-17T23:00:00.000Z");
const end = new Date("2026-08-24T23:00:00.000Z");

const rows: ReportRow[] = [
  {
    appointmentId: "visite-1",
    startTime: new Date("2026-08-18T09:00:00.000Z"),
    source: "walk_in",
    client: {
      id: "client-aline",
      name: "Aline",
      firstAppointmentAt: new Date("2026-07-03T09:00:00.000Z"),
    },
    staff: { id: "staff-1", name: "Mireille" },
    services: [
      { id: "service-coiffure", name: "Coiffure", price: 10_000 },
      { id: "service-soin", name: "Soin", price: 5_000 },
    ],
    payments: [{ amount: 15_000, method: "cash" }],
  },
  {
    appointmentId: "visite-2",
    startTime: new Date("2026-08-19T10:00:00.000Z"),
    source: "reservation",
    client: {
      id: "client-berthe",
      name: "Berthe",
      firstAppointmentAt: new Date("2026-08-19T10:00:00.000Z"),
    },
    staff: { id: "staff-2", name: "Carine" },
    services: [{ id: "service-tresses", name: "Tresses", price: 8_000 }],
    payments: [{ amount: 8_000, method: "orange_money" }],
  },
  {
    appointmentId: "visite-3",
    startTime: new Date("2026-08-20T12:00:00.000Z"),
    source: "walk_in",
    client: {
      id: "client-aline",
      name: "Aline",
      firstAppointmentAt: new Date("2026-07-03T09:00:00.000Z"),
    },
    staff: { id: "staff-1", name: "Mireille" },
    services: [{ id: "service-coiffure", name: "Coiffure", price: 5_000 }],
    payments: [{ amount: 5_000, method: "mtn_momo" }],
  },
];

describe("aggregateReportRows", () => {
  it("agrège le chiffre d’affaires par paiement, personnel et prestation", () => {
    const result = aggregateReportRows(rows, { start, end });

    expect(result.totalRevenue).toBe(28_000);
    expect(result.paymentMethods).toEqual([
      { method: "cash", label: "Espèces", amount: 15_000, count: 1 },
      {
        method: "orange_money",
        label: "Orange Money",
        amount: 8_000,
        count: 1,
      },
      { method: "mtn_momo", label: "MTN MoMo", amount: 5_000, count: 1 },
    ]);
    expect(result.staff).toEqual([
      { id: "staff-1", label: "Mireille", amount: 20_000, count: 2 },
      { id: "staff-2", label: "Carine", amount: 8_000, count: 1 },
    ]);
    expect(result.services).toEqual([
      {
        id: "service-coiffure",
        label: "Coiffure",
        amount: 15_000,
        count: 2,
      },
      { id: "service-tresses", label: "Tresses", amount: 8_000, count: 1 },
      { id: "service-soin", label: "Soin", amount: 5_000, count: 1 },
    ]);
  });

  it("compte le volume et distingue les clients nouveaux des clients récurrents", () => {
    const result = aggregateReportRows(rows, { start, end });

    expect(result.serviceVolume).toBe(4);
    expect(result.visitVolume).toBe(3);
    expect(result.uniqueClients).toBe(2);
    expect(result.newClients).toBe(1);
    expect(result.recurringClients).toBe(1);
  });

  it("retourne des totaux nuls sans supprimer les méthodes de paiement", () => {
    const result = aggregateReportRows([], { start, end });

    expect(result.totalRevenue).toBe(0);
    expect(result.serviceVolume).toBe(0);
    expect(result.visitVolume).toBe(0);
    expect(result.paymentMethods).toHaveLength(3);
    expect(result.paymentMethods.every((item) => item.amount === 0)).toBe(true);
  });

  it("calcule les dépenses et le résultat net de la période", () => {
    const result = aggregateReportRows(rows, { start, end }, 9_500);

    expect(result.totalExpenses).toBe(9_500);
    expect(result.netResult).toBe(18_500);
  });
});
