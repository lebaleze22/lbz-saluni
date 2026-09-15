"use server";

import { revalidatePath } from "next/cache";
import { retailSaleSchema } from "@/lib/validation/retail";
import { createRetailSale } from "@/lib/db/retail";
import { mutationFailure, type MutationState } from "@/lib/actions/state";

export async function sellProduct(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  const parsed = retailSaleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return {
      success: false,
      message: "Vérifiez le produit, la quantité, le prix et la date.",
      errors: parsed.error.flatten().fieldErrors,
    };
  }
  try {
    const sale = await createRetailSale(parsed.data);
    for (const path of ["/sales", "/inventory", "/reports", "/clients"]) {
      revalidatePath(path, "layout");
    }
    return {
      success: true,
      message: "Vente enregistrée et stock mis à jour.",
      recordId: sale.id,
      submissionId: Date.now(),
    };
  } catch (error) {
    return mutationFailure(error);
  }
}
