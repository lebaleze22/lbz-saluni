"use server";
import { revalidatePath } from "next/cache";
import { changeStaffStatus, createStaff, StaffDataError, updateStaff } from "@/lib/db/staff";
import { staffCreateSchema, staffStatusSchema, staffUpdateSchema } from "@/lib/validation/staff";
import type { OwnerFormState } from "@/app/(admin)/(owner)/job-titles/actions";

function refresh() {
  revalidatePath("/staff");
  revalidatePath("/staff/nouveau");
  revalidatePath("/register");
}

function readJobTitleIds(formData: FormData) {
  try {
    const value = JSON.parse(String(formData.get("jobTitleIds") ?? "[]"));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
const fail = (error: unknown): OwnerFormState => ({
  success: false,
  message:
    error instanceof StaffDataError
      ? error.message
      : "L’opération n’a pas pu aboutir. Vérifiez notamment que l’e-mail et le rôle ne sont pas déjà utilisés.",
});

export async function createStaffAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = staffCreateSchema.safeParse({
    name: formData.get("name"),
    sex: formData.get("sex"),
    phone: formData.get("phone"),
    residence: formData.get("residence"),
    idType: formData.get("idType"),
    idNumber: formData.get("idNumber"),
    yearsOfExperience: formData.get("yearsOfExperience"),
    jobTitleIds: readJobTitleIds(formData),
    primaryJobTitleId: formData.get("primaryJobTitleId"),
    newJobTitle: formData.get("newJobTitle"),
    newJobTitleIsPrimary: formData.get("newJobTitleIsPrimary"),
    payType: formData.get("payType"),
    payAmount: formData.get("payAmount"),
    systemRole: formData.get("systemRole"),
    email: formData.get("email") ?? undefined,
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const details = Array.from(
      new Set(Object.values(errors).flatMap((messages) => messages ?? [])),
    );
    return {
      success: false,
      message:
        details.length > 0
          ? `À corriger : ${details.join(" ")}`
          : "Corrigez les informations indiquées.",
      errors,
    };
  }
  try {
    await createStaff(parsed.data);
    refresh();
    return { success: true, message: "Membre ajouté à l’équipe.", submissionId: Date.now() };
  } catch (error) {
    return fail(error);
  }
}
export async function updateStaffAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = staffUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    jobTitleIds: readJobTitleIds(formData),
    primaryJobTitleId: formData.get("primaryJobTitleId"),
  });
  if (!parsed.success)
    return {
      success: false,
      message: "Corrigez le formulaire.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await updateStaff(parsed.data);
    refresh();
    return { success: true, message: "Membre modifié." };
  } catch (error) {
    return fail(error);
  }
}
export async function changeStaffStatusAction(
  _: OwnerFormState,
  formData: FormData,
): Promise<OwnerFormState> {
  const parsed = staffStatusSchema.safeParse({
    id: formData.get("id"),
    operation: formData.get("operation"),
  });
  if (!parsed.success) return { success: false, message: "Action invalide." };
  try {
    await changeStaffStatus(parsed.data.id, parsed.data.operation);
    refresh();
    return { success: true, message: "Statut mis à jour." };
  } catch (error) {
    return fail(error);
  }
}
