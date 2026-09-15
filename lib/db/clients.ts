import type { Prisma } from "@prisma/client";
import { requireAdminMember } from "./auth";
import { runInTenantTransaction } from "./rls-session";
import { clientSegmentWhere } from "../clients/segments";
import type { ClientInput, ClientFilters } from "../validation/clients";
import { lockClientIdentities, matchingClients } from "./client-identity";

export class ClientDataError extends Error {}
export const CLIENT_PAGE_SIZE = 25;
export const CLIENT_HISTORY_PAGE_SIZE = 20;

export async function getClientsPageData(filters: ClientFilters) {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const where: Prisma.ClientWhereInput = {
        tenantId: user.tenantId,
        isDeleted: filters.status === "archived",
        ...clientSegmentWhere(filters.segment, filters.days),
        ...(filters.discoverySource === "all" ? {} : { discoverySource: filters.discoverySource }),
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: "insensitive" } },
                { phone: { contains: filters.q, mode: "insensitive" } },
                { email: { contains: filters.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const total = await tx.client.count({ where });
      const page = Math.min(filters.page, Math.max(1, Math.ceil(total / CLIENT_PAGE_SIZE)));
      const clients = await tx.client.findMany({
        where,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: CLIENT_PAGE_SIZE,
        skip: (page - 1) * CLIENT_PAGE_SIZE,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          discoverySource: true,
          isDeleted: true,
          _count: {
            select: { appointments: { where: { isDeleted: false, status: "completed" } } },
          },
          appointments: {
            where: { isDeleted: false, status: "completed" },
            orderBy: { startTime: "desc" },
            take: 1,
            select: { startTime: true },
          },
        },
      });
      return { clients, total, page };
    },
  );
}

export async function getClientDetail(
  id: string,
  requestedPage = 1,
  requestedActivityPage = 1,
  requestedRetailPage = 1,
) {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, tenantId: user.tenantId },
        include: { referredByClient: { select: { id: true, name: true } } },
      });
      if (!client) return null;
      const where = {
        tenantId: user.tenantId,
        clientId: id,
        isDeleted: false,
        status: "completed" as const,
      };
      const [
        visitCount,
        receipts,
        retailSaleCount,
        retailReceipts,
        appointmentCount,
        appointments,
      ] = await Promise.all([
        tx.appointment.count({ where }),
        tx.payment.aggregate({
          where: { tenantId: user.tenantId, isDeleted: false, appointment: where },
          _sum: { amount: true },
        }),
        tx.retailSale.count({ where: { tenantId: user.tenantId, clientId: id } }),
        tx.retailSale.aggregate({
          where: { tenantId: user.tenantId, clientId: id },
          _sum: { total: true },
        }),
        tx.appointment.count({
          where: {
            tenantId: user.tenantId,
            clientId: id,
            isDeleted: false,
            status: { not: "completed" },
          },
        }),
        tx.appointment.findMany({
          where: {
            tenantId: user.tenantId,
            clientId: id,
            isDeleted: false,
            status: { not: "completed" },
          },
          orderBy: [{ startTime: "desc" }, { id: "desc" }],
          take: 20,
          include: {
            staff: { select: { name: true } },
            payments: { where: { isDeleted: false }, select: { amount: true } },
            appointmentServices: {
              where: { isDeleted: false },
              include: { service: { select: { name: true } } },
            },
          },
        }),
      ]);
      const page = Math.min(
        requestedPage,
        Math.max(1, Math.ceil(visitCount / CLIENT_HISTORY_PAGE_SIZE)),
      );
      const visits = await tx.appointment.findMany({
        where,
        orderBy: [{ startTime: "desc" }, { id: "desc" }],
        take: CLIENT_HISTORY_PAGE_SIZE,
        skip: (page - 1) * CLIENT_HISTORY_PAGE_SIZE,
        select: {
          id: true,
          startTime: true,
          source: true,
          staff: { select: { name: true } },
          appointmentServices: {
            where: { isDeleted: false },
            select: { price: true, service: { select: { name: true } } },
          },
          payments: { where: { isDeleted: false }, select: { amount: true, method: true } },
          stockMovements: {
            orderBy: { createdAt: "asc" },
            select: { id: true, productName: true, unit: true, quantity: true },
          },
        },
      });
      const activityCount = await tx.clientActivity.count({
        where: { tenantId: user.tenantId, clientId: id },
      });
      const activityPage = Math.min(
        requestedActivityPage,
        Math.max(1, Math.ceil(activityCount / 20)),
      );
      const activities = await tx.clientActivity.findMany({
        where: { tenantId: user.tenantId, clientId: id },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: 20,
        skip: (activityPage - 1) * 20,
        include: { author: { select: { fullName: true } } },
      });
      const retailPage = Math.min(
        requestedRetailPage,
        Math.max(1, Math.ceil(retailSaleCount / 20)),
      );
      const retailSales = await tx.retailSale.findMany({
        where: { tenantId: user.tenantId, clientId: id },
        orderBy: [{ soldAt: "desc" }, { id: "desc" }],
        take: 20,
        skip: (retailPage - 1) * 20,
      });
      return {
        client,
        visits,
        page,
        visitCount,
        totalPaid: receipts._sum.amount ?? 0,
        retailPaid: retailReceipts._sum.total ?? 0,
        retailSales,
        retailSaleCount,
        retailPage,
        appointments,
        appointmentCount,
        activities,
        activityCount,
        activityPage,
      };
    },
  );
}

