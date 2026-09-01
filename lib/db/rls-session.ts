import type { Prisma } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { adminPrisma } from "@/lib/admin-prisma";
import { AccessDeniedError } from "@/lib/db/auth";
import { verifySupabaseAccessToken } from "@/lib/supabase/verify-jwt";

export type RlsIdentity = {
  userId: string;
  tenantId: string;
  role: string;
};

/**
 * Couche applicative qui fait le pont entre Supabase Auth (JWT, cookies) et les
 * variables de session Postgres (`app.tenant_id`, `app.role`, `app.user_id`) que lisent
 * désormais les fonctions RLS `current_tenant_id()`/`is_salon_admin()`/`is_owner()`/
 * `current_user_id()` — voir docs/architecture/014-decouplage-rls-auth-provider.md.
 *
 * Le seul fournisseur d'auth concerné par `resolveRlsIdentity` est Supabase
 * (session cookie + vérification JWT locale, `lib/supabase/verify-jwt.ts`) ; migrer
 * vers un autre fournisseur ne toucherait QUE ce fichier, jamais les policies RLS
 * elles-mêmes (c'est exactement l'objectif du découplage).
 */
export async function resolveRlsIdentity(verifiedAuthUserId?: string): Promise<RlsIdentity> {
  let authUserId = verifiedAuthUserId;

  if (!authUserId) {
    // Chemin normal (Next.js Server Component/Route Handler) : createClient() lit les
    // cookies via next/headers, indisponible hors d'une requête Next.js. getSession()
    // ne fait AUCUN appel réseau pour une session encore valide (contrairement à
    // getUser()) ; la vérification de signature/expiration se fait ensuite localement —
    // voir docs/architecture/020-verification-jwt-locale.md.
    const supabase = createClient();
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
    authUserId = verified.userId;
  }
  // `verifiedAuthUserId`, quand fourni, doit provenir d'une vérification JWT déjà faite
  // par l'appelant (ex. tests/rls/tenant-isolation.test.ts, qui vérifie un vrai JWT
  // Supabase via `supabase.auth.getUser(accessToken)` — hors contexte next/headers, mais
  // toujours une vraie vérification cryptographique, jamais un id de confiance aveugle).
  // Aucun call site applicatif ne doit passer ce paramètre.

  // Résolution d'identité via `adminPrisma` (rôle privilégié, contourne RLS) — seule
  // lecture faite hors de la transaction SET LOCAL. Depuis que `prisma` (DATABASE_URL)
  // pointe vers le rôle restreint `app_runtime` (réellement soumis à RLS), cette lecture
  // ne peut plus se faire via `prisma` : il faudrait déjà connaître tenant_id pour lire
  // sa propre ligne users, alors que c'est justement ce qu'on cherche à résoudre —
  // problème d'amorçage, pas de permission manquante. `isDeleted` est vérifié ICI, au
  // niveau applicatif : les fonctions RLS ne savent plus rien de public.users (voir
  // migration 20260826170000), donc c'est cette couche qui refuse l'accès à un compte
  // soft-deleted.
  const identityRow = await adminPrisma.user.findUnique({
    where: { id: authUserId },
    select: { id: true, tenantId: true, role: true, isDeleted: true },
  });

  if (!identityRow || identityRow.isDeleted) {
    throw new AccessDeniedError();
  }

  return { userId: identityRow.id, tenantId: identityRow.tenantId, role: identityRow.role };
}

/**
 * Ouvre une transaction Prisma sur la connexion `app_runtime` (RLS réellement appliqué)
 * et y positionne `app.tenant_id`/`app.role`/`app.user_id` pour une identité déjà connue
 * (ex. déjà résolue par `requireSalonAdmin()`) — évite une deuxième vérification JWT +
 * lecture `adminPrisma` quand l'appelant l'a déjà fait.
 *
 * IMPORTANT — portée de `SET LOCAL` : les valeurs positionnées ci-dessous ne survivent
 * que jusqu'à la fin de CETTE transaction (`SET LOCAL`, pas `SET SESSION`) — comportement
 * Postgres, pas un choix de ce code. Toute requête RLS-sensible doit donc s'exécuter via
 * le `tx` fourni au callback, jamais via le singleton `prisma` importé directement.
 */
export async function runInTenantTransaction<T>(
  identity: RlsIdentity,
  run: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx) => {
      // set_config(..., true) == SET LOCAL, mais paramétrable : évite toute
      // interpolation de chaîne dans du SQL (SET LOCAL ne peut pas prendre de
      // paramètre lié).
      await tx.$executeRaw`select set_config('app.tenant_id', ${identity.tenantId}, true)`;
      await tx.$executeRaw`select set_config('app.role', ${identity.role}, true)`;
      await tx.$executeRaw`select set_config('app.user_id', ${identity.userId}, true)`;

      return run(tx);
    },
    // maxWait/timeout par défaut (2s/5s) sont trop courts pour le pooler partagé
    // Supabase sous charge — voir docs/architecture/014-decouplage-rls-auth-provider.md.
    { maxWait: 10_000, timeout: 15_000 },
  );
}

/**
 * Pipeline complet (vérifie le JWT, résout l'identité, ouvre la transaction).
 * `verifiedAuthUserId` : voir `resolveRlsIdentity` — réservé aux tests, jamais utilisé
 * par un call site applicatif.
 */
export async function withRlsSession<T>(
  run: (tx: Prisma.TransactionClient, identity: RlsIdentity) => Promise<T>,
  verifiedAuthUserId?: string,
): Promise<T> {
  const identity = await resolveRlsIdentity(verifiedAuthUserId);
  return runInTenantTransaction(identity, (tx) => run(tx, identity));
}
