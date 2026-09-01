import { NextRequest } from "next/server";
import { getReportData } from "@/lib/db/reports";
import { generateReportPdf } from "@/lib/reports/pdf";
import { reportFiltersSchema } from "@/lib/validation/reports";
import { todayInDouala } from "@/lib/dates";
import { AccessDeniedError } from "@/lib/db/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const parsed = reportFiltersSchema.safeParse({
    period: request.nextUrl.searchParams.get("period") ?? "week",
    date: request.nextUrl.searchParams.get("date") ?? todayInDouala(),
  });

  if (!parsed.success) {
    return Response.json({ message: "Les filtres du rapport sont invalides." }, { status: 400 });
  }

  try {
    const report = await getReportData(parsed.data.period, parsed.data.date);
    const pdf = await generateReportPdf(report);
    return new Response(new Uint8Array(pdf).buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="rapport-lbz-${parsed.data.period}-${parsed.data.date}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const accessDenied = error instanceof AccessDeniedError;
    return Response.json(
      {
        message: accessDenied
          ? error.message
          : "Une erreur technique a empêché la génération du rapport PDF.",
      },
      { status: accessDenied ? 403 : 500 },
    );
  }
}
