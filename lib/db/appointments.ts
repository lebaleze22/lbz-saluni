import type { AppointmentStatus, PaymentMethod, Prisma } from "@prisma/client";
import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { lockClientIdentities, matchingClients } from "./client-identity";
import { consumeVisitProducts } from "./stock";
import { addCalendarDays, getDayRange, startOfDoualaDay, todayInDouala } from "../dates";
import type { AppointmentInput, CalendarFilters } from "../validation/appointments";
import { registerStaffSelect } from "./register-staff-select";

export class AppointmentDataError extends Error {}

const identity = (user: { id: string; tenantId: string; role: string }) => ({
  userId: user.id,
  tenantId: user.tenantId,
  role: user.role,
});

function calendarRange(filters: CalendarFilters) {
  if (filters.view === "day") return getDayRange(filters.date);
  const weekday = new Date(`${filters.date}T12:00:00Z`).getUTCDay();
  const monday = addCalendarDays(filters.date, -(weekday === 0 ? 6 : weekday - 1));
  return { start: startOfDoualaDay(monday), end: startOfDoualaDay(addCalendarDays(monday, 7)) };
}

async function resolveClient(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: Pick<AppointmentInput, "clientId" | "clientName" | "phone" | "email" | "sex">,
) {
  await lockClientIdentities(tx, tenantId);
  const candidates = input.clientId
    ? await tx.client.findMany({
        where: { id: input.clientId, tenantId, active: true, isDeleted: false },
        select: { id: true, active: true, isDeleted: true },
      })
    : await matchingClients(tx, tenantId, {
        name: input.clientName,
        phone: input.phone,
        email: input.email,
        sex: input.sex,
      });
  if (input.clientId && !candidates.length)
    throw new AppointmentDataError("Le client sélectionné est introuvable ou archivé.");
  if (candidates.length > 1)
    throw new AppointmentDataError(
      "Plusieurs fiches correspondent. Sélectionnez le client existant.",
    );
  const existing = candidates[0];
  if (existing && !input.clientId && !input.phone && !input.email)
    throw new AppointmentDataError(
      "Sélectionnez la fiche client existante pour éviter un doublon.",
    );
  return (
    existing ??
    (await tx.client.create({
      data: {
        tenantId,
        name: input.clientName,
        phone: input.phone,
        email: input.email,
        sex: input.sex,
      },
      select: { id: true },
    }))
  );
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: AppointmentInput,
) {
  const serviceIds = input.services.map((line) => line.serviceId);
  const [staff, services] = await Promise.all([
    tx.staff.findFirst({
      where: { id: input.staffId, tenantId, active: true, isDeleted: false },
      select: { id: true },
    }),
    tx.service.count({
      where: { id: { in: serviceIds }, tenantId, active: true, isDeleted: false },
    }),
  ]);
  if (!staff) throw new AppointmentDataError("Le membre du personnel est introuvable.");
  if (services !== serviceIds.length)
    throw new AppointmentDataError("Une prestation est introuvable.");
  if (input.startTime.getTime() < Date.now() - 5 * 60_000)
    throw new AppointmentDataError("Un nouveau rendez-vous ne peut pas commencer dans le passé.");
}

const overlapMessage = "Ce membre du personnel a déjà un rendez-vous sur cette plage horaire.";
async function mapOverlap<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (String(error).includes("appointments_staff_schedule_no_overlap"))
      throw new AppointmentDataError(overlapMessage);
    throw error;
  }
}

