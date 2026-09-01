import { redirect } from "next/navigation";
import { AccessDeniedError, requireAdminMember } from "@/lib/db/auth";

// Director (salon_admin) ET Owner ont un accès complet à /register, /reports,
// /services — parité complète (docs/architecture/018-owner-director-parite-operationnelle.md).
// requireAdminMember() autorise déjà les deux rôles ; requireSalonAdmin() (réservé à
// salon_admin) bloquait Owner ici auparavant.
export default async function DirectorLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminMember();
  } catch (error) {
    if (error instanceof AccessDeniedError) redirect("/staff");
    throw error;
  }

  return children;
}
