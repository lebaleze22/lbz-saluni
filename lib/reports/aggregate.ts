import type { AppointmentStatus, PaymentMethod } from "@prisma/client";
import { PAYMENT_METHOD_LABELS } from "../format";
import type {
  NamedAmount,
  PaymentAmount,
  ReportDateRange,
  ReportRow,
  ReportSummary,
  RetailReportRow,
  ServicePaymentRow,
} from "../../types/reports";
import { quantityToThousandths, thousandthsToQuantity } from "../inventory/quantities";

const PAYMENT_METHODS: PaymentMethod[] = ["cash", "orange_money", "mtn_momo"];

function sortByAmount<T extends { amount: number; label: string }>(items: T[]): T[] {
  return items.sort(
    (left, right) => right.amount - left.amount || left.label.localeCompare(right.label),
  );
}

export function aggregateReportRows(
  rows: ReportRow[],
  range: Pick<ReportDateRange, "start" | "end">,
  totalExpenses = 0,
  retailSales: RetailReportRow[] = [],
  appointmentOutcomes: Partial<Record<AppointmentStatus, number>> = {},
  servicePayments?: ServicePaymentRow[],
  bookingBalances: Array<{ total: number; paid: number }> = [],
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
  const products = new Map<
    string,
    { id: string; label: string; amount: number; saleCount: number; quantity: number; unit: string }
  >();
  let serviceRevenue = 0;
  let serviceVolume = 0;

  for (const row of rows) {
    const appointmentRevenue = row.services.reduce((sum, service) => sum + service.price, 0);
    serviceRevenue += appointmentRevenue;

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

  let serviceReceipts = 0;
  let advanceReceipts = 0;
  const receivedPayments =
    servicePayments ??
    rows.flatMap((row) =>
      row.payments.map((payment) => ({
        amount: payment.amount,
        method: payment.method,
        purpose: payment.purpose ?? ("settlement" as const),
      })),
    );
  for (const payment of receivedPayments) {
    serviceReceipts += payment.amount;
    if (payment.purpose === "advance") advanceReceipts += payment.amount;
    const paymentAggregate = paymentMethods.get(payment.method)!;
    paymentAggregate.amount += payment.amount;
    paymentAggregate.count += 1;
  }

  let retailRevenue = 0;
  const retailQuantities = new Map<string, number>();
  for (const sale of retailSales) {
    retailRevenue += sale.total;
    const paymentAggregate = paymentMethods.get(sale.method)!;
    paymentAggregate.amount += sale.total;
    paymentAggregate.count += 1;
    const productAggregate = products.get(sale.productId) ?? {
      id: sale.productId,
      label: sale.productName,
      amount: 0,
      saleCount: 0,
      quantity: 0,
      unit: sale.unit,
    };
    productAggregate.amount += sale.total;
    productAggregate.saleCount += 1;
    const quantity = quantityToThousandths(sale.quantity);
    productAggregate.quantity += quantity;
    retailQuantities.set(sale.unit, (retailQuantities.get(sale.unit) ?? 0) + quantity);
    products.set(sale.productId, productAggregate);
  }
  const totalRevenue = serviceRevenue + retailRevenue;
  const totalCashReceived = serviceReceipts + retailRevenue;

  const bookingPayments = bookingBalances.reduce(
    (summary, booking) => {
      const balance = Math.max(0, booking.total - booking.paid);
      summary.outstandingAmount += balance;
      if (booking.paid <= 0) summary.unpaid += 1;
      else if (balance > 0) summary.partial += 1;
      else summary.paid += 1;
      return summary;
    },
    { unpaid: 0, partial: 0, paid: 0, outstandingAmount: 0 },
  );

  let newClients = 0;
  for (const firstAppointmentAt of Array.from(clients.values())) {
    if (firstAppointmentAt >= range.start && firstAppointmentAt < range.end) {
      newClients += 1;
    }
  }

  return {
    totalRevenue,
    serviceRevenue,
    retailRevenue,
    totalCashReceived,
    serviceReceipts,
    advanceReceipts,
    totalExpenses,
    netResult: totalRevenue - totalExpenses,
    paymentMethods: PAYMENT_METHODS.map((method) => paymentMethods.get(method)!),
    staff: sortByAmount(Array.from(staff.values())),
    services: sortByAmount(Array.from(services.values())),
    products: sortByAmount(
      Array.from(products.values()).map((product) => ({
        ...product,
        quantity: thousandthsToQuantity(product.quantity),
      })),
    ),
    serviceVolume,
    retailSaleVolume: retailSales.length,
    retailQuantitiesByUnit: Array.from(retailQuantities, ([unit, quantity]) => ({
      unit,
      quantity: thousandthsToQuantity(quantity),
    })).sort((left, right) => left.unit.localeCompare(right.unit)),
    visitVolume: rows.length,
    uniqueClients: clients.size,
    newClients,
    recurringClients: clients.size - newClients,
    appointmentOutcomes: {
      scheduled: appointmentOutcomes.scheduled ?? 0,
      confirmed: appointmentOutcomes.confirmed ?? 0,
      arrived: appointmentOutcomes.arrived ?? 0,
      completed: appointmentOutcomes.completed ?? rows.length,
      cancelled: appointmentOutcomes.cancelled ?? 0,
      no_show: appointmentOutcomes.no_show ?? 0,
    },
    bookingPayments,
  };
}
