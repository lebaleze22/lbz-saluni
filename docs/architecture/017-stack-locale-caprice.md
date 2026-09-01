# 017 — Stack locale 100% offline pour Caprice D'Ebène (Mac du salon)

## Statut

Validée par exécution réelle le 2026-08-31 sur PostgreSQL 16 + GoTrue v2.170.0 +
Next.js standalone + nginx.

## Contexte

L'application doit pouvoir tourner entièrement en local sur un Mac déjà présent au
salon (8 Go de RAM), sans aucune dépendance internet une fois les images Docker
téléchargées — ni Supabase Cloud (facturation, connectivité), ni le VPS. L'app ne parle
jamais à Supabase que par deux canaux : Prisma (jamais PostgREST — voir
[[014-decouplage-rls-auth-provider]], [[013-job-title-vs-system-role]]) et l'API Auth
(GoTrue) pour `signInWithPassword`/l'API admin de création de comptes
([[012-role-owner]]).

Le build n’utilise aucune ressource distante : la police Google Inter a été remplacée
par la pile `font-sans` système de Tailwind, afin qu’une reconstruction de l’image reste
possible hors connexion après téléchargement initial des images et paquets npm.

## Décision

### 1. Stack réduite plutôt que le bundle Supabase self-hosted complet

Le bundle Supabase self-hosted officiel comprend ~10 services : Kong (API gateway),
GoTrue, PostgREST, Realtime, Storage, Studio, Postgres-meta, Analytics (Logflare),
Vector, ImgProxy. Cette application n'utilise que **deux** d'entre eux :

- **Postgres** — évidemment.
- **GoTrue** — pour `signInWithPassword` et l'API admin de création de comptes
  (`scripts/seed-dev.mjs`, `scripts/import-catalogue-caprice.mjs`).

**PostgREST n'est jamais utilisé** : toutes les requêtes de données passent par Prisma
(`lib/db/*.ts`, `lib/prisma.ts`/`lib/admin-prisma.ts`), jamais par l'API REST auto-générée
de PostgREST — confirmé par les tâches précédentes ([[013-*]], [[014-*]]) qui ont
justement migré `tests/rls/tenant-isolation.test.ts` de PostgREST vers Prisma
précisément pour refléter le chemin réel de l'application. Realtime/Storage/Studio/
Analytics/Vector/ImgProxy n'ont aucun usage dans le code de ce projet (aucun
websocket temps réel, aucun upload de fichier, pas de dashboard Studio nécessaire pour
un seul salon).

**Kong n'est pas ajouté** : son seul rôle utile ici (router `/auth/v1/*` vers GoTrue)
est repris par nginx, déjà présent dans le projet pour le VPS — voir point 3.

Sur une machine à 8 Go de RAM, faire tourner 6+ conteneurs supplémentaires pour des
fonctionnalités jamais exercées aurait été un gaspillage direct de la ressource la plus
contrainte, sans aucun bénéfice fonctionnel.

### 2. Fichiers ajoutés

| Fichier                                             | Rôle                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `docker-compose.local.yml`                          | Assemblage local : postgres, gotrue, core-api, tooling (one-off), nginx.                                                 |
| `nginx/local.conf`                                  | Route `/auth/v1/*` → gotrue (rôle de Kong), tout le reste → core-api. Séparé de `nginx/default.conf` (VPS), non modifié. |
| `docker/local/postgres-init/01-supabase-compat.sql` | Rôle `authenticated` + schéma `auth` + stub `auth.uid()` — voir point 4.                                                 |
| `.env.local.example`                                | Variables + séquence d'installation complète, pas à pas.                                                                 |
| `scripts/local-stack/generate-jwt-keys.mjs`         | Génère les clés anon/service_role (JWT HS256) à partir d'un secret GoTrue — voir point 5.                                |

`docker-compose.yml` (VPS) et `nginx/default.conf` : **non modifiés**, comme demandé.

### 3. nginx étend son rôle, ne duplique pas Kong

