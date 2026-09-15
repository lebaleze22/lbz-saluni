import { AccessDeniedError } from "../db/auth";
import { ClientDataError } from "../db/clients";
import { InventoryDataError } from "../db/stock";
import { AppointmentDataError } from "../db/appointments";

export type MutationState = {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  recordId?: string;
  submissionId?: number;
};

export function mutationFailure(error: unknown): MutationState {
  if (
    error instanceof AccessDeniedError ||
    error instanceof ClientDataError ||
    error instanceof InventoryDataError ||
    error instanceof AppointmentDataError
  ) {
    return { success: false, message: error.message };
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    return {
      success: false,
      message: "Cette référence existe déjà. Utilisez une autre référence.",
    };
  }
  console.error("[saluni mutation]", error instanceof Error ? error.name : "UnknownError");
  return {
    success: false,
    message: "L’enregistrement a échoué. Réessayez ou contactez votre administrateur.",
  };
}
