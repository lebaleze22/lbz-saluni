import { getReportDateRange } from "@/lib/dates";
import { aggregateReportRows } from "@/lib/reports/aggregate";
import { requireAdminMember } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type { ReportData, ReportPeriod, ReportRow, RetailReportRow } from "@/types/reports";

export async function getReportData(
  period: ReportPeriod,
  referenceDate: string,
): Promise<ReportData> {
  const user = await requireAdminMember();
  const range = getReportDateRange(period, referenceDate);

  const [
    appointments,
    expenseTotals,
    retailSaleRows,
    appointmentOutcomes,
    servicePaymentRows,
    openBookings,
  ] = await runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      Promise.all([
        tx.appointment.findMany({
          where: {
            tenantId: user.tenantId,
            startTime: { gte: range.start, lt: range.end },
            status: "completed",
            isDeleted: false,
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            startTime: true,
            source: true,
            client: {
              select: {
                id: true,
                name: true,
                appointments: {
                  where: { tenantId: user.tenantId, status: "completed", isDeleted: false },
                  orderBy: { startTime: "asc" },
                  take: 1,
                  select: { startTime: true },
                },
              },
            },
            staff: { select: { id: true, name: true } },
            appointmentServices: {
              select: {
                price: true,
                service: { select: { id: true, name: true } },
              },
            },
            payments: {
              where: { isDeleted: false },
              select: { amount: true, method: true, purpose: true, receivedAt: true },
            },
          },
        }),
        tx.expense.aggregate({
          where: {
            tenantId: user.tenantId,
            occurredAt: { gte: range.start, lt: range.end },
            isDeleted: false,
          },
          _sum: { amount: true },
        }),
        tx.retailSale.findMany({
          where: { tenantId: user.tenantId, soldAt: { gte: range.start, lt: range.end } },
          orderBy: [{ soldAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            soldAt: true,
            productId: true,
            productName: true,
            quantity: true,
            unit: true,
            unitPrice: true,
            total: true,
            method: true,
            client: { select: { name: true } },
            recordedBy: { select: { fullName: true } },
          },
        }),
        tx.appointment.groupBy({
          by: ["status"],
          where: {
            tenantId: user.tenantId,
            startTime: { gte: range.start, lt: range.end },
            isDeleted: false,
          },
          _count: { _all: true },
        }),
        tx.payment.findMany({
          where: {
            tenantId: user.tenantId,
            isDeleted: false,
            receivedAt: { gte: range.start, lt: range.end },
          },
          select: { amount: true, method: true, purpose: true },
        }),
        tx.appointment.findMany({
          where: {
            tenantId: user.tenantId,
            isDeleted: false,
            startTime: { gte: range.start, lt: range.end },
            status: { in: ["scheduled", "confirmed", "arrived"] },
          },
          select: {
            appointmentServices: {
              where: { isDeleted: false },
              select: { price: true },
            },
            payments: { where: { isDeleted: false }, select: { amount: true } },
          },
        }),
      ]),
  );

  const rows: ReportRow[] = appointments.map((appointment) => ({
    appointmentId: appointment.id,
    startTime: appointment.startTime,
    source: appointment.source,
    client: {
      id: appointment.client.id,
      name: appointment.client.name,
      firstAppointmentAt: appointment.client.appointments[0]?.startTime ?? appointment.startTime,
    },
    staff: appointment.staff,
    services: appointment.appointmentServices.map((line) => ({
      id: line.service.id,
      name: line.service.name,
      price: line.price,
    })),
    payments: appointment.payments,
  }));
  const retailSales: RetailReportRow[] = retailSaleRows.map((sale) => ({
    id: sale.id,
    soldAt: sale.soldAt,
    productId: sale.productId,
    productName: sale.productName,
    quantity: sale.quantity.toString(),
    unit: sale.unit,
    unitPrice: sale.unitPrice,
    total: sale.total,
    method: sale.method,
    clientName: sale.client?.name ?? null,
    recordedByName: sale.recordedBy.fullName,
  }));

  return {
    range,
    rows,
    retailSales,
    summary: aggregateReportRows(
      rows,
      range,
      expenseTotals._sum.amount ?? 0,
      retailSales,
      Object.fromEntries(appointmentOutcomes.map((row) => [row.status, row._count._all])),
      servicePaymentRows,
      openBookings.map((booking) => ({
        total: booking.appointmentServices.reduce((sum, line) => sum + line.price, 0),
        paid: booking.payments.reduce((sum, payment) => sum + payment.amount, 0),
      })),
    ),
  };
}
