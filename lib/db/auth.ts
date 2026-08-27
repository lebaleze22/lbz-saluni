import { createClient } from "@/lib/supabase/server";
import { adminPrisma } from "@/lib/admin-prisma";

export class AccessDeniedError extends Error {
  constructor(message = "Vous devez être connecté comme gérant du salon.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function requireSalonAdmin() {
  const supabase = createClient();
  const {
    data: { user: authUser },
    error,
  } = await supabase.auth.getUser();

  if (error || !authUser) {
    throw new AccessDeniedError();
  }

  // adminPrisma (rôle privilégié, contourne RLS) : lire sa propre ligne users pour
  // résoudre tenantId/role est justement ce qui manque pour positionner une session RLS
  // (app.tenant_id) — problème d'amorçage, cf. docs/architecture/014-decouplage-rls-auth-provider.md.
  const user = await adminPrisma.user.findUnique({
    where: { id: authUser.id },
    select: { id: true, tenantId: true, fullName: true, role: true },
  });

  if (!user || user.role !== "salon_admin") {
    throw new AccessDeniedError(
      "Seul le directeur ou le gérant du salon peut accéder à cette fonction.",
    );
  }

  return user;
}
