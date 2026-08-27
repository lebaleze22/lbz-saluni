import type { RegisterEntryInput } from "@/lib/validation/register";
import { getDayRange } from "@/lib/dates";
import { requireSalonAdmin } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type { RegisterPageData } from "@/types/register";

export class RegisterDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegisterDataError";
  }
}

export async function getRegisterPageData(
  date: string,
  staffId?: string,
): Promise<RegisterPageData> {
  const user = await requireSalonAdmin();
  const { start, end } = getDayRange(date);

  // Toutes les lectures ci-dessous doivent partager LA MÊME transaction : app.tenant_id
  // n'est visible (SET LOCAL) que jusqu'à la fin de cette transaction — voir
  // docs/architecture/014-decouplage-rls-auth-provider.md.
  const [staff, services, clients, appointments] = await runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      Promise.all([
        tx.staff.findMany({
          where: { tenantId: user.tenantId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        tx.service.findMany({
          where: { tenantId: user.tenantId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, defaultPrice: true },
        }),
        tx.client.findMany({
          where: { tenantId: user.tenantId },
          orderBy: { updatedAt: "desc" },
          take: 100,
          select: { id: true, name: true, phone: true },
        }),
        tx.appointment.findMany({
          where: {
            tenantId: user.tenantId,
            startTime: { gte: start, lt: end },
            ...(staffId ? { staffId } : {}),
          },
          orderBy: { startTime: "asc" },
          select: {
            id: true,
            startTime: true,
            source: true,
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
              orderBy: { createdAt: "asc" },
              select: { amount: true, method: true },
            },
          },
        }),
      ]),
  );

  return {
    staff,
    services,
    clients,
    entries: appointments.map((appointment) => ({
      id: appointment.id,
      startTime: appointment.startTime,
      source: appointment.source,
      client: appointment.client,
      staff: appointment.staff,
      services: appointment.appointmentServices.map((line) => ({
        id: line.id,
        name: line.service.name,
        price: line.price,
      })),
      payment: appointment.payments[0] ?? null,
    })),
  };
}

export async function createRegisterEntry(input: RegisterEntryInput) {
  const user = await requireSalonAdmin();
  const serviceIds = input.services.map(({ serviceId }) => serviceId);

  // Lectures de validation ET écritures dans LA MÊME transaction (app.tenant_id n'est
  // visible que le temps de cette transaction) — voir
  // docs/architecture/014-decouplage-rls-auth-provider.md.
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (transaction) => {
      const [staff, services] = await Promise.all([
        transaction.staff.findFirst({
          where: { id: input.staffId, tenantId: user.tenantId, active: true },
          select: { id: true },
        }),
        transaction.service.findMany({
          where: {
            id: { in: serviceIds },
            tenantId: user.tenantId,
            active: true,
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

      const existingClient = await transaction.client.findFirst({
        where: {
          tenantId: user.tenantId,
          ...(input.phone
            ? {
                OR: [
                  { phone: input.phone },
                  {
                    name: { equals: input.clientName, mode: "insensitive" },
                    phone: null,
                  },
                ],
              }
            : { name: { equals: input.clientName, mode: "insensitive" } }),
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true, phone: true },
      });

      const client =
        (existingClient && input.phone && !existingClient.phone
          ? await transaction.client.update({
              where: { id: existingClient.id },
              data: { phone: input.phone },
              select: { id: true },
            })
          : existingClient) ??
        (await transaction.client.create({
          data: {
            tenantId: user.tenantId,
            name: input.clientName,
            phone: input.phone,
          },
          select: { id: true },
        }));

      return transaction.appointment.create({
        data: {
          tenantId: user.tenantId,
          clientId: client.id,
          staffId: input.staffId,
          createdById: user.id,
          source: input.source,
          startTime: input.startTime,
          appointmentServices: {
            create: input.services.map((line) => ({
              tenantId: user.tenantId,
              serviceId: line.serviceId,
              price: line.price,
            })),
          },
          payments: {
            create: {
              tenantId: user.tenantId,
              amount: input.paymentAmount,
              method: input.paymentMethod,
            },
          },
        },
        select: { id: true },
      });
    },
  );
}
