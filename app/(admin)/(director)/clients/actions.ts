"use server";

import { revalidatePath } from "next/cache";
import {
  clientInputSchema,
  clientMutationSchema,
  clientStatusSchema,
} from "@/lib/validation/clients";
import { saveClient, changeClientStatus } from "@/lib/db/clients";
import { mutationFailure, type MutationState } from "@/lib/actions/state";
import { clientActivitySchema } from "@/lib/validation/client-activity";
import { addClientActivity } from "@/lib/db/client-activities";

export async function addClientActivityAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = clientActivitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez la date et le contenu du suivi.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await addClientActivity(parsed.data);
    revalidatePath(`/clients/${parsed.data.clientId}`);
    return {
      success: true,
      message: "Le suivi a été ajouté au dossier.",
      submissionId: Date.now(),
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

function refresh(id: string) {
  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/register");
  revalidatePath("/reports");
}

export async function saveClientAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const fields = Object.fromEntries(formData);
  const schema = fields.id ? clientMutationSchema : clientInputSchema;
  const parsed = schema.safeParse(fields);
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez les informations du client.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    const id = "id" in parsed.data ? String(parsed.data.id) : null;
    const client = await saveClient(id, parsed.data);
    refresh(client.id);
    return {
      success: true,
      message: id ? "La fiche client a été mise à jour." : "Le client a été ajouté.",
      recordId: client.id,
      submissionId: Date.now(),
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function changeClientStatusAction(
  _previous: MutationState,
  formData: FormData,
): Promise<MutationState> {
  const parsed = clientStatusSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "L’action demandée est invalide." };
  try {
    await changeClientStatus(parsed.data.id, parsed.data.operation);
    refresh(parsed.data.id);
    return {
      success: true,
      message:
        parsed.data.operation === "archive"
          ? "Le client est archivé. Son historique est conservé."
          : "Le client a été restauré.",
    };
  } catch (error) {
    return mutationFailure(error);
  }
}
