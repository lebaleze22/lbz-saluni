import { revalidatePath } from "next/cache";
import { NextRequest } from "next/server";
import { AccessDeniedError, requireAdminMember } from "@/lib/db/auth";
import { importInventory } from "@/lib/db/inventory-transfer";
import {
  INVENTORY_FILE_LIMIT,
  InventoryFileError,
  parseInventoryFile,
} from "@/lib/inventory/files";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireAdminMember();
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return Response.json({ message: "Origine de requête invalide." }, { status: 403 });
    const reader = request.body?.getReader();
    if (!reader) throw new InventoryFileError("Fichier manquant.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > INVENTORY_FILE_LIMIT + 65536) {
        await reader.cancel();
        throw new InventoryFileError("Le fichier dépasse 2 Mo.");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new InventoryFileError("Sélectionnez un fichier.");
    const parsed = parseInventoryFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (parsed.errors.length)
      return Response.json(
        {
          message:
            "Corrigez toutes les lignes indiquées puis rechargez le fichier. Aucun stock n’a été modifié.",
          errors: parsed.errors,
          rejected: parsed.errors.length,
        },
        { status: 400 },
      );
    const commit = form.get("mode") === "import";
    const result = await importInventory(parsed.products, commit);
    if (commit) {
      revalidatePath("/inventory");
      revalidatePath("/sales");
      revalidatePath("/reports");
    }
    return Response.json({ ...result, preview: !commit });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof InventoryFileError || error instanceof AccessDeniedError
            ? error.message
            : "L’import du stock a échoué. Vérifiez le fichier et réessayez.",
      },
      { status: error instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
