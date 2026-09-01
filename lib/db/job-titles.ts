import { requireOwner } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type { JobTitleStatusOperation } from "@/lib/validation/job-titles";

export class JobTitleDataError extends Error {}

export async function getJobTitlesPageData() {
  const user = await requireOwner();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    (tx) =>
      tx.jobTitle.findMany({
        where: { tenantId: user.tenantId },
        orderBy: [{ isDeleted: "asc" }, { active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          active: true,
          isDeleted: true,
          _count: { select: { staffJobTitles: true } },
        },
      }),
  );
}

export async function saveJobTitle(id: string | null, name: string) {
  const user = await requireOwner();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const duplicate = await tx.jobTitle.findFirst({
        where: {
          tenantId: user.tenantId,
          name: { equals: name, mode: "insensitive" },
          ...(id ? { id: { not: id } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) throw new JobTitleDataError("Un poste porte déjà ce nom.");
      if (!id) return tx.jobTitle.create({ data: { tenantId: user.tenantId, name } });
      const current = await tx.jobTitle.findFirst({
        where: { id, tenantId: user.tenantId, isDeleted: false },
      });
      if (!current) throw new JobTitleDataError("Ce poste est introuvable.");
      return tx.jobTitle.update({ where: { id }, data: { name } });
    },
  );
}

export async function changeJobTitleStatus(id: string, operation: JobTitleStatusOperation) {
  const user = await requireOwner();
  return runInTenantTransaction(
    { userId: user.id, tenantId: user.tenantId, role: user.role },
    async (tx) => {
      const current = await tx.jobTitle.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { isDeleted: true },
      });
      if (!current) throw new JobTitleDataError("Ce poste est introuvable.");
      const data = {
        activate: { active: true },
        deactivate: { active: false },
        archive: { active: false, isDeleted: true, deletedAt: new Date() },
        restore: { isDeleted: false, deletedAt: null },
      }[operation];
      return tx.jobTitle.update({ where: { id }, data });
    },
  );
}
