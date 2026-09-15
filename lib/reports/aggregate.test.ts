import { describe, expect, it } from "vitest";
import { aggregateReportRows } from "./aggregate";
import type { ReportRow } from "../../types/reports";
import type { RetailReportRow } from "../../types/reports";

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
const retailSales: RetailReportRow[] = [
  {
    id: "sale-1",
    soldAt: new Date("2026-08-20T14:00:00Z"),
    productId: "product-1",
    productName: "Shampoo",
    quantity: "2",
    unit: "unité",
    unitPrice: 3000,
    total: 6000,
    method: "cash",
    clientName: "Aline",
    recordedByName: "Owner",
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
  it("includes retail payments and product totals without changing service metrics", () => {
    const result = aggregateReportRows(rows, { start, end }, 9_500, retailSales);
    expect(result.totalRevenue).toBe(34_000);
    expect(result.serviceRevenue).toBe(28_000);
    expect(result.retailRevenue).toBe(6_000);
    expect(result.netResult).toBe(24_500);
    expect(result.retailSaleVolume).toBe(1);
    expect(result.products).toEqual([
      {
        id: "product-1",
        label: "Shampoo",
        amount: 6_000,
        saleCount: 1,
        quantity: "2.000",
        unit: "unité",
      },
    ]);
    expect(result.paymentMethods[0]).toMatchObject({ amount: 21_000, count: 2 });
    expect(result.visitVolume).toBe(3);
    expect(result.serviceVolume).toBe(4);
  });

  it("separates receipt count from the total product quantity sold", () => {
    const secondSale: RetailReportRow = {
      ...retailSales[0],
      id: "sale-2",
      quantity: "4",
      total: 12_000,
    };
    const result = aggregateReportRows([], { start, end }, 0, [...retailSales, secondSale]);
    expect(result.retailSaleVolume).toBe(2);
    expect(result.retailQuantitiesByUnit).toEqual([{ unit: "unité", quantity: "6.000" }]);
    expect(result.products[0]).toMatchObject({ saleCount: 2, quantity: "6.000" });
  });

  it("separates advances and cash receipts from completed service revenue", () => {
    const result = aggregateReportRows(
      [],
      { start, end },
      0,
      [],
      { scheduled: 3 },
      [{ amount: 4_000, method: "cash", purpose: "advance" }],
      [
        { total: 10_000, paid: 0 },
        { total: 10_000, paid: 4_000 },
        { total: 10_000, paid: 10_000 },
      ],
    );
    expect(result.serviceRevenue).toBe(0);
    expect(result.serviceReceipts).toBe(4_000);
    expect(result.advanceReceipts).toBe(4_000);
    expect(result.bookingPayments).toEqual({
      unpaid: 1,
      partial: 1,
      paid: 1,
      outstandingAmount: 16_000,
    });
  });
});
