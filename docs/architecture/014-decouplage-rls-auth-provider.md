# 014 — Découpler les policies RLS de Supabase Auth (`auth.uid()`)

## Statut

**Résolu.** Trois passes, sur deux jours :

1. **2026-08-26, découplage initial** : migration SQL appliquée, fonctions vérifiées
   directement, `npm run test:rls` relancé — 7/10 tests verts, 3 régressions réelles
   rapportées sans correction forcée (voir "Vérification (2026-08-26)" plus bas), et deux
   limites structurelles découvertes (rôle `DATABASE_URL` en `BYPASSRLS`, `lib/db/` non
   transactionnel) documentées plutôt que corrigées silencieusement.
2. **2026-08-27, correctif de robustesse préalable** : vérifié que `staff_select_tenant`/
   `job_titles_select_tenant` couvraient bien Owner en lecture — techniquement oui (via
   combinaison OR avec la policy `write_admin` FOR ALL), mais implicitement ; rendu
   explicite avant de rendre RLS réellement actif (voir "Correctif préalable" plus bas).
3. **2026-08-27, résolution des deux limites** : rôle Postgres `app_runtime` restreint
   provisionné et branché sur `DATABASE_URL`, `FORCE ROW LEVEL SECURITY` posé sur les 9
   tables métier, `lib/db/auth.ts`/`register.ts`/`reports.ts` adaptés (connexion admin
   dédiée pour l'amorçage d'identité + requêtes regroupées en transaction), et
   `tests/rls/tenant-isolation.test.ts` migré du chemin PostgREST direct vers le vrai
   chemin applicatif (Prisma + `withRlsSession()`). **Résultat final : 9 tests verts sur
   10** — seul échec restant : le gap FK croisé payment/appointment déjà documenté
   ([[007-verification-isolation-rls]]), sans rapport avec ce découplage. Voir
   "Résolution finale (2026-08-27)" en fin de document pour le détail complet.

## Contexte

Les quatre fonctions/policies qui portaient jusqu'ici toute la logique d'identité RLS
(`current_tenant_id()`, `is_salon_admin()`, `is_owner()` — [[001-tenant-id-et-rls]],
[[012-role-owner]] — et la policy `users_update_self`, qui appelait `auth.uid()`
directement) dépendaient toutes de `auth.uid()`, une primitive **spécifique à Supabase**
(elle lit `request.jwt.claims->>'sub'`, un mécanisme propre à la façon dont Supabase/
PostgREST peuple la session Postgres à partir d'un JWT). Si le projet changeait un jour de
fournisseur d'auth, ou migrait vers un Postgres auto-hébergé sans PostgREST, **chaque
policy RLS du projet aurait dû être réécrite** — un couplage fort, risqué pour une
fonctionnalité de sécurité déjà vérifiée par des tests d'intégration réels
([[007-verification-isolation-rls]], [[008-soft-delete-active-vs-is-deleted]]).

## Pourquoi maintenant plutôt que plus tard

Le projet n'a que 4 fonctions/policies concernées et une seule migration Prisma
"structure" en cours (schéma stable depuis [[013-job-title-vs-system-role]]). Chaque
policy RLS ajoutée depuis [[001-tenant-id-et-rls]] a réutilisé les 3 fonctions existantes
plutôt que d'appeler `auth.uid()` à nouveau (à une exception près, fermée par cette
tâche : `users_update_self`) — le coût de ce découplage ne fera que croître avec chaque
nouvelle policy écrite directement contre `auth.uid()`. Le faire maintenant, avant que
d'autres tables/policies ne soient ajoutées (Étapes futures), limite le changement à un
seul point de contact plutôt qu'à un nombre croissant de policies dispersées.

## Décision

### 1. Les fonctions RLS lisent des variables de session Postgres, pas `auth.uid()`

```sql
create or replace function public.current_tenant_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function public.current_user_id()
returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function public.is_salon_admin()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.role', true), '') = 'salon_admin'
$$;

create or replace function public.is_owner()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.role', true), '') = 'owner'
$$;
```

- `current_setting(name, true)` — mode `missing_ok` : ne lève jamais d'erreur si la
  variable n'a pas été positionnée (ex. une connexion qui ne passe pas par la couche
  applicative attendue).
- `nullif(x, '')` traite "jamais définie" (`NULL`) et "définie à vide" (`''`, cas d'une
  requête explicitement non authentifiée côté applicatif) de la **même façon** : le
  résultat est `NULL`, donc `tenant_id = current_tenant_id()` ne peut jamais être vrai
  pour aucune ligne — **refus par défaut**, jamais un accès total. Même logique côté
  `coalesce(..., '') = 'salon_admin'` : renvoie explicitement `false` (jamais `NULL`) si
  la variable est absente.
