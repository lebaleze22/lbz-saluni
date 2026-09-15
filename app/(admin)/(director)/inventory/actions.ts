"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  updateProduct,
  moveStock,
  changeProductStatus,
  saveServiceProduct,
} from "@/lib/db/inventory";
import {
  productCreateSchema,
  productMutationSchema,
  productStatusSchema,
  stockMovementSchema,
  serviceProductSchema,
  removeServiceProductSchema,
} from "@/lib/validation/inventory";
import { mutationFailure, type MutationState } from "@/lib/actions/state";

function refresh() {
  revalidatePath("/inventory", "layout");
  revalidatePath("/services");
  revalidatePath("/register");
}
const saved = (message: string, recordId?: string): MutationState => ({
  success: true,
  message,
  recordId,
  submissionId: Date.now(),
});

export async function createProductAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = productCreateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez les informations du produit.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    const product = await createProduct(parsed.data);
    refresh();
    return saved("Le produit et son stock initial ont été enregistrés.", product.id);
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function updateProductAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = productMutationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez les informations du produit.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    const { id, ...input } = parsed.data;
    await updateProduct(id, input);
    refresh();
    return saved("Le produit a été mis à jour.");
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function moveStockAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = stockMovementSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez le mouvement de stock.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await moveStock(parsed.data);
    refresh();
    return saved("Le stock et son historique ont été mis à jour.");
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function changeProductStatusAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = productStatusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, message: "L’action demandée est invalide." };
  try {
    await changeProductStatus(parsed.data.id, parsed.data.operation);
    refresh();
    return saved(
      parsed.data.operation === "archive"
        ? "Le produit a été archivé. L’historique est conservé."
        : "Le produit a été restauré.",
    );
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function saveServiceProductAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = serviceProductSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      success: false,
      message: "Vérifiez le produit et la quantité.",
      errors: parsed.error.flatten().fieldErrors,
    };
  try {
    await saveServiceProduct(parsed.data.serviceId, parsed.data.productId, parsed.data.quantity);
    refresh();
    return saved("La consommation a été enregistrée pour les prochaines visites.");
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function removeServiceProductAction(
  _state: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = removeServiceProductSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, message: "L’association demandée est invalide." };
  try {
    await saveServiceProduct(parsed.data.serviceId, parsed.data.productId, null);
    refresh();
    return saved("Le produit a été retiré des prochaines consommations.");
  } catch (error) {
    return mutationFailure(error);
  }
}