`nginx/local.conf` ajoute un bloc `location /auth/v1/` qui réécrit vers les routes
internes de GoTrue (`/token`, `/user`, `/admin/users`... — GoTrue n'a pas lui-même de
préfixe `/auth/v1`, c'est Kong qui l'ajoute sur Supabase Cloud/self-hosted complet) :

```nginx
location /auth/v1/ {
    rewrite ^/auth/v1/(.*)$ /$1 break;
    proxy_pass http://gotrue_local;
    ...
}
```

`supabase-js` appelle toujours `${NEXT_PUBLIC_SUPABASE_URL}/auth/v1/...`, qu'on parle à
Supabase Cloud ou à ce GoTrue local — aucune adaptation côté client nécessaire au-delà
de changer la valeur de `NEXT_PUBLIC_SUPABASE_URL`.

Comme les cookies sont associés à `localhost` indépendamment du port, plusieurs projets
locaux peuvent faire dépasser à l'en-tête `Cookie` la limite nginx par défaut. Le proxy
local accepte donc des buffers d'en-têtes de 32 Kio et `core-api` utilise la même limite
HTTP Node. Cette tolérance reste strictement locale ; `nginx/default.conf` (VPS) n'est pas
modifié.

Le proxy local transmet `Host` et `X-Forwarded-Host` avec `$http_host`, et non `$host`,
afin de conserver le port public `:54321`. Next.js compare cette valeur à l'en-tête
`Origin` avant d'accepter une Server Action ; sans le port, tous les formulaires en POST
étaient rejetés avec `Invalid Server Actions request` avant même leur validation métier.

### 4. Compatibilité Postgres vanilla — `docker/local/postgres-init/01-supabase-compat.sql`

