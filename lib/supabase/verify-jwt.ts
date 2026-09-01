import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

// Vérification LOCALE (signature + expiration) du JWT Supabase, sans appel réseau sur
// le chemin chaud de chaque requête — remplace `supabase.auth.getUser()` (qui appelle
// ${SUPABASE_URL}/auth/v1/user à CHAQUE invocation) dans lib/db/auth.ts et
// lib/db/rls-session.ts. Voir docs/architecture/020-verification-jwt-locale.md pour la
// mesure de performance et le détail de ce qui est/n'est pas un appel réseau.
//
// AUTH_JWKS_URL, pas SUPABASE_JWKS_URL : nom générique, portable vers un futur backend
// GoTrue self-hosté qui expose le même type d'endpoint JWKS standard
// (docs/architecture/017-stack-locale-caprice.md) — migrer ne changerait que la valeur
// de cette variable, jamais ce fichier ni les policies RLS.
//
// Découverte en implémentant, pas supposée : ce projet Supabase signe ses JWT en ES256
// (clé asymétrique, système "JWT Signing Keys"), pas en HS256 (secret partagé legacy).
// Vérifier une signature asymétrique exige la clé PUBLIQUE du projet — jamais un secret
// à garder confidentiel, à la différence d'HS256. `createRemoteJWKSet` récupère et met
// en cache le trousseau de clés publiques une fois, puis vérifie localement ensuite :
// un appel réseau rare (premier appel, puis seulement en cas de `kid` inconnu du cache —
// ex. rotation de clé côté Supabase — avec un cooldown intégré pour ne jamais marteler
// l'endpoint), JAMAIS un appel systématique comme `getUser()`. C'est la méthode que
// Supabase documente actuellement pour ce cas de figure.
const localJwtSecret = process.env.AUTH_JWT_SECRET ?? process.env.GOTRUE_JWT_SECRET;
const localJwtKey = localJwtSecret ? new TextEncoder().encode(localJwtSecret) : null;
const remoteJwks: JWTVerifyGetKey | null =
  !localJwtKey && process.env.AUTH_JWKS_URL
    ? createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL))
    : null;

export type VerifiedSupabaseSession = {
  userId: string;
  /**
   * Présents UNIQUEMENT si un hook de claims personnalisés côté Supabase les a un jour
   * placés dans `app_metadata` (jamais configuré à ce jour dans ce projet — donc
   * toujours `undefined` en pratique, cf. resolveRlsIdentity()/requireAdminMember()
   * qui retombent alors sur la résolution via la table `users`/`staff`).
   *
   * Volontairement PAS lus depuis `user_metadata` : ce claim est modifiable par
   * l'utilisateur connecté lui-même (`supabase.auth.updateUser()`), donc jamais fiable
   * pour une décision d'autorisation — un utilisateur pourrait s'auto-attribuer
   * `role: "owner"` dans son propre `user_metadata`. `app_metadata`, lui, n'est
   * modifiable que côté serveur (API admin), donc sûr à lire s'il était un jour peuplé.
   *
   * Volontairement PAS lus depuis le claim `role` de premier niveau du JWT : ce claim
   * existe toujours sur un JWT Supabase mais porte le RÔLE POSTGRES générique
   * ("authenticated"), jamais le rôle métier de l'application (owner/salon_admin/...) —
   * le confondre avec un rôle applicatif serait une erreur de sécurité, pas juste un
   * bug fonctionnel.
   */
  tenantId?: string;
  role?: string;
};

/**
 * Vérifie un access token Supabase localement (ES256, trousseau de clés publiques mis
 * en cache via `AUTH_JWKS_URL`). Retourne `null` si la signature est invalide, le token
 * expiré, ou malformé — jamais une exception : l'appelant traite `null` comme "non
 * authentifié", jamais un accès total.
 */
export async function verifySupabaseAccessToken(
  accessToken: string,
): Promise<VerifiedSupabaseSession | null> {
  try {
    const verificationKey = localJwtKey ?? remoteJwks;
    if (!verificationKey) {
      throw new Error("AUTH_JWKS_URL ou AUTH_JWT_SECRET doit être configuré.");
    }

    const { payload } = await jwtVerify(accessToken, verificationKey, {
      algorithms: localJwtKey ? ["HS256"] : ["ES256"],
    });

    if (typeof payload.sub !== "string") return null;

    const appMetadata =
      typeof payload.app_metadata === "object" && payload.app_metadata !== null
        ? (payload.app_metadata as Record<string, unknown>)
        : undefined;

    return {
      userId: payload.sub,
      tenantId: typeof appMetadata?.tenant_id === "string" ? appMetadata.tenant_id : undefined,
      role: typeof appMetadata?.role === "string" ? appMetadata.role : undefined,
    };
  } catch (err) {
    // Cause réelle de l'échec (mismatch d'algorithme, JWKS introuvable/vide, token
    // expiré, signature invalide...) — jamais renvoyée à l'appelant (qui continue de
    // recevoir `null`, jamais un détail exploitable côté client), uniquement en log
    // serveur pour le diagnostic. `code`/`name` sont les champs stables des classes
    // d'erreur `jose` (ex. ERR_JWKS_NO_MATCHING_KEY, ERR_JOSE_ALG_NOT_ALLOWED,
    // ERR_JWT_EXPIRED, ERR_JWS_SIGNATURE_VERIFICATION_FAILED, ERR_JWKS_TIMEOUT pour un
    // échec réseau de récupération du trousseau) — plus fiables à travers les versions
    // de `jose` que `message`, qui peut changer de formulation.
    const code =
      err instanceof Error && "code" in err ? (err as { code?: string }).code : undefined;
    const name = err instanceof Error ? err.name : typeof err;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[verify-jwt] échec de vérification (${code ?? name}): ${message}`);
    return null;
  }
}
