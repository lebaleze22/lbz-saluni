import { createClient } from "@supabase/supabase-js";
import type { IdType, Prisma, Sex, StaffPayType, StaffSystemRole, UserRole } from "@prisma/client";
import { adminPrisma } from "@/lib/admin-prisma";
import { requireOwner } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";
import type {
  StaffCreateInput,
  StaffStatusOperation,
  StaffUpdateInput,
} from "@/lib/validation/staff";

export class StaffDataError extends Error {}

function createSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function identity(user: { id: string; tenantId: string; role: string }) {
  return { userId: user.id, tenantId: user.tenantId, role: user.role };
}

async function validateJobTitles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  jobTitleIds: string[],
) {
  if (jobTitleIds.length === 0) return;
  const titles = await tx.jobTitle.findMany({
    where: { id: { in: jobTitleIds }, tenantId, active: true, isDeleted: false },
    select: { id: true },
  });
  if (titles.length !== new Set(jobTitleIds).size) {
    throw new StaffDataError("Un des postes sélectionnés est introuvable.");
  }
}

async function resolveJobTitles(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: StaffCreateInput,
) {
  await validateJobTitles(tx, tenantId, input.jobTitleIds);
  const ids = Array.from(new Set(input.jobTitleIds));
  let newJobTitleId: string | null = null;

  if (input.newJobTitle) {
    const duplicate = await tx.jobTitle.findFirst({
      where: { tenantId, name: { equals: input.newJobTitle, mode: "insensitive" } },
      select: { id: true, active: true, isDeleted: true },
    });
    if (duplicate && (!duplicate.active || duplicate.isDeleted)) {
      throw new StaffDataError("Ce poste existe déjà mais il est inactif ou archivé.");
    }
    newJobTitleId =
      duplicate?.id ??
      (
        await tx.jobTitle.create({
          data: { tenantId, name: input.newJobTitle },
          select: { id: true },
        })
      ).id;
    if (!ids.includes(newJobTitleId)) ids.push(newJobTitleId);
  }

  return {
    ids,
    primaryId: input.newJobTitleIsPrimary ? newJobTitleId : (input.primaryJobTitleId ?? null),
  };
}

export async function getStaffPageData() {
  const user = await requireOwner();
  return runInTenantTransaction(identity(user), (tx) =>
    Promise.all([
      tx.staff.findMany({
        where: { tenantId: user.tenantId },
        orderBy: [{ isDeleted: "asc" }, { active: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          systemRole: true,
          active: true,
          isDeleted: true,
          userId: true,
          jobTitles: {
            orderBy: { isPrimary: "desc" },
            select: {
              isPrimary: true,
              jobTitle: { select: { id: true, name: true } },
            },
          },
          user: { select: { email: true } },
        },
      }),
      tx.jobTitle.findMany({
        where: { tenantId: user.tenantId, active: true, isDeleted: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]),
  );
}

export async function createStaff(input: StaffCreateInput) {
  const owner = await requireOwner();
  let authUserId: string | null = null;
  let publicUserCreated = false;

  try {
    if (input.systemRole !== "none") {
      const email = input.email!.toLowerCase();
      const { data, error } = await createSupabaseAdmin().auth.admin.createUser({
        email,
        password: input.password!,
        email_confirm: true,
        user_metadata: { full_name: input.name },
      });
      if (error || !data.user) {
        throw error ?? new StaffDataError("Le compte n’a pas pu être créé.");
      }
      authUserId = data.user.id;
      const role: UserRole = input.systemRole === "director" ? "salon_admin" : "manager";
      await adminPrisma.user.create({
        data: { id: authUserId, tenantId: owner.tenantId, email, fullName: input.name, role },
      });
      publicUserCreated = true;
    }

    return await runInTenantTransaction(identity(owner), async (tx) => {
      const titles = await resolveJobTitles(tx, owner.tenantId, input);
      return tx.staff.create({
        data: {
          tenantId: owner.tenantId,
          name: input.name,
          sex: input.sex as Sex | undefined,
          phone: input.phone,
          residence: input.residence,
          idType: input.idType as IdType | undefined,
          idNumber: input.idNumber,
          yearsOfExperience: input.yearsOfExperience,
          payType: input.payType as StaffPayType,
          fixedSalary: input.payType === "fixed_salary" ? Math.round(input.payAmount) : null,
          commissionRate: input.payType === "commission" ? input.payAmount : null,
          systemRole: input.systemRole as StaffSystemRole,
          userId: authUserId,
          jobTitles: {
            create: titles.ids.map((jobTitleId) => ({
              jobTitleId,
              isPrimary: jobTitleId === titles.primaryId,
            })),
          },
        },
      });
    });
  } catch (error) {
    if (publicUserCreated && authUserId) {
      await adminPrisma.user.delete({ where: { id: authUserId } }).catch(() => undefined);
    }
    if (authUserId) {
      await createSupabaseAdmin()
        .auth.admin.deleteUser(authUserId)
        .catch(() => undefined);
    }
    throw error;
  }
}

export async function updateStaff(input: StaffUpdateInput) {
  const owner = await requireOwner();
  return runInTenantTransaction(identity(owner), async (tx) => {
    await validateJobTitles(tx, owner.tenantId, input.jobTitleIds);
    const current = await tx.staff.findFirst({
      where: { id: input.id, tenantId: owner.tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!current) throw new StaffDataError("Ce membre est introuvable.");

    await tx.staffJobTitle.deleteMany({
      where: { tenantId: owner.tenantId, staffId: input.id },
    });
    if (input.jobTitleIds.length > 0) {
      await tx.staffJobTitle.createMany({
        data: input.jobTitleIds.map((jobTitleId) => ({
          tenantId: owner.tenantId,
          staffId: input.id,
          jobTitleId,
          isPrimary: jobTitleId === input.primaryJobTitleId,
        })),
      });
    }
    return tx.staff.update({ where: { id: input.id }, data: { name: input.name } });
  });
}

export async function changeStaffStatus(id: string, operation: StaffStatusOperation) {
  const owner = await requireOwner();
  if (id === owner.staffProfile.id && ["deactivate", "archive"].includes(operation)) {
    throw new StaffDataError("Vous ne pouvez pas désactiver ou archiver votre propre fiche.");
  }
  return runInTenantTransaction(identity(owner), async (tx) => {
    const current = await tx.staff.findFirst({
      where: { id, tenantId: owner.tenantId },
      select: { isDeleted: true },
    });
    if (!current) throw new StaffDataError("Ce membre est introuvable.");
    const data = {
      activate: { active: true },
      deactivate: { active: false },
      archive: { active: false, isDeleted: true, deletedAt: new Date() },
      restore: { isDeleted: false, deletedAt: null },
    }[operation];
    return tx.staff.update({ where: { id }, data });
  });
}
