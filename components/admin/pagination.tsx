import Link from "next/link";

export function Pagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages < 2) return null;
  return (
    <nav
      aria-label="Pagination"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p className="text-stone-500">
        Page {page} sur {pages} · {total} résultat(s)
      </p>
      <div className="flex gap-3">
        {page > 1 && (
          <Link
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold"
            href={href(page - 1)}
          >
            Précédent
          </Link>
        )}
        {page < pages && (
          <Link
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 font-semibold"
            href={href(page + 1)}
          >
            Suivant
          </Link>
        )}
      </div>
    </nav>
  );
}
