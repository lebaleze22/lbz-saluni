import { NextRequest } from "next/server";
import { requireAdminMember, AccessDeniedError } from "@/lib/db/auth";
import { exportClients } from "@/lib/db/client-transfer";
import { exportClientFile } from "@/lib/clients/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    await requireAdminMember();
    const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
    const status = request.nextUrl.searchParams.get("status") ?? "active";
    if ((format !== "csv" && format !== "xlsx") || !["active", "archived", "all"].includes(status))
      return Response.json({ message: "Format ou sélection invalide." }, { status: 400 });
    const template = request.nextUrl.searchParams.get("template") === "1";
    const clients = template ? [] : await exportClients(status as "active" | "archived" | "all");
    return new Response(exportClientFile(clients, format), {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="clients-${template ? "modele" : status}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { message: "Export indisponible." },
      { status: error instanceof AccessDeniedError ? 403 : 500 },
    );
  }
}
