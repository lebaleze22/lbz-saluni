"use server";

import { revalidatePath } from "next/cache";
import { AccessDeniedError } from "@/lib/db/auth";
import {
  changeExpenseStatus,
  createExpense,
  ExpenseDataError,
  updateExpense,
} from "@/lib/db/expenses";
import {
  expenseInputSchema,
  expenseMutationSchema,
  expenseStatusSchema,
} from "@/lib/validation/expenses";

export type ExpenseFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  submissionId?: number;
};

const TECHNICAL_ERROR = "Une erreur technique a empêché l’enregistrement de la dépense.";

function failure(error: unknown, fallback = TECHNICAL_ERROR): ExpenseFormState {
  return {
    success: false,
    message:
      error instanceof ExpenseDataError || error instanceof AccessDeniedError
        ? error.message
        : fallback,
  };
}

function inputFrom(formData: FormData) {
  return {
    description: formData.get("description"),
    amount: formData.get("amount"),
    category: formData.get("category"),
    occurredAt: formData.get("occurredAt"),
  };
}

function refreshExpensePages() {
  revalidatePath("/expenses");
  revalidatePath("/reports");
}

export async function createExpenseAction(
  _previousState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = expenseInputSchema.safeParse(inputFrom(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "Certaines informations doivent être corrigées.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await createExpense(parsed.data);
    refreshExpensePages();
    return {
      success: true,
      message: "La dépense a bien été enregistrée.",
      submissionId: Date.now(),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateExpenseAction(
  _previousState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = expenseMutationSchema.safeParse({
    id: formData.get("id"),
    ...inputFrom(formData),
  });
  if (!parsed.success) {
    return {
      success: false,
      message: "Certaines informations doivent être corrigées.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const { id, ...input } = parsed.data;
    await updateExpense(id, input);
    refreshExpensePages();
    return { success: true, message: "La dépense a bien été modifiée." };
  } catch (error) {
    return failure(error);
  }
}

export async function changeExpenseStatusAction(
  _previousState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  const parsed = expenseStatusSchema.safeParse({
    id: formData.get("id"),
    operation: formData.get("operation"),
  });
  if (!parsed.success) return { success: false, message: "L’action demandée est invalide." };

  try {
    await changeExpenseStatus(parsed.data.id, parsed.data.operation);
    refreshExpensePages();
    return {
      success: true,
      message:
        parsed.data.operation === "archive"
          ? "La dépense a été archivée."
          : "La dépense a été restaurée.",
    };
  } catch (error) {
    return failure(error, "Une erreur technique a empêché la mise à jour de la dépense.");
  }
}
