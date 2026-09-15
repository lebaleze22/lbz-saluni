"use server";

import { revalidatePath } from "next/cache";
import { createRegisterEntry, RegisterDataError } from "@/lib/db/register";
import { AccessDeniedError } from "@/lib/db/auth";
import { registerEntrySchema } from "@/lib/validation/register";
import { InventoryDataError } from "@/lib/db/stock";

export type RegisterFormState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
  submissionId?: number;
};

export async function submitRegisterEntry(
  _previousState: RegisterFormState,
  formData: FormData,
): Promise<RegisterFormState> {
  let services: unknown = [];
  try {
    services = JSON.parse(String(formData.get("services") ?? "[]"));
  } catch {
    return {
      success: false,
      message: "Les prestations saisies sont invalides.",
      errors: { services: ["Vérifiez les prestations et réessayez."] },
    };
  }

  const parsed = registerEntrySchema.safeParse({
    entryMode: formData.get("entryMode"),
    clientId: formData.get("clientId"),
    clientName: formData.get("clientName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    sex: formData.get("sex"),
    staffId: formData.get("staffId"),
    source: formData.get("source"),
    startTime: formData.get("startTime"),
    durationMinutes: formData.get("durationMinutes"),
    services,
    paymentAmount: formData.get("paymentAmount"),
    paymentMethod: formData.get("paymentMethod"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: "Certaines informations doivent être corrigées.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await createRegisterEntry(parsed.data);
    revalidatePath("/register");
    revalidatePath("/reports");
    revalidatePath("/appointments", "layout");
    revalidatePath("/clients", "layout");
    revalidatePath("/inventory", "layout");
    return {
      success: true,
      message:
        parsed.data.entryMode === "appointment"
          ? parsed.data.paymentAmount > 0
            ? "Le rendez-vous et son acompte ont été enregistrés."
            : "Le rendez-vous non payé a été planifié."
          : "La visite a bien été ajoutée au registre.",
      submissionId: Date.now(),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof RegisterDataError ||
        error instanceof AccessDeniedError ||
        error instanceof InventoryDataError
          ? error.message
          : "Une erreur technique a empêché l’enregistrement de la visite.",
    };
  }
}
