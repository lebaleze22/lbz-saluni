import type { Prisma } from "@prisma/client";
import type { ServiceInput, ServiceStatusOperation } from "@/lib/validation/services";
import { requireAdminMember } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";

export class ServiceDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServiceDataError";
  }
}

async function resolveCategory(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  input: ServiceInput,
) {
  if (input.newCategory) {
    const duplicate = await transaction.serviceCategory.findFirst({
      where: {
        tenantId,
        name: { equals: input.newCategory, mode: "insensitive" },
      },
      select: { id: true, active: true, isDeleted: true },
    });

    if (duplicate && (!duplicate.active || duplicate.isDeleted)) {
      throw new ServiceDataError("Cette catégorie existe déjà mais elle est inactive ou archivée.");
    }
    if (duplicate) return duplicate.id;

    return (
      await transaction.serviceCategory.create({
        data: { tenantId, name: input.newCategory },
        select: { id: true },
      })
    ).id;
  }

  const category = await transaction.serviceCategory.findFirst({
    where: {
      id: input.categoryId,
      tenantId,
      active: true,
      isDeleted: false,
    },
    select: { id: true },
  });
  if (!category) throw new ServiceDataError("La catégorie sélectionnée est introuvable.");
  return category.id;
}

async function assertUniqueName(
  transaction: Prisma.TransactionClient,
  tenantId: string,
  categoryId: string,
  name: string,
  excludedId?: string,
) {
  const duplicate = await transaction.service.findFirst({
    where: {
      tenantId,
      categoryId,
      name: { equals: name, mode: "insensitive" },
      ...(excludedId ? { id: { not: excludedId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new ServiceDataError("Une prestation porte déjà ce nom dans cette catégorie.");
  }
}

export async function getServicesPageData() {
  const user = await requireAdminMember();

  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (transaction) =>
      Promise.all([
        transaction.service.findMany({
          where: { tenantId: user.tenantId },
          orderBy: [{ isDeleted: "asc" }, { active: "desc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            defaultPrice: true,
            active: true,
            isDeleted: true,
            category: { select: { id: true, name: true } },
          },
        }),
        transaction.serviceCategory.findMany({
          where: { tenantId: user.tenantId, active: true, isDeleted: false },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ]),
  );
}

export async function createService(input: ServiceInput) {
  const user = await requireAdminMember();

  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (transaction) => {
      const categoryId = await resolveCategory(transaction, user.tenantId, input);
      await assertUniqueName(transaction, user.tenantId, categoryId, input.name);

      return transaction.service.create({
        data: {
          tenantId: user.tenantId,
          name: input.name,
          categoryId,
          defaultPrice: input.defaultPrice,
        },
        select: { id: true },
      });
    },
  );
}

export async function updateService(id: string, input: ServiceInput) {
  const user = await requireAdminMember();

  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (transaction) => {
      const service = await transaction.service.findFirst({
        where: { id, tenantId: user.tenantId, isDeleted: false },
        select: { id: true },
      });
      if (!service) throw new ServiceDataError("Cette prestation est introuvable.");

      const categoryId = await resolveCategory(transaction, user.tenantId, input);
      await assertUniqueName(transaction, user.tenantId, categoryId, input.name, id);

      return transaction.service.update({
        where: { id },
        data: {
          name: input.name,
          categoryId,
          defaultPrice: input.defaultPrice,
        },
        select: { id: true },
      });
    },
  );
}

export async function changeServiceStatus(id: string, operation: ServiceStatusOperation) {
  const user = await requireAdminMember();

  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (transaction) => {
      const service = await transaction.service.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, isDeleted: true },
      });
      if (!service) throw new ServiceDataError("Cette prestation est introuvable.");

      if (operation === "restore" && !service.isDeleted) {
        throw new ServiceDataError("Cette prestation n’est pas archivée.");
      }
      if (operation !== "restore" && service.isDeleted) {
        throw new ServiceDataError("Restaurez cette prestation avant de la modifier.");
      }

      const data = {
        activate: { active: true },
        deactivate: { active: false },
        archive: { active: false, isDeleted: true, deletedAt: new Date() },
        restore: { isDeleted: false, deletedAt: null },
      }[operation];

      return transaction.service.update({ where: { id }, data, select: { id: true } });
    },
  );
}
