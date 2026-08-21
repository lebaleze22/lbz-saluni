# 007 — Vérification de l'isolation multi-tenant RLS (test d'intégration)

## Statut

**Exécuté le 2026-08-21 contre une instance Supabase de test réelle — 5/6 tests passent.**
Les 5 vérifications demandées initialement sont vertes. La limite décrite plus bas,
identifiée par analyse du code avant toute exécution, est maintenant **confirmée** :
le test correspondant échoue réellement (`AssertionError: expected null not to be null`).
La faille est donc réelle, pas seulement théorique. Elle n'a pas été corrigée dans cette
session — correction en attente d'une décision explicite (voir en fin de section).

Deux prérequis ont dû être corrigés avant que le seed du test passe, tous deux relevant
de la même cause : des comportements gérés uniquement par Prisma Client (jamais
appliqués lors d'un INSERT fait hors Prisma Client, ex. le client admin Supabase du
test) plutôt que par de vraies valeurs par défaut Postgres :

- `id` : `@default(uuid())` → `@default(dbgenerated("gen_random_uuid()"))`
  (migration `20260821103000_database_uuid_defaults`).
- `updated_at` : `@updatedAt` seul → `@default(now()) @updatedAt`
  (migration `20260821110000_updated_at_defaults`).

`created_at` a été vérifié en même temps (sur les 6 mêmes modèles) : il utilisait déjà
`@default(now())`, qui **est** une vraie valeur par défaut Postgres (`DEFAULT
CURRENT_TIMESTAMP`), contrairement à `uuid()` et `@updatedAt` seul. Confirmé directement
en base via `information_schema.columns` sur les 8 tables métier : aucune autre colonne
de ces modèles ne repose sur un comportement Prisma-Client-only sans default Postgres
correspondant (les défauts booléens/enum comme `@default(true)` ou
`@default(salon_admin)` sont eux aussi de vraies valeurs par défaut Postgres, donc non
concernés).

## Contexte

Les policies RLS posées dans
[[001-tenant-id-et-rls]] (`prisma/migrations/00000000000001_rls_policies/migration.sql`)
n'avaient jusqu'ici été vérifiées que par lecture du SQL. Un test end-to-end était
nécessaire pour prouver, contre PostgREST + un vrai JWT Supabase (pas un mock, pas une
requête Prisma qui contournerait RLS), que l'isolation tient réellement.

## Ce que fait le test

`tests/rls/tenant-isolation.test.ts`, séparé de la suite par défaut :

- **Setup** (`beforeAll`, via la clé `service_role` qui contourne RLS) : crée deux
  tenants (`rls-test-tenant-a-<runId>`, `rls-test-tenant-b-<runId>`), un utilisateur
  `salon_admin` réel par tenant (`auth.admin.createUser` + ligne `public.users`), puis
  seed un `client`, un `service`, un `staff` et un `appointment` **sous tenant A
  uniquement**.
- **Sessions réelles** : deux clients Supabase authentifiés via
  `signInWithPassword`, un par utilisateur — donc deux JWT distincts portant le rôle
  Postgres `authenticated`, exactement le chemin qu'emprunte l'application.
- **Assertions demandées :**
  1. Lecture de `clients`/`services`/`appointments` de tenant A par la session tenant B
     → tableau vide, `error === null` (pas une erreur Postgres masquée).
  2. Insertion d'un `payment` avec `tenant_id = tenantA.id` par la session tenant B →
     rejetée par Postgres (`error.message` contient `row-level security`), aucune ligne
     créée.
  3. Contrôle : la session tenant A relit ses propres `client`/`service`/`appointment`
     et les trouve — écarte l'hypothèse d'une policy qui bloquerait tout le monde à
     tort.
- **Cleanup** (`afterAll`, `service_role`) : suppression explicite des lignes créées
  (enfants avant parents pour respecter les FK) puis des deux comptes `auth.users`. Pas
  de dépendance à une transaction/rollback : Supabase ne permet pas de rollback
  inter-requêtes depuis un client PostgREST, donc le nettoyage est un delete explicite,
  résilient même si le setup s'est arrêté en cours de route.

## Faille confirmée par exécution — référence croisée entre tenants

Le test inclut une vérification supplémentaire, au-delà de la demande initiale : la
session tenant B tente d'insérer un `payment` avec **son propre** `tenant_id` (donc
conforme à la policy `payments_write_admin`), mais avec `appointment_id` pointant vers
l'`appointment` de tenant A.

**Confirmé le 2026-08-21** : ce test échoue (`expected null not to be null` — c'est-à-dire
qu'aucune erreur Postgres n'a été renvoyée, l'insertion a réussi). Un `payment` de
tenant B a bien été créé en pointant vers un `appointment` de tenant A ; le test l'a
nettoyé immédiatement via le client `service_role` (comportement prévu dans le test pour
ce cas). La faille ci-dessous n'est donc plus une hypothèse.

En lisant la policy RLS de `payments` :

```sql
create policy "payments_write_admin" on "payments"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());
```

... rien ne vérifie que `appointment_id` référence bien un `appointment` du **même**
tenant que `payments.tenant_id`. La contrainte FK Postgres garantit seulement que
`appointment_id` existe quelque part, pas qu'il appartient au bon tenant — c'est
exactement ce que l'exécution du 2026-08-21 a démontré.

Ce même risque existe structurellement pour toutes les FK dénormalisées du schéma :
`appointments.client_id`, `appointments.staff_id`, `appointment_services.appointment_id`,
`appointment_services.service_id`. Ces cas n'ont pas été testés individuellement — seul
`payments.appointment_id` a été vérifié par exécution réelle.

**Statut de la correction : pas encore appliquée.** Le correctif recommandé — à
n'appliquer que sur décision explicite, la faille étant maintenant confirmée mais la
correction n'ayant pas été demandée dans cette session — consiste à remplacer les FK
simples par des FK composites incluant `tenant_id`, par exemple :

```sql
alter table "appointments" add constraint "appointments_tenant_id_id_unique" unique ("tenant_id", "id");
alter table "payments"
  add constraint "payments_appointment_tenant_fkey"
  foreign key ("tenant_id", "appointment_id")
  references "appointments" ("tenant_id", "id");
```

... à répéter pour chaque paire (table de référence, table qui la référence) concernée.
Cela déplace la garantie d'intégrité tenant du niveau applicatif/RLS vers une contrainte
Postgres native, cohérente avec l'esprit de [[001-tenant-id-et-rls]].

## Comment exécuter

```bash
# .env doit pointer vers un projet Supabase de TEST (jamais la prod), migré :
#   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npx prisma migrate deploy   # structure + policies RLS sur le projet de test
npm run test:rls
```

Sans ces trois variables d'environnement, `npm run test:rls` s'exécute mais **ignore**
tous les tests (via `describe.skipIf`) avec un avertissement explicite en console — il
ne les fait jamais passer au vert par défaut.

## Conséquences

- Ce test ne doit jamais tourner en CI sur un projet Supabase de production : il crée et
  supprime des comptes `auth.users` réels.
- `npm test` (suite par défaut) exclut `tests/rls/**` — voir `vitest.config.ts` — donc
  aucun risque qu'il s'exécute par accident dans un pipeline générique.
- La faille de référence croisée entre tenants (ci-dessus) reste ouverte : elle doit être
  corrigée (FK composites) avant que `payments`/`appointments`/`appointment_services` ne
  soient exposées à de vraies données multi-tenants en production.
