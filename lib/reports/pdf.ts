import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDateFr, formatFcfa, formatTimeFr, PAYMENT_METHOD_LABELS } from "@/lib/format";
import type { ReportData } from "@/types/reports";
import { formatQuantity } from "@/lib/inventory/quantities";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;

function printable(value: string): string {
  return value.replace("ᵉ", "e").replace(/[–—]/g, "-");
}

export async function generateReportPdf(report: ReportData): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const addPage = () => {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };
  const ensureSpace = (height: number) => {
    if (y - height < MARGIN) addPage();
  };
  const line = (
    text: string,
    options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const size = options.size ?? 10;
    ensureSpace(size + 8);
    page.drawText(printable(text), {
      x: MARGIN,
      y,
      size,
      font: options.font ?? regular,
      color: options.color ?? rgb(0.12, 0.13, 0.16),
      maxWidth: PAGE_WIDTH - MARGIN * 2,
    });
    y -= size + 8;
  };
  const section = (title: string) => {
    y -= 8;
    line(title, { size: 13, font: bold, color: rgb(0.13, 0.35, 0.29) });
  };

  line("LBZ - Rapport d'activité", { size: 20, font: bold });
  line(report.range.label, { size: 11, color: rgb(0.38, 0.4, 0.44) });
  y -= 6;
  line(`Chiffre d'affaires : ${formatFcfa(report.summary.totalRevenue)}`, {
    size: 15,
    font: bold,
  });
  line(`Prestations : ${formatFcfa(report.summary.serviceRevenue)}`);
  line(`Ventes produits : ${formatFcfa(report.summary.retailRevenue)}`);
  line(`Encaissements : ${formatFcfa(report.summary.totalCashReceived)}`);
  line(`Acomptes reçus : ${formatFcfa(report.summary.advanceReceipts)}`);
  line(`Dépenses : ${formatFcfa(report.summary.totalExpenses)}`);
  line(`Résultat net : ${formatFcfa(report.summary.netResult)}`, { size: 13, font: bold });
  line(
    `${report.summary.serviceVolume} prestation(s) • ${report.summary.visitVolume} visite(s) • ${report.summary.uniqueClients} client(s)`,
  );
  line(
    `Rendez-vous : ${report.summary.appointmentOutcomes.scheduled} planifié(s), ${report.summary.appointmentOutcomes.confirmed} confirmé(s), ${report.summary.appointmentOutcomes.arrived} arrivé(s)`,
  );
  line(
    `Statuts suivants : ${report.summary.appointmentOutcomes.completed} terminé(s), ${report.summary.appointmentOutcomes.cancelled} annulé(s), ${report.summary.appointmentOutcomes.no_show} absent(s)`,
  );
  line(
    `Paiement RDV ouverts : ${report.summary.bookingPayments.unpaid} non payé(s), ${report.summary.bookingPayments.partial} partiel(s), ${report.summary.bookingPayments.paid} payé(s)`,
  );
  line(
    `Solde restant des RDV ouverts : ${formatFcfa(report.summary.bookingPayments.outstandingAmount)}`,
  );

  section("Répartition par méthode de paiement");
  for (const item of report.summary.paymentMethods) {
    line(`${item.label} : ${formatFcfa(item.amount)} (${item.count} paiement(s))`);
  }

  section("Répartition par membre du personnel");
  if (report.summary.staff.length === 0) line("Aucune donnée sur cette période.");
  for (const item of report.summary.staff) {
    line(`${item.label} : ${formatFcfa(item.amount)} (${item.count} visite(s))`);
  }

  section("Répartition par prestation");
  if (report.summary.services.length === 0) line("Aucune donnée sur cette période.");
  for (const item of report.summary.services) {
    line(`${item.label} : ${formatFcfa(item.amount)} (${item.count})`);
  }

  section("Détail des prestations");
  for (const appointment of report.rows) {
    for (const service of appointment.services) {
      ensureSpace(44);
      line(
        `${formatDateFr(appointment.startTime)} à ${formatTimeFr(appointment.startTime)} - ${appointment.client.name}`,
        { font: bold },
      );
      line(
        `${service.name} • ${appointment.staff.name} • ${formatFcfa(service.price)} • ${appointment.payments
          .map((payment) => PAYMENT_METHOD_LABELS[payment.method])
          .join(" + ")}`,
        { size: 9, color: rgb(0.38, 0.4, 0.44) },
      );
    }
  }

  section("Ventes de produits");
  for (const product of report.summary.products) {
    line(
      `${printable(product.label)} : ${product.saleCount} vente(s), ${formatQuantity(product.quantity)} ${printable(product.unit)}, ${formatFcfa(product.amount)}`,
      { font: bold },
    );
  }
  if (report.retailSales.length === 0) line("Aucune vente de produit sur cette période.");
  for (const sale of report.retailSales) {
    line(
      `${formatDateFr(sale.soldAt)} ${formatTimeFr(sale.soldAt)} • ${printable(sale.productName)} • ${sale.quantity} ${printable(sale.unit)} x ${formatFcfa(sale.unitPrice)} • ${formatFcfa(sale.total)}`,
      { size: 9 },
    );
    line(
      `${sale.clientName ? printable(sale.clientName) : "Sans fiche client"} • ${PAYMENT_METHOD_LABELS[sale.method]} • ${printable(sale.recordedByName)} • ${sale.id}`,
      { size: 8, color: rgb(0.38, 0.4, 0.44) },
    );
  }

  const pages = document.getPages();
  pages.forEach((currentPage: PDFPage, index: number) => {
    currentPage.drawText(`Page ${index + 1} sur ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN - 70,
      y: 24,
      size: 8,
      font: regular,
      color: rgb(0.45, 0.47, 0.5),
    });
  });

  return document.save();
}
