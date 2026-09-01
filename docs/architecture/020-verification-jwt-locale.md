# 020 — Vérification JWT locale (correctif de performance)

## Statut

Implémenté et vérifié le 2026-08-31 — mesures réelles ci-dessous (avant/après isolé sur
le seul appel de vérification, et charge complète `/register`), confirmation réseau par
instrumentation serveur réelle (pas une lecture de code), reconnexion réelle vérifiée en
navigateur. `npm run test:rls` rapporté en fin de document avec les Parties 2 et 3.

## Contexte

`requireAdminMember()` ([[014-decouplage-rls-auth-provider]]) et `resolveRlsIdentity()`
appelaient `supabase.auth.getUser(accessToken)` à chaque requête admin — cette méthode
fait **systématiquement** un aller-retour réseau vers
`${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, même pour un token déjà valide en cache
côté cookie, contrairement à `getUser()` de la session (pas d'appel) qui ne fait, lui,
aucune vérification cryptographique. Objectif : garder une vérification cryptographique
réelle de la signature/expiration, mais la faire **localement**, sans ce aller-retour
systématique.

## Découverte en cours d'implémentation : ES256, pas HS256

L'hypothèse de départ (secret partagé HS256, `SUPABASE_JWT_SECRET` depuis Project
Settings → API) s'est révélée fausse à l'exécution : la vérification HS256 échouait avec
`JOSEAlgNotAllowed` sur un vrai token. Décodage direct de l'en-tête du JWT → `alg:
"ES256"`, avec un `kid` correspondant exactement à la valeur qui avait été communiquée
comme "secret" : ce projet Supabase signe avec le système "JWT Signing Keys" (clé
asymétrique) — la valeur récupérée était en réalité le Key ID de cette clé, pas un secret
HMAC. Vérifier une signature asymétrique exige la clé **publique** du projet (jamais un
secret à garder confidentiel, à la différence d'HS256) : ce fait a été signalé
explicitement avant de choisir une approche plutôt que de forcer un contournement.

Deux options ont été présentées : `createRemoteJWKSet` (jose), trousseau public mis en
cache et rafraîchi automatiquement ; ou clé publique codée en dur. **Option retenue :
`createRemoteJWKSet`**, pour gérer une rotation de clé côté Supabase sans intervention
manuelle.

## Décision

### 1. `lib/supabase/verify-jwt.ts` — vérification locale via JWKS caché

```ts
const JWKS = createRemoteJWKSet(new URL(process.env.AUTH_JWKS_URL!));

export async function verifySupabaseAccessToken(accessToken: string) {
  const { payload } = await jwtVerify(accessToken, JWKS, { algorithms: ["ES256"] });
  // ... sub -> userId, app_metadata.tenant_id / app_metadata.role si présents
}
```

- **`AUTH_JWKS_URL`, pas `SUPABASE_JWKS_URL`** : nom générique, cohérent avec
  `AUTH_JWT_SECRET` déjà envisagé sous ce nom — portable vers un futur backend GoTrue
  self-hosté ([[017-stack-locale-caprice]]) qui expose le même type d'endpoint JWKS
  standard ; migrer ne changerait que la valeur de cette variable, jamais ce fichier ni
  les policies RLS.
- Lecture **uniquement** dans `app_metadata` (jamais `user_metadata`, modifiable par
  l'utilisateur lui-même via `updateUser()` — jamais fiable pour une décision
  d'autorisation) et jamais le claim `role` de premier niveau du JWT (rôle Postgres
  générique `authenticated`, jamais le rôle métier de l'application). Ces deux claims ne
  sont à ce jour pas peuplés par un hook côté Supabase : `requireAdminMember()` et
  `resolveRlsIdentity()` retombent donc, comme avant, sur la résolution via la table
  `users`/`staff` — comportement inchangé, conforme à la consigne "garder exactement la
  même structure de claims lue ensuite".
- Retourne `null` sur signature invalide/expirée/malformée, jamais une exception :
  l'appelant traite `null` comme non authentifié.

### 2. `lib/db/auth.ts` / `lib/db/rls-session.ts`

`getUser()` → `getSession()` (lecture cookie, aucun appel réseau pour une session encore
valide) + `verifySupabaseAccessToken(session.access_token)`. Le paramètre
`verifiedAuthUserId` de `resolveRlsIdentity()` (réservé à
`tests/rls/tenant-isolation.test.ts`, qui vérifie un vrai JWT hors contexte
`next/headers` via `getUser(accessToken)`) est inchangé.

## Ce qui n'a volontairement pas été fait

- Aucun changement de la structure des claims lus après vérification — toujours
  résolution via `users`/`staff` si `app_metadata` est vide, comme avant.
- Aucun hook de claims personnalisés côté Supabase ajouté pour peupler `app_metadata` —
  non demandé, et changerait le modèle de confiance sans besoin identifié aujourd'hui.

## Vérification

### Confirmation réseau — par instrumentation serveur réelle, pas par lecture de code

`globalThis.fetch` patché temporairement pour logger tout appel sortant vers
`supabase.co`, avec un log serveur horodaté par requête. Résultat sur 4 chargements
successifs de `/register` (serveur redémarré juste avant, cache JWKS donc vide au
premier appel) :

| Requête                 | Appel réseau observé                                               |
| ----------------------- | ------------------------------------------------------------------ |
| 1 (à froid, cache vide) | 1 appel : `GET https://…supabase.co/auth/v1/.well-known/jwks.json` |
| 2, 3, 4                 | **Aucun**                                                          |

