import { NextRequest } from "next/server";
import { AccessDeniedError, requireAdminMember } from "@/lib/db/auth";
import { exportInventoryTemplate } from "@/lib/inventory/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdminMember();
    const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
    return new Response(exportInventoryTemplate(format), {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="modele-stock-saluni.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const accessDenied = error instanceof AccessDeniedError;
    return Response.json(
      { message: accessDenied ? error.message : "Le modèle n’a pas pu être généré." },
      { status: accessDenied ? 403 : 500 },
    );
  }
}
