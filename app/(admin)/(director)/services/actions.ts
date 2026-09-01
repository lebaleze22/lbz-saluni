"use server";

import { revalidatePath } from "next/cache";
import { AccessDeniedError } from "@/lib/db/auth";
import {
  changeServiceStatus,
  createService,
  ServiceDataError,
  updateService,
} from "@/lib/db/services";
import {
  serviceInputSchema,
  serviceMutationSchema,
  serviceStatusSchema,
} from "@/lib/validation/services";

export type ServiceFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  submissionId?: number;
};

const TECHNICAL_ERROR = "Une erreur technique a empêché l’enregistrement de la prestation.";

function failure(error: unknown, fallback = TECHNICAL_ERROR): ServiceFormState {
  return {
    success: false,
    message:
      error instanceof ServiceDataError || error instanceof AccessDeniedError
        ? error.message
        : fallback,
  };
}

function refreshServicePages() {
  revalidatePath("/services");
  revalidatePath("/register");
}

export async function createServiceAction(
  _previousState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = serviceInputSchema.safeParse({
    name: formData.get("name"),
    defaultPrice: formData.get("defaultPrice"),
    categoryId: formData.get("categoryId"),
    newCategory: formData.get("newCategory"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Certaines informations doivent être corrigées.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await createService(parsed.data);
    refreshServicePages();
    return {
      success: true,
      message: "La prestation a bien été ajoutée.",
      submissionId: Date.now(),
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateServiceAction(
  _previousState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = serviceMutationSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    defaultPrice: formData.get("defaultPrice"),
    categoryId: formData.get("categoryId"),
    newCategory: formData.get("newCategory"),
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
    await updateService(id, input);
    refreshServicePages();
    return { success: true, message: "La prestation a bien été modifiée." };
  } catch (error) {
    return failure(error);
  }
}

const STATUS_MESSAGES = {
  activate: "La prestation est maintenant active.",
  deactivate: "La prestation a été désactivée.",
  archive: "La prestation a été archivée.",
  restore: "La prestation a été restaurée. Elle reste inactive jusqu’à sa réactivation.",
} as const;

export async function changeServiceStatusAction(
  _previousState: ServiceFormState,
  formData: FormData,
): Promise<ServiceFormState> {
  const parsed = serviceStatusSchema.safeParse({
    id: formData.get("id"),
    operation: formData.get("operation"),
  });

  if (!parsed.success) {
    return { success: false, message: "L’action demandée est invalide." };
  }

  try {
    await changeServiceStatus(parsed.data.id, parsed.data.operation);
    refreshServicePages();
    return { success: true, message: STATUS_MESSAGES[parsed.data.operation] };
  } catch (error) {
    return failure(error, "Une erreur technique a empêché la mise à jour de la prestation.");
  }
}
