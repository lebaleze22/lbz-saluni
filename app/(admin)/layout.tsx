import Link from "next/link";
import { BarChart3, BookOpen, Scissors } from "lucide-react";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-950">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/register" className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-emerald-950 text-white">
              <Scissors className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-black tracking-[0.16em]">LEBALEZE</span>
              <span className="block text-xs text-stone-500">Gestion du salon</span>
            </span>
          </Link>
          <nav
            aria-label="Navigation principale"
            className="flex items-center gap-1 rounded-xl bg-stone-100 p-1"
          >
            <Link
              href="/register"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-white hover:text-emerald-950"
            >
              <BookOpen className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Registre</span>
            </Link>
            <Link
              href="/reports"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 transition hover:bg-white hover:text-emerald-950"
            >
              <BarChart3 className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Rapports</span>
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
