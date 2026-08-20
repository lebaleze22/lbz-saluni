import * as XLSX from "xlsx";
import { formatFcfa, PAYMENT_METHOD_LABELS, SOURCE_LABELS } from "@/lib/format";
import type { ReportData } from "@/types/reports";

export function generateReportWorkbook(report: ReportData): Buffer {
  const details = report.rows.flatMap((appointment) =>
    appointment.services.map((service) => ({
      Date: appointment.startTime,
      Heure: new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Douala",
      }).format(appointment.startTime),
      Client: appointment.client.name,
      Personnel: appointment.staff.name,
      Prestation: service.name,
      "Prix (FCFA)": service.price,
      Origine: SOURCE_LABELS[appointment.source],
      "Méthode de paiement": appointment.payments
        .map((payment) => PAYMENT_METHOD_LABELS[payment.method])
        .join(" + "),
      "Total visite (FCFA)": appointment.payments.reduce((sum, payment) => sum + payment.amount, 0),
    })),
  );

  const summary = [
    { Indicateur: "Période", Valeur: report.range.label },
    {
      Indicateur: "Chiffre d’affaires total",
      Valeur: formatFcfa(report.summary.totalRevenue),
    },
    { Indicateur: "Nombre de prestations", Valeur: report.summary.serviceVolume },
    { Indicateur: "Nombre de visites", Valeur: report.summary.visitVolume },
    { Indicateur: "Clients uniques", Valeur: report.summary.uniqueClients },
    { Indicateur: "Nouveaux clients", Valeur: report.summary.newClients },
    { Indicateur: "Clients récurrents", Valeur: report.summary.recurringClients },
    ...report.summary.paymentMethods.map((item) => ({
      Indicateur: `CA - ${item.label}`,
      Valeur: formatFcfa(item.amount),
    })),
  ];

  const workbook = XLSX.utils.book_new();
  const detailsSheet = XLSX.utils.json_to_sheet(details, {
    cellDates: true,
  });
  const detailsRange = XLSX.utils.decode_range(detailsSheet["!ref"] ?? "A1:A1");
  for (let row = 1; row <= detailsRange.e.r; row += 1) {
    for (const column of [5, 8]) {
      const cell = detailsSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '# ##0 "FCFA"';
    }
  }
  detailsSheet["!cols"] = [
    { wch: 13 },
    { wch: 8 },
    { wch: 24 },
    { wch: 22 },
    { wch: 28 },
    { wch: 15 },
    { wch: 15 },
    { wch: 24 },
    { wch: 20 },
  ];
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 28 }];

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Synthèse");
  XLSX.utils.book_append_sheet(workbook, detailsSheet, "Prestations");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
