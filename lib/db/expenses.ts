import type { ExpenseInput, ExpenseStatusOperation } from "@/lib/validation/expenses";
import { startOfDoualaDay } from "@/lib/dates";
import { requireAdminMember } from "@/lib/db/auth";
import { runInTenantTransaction } from "@/lib/db/rls-session";

export class ExpenseDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseDataError";
  }
}

function identity(user: Awaited<ReturnType<typeof requireAdminMember>>) {
  return { userId: user.id, tenantId: user.tenantId, role: user.role };
}

export async function getExpensesPageData() {
  const user = await requireAdminMember();

  return runInTenantTransaction(identity(user), (transaction) =>
    transaction.expense.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isDeleted: "asc" }, { occurredAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        description: true,
        amount: true,
        category: true,
        occurredAt: true,
        isDeleted: true,
        recordedBy: { select: { name: true } },
      },
    }),
  );
}

export async function createExpense(input: ExpenseInput) {
  const user = await requireAdminMember();

  return runInTenantTransaction(identity(user), (transaction) =>
    transaction.expense.create({
      data: {
        tenantId: user.tenantId,
        description: input.description,
        amount: input.amount,
        category: input.category ?? null,
        occurredAt: startOfDoualaDay(input.occurredAt),
        recordedById: user.staffProfile.id,
      },
      select: { id: true },
    }),
  );
}

export async function updateExpense(id: string, input: ExpenseInput) {
  const user = await requireAdminMember();

  return runInTenantTransaction(identity(user), async (transaction) => {
    const expense = await transaction.expense.findFirst({
      where: { id, tenantId: user.tenantId, isDeleted: false },
      select: { id: true },
    });
    if (!expense) throw new ExpenseDataError("Cette dépense est introuvable ou archivée.");

    return transaction.expense.update({
      where: { id },
      data: {
        description: input.description,
        amount: input.amount,
        category: input.category ?? null,
        occurredAt: startOfDoualaDay(input.occurredAt),
      },
      select: { id: true },
    });
  });
}

export async function changeExpenseStatus(id: string, operation: ExpenseStatusOperation) {
  const user = await requireAdminMember();

  return runInTenantTransaction(identity(user), async (transaction) => {
    const expense = await transaction.expense.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, isDeleted: true },
    });
    if (!expense) throw new ExpenseDataError("Cette dépense est introuvable.");
    if (operation === "archive" && expense.isDeleted) {
      throw new ExpenseDataError("Cette dépense est déjà archivée.");
    }
    if (operation === "restore" && !expense.isDeleted) {
      throw new ExpenseDataError("Cette dépense n’est pas archivée.");
    }

    return transaction.expense.update({
      where: { id },
      data:
        operation === "archive"
          ? { active: false, isDeleted: true, deletedAt: new Date() }
          : { active: true, isDeleted: false, deletedAt: null },
      select: { id: true },
    });
  });
}
