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
    {
      Indicateur: "Chiffre d’affaires prestations",
      Valeur: formatFcfa(report.summary.serviceRevenue),
    },
    { Indicateur: "Chiffre d’affaires produits", Valeur: formatFcfa(report.summary.retailRevenue) },
    { Indicateur: "Encaissements totaux", Valeur: formatFcfa(report.summary.totalCashReceived) },
    { Indicateur: "Encaissements prestations", Valeur: formatFcfa(report.summary.serviceReceipts) },
    { Indicateur: "Acomptes reçus", Valeur: formatFcfa(report.summary.advanceReceipts) },
    { Indicateur: "Reçus de vente produit", Valeur: report.summary.retailSaleVolume },
    ...report.summary.retailQuantitiesByUnit.map((item) => ({
      Indicateur: `Quantité vendue — ${item.unit}`,
      Valeur: Number(item.quantity),
    })),
    { Indicateur: "Dépenses totales", Valeur: formatFcfa(report.summary.totalExpenses) },
    { Indicateur: "Résultat net", Valeur: formatFcfa(report.summary.netResult) },
    { Indicateur: "Nombre de prestations", Valeur: report.summary.serviceVolume },
    { Indicateur: "Nombre de visites", Valeur: report.summary.visitVolume },
    { Indicateur: "Clients uniques", Valeur: report.summary.uniqueClients },
    { Indicateur: "Nouveaux clients", Valeur: report.summary.newClients },
    { Indicateur: "Clients récurrents", Valeur: report.summary.recurringClients },
    { Indicateur: "Rendez-vous planifiés", Valeur: report.summary.appointmentOutcomes.scheduled },
    { Indicateur: "Rendez-vous confirmés", Valeur: report.summary.appointmentOutcomes.confirmed },
    { Indicateur: "Rendez-vous arrivés", Valeur: report.summary.appointmentOutcomes.arrived },
    { Indicateur: "Rendez-vous terminés", Valeur: report.summary.appointmentOutcomes.completed },
    { Indicateur: "Rendez-vous annulés", Valeur: report.summary.appointmentOutcomes.cancelled },
    { Indicateur: "Rendez-vous absents", Valeur: report.summary.appointmentOutcomes.no_show },
    { Indicateur: "Rendez-vous non payés", Valeur: report.summary.bookingPayments.unpaid },
    {
      Indicateur: "Rendez-vous partiellement payés",
      Valeur: report.summary.bookingPayments.partial,
    },
    { Indicateur: "Rendez-vous payés", Valeur: report.summary.bookingPayments.paid },
    {
      Indicateur: "Solde restant des rendez-vous",
      Valeur: formatFcfa(report.summary.bookingPayments.outstandingAmount),
    },
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
  const retailSheet = XLSX.utils.json_to_sheet(
    report.retailSales.map((sale) => ({
      Date: sale.soldAt,
      Heure: new Intl.DateTimeFormat("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Douala",
      }).format(sale.soldAt),
      Produit: sale.productName,
      Quantité: Number(sale.quantity),
      Unité: sale.unit,
      "Prix unitaire (FCFA)": sale.unitPrice,
      "Total (FCFA)": sale.total,
      Paiement: PAYMENT_METHOD_LABELS[sale.method],
      Client: sale.clientName ?? "Sans fiche client",
      "Enregistré par": sale.recordedByName,
      "Référence reçu": sale.id,
    })),
    { cellDates: true },
  );
  retailSheet["!cols"] = [
    { wch: 13 },
    { wch: 8 },
    { wch: 28 },
    { wch: 12 },
    { wch: 10 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 24 },
    { wch: 24 },
    { wch: 38 },
  ];
  const retailRange = XLSX.utils.decode_range(retailSheet["!ref"] ?? "A1:A1");
  for (let row = 1; row <= retailRange.e.r; row += 1) {
    for (const column of [5, 6]) {
      const cell = retailSheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell) cell.z = '# ##0 "FCFA"';
    }
  }

  XLSX.utils.book_append_sheet(workbook, summarySheet, "Synthèse");
  XLSX.utils.book_append_sheet(workbook, detailsSheet, "Prestations");
  XLSX.utils.book_append_sheet(workbook, retailSheet, "Ventes produits");
  const productSheet = XLSX.utils.json_to_sheet(
    report.summary.products.map((product) => ({
      Produit: product.label,
      "Nombre de ventes": product.saleCount,
      "Quantité vendue": Number(product.quantity),
      Unité: product.unit,
      "Chiffre d’affaires (FCFA)": product.amount,
    })),
  );
  productSheet["!cols"] = [{ wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(workbook, productSheet, "Synthèse produits");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