export async function getCalendarData(filters: CalendarFilters, selectedClientId?: string) {
  const user = await requireAdminMember();
  const range = calendarRange(filters);
  const today = getDayRange(todayInDouala());
  return runInTenantTransaction(identity(user), async (tx) => {
    const [staff, services, recentClients, appointments, todayOpen] = await Promise.all([
      tx.staff.findMany({
        where: { tenantId: user.tenantId, active: true, isDeleted: false },
        orderBy: { name: "asc" },
        select: registerStaffSelect,
      }),
      tx.service.findMany({
        where: { tenantId: user.tenantId, active: true, isDeleted: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, defaultPrice: true, category: { select: { name: true } } },
      }),
      tx.client.findMany({
        where: { tenantId: user.tenantId, active: true, isDeleted: false },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, name: true, phone: true, email: true, sex: true },
      }),
      tx.appointment.findMany({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          startTime: { gte: range.start, lt: range.end },
          ...(filters.staffId ? { staffId: filters.staffId } : {}),
          ...(filters.serviceId
            ? { appointmentServices: { some: { serviceId: filters.serviceId, isDeleted: false } } }
            : {}),
          ...(filters.status === "all" ? {} : { status: filters.status }),
        },
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        include: {
          client: { select: { id: true, name: true, phone: true } },
          staff: { select: { id: true, name: true } },
          appointmentServices: {
            where: { isDeleted: false },
            include: { service: { select: { id: true, name: true } } },
          },
          payments: { where: { isDeleted: false }, select: { amount: true, method: true } },
        },
      }),
      tx.appointment.findMany({
        where: {
          tenantId: user.tenantId,
          isDeleted: false,
          startTime: { gte: today.start, lt: today.end },
          status: { in: ["scheduled", "confirmed", "arrived"] },
        },
        select: { startTime: true, status: true },
      }),
    ]);
    if (selectedClientId && !recentClients.some((client) => client.id === selectedClientId)) {
      const selected = await tx.client.findFirst({
        where: { id: selectedClientId, tenantId: user.tenantId, active: true, isDeleted: false },
        select: { id: true, name: true, phone: true, email: true, sex: true },
      });
      if (selected) recentClients.unshift(selected);
    }
    const now = Date.now();
    return {
      range,
      staff: staff.map((member) => ({
        id: member.id,
        name: member.name,
        jobTitles: member.jobTitles.map(({ jobTitle, isPrimary }) => ({ ...jobTitle, isPrimary })),
      })),
      services,
      clients: recentClients,
      appointments,
      todayUpcoming: todayOpen.filter((item) => item.startTime.getTime() >= now).length,
      todayLate: todayOpen.filter(
        (item) => item.startTime.getTime() < now && item.status !== "arrived",
      ).length,
    };
  });
}

export async function createAppointment(input: AppointmentInput) {
  const user = await requireAdminMember();
  return mapOverlap(() =>
    runInTenantTransaction(identity(user), async (tx) => {
      await validateReferences(tx, user.tenantId, input);
      const client = await resolveClient(tx, user.tenantId, input);
      return tx.appointment.create({
        data: {
          tenantId: user.tenantId,
          clientId: client.id,
          staffId: input.staffId,
          createdById: user.id,
          source: "reservation",
          startTime: input.startTime,
          durationMinutes: input.durationMinutes,
          status: "scheduled",
          notes: input.notes,
          appointmentServices: {
            create: input.services.map((line) => ({
              serviceId: line.serviceId,
              price: line.price,
            })),
          },
          ...((input.paymentAmount ?? 0) > 0 && input.paymentMethod
            ? {
                payments: {
                  create: {
                    amount: input.paymentAmount!,
                    method: input.paymentMethod,
                    purpose: "advance" as const,
                    receivedAt: new Date(),
                  },
                },
              }
            : {}),
        },
        select: { id: true },
      });
    }),
  );
}

const transitions: Partial<Record<AppointmentStatus, AppointmentStatus[]>> = {
  scheduled: ["confirmed", "arrived", "cancelled", "no_show"],
  confirmed: ["arrived", "cancelled", "no_show"],
  arrived: ["cancelled"],
};