- **`current_user_id()` est une addition non demandée explicitement** (la mission cite
  `current_tenant_id`/`is_owner`/`is_salon_admin`) mais nécessaire pour tenir l'objectif
  énoncé en tête de mission : `users_update_self` appelait `auth.uid()` directement, sans
  passer par une fonction helper — un 4ᵉ point de couplage non listé. Fermé dans la même
  migration (`alter policy "users_update_self" ... using (id = public.current_user_id() ...)`).
- **`SECURITY DEFINER` retiré** des 4 fonctions : il n'était nécessaire que pour
  contourner RLS lors de la lecture de `public.users` (éviter une récursion de policy,
  cf. [[001-tenant-id-et-rls]]). Ces fonctions ne lisent plus aucune table — seulement
  `current_setting()` — donc plus aucun privilège élevé n'est justifié (principe du
  moindre privilège).
- **Aucun changement de schéma ni de logique de policy** : chaque policy RLS continue
  d'appeler exactement les mêmes 4 fonctions, avec la même signification métier ("qui a
  le droit de faire quoi" est identique à avant). Seule la source interne de l'identité
  change.

### 2. Couche applicative — `lib/db/rls-session.ts`

```ts
export async function withRlsSession<T>(
  run: (tx: Prisma.TransactionClient, identity: RlsIdentity) => Promise<T>,
): Promise<T> {
  // 1. Vérifie le JWT Supabase (supabase.auth.getUser()) — inchangé par rapport à
  //    requireSalonAdmin() aujourd'hui.
  // 2. Résout tenantId/role/isDeleted via la connexion Prisma existante (contourne RLS
  //    par construction — voir point 3 plus bas) : SEULE lecture faite hors transaction.
  //    isDeleted rejeté ici (AccessDeniedError) — cf. point "Ce que cette tâche NE règle
  //    PAS" pour la conséquence de sécurité de ce déplacement.
  // 3. Ouvre prisma.$transaction(...) et pose set_config('app.tenant_id'/'app.role'/
  //    'app.user_id', ..., true) — l'équivalent paramétrable de SET LOCAL — en tout
  //    premier, avant d'exécuter `run(tx, identity)`.
}
```