**Confirmation explicite demandée** : aucun appel réseau vers Supabase n'a lieu pour la
validation de signature/expiration au-delà du tout premier appel (ou d'une rotation de
clé future — même mécanisme de cooldown intégré à `createRemoteJWKSet`, non déclenché
ici). Ce premier appel n'est pas un aller-retour de vérification d'identité comme
`getUser()` : c'est une récupération de clé **publique**, mise en cache en mémoire
process pour toute la durée de vie du serveur. La résolution d'identité applicative
(`adminPrisma.user.findUnique()`) reste, elle, une requête base de données normale,
inchangée, distincte de cette vérification.

### Mesure isolée de l'appel de vérification — chiffres réels

Instrumentation temporaire (`console.time`/`console.timeEnd` autour de l'appel, dans
`requireAdminMember()`), retirée après mesure. Même session `sire.dev@caprice-ebene.com`
(Owner), même page `/register`, serveur redémarré entre les deux variantes pour partir
d'un cache vide à chaque fois :

| Variante                                         | Échantillons (ms)                      | Moyenne     |
| ------------------------------------------------ | -------------------------------------- | ----------- |
| **Avant** — `getUser()` (réseau à chaque appel)  | 829.7 / 564.7 / 553.2 / 588.9 / 1001.0 | **~707 ms** |
| **Après** — local, 1er appel (JWKS à froid)      | 792.2                                  | —           |
| **Après** — local, appels suivants (cache chaud) | 8.99 / 9.51 / 4.46                     | **~7.7 ms** |

Soit une division par ~90 du coût de l'étape de vérification elle-même, une fois le
trousseau en cache — cohérent avec le remplacement d'un aller-retour HTTPS par une
vérification de signature purement locale (CPU).

### Chargement complet de `/register` — pas d'amélioration mesurable, et c'est honnête de le dire

| Variante | Échantillons (ms)            |
| -------- | ---------------------------- |
| Avant    | 13265 / 7875 / 9075 / 7044   |
| Après    | 10782 / 10004 / 12102 / 7498 |

Sur cet environnement, le temps de chargement total de `/register` (7 à 20 s, forte
variance) est dominé par les allers-retours vers le pooler Postgres Supabase
(`aws-1-eu-west-1.pooler.supabase.com`, région distante) pour les données propres à la
page (registre du jour, personnel, services), pas par l'étape d'authentification. Le
gain mesuré est réel et important sur l'étape qu'il cible (~700 ms → ~8 ms par requête
admin), mais il est noyé dans le bruit de latence réseau du pooler à l'échelle de la page
entière sur cet environnement — ce n'est pas un gain de temps de chargement perçu
aujourd'hui, plutôt une élimination d'une dépendance réseau systématique et de sa
variance propre (et un risque en moins : plus de couplage à la disponibilité de l'API
Auth Supabase pour chaque requête admin).

### Reconnexion réelle

`sire.dev@caprice-ebene.com` reconnecté avec succès en navigateur réel, `/register`
rendu sans erreur, avec le code de vérification locale actif (voir capture de session).

### `npm run test:rls`

Résultat rapporté avec l'ensemble des trois parties — voir le rapport final (9/10, sans
régression, seul échec le gap FK cross-tenant préexistant et déjà documenté dans
[[007-verification-isolation-rls]]).
