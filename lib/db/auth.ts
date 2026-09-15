import { createClient } from "@/lib/supabase/server";
import { adminPrisma } from "@/lib/admin-prisma";
import { verifySupabaseAccessToken } from "@/lib/supabase/verify-jwt";

export class AccessDeniedError extends Error {
  constructor(message = "Vous devez être connecté comme gérant du salon.") {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function requireAdminMember() {
  const supabase = createClient();
  // getSession() lit la session depuis les cookies — AUCUN appel réseau pour une session
  // encore valide (contrairement à getUser(), qui appelle systématiquement
  // ${SUPABASE_URL}/auth/v1/user). La vérification de signature/expiration se fait
  // ensuite localement via verifySupabaseAccessToken() — voir
  // docs/architecture/020-verification-jwt-locale.md pour la mesure et la confirmation
  // qu'aucun réseau n'intervient dans ce chemin.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new AccessDeniedError();
  }

  const verified = await verifySupabaseAccessToken(session.access_token);
  if (!verified) {
    throw new AccessDeniedError();
  }

  // adminPrisma (rôle privilégié, contourne RLS) : lire sa propre ligne users pour
  // résoudre tenantId/role est justement ce qui manque pour positionner une session RLS
  // (app.tenant_id) — problème d'amorçage, cf. docs/architecture/014-decouplage-rls-auth-provider.md.
  // Requête base de données normale, distincte de la vérification JWT ci-dessus — c'est
  // la résolution d'identité applicative (users/staff), pas un appel Supabase Auth.
  const user = await adminPrisma.user.findUnique({
    where: { id: verified.userId },
    select: {
      id: true,
      tenantId: true,
      fullName: true,
      role: true,
      active: true,
      isDeleted: true,
      tenant: { select: { name: true, active: true, isDeleted: true } },
      staffProfile: {
        select: { id: true, systemRole: true, active: true, isDeleted: true },
      },
    },
  });

  const staffProfile = user?.staffProfile;

  if (
    !user ||
    !user.active ||
    user.isDeleted ||
    !user.tenant.active ||
    user.tenant.isDeleted ||
    !["owner", "salon_admin"].includes(user.role) ||
    !staffProfile ||
    !staffProfile.active ||
    staffProfile.isDeleted
  ) {
    throw new AccessDeniedError("Votre compte n’est pas lié à un membre actif du salon.");
  }

  return { ...user, staffProfile };
}

export async function requireSalonAdmin() {
  const user = await requireAdminMember();

  if (user.role !== "salon_admin") {
    throw new AccessDeniedError(
      "Seul le directeur ou le gérant du salon peut accéder à cette fonction.",
    );
  }

  return user;
}

export async function requireOwner() {
  const user = await requireAdminMember();

  if (user.role !== "owner") {
    throw new AccessDeniedError("Seul le propriétaire du salon peut accéder à cette fonction.");
  }

  return user;
}