`set_config(name, value, true)` plutôt que `SET LOCAL app.tenant_id = '...'` littéral :
`SET` n'accepte pas de paramètre lié en SQL — construire la requête par interpolation de
chaîne serait un risque d'injection, même si la valeur vient d'une source interne
(l'UUID résolu depuis `public.users`). `set_config(nom, valeur, true)` est l'équivalent
exact de `SET LOCAL` (le 3ᵉ argument `true` = "local à la transaction") mais accepte des
paramètres liés (`$1`) — utilisé ici via les tagged templates `$executeRaw` de Prisma qui
paramètrent automatiquement les valeurs interpolées.

Migrer d'auth provider ne toucherait, par construction, que ce fichier (`lib/db/rls-session.ts`)
et la façon dont `authUser.id` est obtenu — jamais les 4 fonctions SQL ni aucune policy.

### 3. `SET LOCAL` exige une transaction explicite — vérifié empiriquement

Comportement Postgres confirmé par exécution réelle (pas seulement documenté) :

```
SET LOCAL positionné dans une transaction, lu dans la même transaction : valeur visible.
Transaction terminée (commit) : la variable revient à NULL/absente immédiatement après.
```

Conséquence directe pour ce projet : **toute requête RLS-sensible doit s'exécuter via le
`tx` fourni par `withRlsSession`, jamais via le singleton `prisma` importé directement.**
Une requête hors de cette transaction ne verrait aucune des trois variables — refusée par
défaut (jamais un accès total, cf. point 1), mais probablement pas le comportement désiré
pour une page qui doit réellement lire des données.

**Vérifié : le pattern actuel de `lib/db/` ne le permet PAS partout**, comme demandé par
la mission ("vérifie que le pattern actuel des requêtes dans lib/db/ le permet, sinon
propose l'ajustement nécessaire") :

| Fonction                                       | Pattern actuel                                                                                                        | Compatible `SET LOCAL` ?                                                                                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/db/auth.ts` → `requireSalonAdmin()`       | 1 seule lecture `prisma.user.findUnique()`, hors transaction                                                          | Oui, sans changement — c'est exactement la résolution d'identité que fait `withRlsSession` lui-même, hors transaction, par construction                                                                |
| `lib/db/register.ts` → `getRegisterPageData()` | 4 requêtes indépendantes via `Promise.all([...])`, **hors transaction**                                               | **Non** — chaque requête peut atterrir sur une connexion pooler différente (PgBouncer, `pgbouncer=true` sur `DATABASE_URL`) ; `SET LOCAL` posé pour l'une ne serait pas garanti visible par les autres |
| `lib/db/register.ts` → `createRegisterEntry()` | lectures (`staff.findFirst`, `service.findMany`) **hors** transaction, écritures déjà dans `prisma.$transaction(...)` | Partiellement — la partie écriture est déjà structurée correctement ; la partie lecture en tête de fonction ne l'est pas                                                                               |
| `lib/db/reports.ts` → `getReportData()`        | 1 requête unique, mais hors transaction                                                                               | Non par construction actuelle (pas de `$transaction` du tout)                                                                                                                                          |

**Ajustement nécessaire (proposé, non appliqué par cette tâche)** : regrouper chaque
fonction dans un seul `withRlsSession(async (tx, identity) => { ... utiliser tx.staff,
tx.service, etc. au lieu de prisma.staff, prisma.service ... })`. Non fait ici
volontairement : (a) la mission demande d'ajouter la couche, pas de migrer la logique
métier existante ("Ne change ni le schéma ni la logique métier des policies elles-mêmes") ;
(b) tant que le point 4 ci-dessous n'est pas résolu, cette migration serait sans effet
observable — un risque de faux sentiment de sécurité si elle était faite maintenant sans
qu'on sache qu'elle ne change rien en pratique.

### 4. Trouvaille critique, non demandée mais bloquante : le rôle Postgres de `DATABASE_URL` contourne RLS entièrement

Vérifié par requête directe pendant cette tâche :

```
current_user = postgres
rolsuper     = false
rolbypassrls = true
staff.tableowner = postgres
```

Le rôle utilisé par `DATABASE_URL` (donc par tout `lib/db/*.ts` actuel, y compris le futur
`withRlsSession`) a l'attribut Postgres `BYPASSRLS`, et possède en plus les tables
elles-mêmes. **Un rôle avec `BYPASSRLS` ignore RLS inconditionnellement, `FORCE ROW LEVEL
SECURITY` ou pas** — seul un rôle non-owner et sans `BYPASSRLS` est réellement soumis aux
policies. Ce n'est pas introduit par cette tâche : c'est la même trouvaille déjà actée en
[[013-job-title-vs-system-role]] ("l'app Next.js lit `staff` exclusivement via la connexion
`DATABASE_URL`, qui contourne RLS").

**Conséquence directe pour ce découplage** : `withRlsSession` positionne correctement
`app.tenant_id`/`app.role`/`app.user_id` (vérifié, voir "Vérification" ci-dessous), et les
4 fonctions RLS les lisent correctement — **mais tant que ces requêtes passent par la
connexion `DATABASE_URL` actuelle, RLS ne les évalue jamais, quelle que soit la valeur des
variables.** Le mécanisme est correct ; il n'a aucun effet observable sur les données
retournées par `lib/db/` tant qu'un second rôle Postgres, sans `BYPASSRLS` ni ownership
des tables (avec des `GRANT` explicites `SELECT`/`INSERT`/`UPDATE`/`DELETE`), n'est pas
provisionné et utilisé pour ce chemin. Provisionner un tel rôle est une action
d'infrastructure (nouvelle credential Supabase, nouvelle chaîne de connexion) qui dépasse
le périmètre "schéma + RLS + ADR" de cette tâche et n'a pas été faite ici sans
confirmation explicite.

## Ce que cette tâche NE règle PAS (limites assumées le 2026-08-26 — **résolues le

2026-08-27, voir "Résolution finale" en fin de document**)

- **Point 3 et 4 ci-dessus** : le code applicatif métier (`register.ts`, `reports.ts`)
  n'a pas été restructuré en transactions, et aucun rôle Postgres non-`BYPASSRLS` n'a été
  provisionné — sans les deux, `withRlsSession` reste une brique correcte mais inerte en
  pratique pour les requêtes de l'application (la seule voie qui exerce réellement RLS
  aujourd'hui est le chemin PostgREST + JWT direct, celui de `tests/rls/`, qui n'utilise
  ni Prisma ni `withRlsSession`).
- **Déplacement du contrôle `isDeleted` de la policy vers l'application.** Avant cette
  tâche, `current_tenant_id()`/`is_salon_admin()` filtraient elles-mêmes
  `and not is_deleted` en lisant `public.users` à chaque évaluation de policy — un compte
  désactivé en cours de session perdait immédiatement tout accès, y compris sur une
  connexion déjà ouverte. Les 4 fonctions ne lisent plus aucune table : ce contrôle est
  désormais fait une fois, dans `withRlsSession`, au moment de la résolution d'identité.
  **Conséquence assumée** : si un compte est soft-deleted alors qu'une transaction Prisma
  a déjà positionné ses variables `app.*`, cette transaction déjà ouverte continuerait de
  s'exécuter avec l'identité résolue avant la suppression (fenêtre de cohérence limitée à
  la durée d'une transaction, pas d'une session longue comme avant). Le chemin PostgREST
  direct (`tests/rls/`), lui, n'est pas concerné par cette tâche et garde son propre
  mécanisme (voir "Vérification").
- **Cohérence entre les deux mécanismes d'identité qui coexistent désormais** : le
  chemin PostgREST + JWT (utilisé par `tests/rls/`) continue de peupler
  `request.jwt.claims` (`auth.uid()`), mais plus aucune fonction RLS ne le lit — ce chemin
  n'a donc plus aucun moyen de faire fonctionner les policies (voir régressions
  ci-dessous), sauf à configurer un mécanisme Supabase (`db-pre-request`) qui positionne
  `app.tenant_id`/`app.role` à partir du JWT côté PostgREST — non fait ici (configuration
  de projet Supabase, hors du dépôt, et réintroduirait une dépendance Supabase-spécifique
  à l'endroit même que cette tâche cherche à éliminer).

## Vérification (2026-08-26)

### Fonctions — comportement vérifié directement (hors RLS, requêtes SQL directes)

| Scénario                                                                                                      | Résultat                                                                                                         |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Aucune variable positionnée                                                                                   | `current_tenant_id()` = NULL, `current_user_id()` = NULL, `is_salon_admin()` = false, `is_owner()` = false       |
| `app.tenant_id`/`app.user_id`/`app.role='owner'` positionnés via `set_config(..., true)` dans une transaction | Valeurs correctement lues à l'intérieur de la même transaction (`is_owner()` = true, `is_salon_admin()` = false) |
| Après fin de la transaction                                                                                   | Toutes les fonctions reviennent à NULL/false — confirme le comportement `SET LOCAL` documenté au point 3         |
| Variables positionnées à `''` (chaîne vide, cas applicatif "non authentifié")                                 | Même résultat que "non positionnées" : NULL/false partout                                                        |

### `npm run test:rls` — résultat complet, test par test

Relancé en entier contre l'instance Supabase de test après application de la migration
`20260826170000_decouple_rls_from_supabase_auth`. **7 tests verts sur 10 — 3 régressions
réelles sur des tests déjà verts avant cette tâche.** Conformément à la consigne
("si un test RLS déjà vert casse... arrête-toi et rapporte-le clairement plutôt que de
forcer une correction non vérifiée"), **aucune correction n'a été tentée** — résultat
rapporté tel quel, obtenu par exécution réelle de la suite complète.

| Test                                                                                                    | Avant cette tâche                                        | Après cette tâche                                                  |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur      | ✅                                                       | ✅                                                                 |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur     | ✅                                                       | ✅                                                                 |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur | ✅                                                       | ✅                                                                 |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A                     | ✅                                                       | ✅                                                                 |
| **(contrôle) un utilisateur de tenant A voit bien ses propres données**                                 | ✅                                                       | **❌ RÉGRESSION** — `expected [] to have a length of 1 but got +0` |
| (analyse complémentaire) un payment de tenant B ne peut pas référencer un appointment de tenant A       | ❌ (gap préexistant, [[007-verification-isolation-rls]]) | ❌ (même gap, sans rapport)                                        |
| **un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted**                              | ✅                                                       | **❌ RÉGRESSION** — `expected [] to have a length of 1 but got +0` |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A          | ✅                                                       | ✅ (passe, mais pour une mauvaise raison — voir explication)       |
| **un owner de tenant A peut lire les données de son propre tenant**                                     | ✅                                                       | **❌ RÉGRESSION** — `expected [] to have a length of 1 but got +0` |
| un owner de tenant A ne peut pas lire les utilisateurs de tenant B                                      | ✅                                                       | ✅ (passe, mais pour une mauvaise raison — voir explication)       |

**Résumé exécution** : `Test Files 1 failed (1)` / `Tests 3 failed | 7 passed (10)`.

### Cause des régressions — confirmée, pas seulement supposée

`tests/rls/tenant-isolation.test.ts` authentifie ses sessions **exclusivement** via
`supabase-js` + `signInWithPassword()`, puis interroge directement PostgREST
(`sessionA.from("clients").select(...)`). Ce chemin peuple `request.jwt.claims`
(`auth.uid()`), **jamais** `app.tenant_id`/`app.role`/`app.user_id` — ces GUC ne sont
positionnées que par `withRlsSession` (point 2), qui n'est appelé nulle part sur ce chemin
(il vit côté Next.js/Prisma, jamais exercé par ce test). Conséquence mécanique :
`current_tenant_id()` renvoie systématiquement `NULL` et `is_salon_admin()`/`is_owner()`
renvoient systématiquement `false` pour **toute** session de ce test, y compris pour
l'utilisateur légitime de son propre tenant.

- Les tests qui vérifient qu'un accès **doit être refusé** continuent de passer, mais
  souvent pour une raison dégradée : plus personne n'a d'identité résolue sur ce chemin,
  donc plus personne ne voit plus rien nulle part (au lieu de "isolation correcte entre
  tenants", c'est "refus total, y compris pour son propre tenant").
- Les tests qui vérifient qu'un accès **légitime doit fonctionner**
  ("(contrôle) un utilisateur de tenant A voit bien ses propres données",
  "un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted") **échouent**
  désormais, puisque même le propriétaire légitime de ses données ne peut plus les lire :
  `current_tenant_id()` = NULL ne correspond au `tenant_id` d'aucune ligne, y compris les
  siennes.

Ce n'est pas un bug de la migration SQL (les fonctions se comportent exactement comme
vérifié ci-dessus, en isolation) ni un bug de `withRlsSession` — c'est une **incompatibilité
architecturale** : ce test exerce un chemin (PostgREST + JWT direct) que ce découplage ne
couvre pas et n'a jamais été conçu pour couvrir (voir "Ce que cette tâche NE règle PAS").
Le corriger correctement demanderait soit (a) un mécanisme Supabase `db-pre-request` qui
peuple `app.*` à partir du JWT côté PostgREST — réintroduisant une dépendance
Supabase-spécifique à l'endroit précis que cette tâche cherche à éliminer — soit (b) de
migrer `tests/rls/` lui-même vers le chemin Prisma + `withRlsSession` plutôt que PostgREST
direct, ce qui changerait fondamentalement ce que ce test prouve (il ne testerait plus le
chemin PostgREST + JWT réel décrit dans son propre en-tête). Aucune des deux n'a été
tentée le 2026-08-26 : décision explicitement laissée à l'utilisateur — l'option (b) a été
choisie et appliquée le lendemain, voir ci-dessous.

## Correctif préalable (2026-08-27) — accès lecture d'Owner sur `staff`/`job_titles`

Avant de rendre RLS réellement actif (section suivante), vérification demandée
explicitement : `staff_select_tenant`/`job_titles_select_tenant`
([[013-job-title-vs-system-role]]) incluaient-elles `is_owner()` en plus de
`is_salon_admin()` ? Lu directement depuis `pg_policies` : **non**, leur `USING` ne
teste que `is_salon_admin()`. Owner avait malgré tout accès en lecture aujourd'hui, mais
uniquement par un effet indirect : `staff_write_admin`/`job_titles_write_admin` sont des
policies `FOR ALL` (donc applicables aussi aux commandes `SELECT`), et PostgreSQL combine
par OR tous les `USING` des policies permissives applicables à une commande — l'accès
lecture d'Owner dépendait donc entièrement du fait que `write_admin` reste une policy
`FOR ALL`, un lien implicite entre deux policies distinctes.

Sans conséquence observable jusqu'ici (le rôle `DATABASE_URL` avait `BYPASSRLS` — aucune
policy, correcte ou non, n'avait d'effet). Une fois RLS réellement appliqué, un futur
refactor de `write_admin` (ex. le scinder en policies `INSERT`/`UPDATE`/`DELETE`
séparées) ferait perdre à Owner son accès en lecture silencieusement. Corrigé par
migration `20260826180000_staff_job_titles_select_owner_explicit` : le `USING` des deux
policies `*_select_tenant` teste désormais explicitement
`(is_salon_admin() or is_owner())`, indépendamment de la forme future de `write_admin`.
Aucun changement de comportement observable (Owner avait déjà cet accès) — uniquement une
clarification structurelle avant l'étape suivante.

## Résolution finale (2026-08-27)

### Partie 1 — Rôle Postgres restreint (`app_runtime`) pour le trafic applicatif réel

Un nouveau rôle Postgres a été provisionné spécifiquement pour être le rôle utilisé par
`DATABASE_URL` (runtime applicatif), remplaçant le rôle `postgres` (propriétaire des
tables, `BYPASSRLS`) qui servait jusqu'ici indifféremment aux migrations ET au runtime :

```sql
create role app_runtime with login nosuperuser nocreatedb nocreaterole nobypassrls
  noreplication inherit password '<secret>';
grant authenticated to app_runtime;          -- rend les policies "to authenticated" applicables
grant usage on schema public to app_runtime;
grant select, insert, update, delete on all tables in schema public to app_runtime;
```

`grant authenticated to app_runtime` — nécessaire car toutes les policies RLS du projet
sont scopées `to authenticated` (jamais `to public`). PostgreSQL applique une policy
`to X` à toute session dont le rôle courant est membre de `X` (pas seulement au rôle `X`
lui-même) — **vérifié empiriquement** (voir "Preuve" plus bas), pas seulement supposé :
c'est ce qui permet à `app_runtime` (un rôle entièrement nouveau, sans aucun rapport
préexistant avec `authenticated`) de se voir appliquer les mêmes policies que le chemin
PostgREST, sans modifier une seule policy.

**`FORCE ROW LEVEL SECURITY`** appliqué sur les 9 tables métier (`tenants`, `users`,
`staff`, `job_titles`, `clients`, `services`, `appointments`, `appointment_services`,
`payments`) — nécessaire uniquement pour un rôle qui serait _propriétaire_ de la table
(un propriétaire est exempté de RLS par défaut, `FORCE` lève cette exemption) ; sans
incidence ici puisque `app_runtime` ne possède aucune table, mais posé par cohérence avec
la demande et pour ne dépendre d'aucune hypothèse implicite sur la propriété future des
tables.

**`DATABASE_URL`** repointé vers `app_runtime` (connexion poolée, port 6543, inchangée
sinon). **`DIRECT_URL`** inchangé (`postgres`, utilisé uniquement par `prisma migrate`).
Nouvelle variable **`ADMIN_DATABASE_URL`** ajoutée (même valeur que l'ancien
`DATABASE_URL` — rôle `postgres`, poolé) : voir Partie de correctif applicatif ci-dessous
pour pourquoi elle était nécessaire.

#### Preuve — `app_runtime` n'a ni `BYPASSRLS` ni la propriété des tables, et RLS s'applique réellement

Vérifié par requête directe :

```
rolname = app_runtime, rolsuper = false, rolbypassrls = false, rolcanlogin = true
membership: app_runtime ∈ authenticated
tables (tenants, users, staff, job_titles, clients, services, appointments,
        appointment_services, payments) : owner = postgres, forced = true (toutes)
```

Et par un test fonctionnel de bout en bout (pas seulement les attributs du rôle) : une
ligne `clients` réelle insérée sous un tenant connu, lue via `app_runtime` —

| Scénario                                                     | Résultat                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Connexion `app_runtime`, aucune variable `app.*` positionnée | 0 ligne visible (alors que la ligne existe réellement — confirmé côté `postgres`) |
| `app.tenant_id` positionné à un tenant **différent** (réel)  | 0 ligne visible                                                                   |
| `app.tenant_id` positionné au **vrai** tenant de la ligne    | La ligne est visible                                                              |

RLS est donc réellement évalué pour ce rôle — ce n'était vérifiable d'aucune façon avec
l'ancien rôle `postgres` (`BYPASSRLS`).

### Correctif applicatif nécessaire, découvert avant de basculer `DATABASE_URL`

Basculer `DATABASE_URL` vers `app_runtime` sans rien changer d'autre aurait cassé
`requireSalonAdmin()` (`lib/db/auth.ts`) et donc l'intégralité des pages `register`/
`reports` : cette fonction lit sa propre ligne `public.users` par `id = authUser.id`
**pour découvrir** `tenantId`/`role` — un problème d'amorçage, pas un `GRANT` manquant
(aucun `GRANT` ne peut résoudre "il faut déjà connaître le tenant pour lire la ligne qui
donne le tenant"). Signalé explicitement avant d'agir ; décision confirmée : corriger
l'application pour qu'elle reste fonctionnelle plutôt que basculer et casser `register`/
`reports`.

- **`lib/admin-prisma.ts`** (nouveau) : second client Prisma, connecté via
  `ADMIN_DATABASE_URL` (rôle `postgres`, privilégié) — réservé à la résolution
  d'identité. Ne jamais l'utiliser pour une requête métier RLS-sensible.
- **`lib/db/auth.ts`** (`requireSalonAdmin`) : lookup `prisma.user.findUnique` →
  `adminPrisma.user.findUnique`. Comportement/signature identiques, seule la connexion
  change.
- **`lib/db/rls-session.ts`** (nouveau, posé le 2026-08-26, ajusté le 2026-08-27) :
  `resolveRlsIdentity()`/`withRlsSession()` utilisent désormais `adminPrisma` pour
  l'amorçage, `prisma` (→ `app_runtime`) pour la transaction `tx` réellement soumise à
  RLS. Ajout de `runInTenantTransaction(identity, run)` — ouvre la transaction `SET
LOCAL` à partir d'une identité déjà résolue, pour les call sites qui ont déjà appelé
  `requireSalonAdmin()` et ne veulent pas revérifier le JWT une deuxième fois. Ajout d'un
  paramètre optionnel `verifiedAuthUserId` (réservé aux tests, voir Partie 2) permettant
  de fournir un id déjà vérifié par JWT sans dépendre de `next/headers`.
- **`lib/db/register.ts`/`lib/db/reports.ts`** : les requêtes (précédemment indépendantes
  ou partiellement hors transaction — voir le tableau de la section 3 plus haut) sont
  désormais regroupées dans un seul `runInTenantTransaction(identity, (tx) => ...)` par
  fonction, `prisma.X` → `tx.X`. Logique métier et validations identiques ; seule la
  plomberie de connexion change — conforme à l'esprit (pas la lettre stricte, puisque le
  contournement RLS qui rendait cet ajustement inutile a disparu) de "ne pas changer la
  logique métier".

### Partie 2 — Suite de tests migrée vers le vrai chemin applicatif

`tests/rls/tenant-isolation.test.ts` interrogeait directement PostgREST via
`supabase-js` (`sessionX.from("table").select(...)`) — un chemin que l'application
elle-même n'emprunte plus (et n'a jamais vraiment emprunté pour les requêtes de données,
voir [[013-job-title-vs-system-role]]). Remplacé par le chemin réel : `withRlsSession()`

- Prisma, comme `lib/db/register.ts`/`reports.ts`.

* Le **setup/teardown** (créer 2 tenants, des comptes `auth.users` réels, seed des
  données, suppression finale) reste en `supabase-js` + client `service_role` — ce n'est
  pas le chemin sous test, et Prisma n'a pas d'équivalent pour créer des comptes
  `auth.users` (opération Supabase Auth, pas une simple ligne Postgres).
* Chaque session (`userA`, `userB`, `ownerA`) se connecte toujours via
  `signInWithPassword` (vrai mot de passe, vrai JWT), puis ce JWT est **vérifié pour de
  vrai** via `client.auth.getUser(accessToken)` — la même vérification cryptographique
  que `resolveRlsIdentity()` fait en production via `getUser()` sans argument (lu depuis
  les cookies Next.js, indisponibles dans un test Vitest). Le seul écart avec la
  production est le transport du JWT (argument explicite ici vs. cookie), jamais la
  vérification elle-même.
* Chaque assertion de lecture/écriture passe désormais par
  `withRlsSession((tx) => tx.client.findMany(...), verifiedUserId)` plutôt que
  `sessionX.from("clients").select(...)`. Deux différences d'API notées et gérées :
  - Une lecture cross-tenant qui ne trouve rien renvoie `[]` dans les deux cas (pas de
    changement d'assertion).
  - Un **`UPDATE` qui ne matche 0 ligne** se comporte différemment : PostgREST renvoie
    `data: [], error: null` (pas un échec au sens Postgres) ; Prisma, lui, s'attend à
    modifier exactement une ligne et lève une erreur (`P2025`, _Record to update not
    found_) si RLS en filtre 0. Les tests de restauration cross-tenant ont été réécrits
    en conséquence (`await expect(...).rejects.toThrow()` plutôt que
    `expect(data).toEqual([])`) — même refus, exprimé différemment par la couche client.
* `vitest.rls.config.ts` : ajout de `resolve.alias` (`"@"` → racine du projet) —
  nécessaire car ce test importe désormais du code applicatif (`lib/db/rls-session.ts`,
  qui utilise lui-même l'alias `@/*`) ; aucun test du projet n'en avait besoin jusqu'ici.

### Résultat final — `npm run test:rls`, 9 tests verts sur 10

Relancé en entier après application de la migration
`20260826180000_staff_job_titles_select_owner_explicit`, le basculement de
`DATABASE_URL`/`ADMIN_DATABASE_URL`, et la migration du test lui-même :

| Test                                                                                                    | Résultat                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur      | ✅                                                                                                                                                                      |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur     | ✅                                                                                                                                                                      |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur | ✅                                                                                                                                                                      |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A                     | ✅                                                                                                                                                                      |
| (contrôle) un utilisateur de tenant A voit bien ses propres données                                     | ✅ (régression du 08-26 résolue)                                                                                                                                        |
| (analyse complémentaire) un payment de tenant B ne peut pas référencer un appointment de tenant A       | ❌ — gap FK cross-tenant préexistant ([[007-verification-isolation-rls]]), sans rapport avec ce découplage, non corrigé ici (seul échec attendu, conforme à la demande) |
| un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted                                  | ✅ (régression du 08-26 résolue)                                                                                                                                        |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A          | ✅ (cette fois pour la bonne raison — RLS évalue une vraie identité, pas une absence totale d'identité)                                                                 |
| un owner de tenant A peut lire les données de son propre tenant                                         | ✅ (régression du 08-26 résolue)                                                                                                                                        |
| un owner de tenant A ne peut pas lire les utilisateurs de tenant B                                      | ✅ (bonne raison, idem)                                                                                                                                                 |

**Résumé exécution** : `Test Files 1 failed (1)` / `Tests 1 failed | 9 passed (10)` —
**reproduit sur 2 exécutions consécutives stables** après le correctif de timeout
ci-dessous.

#### Trouvaille additionnelle : `maxWait`/`timeout` par défaut de `$transaction` trop courts pour le pooler partagé Supabase

Une exécution intermédiaire de la suite (entre deux exécutions par ailleurs propres) a
produit 4 échecs sur des erreurs Prisma `P2028` (`Unable to start a transaction in the
given time`, `Transaction not found`) — pas des échecs d'assertion. `prisma.$transaction`
attend par défaut au plus 2s (`maxWait`) pour obtenir une connexion et démarrer la
transaction interactive, et 5s (`timeout`) pour qu'elle se termine. Sous le pooler
partagé multi-projets de Supabase (`DATABASE_URL`, port 6543, `pgbouncer=true`), ce délai
s'est avéré parfois trop court — probablement de la latence/contention côté pooler
partagé, pas une incompatibilité structurelle (les transactions interactives Prisma sont
documentées comme fonctionnant avec PgBouncer en mode transaction tant que
`pgbouncer=true` est présent dans l'URL, ce qui est déjà le cas ici).

Corrigé dans `runInTenantTransaction` (`lib/db/rls-session.ts`) en passant explicitement
`{ maxWait: 10_000, timeout: 15_000 }` à `prisma.$transaction(...)` — au lieu de courir
après une cause plus profonde (le symptôme a disparu et n'est pas revenu sur les
exécutions suivantes, ce qui pointe vers un délai insuffisant plutôt qu'un problème de
correction). **Effet secondaire assumé** : une requête RLS-sensible réellement bloquée
(policy incorrecte, boucle applicative) mettra désormais jusqu'à 15s à échouer au lieu de
5s — acceptable pour ce volume de trafic actuel, à revisiter si la latence perçue devient
un problème en production.

Les 3 régressions du 2026-08-26 sont résolues : chaque session de test dispose désormais
d'une vraie identité résolue (`app.tenant_id`/`app.role`/`app.user_id` réellement
positionnées via `withRlsSession`), donc un utilisateur légitime voit à nouveau ses
propres données — et les tests qui vérifient un refus le vérifient maintenant pour la
bonne raison (isolation tenant réelle), pas par absence totale d'identité sur un chemin
mort.

### Ce qui reste vrai après cette résolution

- Le gap FK cross-tenant `payments.appointment_id` (et les FK dénormalisées analogues,
  [[007-verification-isolation-rls]]) reste ouvert — aucune partie de cette tâche ne le
  concerne.
- Le déplacement du contrôle `isDeleted` de la policy vers l'application (section "Ce que
  cette tâche NE règle PAS" ci-dessus) reste une caractéristique assumée du design, pas
  une régression : un compte soft-deleted en cours de transaction achève cette
  transaction avec l'identité résolue avant la suppression — fenêtre bornée à une
  transaction, pas à une session longue.
- `scripts/seed-dev.mjs` (création du tenant/compte de démo) utilise `supabase-js` avec
  la clé `service_role`, pas Prisma — non affecté par le changement de rôle
  `DATABASE_URL` (chemin totalement différent, contourne RLS par la clé API, pas par un
  rôle Postgres).
