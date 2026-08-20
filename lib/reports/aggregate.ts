import type { PaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABELS } from "../format";
import type {
  NamedAmount,
  PaymentAmount,
  ReportDateRange,
  ReportRow,
  ReportSummary,
} from "../../types/reports";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "orange_money", "mtn_momo"];

function sortByAmount<T extends { amount: number; label: string }>(items: T[]): T[] {
  return items.sort(
    (left, right) => right.amount - left.amount || left.label.localeCompare(right.label),
  );
}

export function aggregateReportRows(
  rows: ReportRow[],
  range: Pick<ReportDateRange, "start" | "end">,
): ReportSummary {
  const paymentMethods = new Map<PaymentMethod, PaymentAmount>(
    PAYMENT_METHODS.map((method) => [
      method,
      {
        method,
        label: PAYMENT_METHOD_LABELS[method],
        amount: 0,
        count: 0,
      },
    ]),
  );
  const staff = new Map<string, NamedAmount>();
  const services = new Map<string, NamedAmount>();
  const clients = new Map<string, Date>();
  let totalRevenue = 0;
  let serviceVolume = 0;

  for (const row of rows) {
    const appointmentRevenue = row.payments.reduce((sum, payment) => {
      const paymentAggregate = paymentMethods.get(payment.method)!;
      paymentAggregate.amount += payment.amount;
      paymentAggregate.count += 1;
      return sum + payment.amount;
    }, 0);
    totalRevenue += appointmentRevenue;

    const staffAggregate = staff.get(row.staff.id) ?? {
      id: row.staff.id,
      label: row.staff.name,
      amount: 0,
      count: 0,
    };
    staffAggregate.amount += appointmentRevenue;
    staffAggregate.count += 1;
    staff.set(row.staff.id, staffAggregate);

    for (const service of row.services) {
      const serviceAggregate = services.get(service.id) ?? {
        id: service.id,
        label: service.name,
        amount: 0,
        count: 0,
      };
      serviceAggregate.amount += service.price;
      serviceAggregate.count += 1;
      services.set(service.id, serviceAggregate);
      serviceVolume += 1;
    }

    const knownFirstVisit = clients.get(row.client.id);
    if (!knownFirstVisit || row.client.firstAppointmentAt < knownFirstVisit) {
      clients.set(row.client.id, row.client.firstAppointmentAt);
    }
  }

  let newClients = 0;
  for (const firstAppointmentAt of Array.from(clients.values())) {
    if (firstAppointmentAt >= range.start && firstAppointmentAt < range.end) {
      newClients += 1;
    }
  }

  return {
    totalRevenue,
    paymentMethods: PAYMENT_METHODS.map((method) => paymentMethods.get(method)!),
    staff: sortByAmount(Array.from(staff.values())),
    services: sortByAmount(Array.from(services.values())),
    serviceVolume,
    visitVolume: rows.length,
    uniqueClients: clients.size,
    newClients,
    recurringClients: clients.size - newClients,
  };
}