**Trouvaille critique, découverte avant d'écrire le script** (pas en le lisant après
coup) : l'historique COMPLET des migrations Prisma
(`prisma/migrations/00000000000001_rls_policies/` en tête) doit rejouer sur un Postgres
vierge pour que `prisma migrate deploy` fonctionne. Or trois migrations historiques —
déjà appliquées sur Supabase Cloud, donc **immuables** (les modifier casserait la
vérification de checksum de Prisma sur cet environnement, voir
[[005-prisma-et-supabase]]) — appellent littéralement `auth.uid()` :
`00000000000001_rls_policies`, `20260821120001_soft_delete_rls_filtering`,
`20260826140100_owner_role_rls`. Sur un Postgres vanilla, `auth.uid()` n'existe pas
(c'est une fonction que la plateforme Supabase ajoute, jamais Postgres lui-même) — la
toute première migration échouerait donc immédiatement.

**Vérifié, pas supposé** : recherche exhaustive dans `prisma/migrations/` (`grep auth\.`)
confirmant que SEULES ces trois migrations appellent `auth.uid()` en SQL réel (les
autres occurrences de "auth." trouvées par la recherche sont des commentaires) —
[[014-decouplage-rls-auth-provider]] a déjà remplacé toute la logique qui en dépendait,
donc **à la fin du rejeu complet, plus aucune policy n'appelle `auth.uid()`**. Le script
n'a donc besoin de fournir une fonction _appelable_ pendant le rejeu, jamais _correcte_
sémantiquement :

```sql
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select null::uuid
$$;
```

Un `auth.uid()` "réel" (lisant `request.jwt.claims`, comme le fait la vraie fonction
Supabase) serait d'ailleurs trompeur ici : ce mécanisme n'a de sens qu'avec PostgREST,
jamais utilisé dans cette stack (point 1).

Même script, rôle `authenticated` (`nologin noinherit`) : toutes les policies RLS du
projet sont scopées `TO authenticated`, et
`20260827140000_app_runtime_role_provisioning` fait `GRANT authenticated TO
app_runtime`. `anon`/`service_role` ne sont référencés par AUCUNE policy ni migration de
ce projet (même recherche exhaustive) — volontairement absents, cohérent avec l'esprit
"stack réduite" (ils n'auraient de sens qu'avec PostgREST).

GoTrue crée ensuite ses propres tables dans ce même schéma `auth` via ses migrations
internes (`CREATE TABLE IF NOT EXISTS`) — sans conflit, ce script ne crée qu'un schéma
et une fonction, jamais de table.

### 5. Clés Supabase locales — de vrais JWT, pas des chaînes arbitraires

`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` sur Supabase Cloud sont des
JWT signés par la plateforme, portant un claim `role`. GoTrue valide ce claim pour les
routes admin (`GOTRUE_JWT_ADMIN_ROLES=service_role`) : `SUPABASE_SERVICE_ROLE_KEY`
**doit** être un JWT réel, signé avec le même secret que `GOTRUE_JWT_SECRET`, portant
`role: "service_role"` — une chaîne arbitraire serait rejetée par l'API admin
(`scripts/seed-dev.mjs`, `scripts/import-catalogue-caprice.mjs` en dépendent).
`scripts/local-stack/generate-jwt-keys.mjs` génère les deux clés (HS256 manuel, `crypto`
natif de Node — aucune dépendance npm ajoutée pour un besoin ponctuel d'installation).

### 6. `SUPABASE_INTERNAL_URL` — trouvaille de réseau, corrigée avant le test, pas après

`NEXT_PUBLIC_SUPABASE_URL` doit être joignable depuis le **navigateur** (inliné dans le
bundle client par Next.js) : en local, l'URL publique de nginx
(`http://localhost:54321`). Le port dédié évite une collision avec les autres reverse
proxies de la machine (notamment Superset sur le port 80).
Mais du code **serveur** tournant DANS le conteneur `core-api`
(`requireSalonAdmin()`, `resolveRlsIdentity()`, le middleware de rafraîchissement de
session) appelle aussi `createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, ...)` —
si cette valeur est `http://localhost:54321`, depuis l'INTÉRIEUR du conteneur `core-api`,
`localhost` résout vers **ce conteneur lui-même**, pas vers nginx : tous les appels
serveur vers `/auth/v1/*` échoueraient.

Corrigé par un nouveau paramètre optionnel, `SUPABASE_INTERNAL_URL` (`http://nginx`,
joignable par nom de service Docker depuis n'importe quel conteneur du réseau
`lbz-local`) :

```ts
// lib/supabase/server.ts, lib/supabase/middleware.ts
const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
```

Non défini sur Supabase Cloud/le VPS (`docker-compose.yml`) : `NEXT_PUBLIC_SUPABASE_URL`
y est déjà joignable aussi bien du navigateur que du serveur (domaine public unique) —
**aucun changement de comportement là-bas**, le `??` ne change rien quand la variable
est absente. Le même correctif est appliqué aux scripts qui appellent Supabase Auth,
notamment `scripts/seed-dev.mjs`. L'import du catalogue utilise désormais directement
Prisma Admin et ne dépend ni de l'URL Supabase ni de PostgREST (voir point 8).

Cette correction dépasse le strict "schéma/RLS/script d'import" des tâches précédentes,
mais reste une nécessité de plomberie réseau — pas un changement d'UI ni de logique
métier — directement forcée par le fait de faire tourner GoTrue derrière nginx, exactement
la même nature de nécessité que l'ajout d'`adminPrisma`
([[014-decouplage-rls-auth-provider]]).

### 7. GoTrue — configuration, et deux bugs réels trouvés en exécutant, pas en lisant la doc

- **Connexion Postgres directe en tant que `postgres`** (superuser), pas de séparation
  `supabase_auth_admin`/`authenticator` comme sur Supabase Cloud — simplification
  assumée : un seul salon, une seule machine locale de confiance, pas une plateforme
  hébergée multi-tenant à durcir.
- **`GOTRUE_DISABLE_SIGNUP=true`** : provisioning admin uniquement, jamais self-service
  — cohérent avec [[012-role-owner]].
- **`GOTRUE_MAILER_AUTOCONFIRM=true`** : pas de serveur mail local (stack 100% offline) ;
  sans effet pratique aujourd'hui puisque tous les comptes sont créés via l'API admin
  avec `email_confirm: true` explicite (`seed-dev.mjs`), posé par défense en profondeur.

**Bug 1 — `API_EXTERNAL_URL` sans préfixe `GOTRUE_`** : `GOTRUE_API_EXTERNAL_URL` est
transmise au conteneur (vérifié via `docker inspect`) mais rejetée par GoTrue comme
"manquante" — cette clé précise doit être passée SANS le préfixe `GOTRUE_`
(`API_EXTERNAL_URL` brut), contrairement à toutes les autres options GoTrue. Découvert
en lisant les logs d'échec réels, pas en devinant.

**Bug 2 — `search_path` de la connexion GoTrue** : sans `?options=-c%20search_path=auth`
sur `GOTRUE_DB_DATABASE_URL`, les migrations internes de GoTrue qui créent des types/
tables SANS qualification de schéma (ex. `create type factor_type as enum (...)`)
atterrissent dans `public` (premier schéma du search_path par défaut d'une connexion
`postgres`), puis une migration GoTrue ultérieure qui les référence explicitement en
`auth.factor_type` échoue avec `type "auth.factor_type" does not exist`. Confirmé par
exécution réelle : première tentative sans ce paramètre, `factor_type` s'est retrouvé
dans `public` (vérifié via `pg_type`/`pg_namespace`), pas dans `auth`. Corrigé en scopant
`search_path=auth` à cette seule connexion (paramètre de session GoTrue, pas
`ALTER ROLE postgres SET search_path` global) — un changement global aurait cassé les
migrations Prisma elles-mêmes, qui créent leurs propres tables sans qualification de
schéma en s'appuyant sur `public` étant premier par défaut.

### 8. Migrations/scripts d'administration — un service `tooling` séparé de `core-api`

L'image finale de `core-api` (stage `runner` du `Dockerfile`) est volontairement
minimale : serveur Next.js standalone + client Prisma généré, **pas** le CLI `prisma`
complet, **pas** `prisma/migrations/`, **pas** `scripts/*.mjs` (voir le `Dockerfile`,
commentaire du stage `runner` : "N'exécute PAS `prisma migrate deploy` au démarrage").
`docker compose run --rm core-api npx prisma migrate deploy` échouerait donc
(CLI absent, dossier de migrations absent de l'image).

`docker-compose.local.yml` ajoute un service `tooling`, ciblant le stage `builder` du
MÊME `Dockerfile` (source complète, `node_modules` complet, CLI Prisma inclus) —
`profiles: ["tooling"]` pour qu'il ne démarre jamais via un simple `up`, utilisé
uniquement via `run --rm tooling <commande>` : `npx prisma migrate deploy`,
`node scripts/seed-dev.mjs`, `node scripts/import-catalogue-caprice.mjs`.

### 9. Séquence de démarrage — documentée, pas automatisée en une commande

Même principe assumé que le `Dockerfile` lui-même (qui n'exécute jamais
`prisma migrate deploy` au boot du conteneur `core-api`) : la stack locale démarre en
plusieurs étapes documentées (`.env.local.example`), pas via un unique
`docker compose up` :

1. `up -d postgres gotrue`
2. `run --rm tooling npx prisma migrate deploy` — crée `app_runtime` avec un mot de
   passe placeholder ([[014-decouplage-rls-auth-provider]], migration
   `20260827140000_app_runtime_role_provisioning`, déjà idempotente et pensée pour un
   environnement neuf).
3. `run --rm tooling node scripts/local-stack/set-app-runtime-password.mjs` — remplace
   le placeholder par le mot de passe réel de `.env.local`, sans l’exposer dans la
   ligne de commande ni l’historique du shell.
4. `up -d core-api nginx`
5. (une fois) `run --rm tooling node scripts/seed-dev.mjs` — compte Director de démo.
6. (une fois) `run --rm tooling node scripts/import-catalogue-caprice.mjs` — catalogue
   réel ([[016-catalogue-prestations-caprice]]).

### 10. Compatibilité multi-architecture (Apple Silicon vs Intel)

Le Mac cible n'étant pas précisé, les 4 images utilisées ont été vérifiées via
`docker manifest inspect` (liste des plateformes publiées, pas une supposition) :

| Image                                                    | amd64 (Intel) | arm64 (Apple Silicon) |
| -------------------------------------------------------- | ------------- | --------------------- |
| `postgres:16-alpine`                                     | ✅            | ✅                    |
| `supabase/gotrue:v2.170.0`                               | ✅            | ✅                    |
| `nginx:1.27-alpine`                                      | ✅            | ✅                    |
| `node:22-alpine` (base du `Dockerfile` core-api/tooling) | ✅            | ✅                    |

Les quatre supportent nativement les deux architectures — Docker choisit automatiquement
la bonne variante au `pull`, aucune configuration `platform:` nécessaire dans
`docker-compose.local.yml`. **Limite assumée de cette vérification** : la machine de
test réelle (voir "Vérification") est x86_64 (amd64) — seul CE chemin a été exécuté de
bout en bout. Le chemin arm64 est vérifié par manifeste (les images existent et sont
publiées pour cette architecture) mais pas par exécution réelle, faute d'un Mac Apple
Silicon disponible pour cette tâche.

## Ce qui n'a volontairement pas été fait

- Aucune UI, aucun endpoint nouveau.
- Aucune séparation de rôles Postgres pour GoTrue (`supabase_auth_admin`/
  `authenticator`) — simplification assumée, voir point 7.
- Aucun serveur mail local, aucune gestion de lien de confirmation par e-mail — hors
  scope (provisioning admin uniquement).
- Pas de `docker compose up` en une seule commande — séquence documentée assumée
  (point 9), cohérent avec le choix déjà fait pour le VPS (`Dockerfile`).

## Prérequis d'installation sur la machine cible (Mac du salon)

1. **Docker Desktop for Mac** — https://www.docker.com/products/docker-desktop/,
   version Apple Silicon ou Intel selon le Mac (voir point 10). Docker Desktop inclut
   Docker Compose v2 — aucune installation séparée.
2. Le dépôt de ce projet, cloné ou copié sur la machine (le `Dockerfile` construit
   l'image `core-api` à partir des sources — pas d'image pré-construite nécessaire pour
   un usage local).
3. Espace disque : les 4 images + le volume Postgres représentent quelques centaines de
   Mo à ~1 Go au total — largement dans les capacités d'un Mac récent.
4. RAM : Postgres + GoTrue + core-api (Next.js) + nginx sont individuellement légers
   (quelques dizaines à ~200 Mo chacun en usage normal, un seul salon) — la contrainte
   de 8 Go est confortable pour cette stack, largement dominée par le système
   d'exploitation et l'application elle-même plutôt que par l'infrastructure.
5. Un terminal (Terminal.app, déjà présent sur macOS) — aucun autre outil (Node, npm,
   psql...) n'est nécessaire sur la machine hôte : tout tourne dans les conteneurs,
   y compris les scripts d'administration (voir point 8, service `tooling`).

## Vérification

- 23 migrations appliquées sur un PostgreSQL local vierge.
- Seeds Director et Owner exécutés deux fois chacun pour confirmer leur idempotence.
- Suite unitaire : 27/27 tests réussis.
- Suite RLS locale : 10/10 tests réussis, avec fixtures automatiquement nettoyées.
- Connexion mot de passe réelle Director puis Owner via GoTrue local.
- Director : accès aux quatre routes opérationnelles, redirection hors de Staff/Postes.
- Owner : accès aux quatre routes opérationnelles ainsi qu’à Staff/Postes.
- Les douze rendus authentifiés contrôlés répondent avec le statut attendu et conservent
  le wrapper pleine largeur.