function clientData(input: ClientInput) {
  return {
    name: input.name,
    phone: input.phone || null,
    email: input.email || null,
    sex: input.sex ?? null,
    notes: input.notes || null,
    preferences: input.preferences || null,
    allergies: input.allergies || null,
    city: input.city || null,
    neighbourhood: input.neighbourhood || null,
    addressDetails: input.addressDetails || null,
    discoverySource: input.discoverySource || "unknown",
    discoveryDetails: input.discoveryDetails || null,
    referredByClientId: input.referredByClientId || null,
    referrerName: input.referrerName || null,
  };
}

export async function saveClient(id: string | null, input: ClientInput) {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      await lockClientIdentities(tx, user.tenantId);
      if (input.referredByClientId) {
        if (input.referredByClientId === id)
          throw new ClientDataError("Un client ne peut pas se recommander lui-même.");
        if (
          !(await tx.client.findFirst({
            where: { id: input.referredByClientId, tenantId: user.tenantId },
            select: { id: true },
          }))
        )
          throw new ClientDataError("Le client qui recommande est introuvable dans ce salon.");
      }
      const duplicates = await matchingClients(tx, user.tenantId, input, id ?? undefined);
      if (duplicates.length)
        throw new ClientDataError(
          duplicates.some((client) => client.isDeleted)
            ? "Une fiche archivée possède déjà ces nom, téléphone, e-mail et sexe. Retrouvez-la dans les clients archivés."
            : "Un client possède déjà ces nom, téléphone, e-mail et sexe. Utilisez sa fiche existante ou renseignez les informations qui distinguent cette personne.",
        );
      if (!id)
        return tx.client.create({
          data: { tenantId: user.tenantId, ...clientData(input) },
          select: { id: true },
        });
      const existing = await tx.client.findFirst({
        where: { id, tenantId: user.tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!existing) throw new ClientDataError("Ce client est introuvable ou archivé.");
      return tx.client.update({ where: { id }, data: clientData(input), select: { id: true } });
    },
  );
}

export async function getClientReferrers() {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      tx.client.findMany({
        where: { tenantId: user.tenantId },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, phone: true, email: true },
      }),
  );
}

export async function changeClientStatus(id: string, operation: "archive" | "restore") {
  const user = await requireAdminMember();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const client = await tx.client.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { isDeleted: true },
      });
      if (!client) throw new ClientDataError("Ce client est introuvable.");
      if (client.isDeleted !== (operation === "restore"))
        throw new ClientDataError("L’état du client a changé. Actualisez la page.");
      return tx.client.update({
        where: { id },
        data:
          operation === "archive"
            ? { active: false, isDeleted: true, deletedAt: new Date() }
            : { active: true, isDeleted: false, deletedAt: null },
        select: { id: true },
      });
    },
  );
}
