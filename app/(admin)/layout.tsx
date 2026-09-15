import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ReceiptText,
  Scissors,
  Sparkles,
  Users,
  ContactRound,
  Package,
  ShoppingBag,
  CalendarDays,
} from "lucide-react";
import { AccessDeniedError, requireAdminMember } from "@/lib/db/auth";
import { LogoutButton } from "@/app/(admin)/logout-button";

const OPERATIONAL_LINKS = [
  { href: "/register", label: "Registre", icon: BookOpen },
  { href: "/appointments", label: "Agenda", icon: CalendarDays },
  { href: "/clients", label: "Clients", icon: ContactRound },
  { href: "/services", label: "Prestations", icon: Sparkles },
  { href: "/inventory", label: "Stock", icon: Package },
  { href: "/sales", label: "Ventes", icon: ShoppingBag },
  { href: "/expenses", label: "Dépenses", icon: ReceiptText },
  { href: "/reports", label: "Rapports", icon: BarChart3 },
];

const OWNER_LINKS = [
  { href: "/staff", label: "Équipe", icon: Users },
  { href: "/job-titles", label: "Postes", icon: BriefcaseBusiness },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let member;
  try {
    member = await requireAdminMember();
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/login");
    throw error;
  }

  const links =
    member.role === "owner" ? [...OPERATIONAL_LINKS, ...OWNER_LINKS] : OPERATIONAL_LINKS;
  const home = links[0].href;

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-950">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-emerald-950 px-4 py-6 text-white lg:flex">
        <Link href={home} className="flex items-center gap-3 px-2">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-emerald-950">
            <Scissors className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-black tracking-[0.16em]">SALUNI</span>
            <span className="block text-xs text-emerald-100/70">Édité par LBZ</span>
          </span>
        </Link>
        <p className="mt-5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-emerald-50">
          Salon · {member.tenant.name}
        </p>
        <nav aria-label="Navigation principale" className="mt-10 space-y-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-bold text-emerald-50/80 transition hover:bg-white/10 hover:text-white"
            >
              <Icon className="size-4" aria-hidden="true" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">
          <LogoutButton />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="border-b border-stone-200 bg-white">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
            <Link href={home} className="flex items-center gap-3 lg:hidden">
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-950 text-white">
                <Scissors className="size-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-black tracking-[0.14em]">SALUNI</span>
                <span className="block text-[0.65rem] text-stone-500">{member.tenant.name}</span>
              </span>
            </Link>
            <div className="hidden lg:block">
              <p className="text-sm font-black">{member.fullName}</p>
              <p className="text-xs text-stone-500">
                {member.role === "owner" ? "Owner" : "Director"} · {member.tenant.name}
              </p>
            </div>
            <nav
              aria-label="Navigation mobile"
              className="flex w-full items-center gap-1 overflow-x-auto pb-1 lg:hidden"
            >
              {links.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-stone-600 hover:bg-stone-100"
                >
                  <Icon className="size-4" aria-hidden="true" />
                </Link>
              ))}
              <LogoutButton />
            </nav>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
