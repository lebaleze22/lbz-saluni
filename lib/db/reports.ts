import { getReportDateRange } from "@/lib/dates";
import { aggregateReportRows } from "@/lib/reports/aggregate";
import { requireAdminMember } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type { ReportData, ReportPeriod, ReportRow } from "@/types/reports";

export async function getReportData(
  period: ReportPeriod,
  referenceDate: string,
): Promise<ReportData> {
  const user = await requireAdminMember();
  const range = getReportDateRange(period, referenceDate);

  const [appointments, expenseTotals] = await runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      Promise.all([
        tx.appointment.findMany({
          where: {
            tenantId: user.tenantId,
            startTime: { gte: range.start, lt: range.end },
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
                  where: { tenantId: user.tenantId },
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
            payments: { select: { amount: true, method: true } },
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

  return {
    range,
    rows,
    summary: aggregateReportRows(rows, range, expenseTotals._sum.amount ?? 0),
  };
}
