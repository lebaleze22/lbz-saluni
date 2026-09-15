"use server";

import { revalidatePath } from "next/cache";
import {
  changeAppointmentStatus,
  completeAppointment,
  createAppointment,
  recordAppointmentPayment,
} from "@/lib/db/appointments";
import {
  appointmentCheckoutSchema,
  appointmentInputSchema,
  appointmentPaymentSchema,
  appointmentStatusSchema,
} from "@/lib/validation/appointments";
import { doualaInputToIso } from "@/lib/dates";
import { mutationFailure, type MutationState } from "@/lib/actions/state";

function refresh(id?: string) {
  revalidatePath("/appointments", "layout");
  revalidatePath("/register");
  revalidatePath("/clients", "layout");
  revalidatePath("/reports");
  if (id) revalidatePath(`/appointments/${id}`);
}

function parseInput(form: FormData) {
  const values = Object.fromEntries(form);
  let services: unknown = [];
  try {
    services = JSON.parse(String(values.services ?? "[]"));
  } catch {}
  return appointmentInputSchema.safeParse({
    ...values,
    startTime: doualaInputToIso(String(values.startTime ?? "")),
    services,
  });
}

export async function createAppointmentAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = parseInput(form);
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez les informations du rendez-vous.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    const appointment = await createAppointment(parsed.data);
    refresh(appointment.id);
    return {
      success: true,
      message:
        (parsed.data.paymentAmount ?? 0) > 0
          ? "Le rendez-vous et son acompte ont été enregistrés."
          : "Le rendez-vous non payé a été planifié.",
      recordId: appointment.id,
      submissionId: Date.now(),
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function changeAppointmentStatusAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = appointmentStatusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, message: "L’action demandée est invalide." };
  try {
    await changeAppointmentStatus(parsed.data.id, parsed.data.status);
    refresh(parsed.data.id);
    return { success: true, message: "Le statut a été mis à jour.", submissionId: Date.now() };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function completeAppointmentAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = appointmentCheckoutSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, message: "Sélectionnez une méthode de paiement." };
  try {
    await completeAppointment(parsed.data.id, parsed.data.paymentMethod);
    refresh(parsed.data.id);
    return {
      success: true,
      message: "La visite, le paiement et les consommations ont été enregistrés.",
      submissionId: Date.now(),
    };
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function recordAppointmentPaymentAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = appointmentPaymentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez le montant et la méthode de paiement.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await recordAppointmentPayment(parsed.data.id, parsed.data.amount, parsed.data.paymentMethod);
    refresh(parsed.data.id);
    return { success: true, message: "Le paiement a été enregistré.", submissionId: Date.now() };
  } catch (error) {
    return mutationFailure(error);
  }
}
