import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminMember, AccessDeniedError } from "@/lib/db/auth";
import { importClients } from "@/lib/db/client-transfer";
import { parseClientFile, ClientFileError, CLIENT_FILE_LIMIT } from "@/lib/clients/files";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    await requireAdminMember();
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== request.headers.get("host"))
      return Response.json({ message: "Origine de requête invalide." }, { status: 403 });
    // Bound the entire multipart request before parsing it.
    const reader = request.body?.getReader();
    if (!reader) throw new ClientFileError("Fichier manquant.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > CLIENT_FILE_LIMIT + 65536) {
        await reader.cancel();
        throw new ClientFileError("Le fichier dépasse 2 Mo.");
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("file");
    if (!file || typeof file === "string") throw new ClientFileError("Sélectionnez un fichier.");
    const parsed = parseClientFile(new Uint8Array(await file.arrayBuffer()), file.name);
    if (parsed.errors.length)
      return Response.json(
        {
          message: "Corrigez les lignes indiquées puis rechargez le fichier. Aucun client importé.",
          errors: parsed.errors,
        },
        { status: 400 },
      );
    const commit = form.get("mode") === "import";
    const result = await importClients(parsed.clients, commit);
    if (commit) {
      revalidatePath("/clients");
      revalidatePath("/register");
    }
    return Response.json({
      ...result,
      preview: !commit,
      samples: commit
        ? []
        : parsed.clients
            .slice(0, 10)
            .map(({ name, phone, email, sex }) => ({ name, phone, email, sex })),
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof ClientFileError || error instanceof AccessDeniedError
            ? error.message
            : "L’import a échoué. Vérifiez le fichier et réessayez.",
      },
      { status: error instanceof AccessDeniedError ? 403 : 400 },
    );
  }
}
