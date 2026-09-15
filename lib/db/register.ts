import { lockClientIdentities, matchingClients } from "./client-identity";
import type { RegisterEntryInput } from "@/lib/validation/register";
import { getDayRange } from "@/lib/dates";
import { requireAdminMember } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type { RegisterPageData } from "@/types/register";
import { registerStaffSelect } from "./register-staff-select";
import { consumeVisitProducts } from "./stock";

export class RegisterDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterDataError";
  }
}

export async function getRegisterPageData(
  date: string,
  staffId?: string,
  selectedClientId?: string,
): Promise<RegisterPageData> {
  const user = await requireAdminMember();
  const { start, end } = getDayRange(date);

  // Toutes les lectures ci-dessous doivent partager LA MÊME transaction : app.tenant_id
  // n'est visible (SET LOCAL) que jusqu'à la fin de cette transaction — voir
  // docs/architecture/014-decouplage-rls-auth-provider.md.
  const [staff, services, clients, appointments, serviceReceipts, retailReceipts] =
    await runInTenantTransaction(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      (tx) =>
        Promise.all([
          tx.staff.findMany({
            where: { tenantId: user.tenantId, active: true, isDeleted: false },
            orderBy: { name: "asc" },
            // Projection volontairement minimale pour le sélecteur du registre :
            // jamais idType/idNumber ni aucune autre donnée administrative sensible.
            select: registerStaffSelect,
          }),
          tx.service.findMany({
            where: { tenantId: user.tenantId, active: true, isDeleted: false },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              defaultPrice: true,
              category: { select: { id: true, name: true } },
            },
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
              startTime: { gte: start, lt: end },
              ...(staffId ? { staffId } : {}),
            },
            orderBy: { startTime: "asc" },
            select: {
              id: true,
              startTime: true,
              source: true,
              status: true,
              client: { select: { id: true, name: true, phone: true } },
              staff: { select: { id: true, name: true } },
              appointmentServices: {
                select: {
                  id: true,
                  price: true,
                  service: { select: { name: true } },
                },
              },
              payments: {
                where: { isDeleted: false },
                orderBy: { createdAt: "asc" },
                select: { amount: true, method: true, purpose: true },
              },
            },
          }),
          tx.payment.aggregate({
            where: {
              tenantId: user.tenantId,
              isDeleted: false,
              receivedAt: { gte: start, lt: end },
            },
            _sum: { amount: true },
          }),
          tx.retailSale.aggregate({
            where: { tenantId: user.tenantId, soldAt: { gte: start, lt: end } },
            _sum: { total: true },
          }),
        ]),
    );

  if (selectedClientId && !clients.some((client) => client.id === selectedClientId)) {
    const selected = await runInTenantTransaction(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      (tx) =>
        tx.client.findFirst({
          where: { id: selectedClientId, tenantId: user.tenantId, active: true, isDeleted: false },
          select: { id: true, name: true, phone: true, email: true, sex: true },
        }),
    );
    if (selected) clients.unshift(selected);
  }
  return {
    staff: staff.map((member) => ({
      id: member.id,
      name: member.name,
      jobTitles: member.jobTitles.map(({ jobTitle, isPrimary }) => ({
        ...jobTitle,
        isPrimary,
      })),
    })),
    services,
    clients,
    entries: appointments.map((appointment) => ({
      id: appointment.id,
      startTime: appointment.startTime,
      source: appointment.source,
      status: appointment.status,
      client: appointment.client,
      staff: appointment.staff,
      services: appointment.appointmentServices.map((line) => ({
        id: line.id,
        name: line.service.name,
        price: line.price,
      })),
      payments: appointment.payments,
    })),
    serviceReceipts: serviceReceipts._sum.amount ?? 0,
    retailReceipts: retailReceipts._sum.total ?? 0,
    completedVisitCount: appointments.filter((appointment) => appointment.status === "completed")
      .length,
  };
}