export async function changeAppointmentStatus(id: string, status: AppointmentStatus) {
  const user = await requireAdminMember();
  return mapOverlap(() =>
    runInTenantTransaction(identity(user), async (tx) => {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${id}::uuid AND tenant_id = ${user.tenantId}::uuid FOR UPDATE`;
      const appointment = await tx.appointment.findFirst({
        where: { id, tenantId: user.tenantId, isDeleted: false },
        select: { id: true, status: true },
      });
      if (!appointment) throw new AppointmentDataError("Ce rendez-vous est introuvable.");
      if (!transitions[appointment.status]?.includes(status))
        throw new AppointmentDataError("Ce changement de statut n’est plus autorisé.");
      return tx.appointment.update({ where: { id }, data: { status }, select: { id: true } });
    }),
  );
}

export async function completeAppointment(id: string, paymentMethod?: PaymentMethod) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${id}::uuid AND tenant_id = ${user.tenantId}::uuid FOR UPDATE`;
    const appointment = await tx.appointment.findFirst({
      where: { id, tenantId: user.tenantId, isDeleted: false },
      include: {
        appointmentServices: {
          where: { isDeleted: false },
          select: { serviceId: true, price: true },
        },
        payments: { where: { isDeleted: false }, select: { id: true, amount: true } },
      },
    });
    if (!appointment) throw new AppointmentDataError("Ce rendez-vous est introuvable.");
    if (appointment.status === "completed") return { id };
    if (appointment.status !== "arrived")
      throw new AppointmentDataError("Marquez d’abord le client comme arrivé.");
    const total = appointment.appointmentServices.reduce((sum, line) => sum + line.price, 0);
    if (!total)
      throw new AppointmentDataError("Le rendez-vous ne contient aucune prestation payable.");
    const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paid > total)
      throw new AppointmentDataError(
        "Les paiements dépassent le total prévu. Corrigez le dossier.",
      );
    const balance = total - paid;
    if (balance > 0 && !paymentMethod)
      throw new AppointmentDataError("Sélectionnez une méthode pour encaisser le solde.");
    if (balance > 0 && paymentMethod)
      await tx.payment.create({
        data: {
          tenantId: user.tenantId,
          appointmentId: id,
          amount: balance,
          method: paymentMethod,
          purpose: "settlement",
          receivedAt: new Date(),
        },
      });
    await consumeVisitProducts(
      tx,
      identity(user),
      id,
      appointment.appointmentServices.map((line) => line.serviceId),
    );
    return tx.appointment.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
      select: { id: true },
    });
  });
}

export async function recordAppointmentPayment(id: string, amount: number, method: PaymentMethod) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), async (tx) => {
    await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${id}::uuid AND tenant_id = ${user.tenantId}::uuid FOR UPDATE`;
    const appointment = await tx.appointment.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        isDeleted: false,
        status: { in: ["scheduled", "confirmed", "arrived"] },
      },
      include: {
        appointmentServices: { where: { isDeleted: false }, select: { price: true } },
        payments: { where: { isDeleted: false }, select: { amount: true } },
      },
    });
    if (!appointment)
      throw new AppointmentDataError("Ce rendez-vous ne peut plus recevoir d’acompte.");
    const total = appointment.appointmentServices.reduce((sum, line) => sum + line.price, 0);
    const paid = appointment.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (amount > total - paid)
      throw new AppointmentDataError("Le paiement dépasse le solde restant.");
    return tx.payment.create({
      data: {
        tenantId: user.tenantId,
        appointmentId: id,
        amount,
        method,
        purpose: "advance",
        receivedAt: new Date(),
      },
      select: { id: true },
    });
  });
}

export async function getAppointment(id: string) {
  const user = await requireAdminMember();
  return runInTenantTransaction(identity(user), (tx) =>
    tx.appointment.findFirst({
      where: { id, tenantId: user.tenantId, isDeleted: false },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
        createdBy: { select: { fullName: true } },
        appointmentServices: {
          where: { isDeleted: false },
          include: { service: { select: { name: true } } },
        },
        payments: { where: { isDeleted: false }, orderBy: { receivedAt: "asc" } },
      },
    }),
  );
}
