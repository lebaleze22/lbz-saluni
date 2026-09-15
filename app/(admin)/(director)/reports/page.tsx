import Link from "next/link";
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  FileText,
  ReceiptText,
  Scissors,
  Scale,
  UserRound,
  UsersRound,
  WalletCards,
  ShoppingBag,
} from "lucide-react";
import { getReportData } from "@/lib/db/reports";
import { AccessDeniedError } from "@/lib/db/auth";
import { addCalendarDays, todayInDouala } from "@/lib/dates";
import { formatFcfa } from "@/lib/format";
import { reportFiltersSchema } from "@/lib/validation/reports";
import { formatQuantity } from "@/lib/inventory/quantities";

export const dynamic = "force-dynamic";

const PERIODS = [
  { value: "week", label: "Hebdomadaire" },
  { value: "month", label: "Mensuel" },
  { value: "quarter", label: "Trimestriel" },
] as const;

function shiftReferenceDate(date: string, period: "week" | "month" | "quarter", amount: number) {
  if (period === "week") return addCalendarDays(date, amount * 7);
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + amount * (period === "month" ? 1 : 3));
  return value.toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { period?: string; date?: string };
}) {
  const parsedFilters = reportFiltersSchema.safeParse({
    period: searchParams?.period ?? "week",
    date: searchParams?.date ?? todayInDouala(),
  });
  const filters = parsedFilters.success
    ? parsedFilters.data
    : reportFiltersSchema.parse({ date: todayInDouala() });

  let report;
  try {
    report = await getReportData(filters.period, filters.date);
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return (
        <main className="w-full px-4 py-20 text-center sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8">
            <h1 className="text-xl font-black text-amber-950">Accès aux rapports indisponible</h1>
            <p className="mt-2 text-sm text-amber-800">{error.message}</p>
          </div>
        </main>
      );
    }
    throw error;
  }

  const query = new URLSearchParams({ period: filters.period, date: filters.date }).toString();
  const topAmount = Math.max(...report.summary.services.map((item) => item.amount), 1);
  const topProductAmount = Math.max(...report.summary.products.map((item) => item.amount), 1);

  return (
    <main className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">
            Pilotage du salon
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">
            Rapports d’activité
          </h1>
          <p className="mt-2 text-sm text-stone-500">{report.range.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/reports/export/pdf?${query}`}
            className="flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold shadow-sm hover:border-emerald-700"
          >
            <FileText className="size-4 text-red-700" /> Exporter en PDF{" "}
            <Download className="size-3.5 text-stone-400" />
          </Link>
          <Link
            href={`/reports/export/excel?${query}`}
            className="flex items-center gap-2 rounded-xl bg-emerald-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-900"
          >
            <FileSpreadsheet className="size-4" /> Exporter en Excel{" "}
            <Download className="size-3.5 text-emerald-300" />
          </Link>
        </div>
      </div>

      <section className="mt-7 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1.5 text-sm font-semibold text-stone-700">
            <span>Période</span>
            <select
              name="period"
              defaultValue={filters.period}
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700"
            >
              {PERIODS.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex-1 space-y-1.5 text-sm font-semibold text-stone-700">
            <span>Date de référence</span>
            <input
              type="date"
              name="date"
              defaultValue={filters.date}
              className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-3 outline-none focus:border-emerald-700"
            />
          </label>
          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-bold text-white"
          >
            <CalendarRange className="size-4" /> Afficher
          </button>
        </form>
        <div className="mt-3 flex flex-wrap justify-between gap-2 border-t border-stone-100 pt-3 text-sm font-bold">
          <Link
            href={`/reports?${new URLSearchParams({ period: filters.period, date: shiftReferenceDate(filters.date, filters.period, -1) })}`}
            className="text-emerald-800 underline"
          >
            ← Période précédente
          </Link>
          <Link
            href={`/reports?${new URLSearchParams({ period: filters.period, date: shiftReferenceDate(filters.date, filters.period, 1) })}`}
            className="text-emerald-800 underline"
          >
            Période suivante →
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="font-black">Résultats des rendez-vous</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Planifiés", report.summary.appointmentOutcomes.scheduled],
            ["Confirmés", report.summary.appointmentOutcomes.confirmed],
            ["Arrivés", report.summary.appointmentOutcomes.arrived],
            ["Terminés", report.summary.appointmentOutcomes.completed],
            ["Annulés", report.summary.appointmentOutcomes.cancelled],
            ["Absents", report.summary.appointmentOutcomes.no_show],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-stone-50 p-4">
              <p className="text-xs text-stone-500">{label}</p>
              <p className="text-2xl font-black">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-stone-500">Rendez-vous non payés</p>
            <p className="text-xl font-black">{report.summary.bookingPayments.unpaid}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Partiellement payés</p>
            <p className="text-xl font-black">{report.summary.bookingPayments.partial}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Payés</p>
            <p className="text-xl font-black">{report.summary.bookingPayments.paid}</p>
          </div>
          <div>
            <p className="text-xs text-stone-500">Solde restant</p>
            <p className="text-xl font-black">
              {formatFcfa(report.summary.bookingPayments.outstandingAmount)}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
        {[
          {
            label: "Chiffre d’affaires",
            value: formatFcfa(report.summary.totalRevenue),
            detail: `${formatFcfa(report.summary.serviceRevenue)} prestations réalisées · ${formatFcfa(report.summary.retailRevenue)} produits`,
            icon: WalletCards,
          },
          {
            label: "Encaissements",
            value: formatFcfa(report.summary.totalCashReceived),
            detail: `${formatFcfa(report.summary.advanceReceipts)} d’acomptes reçus`,
            icon: WalletCards,
          },
          {
            label: "Dépenses",
            value: formatFcfa(report.summary.totalExpenses),
            detail: "sur la période",
            icon: ReceiptText,
          },
          {
            label: "Résultat net",
            value: formatFcfa(report.summary.netResult),
            detail: "chiffre d’affaires − dépenses",
            icon: Scale,
          },
          {
            label: "Prestations",
            value: String(report.summary.serviceVolume),
            detail: "volume total",
            icon: Scissors,
          },
          {
            label: "Ventes produits",
            value: formatFcfa(report.summary.retailRevenue),
            detail: `${report.summary.retailSaleVolume} reçu(s) · ${report.summary.retailQuantitiesByUnit.map((item) => `${formatQuantity(item.quantity)} ${item.unit}`).join(" · ") || "aucune quantité"}`,
            icon: ShoppingBag,
          },
          {
            label: "Nouveaux clients",
            value: String(report.summary.newClients),
            detail: `${report.summary.uniqueClients} client(s) unique(s)`,
            icon: UserRound,
          },
          {
            label: "Clients récurrents",
            value: String(report.summary.recurringClients),
            detail: "déjà venus auparavant",
            icon: UsersRound,
          },
        ].map((card) => (
          <article
            key={card.label}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between">
              <p className="text-sm font-semibold text-stone-500">{card.label}</p>
              <span className="grid size-9 place-items-center rounded-lg bg-emerald-50 text-emerald-900">
                <card.icon className="size-4" />
              </span>
            </div>
            <p className="mt-4 text-2xl font-black tracking-tight">{card.value}</p>
            <p className="mt-1 text-xs text-stone-400">{card.detail}</p>
          </article>
        ))}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <WalletCards className="size-5 text-emerald-800" />
            <h2 className="font-black">Par méthode de paiement</h2>
          </div>
          <div className="space-y-4">
            {report.summary.paymentMethods.map((item) => {
              const percentage = report.summary.totalRevenue
                ? Math.round((item.amount / report.summary.totalRevenue) * 100)
                : 0;
              return (
                <div key={item.method}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-semibold text-stone-600">{item.label}</span>
                    <span className="font-black">{formatFcfa(item.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-emerald-800"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-stone-400">
                    {percentage} % · {item.count} paiement(s)
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-5 flex items-center gap-2">
            <UsersRound className="size-5 text-emerald-800" />
            <h2 className="font-black">Par membre du personnel</h2>
          </div>
          {report.summary.staff.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune donnée pour cette période.</p>
          ) : (
            <div className="divide-y divide-stone-100">
              {report.summary.staff.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid size-8 place-items-center rounded-full bg-stone-100 text-xs font-black text-stone-500">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold">{item.label}</p>
                      <p className="text-xs text-stone-400">{item.count} visite(s)</p>
                    </div>
                  </div>
                  <p className="font-black text-emerald-950">{formatFcfa(item.amount)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 className="size-5 text-emerald-800" />
            <h2 className="font-black">Par prestation</h2>
          </div>
          {report.summary.services.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune donnée pour cette période.</p>
          ) : (
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {report.summary.services.map((item) => (
                <div key={item.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-semibold text-stone-700">
                      {item.label}{" "}
                      <span className="font-normal text-stone-400">× {item.count}</span>
                    </span>
                    <span className="font-black">{formatFcfa(item.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.round((item.amount / topAmount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <ShoppingBag className="size-5 text-emerald-800" />
            <h2 className="font-black">Par produit vendu</h2>
          </div>
          {report.summary.products.length === 0 ? (
            <p className="text-sm text-stone-500">Aucune vente de produit pour cette période.</p>
          ) : (
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              {report.summary.products.map((item) => (
                <div key={item.id}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-4 text-sm">
                    <span className="font-semibold text-stone-700">
                      {item.label}{" "}
                      <span className="font-normal text-stone-400">
                        {item.saleCount} vente(s) · {formatQuantity(item.quantity)} {item.unit}
                      </span>
                    </span>
                    <span className="font-black">{formatFcfa(item.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-emerald-700"
                      style={{ width: `${Math.round((item.amount / topProductAmount) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