export async function createRegisterEntry(input: RegisterEntryInput) {
  const user = await requireAdminMember();
  const serviceIds = input.services.map(({ serviceId }) => serviceId);

  // Lectures de validation ET écritures dans LA MÊME transaction (app.tenant_id n'est
  // visible que le temps de cette transaction) — voir
  // docs/architecture/014-decouplage-rls-auth-provider.md.
  try {
    return await runInTenantTransaction(
      { userId: user.id, tenantId: user.tenantId, role: user.role },
      async (transaction) => {
        const [staff, services] = await Promise.all([
          transaction.staff.findFirst({
            where: { id: input.staffId, tenantId: user.tenantId, active: true, isDeleted: false },
            select: { id: true },
          }),
          transaction.service.findMany({
            where: {
              id: { in: serviceIds },
              tenantId: user.tenantId,
              active: true,
              isDeleted: false,
            },
            select: { id: true },
          }),
        ]);

        if (!staff) {
          throw new RegisterDataError("Le membre du personnel sélectionné est introuvable.");
        }
        if (services.length !== serviceIds.length) {
          throw new RegisterDataError("Une prestation sélectionnée est introuvable.");
        }

        await lockClientIdentities(transaction, user.tenantId);
        const candidates = input.clientId
          ? await transaction.client.findMany({
              where: {
                id: input.clientId,
                tenantId: user.tenantId,
                active: true,
                isDeleted: false,
              },
              select: { id: true, active: true, isDeleted: true },
            })
          : await matchingClients(transaction, user.tenantId, {
              name: input.clientName,
              phone: input.phone,
              email: input.email,
              sex: input.sex,
            });
        if (input.clientId && !candidates.length)
          throw new RegisterDataError("Le client sélectionné est introuvable ou archivé.");
        if (candidates.length > 1)
          throw new RegisterDataError(
            "Plusieurs fiches correspondent aux quatre informations. Sélectionnez la fiche client à utiliser.",
          );
        const existingClient = candidates[0];
        if (existingClient && (!existingClient.active || existingClient.isDeleted))
          throw new RegisterDataError(
            "Cette fiche client est archivée ou inactive. Restaurez-la avant de saisir une visite.",
          );
        if (existingClient && !input.clientId && !input.phone && !input.email)
          throw new RegisterDataError(
            "Une fiche correspond à ces informations. Sélectionnez le client existant ou ajoutez un téléphone ou un e-mail pour distinguer cette personne.",
          );
        const client =
          existingClient ??
          (await transaction.client.create({
            data: {
              tenantId: user.tenantId,
              name: input.clientName,
              phone: input.phone,
              email: input.email,
              sex: input.sex,
            },
            select: { id: true },
          }));

        if (
          input.entryMode === "appointment" &&
          input.startTime.getTime() < Date.now() - 5 * 60_000
        )
          throw new RegisterDataError(
            "Un nouveau rendez-vous ne peut pas commencer dans le passé.",
          );

        const appointment = await transaction.appointment.create({
          data: {
            tenantId: user.tenantId,
            clientId: client.id,
            staffId: input.staffId,
            createdById: user.id,
            source: input.entryMode === "appointment" ? "reservation" : input.source,
            startTime: input.startTime,
            durationMinutes: input.durationMinutes,
            status: input.entryMode === "appointment" ? "scheduled" : "completed",
            completedAt: input.entryMode === "appointment" ? null : new Date(),
            appointmentServices: {
              // Le prix saisi appartient uniquement à la visite. Service.defaultPrice
              // reste une valeur de pré-remplissage et n'est jamais modifiée ici.
              create: input.services.map((line) => ({
                serviceId: line.serviceId,
                price: line.price,
              })),
            },
            ...(input.paymentAmount > 0 && input.paymentMethod
              ? {
                  payments: {
                    create: {
                      amount: input.paymentAmount,
                      method: input.paymentMethod,
                      purpose: input.entryMode === "appointment" ? "advance" : "settlement",
                      receivedAt: new Date(),
                    },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        if (input.entryMode === "completed_visit")
          await consumeVisitProducts(
            transaction,
            { userId: user.id, tenantId: user.tenantId, role: user.role },
            appointment.id,
            serviceIds,
          );
        return appointment;
      },
    );
  } catch (error) {
    if (String(error).includes("appointments_staff_schedule_no_overlap"))
      throw new RegisterDataError(
        "Ce membre du personnel a déjà un rendez-vous sur cette plage horaire.",
      );
    throw error;
  }
}
