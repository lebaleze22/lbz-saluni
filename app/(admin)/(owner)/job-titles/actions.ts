"use server";
import { revalidatePath } from "next/cache";
import { changeJobTitleStatus, JobTitleDataError, saveJobTitle } from "@/lib/db/job-titles";
import {
  jobTitleInputSchema,
  jobTitleStatusSchema,
  jobTitleUpdateSchema,
} from "@/lib/validation/job-titles";

export type OwnerFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  submissionId?: number;
};
const fail = (error: unknown): OwnerFormState => ({
  success: false,
  message:
    error instanceof JobTitleDataError ? error.message : "Une erreur technique est survenue.",
});
function refresh() {
  revalidatePath("/job-titles");
  revalidatePath("/staff");
  revalidatePath("/staff/nouveau");
}

export async function createJobTitleAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = jobTitleInputSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success)
    return {
      success: false,
      message: "Corrigez le formulaire.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await saveJobTitle(null, parsed.data.name);
    refresh();
    return { success: true, message: "Poste ajouté.", submissionId: Date.now() };
  } catch (error) {
    return fail(error);
  }
}
export async function updateJobTitleAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = jobTitleUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
  });
  if (!parsed.success)
    return {
      success: false,
      message: "Corrigez le formulaire.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await saveJobTitle(parsed.data.id, parsed.data.name);
    refresh();
    return { success: true, message: "Poste modifié." };
  } catch (error) {
    return fail(error);
  }
}
export async function changeJobTitleStatusAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = jobTitleStatusSchema.safeParse({
    id: formData.get("id"),
    operation: formData.get("operation"),
  });
  if (!parsed.success) return { success: false, message: "Action invalide." };
  try {
    await changeJobTitleStatus(parsed.data.id, parsed.data.operation);
    refresh();
    return { success: true, message: "Statut mis à jour." };
  } catch (error) {
    return fail(error);
  }
}
