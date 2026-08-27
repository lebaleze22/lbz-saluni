# 012 — Rôle Owner, au-dessus de Director (`salon_admin`)

## Statut

Implémenté et vérifié le 2026-08-26 contre l'instance Supabase de test — migrations
appliquées via `prisma migrate deploy`, **9 tests verts sur 10** en relançant
`npm run test:rls` (voir [[007-verification-isolation-rls]] pour la suite ; résultat
détaillé en fin de document). Le seul échec est le gap FK cross-tenant déjà documenté en
[[007-verification-isolation-rls]] et [[008-soft-delete-active-vs-is-deleted]], sans
rapport avec cette tâche. Les 2 nouveaux tests Owner passent.

## Contexte

Jusqu'ici, `salon_admin` (nommé "Director" côté métier) était le seul rôle réellement
utilisé (cf. [[001-tenant-id-et-rls]], [[004-staff-sans-compte]]) : un compte par salon,
opérationnel au quotidien (saisie du registre d'activité). Le besoin métier introduit ici
est différent : un rôle **Owner**, au-dessus de Director, qui supervise un salon de façon
globale/approuvée mais **n'opère pas** au quotidien — pas de saisie, pas de gestion des
présences (fonctionnalité future, explicitement hors MVP, voir plus bas).

## Décision

### 1. Hiérarchie

```
Owner            — supervision globale, approuvé, un par salon, pas opérationnel.
  ↳ Director     — salon_admin (nom technique inchangé), un par salon, opérationnel
                    (saisie du registre d'activité, seul rôle d'écriture au MVP).
      ↳ Staff    — sans compte, donnée de référence sélectionnable (cf. [[004-staff-sans-compte]]).
```

Owner et Director sont tous deux des comptes `public.users` réels (contrairement à Staff).
Rien dans ce document ne change le fonctionnement de Director : c'est une addition
au-dessus, pas une modification.

### 2. `owner` ajouté à l'enum `UserRole`

```prisma
enum UserRole {
  owner
  salon_admin
  manager
  staff
}
```

Deux migrations séparées (`20260826140000_owner_role_enum` puis `20260826140100_owner_role_rls`) :
PostgreSQL interdit d'utiliser une valeur d'enum tout juste ajoutée
(`ALTER TYPE ... ADD VALUE`) dans la **même** transaction que celle qui l'ajoute
("unsafe use of new value of enum type"). `prisma migrate deploy` exécute chaque dossier
de migration comme sa propre transaction — la fonction `is_owner()` et les index qui
référencent `'owner'::user_role` (ci-dessous) devaient donc vivre dans une migration
postérieure à celle qui ajoute la valeur.

### 3. Choix délibéré : `salon_admin` reste le nom technique de Director

Le rôle métier "Director" n'est **pas** renommé en base — l'enum, les policies RLS
(`is_salon_admin()`, `*_write_admin`, `*_restore_admin`, `*_select_deleted_admin`), le
helper applicatif `requireSalonAdmin()` (`lib/db/auth.ts`) et les tests RLS existants
continuent de parler de `salon_admin`, inchangés par cette tâche.

**Pourquoi** : `salon_admin` est un nom technique déjà vérifié de bout en bout (policies
RLS, contournement de récursion via `SECURITY DEFINER`, 8 tests d'intégration réels contre
une vraie instance Supabase — [[007-verification-isolation-rls]], [[008-soft-delete-active-vs-is-deleted]]).
Le renommer en `director` toucherait l'enum Postgres (renommage de valeur — possible mais
non trivial et irréversible sans nouvelle migration), toutes les policies RLS qui
comparent `role = 'salon_admin'`, la fonction `is_salon_admin()`, son appelant
applicatif, et invaliderait la couverture de test existante sans aucun bénéfice
fonctionnel — "Director" est une étiquette métier, pas un comportement système différent.
Coût de renommage disproportionné par rapport au risque de régression sur une base déjà
vérifiée. "Director" reste donc le nom d'affichage/métier ; `salon_admin` reste le nom en
base et dans le code.

### 4. Helper `is_owner()` — même pattern que `is_salon_admin()`

```sql
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'owner' and not is_deleted
  )
$$;
```

`SECURITY DEFINER` pour la même raison que `is_salon_admin()` ([[001-tenant-id-et-rls]]) :
contourner RLS lors de sa propre lecture de `public.users`, pour éviter toute récursion de
policy sur `users` elle-même. Filtre `not is_deleted`, par cohérence avec
`current_tenant_id()`/`is_salon_admin()` depuis [[008-soft-delete-active-vs-is-deleted]].

Cette fonction n'est **appelée par aucune policy** à ce stade (voir point 6) — elle est
posée pour être prête le jour où une policy d'écriture spécifique à Owner sera
spécifiée, exactement comme `is_salon_admin()` a précédé les policies qui l'utilisent.

### 5. Contrainte base : au plus un salon_admin (Director) et un owner par tenant

```sql
create unique index "users_one_salon_admin_per_tenant"
  on "users" ("tenant_id")
  where role = 'salon_admin' and not is_deleted;

create unique index "users_one_owner_per_tenant"
  on "users" ("tenant_id")
  where role = 'owner' and not is_deleted;
```

Index unique **partiel** plutôt qu'une contrainte `UNIQUE(tenant_id, role)` classique :
cette dernière limiterait à un seul utilisateur par `(tenant, rôle)` pour **tous** les
rôles, y compris `staff`/`manager` — non souhaité, ces rôles doivent pouvoir compter
plusieurs comptes par tenant à terme. L'index partiel cible précisément les deux rôles à
titulaire unique.

**Écart assumé par rapport à l'exemple donné dans la mission** : le prédicat inclut
`and not is_deleted`, absent de l'exemple fourni
(`CREATE UNIQUE INDEX ON users (tenant_id) WHERE role = 'salon_admin'`). Raison : la
hiérarchie du projet ([[008-soft-delete-active-vs-is-deleted]]) traite une ligne
soft-deleted comme "supprimée, point final". Sans ce filtre, un ancien Director ou Owner
soft-deleted (départ, remplacement) bloquerait indéfiniment le provisioning de son
remplaçant tant que la ligne historique existe — contraire à l'esprit du soft delete déjà
en place pour les 6 autres tables métier. Avec le filtre, une ligne soft-deleted "libère"
le slot ; restaurer cette ligne (policy `users`... note : `users` n'a pas de
`*_restore_admin`, voir [[008-soft-delete-active-vs-is-deleted]] "Tables hors scope")
alors qu'un remplaçant actif existe redeviendrait, elle, un conflit d'unicité détecté par
Postgres au moment de la restauration — comportement jugé correct et suffisant.

### 6. Lecture : Owner hérite automatiquement, aucune nouvelle policy — confirmé, pas supposé

Vérification demandée explicitement par la mission plutôt qu'assumée : lecture directe de
chaque policy `*_select_tenant` existante (`00000000000001_rls_policies/migration.sql`,
mise à jour par `20260821120001_soft_delete_rls_filtering/migration.sql`) :

```sql
create policy "users_select_tenant" on "users"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and not is_deleted);
-- (même forme pour staff_select_tenant, clients_select_tenant, services_select_tenant,
--  appointments_select_tenant, appointment_services_select_tenant, payments_select_tenant,
--  et tenants_select_own)
```

Aucune de ces policies ne conditionne l'accès à un rôle — seulement `tenant_id` (+
`not is_deleted`). **Confirmé** : un utilisateur `owner` du tenant hérite donc de la
lecture globale du tenant dès l'ajout de la valeur d'enum, sans policy supplémentaire.
Vérifié une deuxième fois par exécution réelle (pas seulement lecture du SQL) : voir la
suite `tests/rls/tenant-isolation.test.ts`, tests "un owner de tenant A peut lire..." /
"...ne peut pas lire les utilisateurs de tenant B" en fin de document.

### 7. Aucune policy d'écriture pour Owner à ce stade (MVP)

Ni pour Owner ni pour Director la création de compte ne passe par une UI self-service :
c'est une opération admin (script — voir `scripts/seed-dev.mjs` pour le pattern actuel
avec Director), via la clé `service_role` qui contourne RLS. Cette tâche n'ajoute donc
aucune policy `INSERT`/`UPDATE`/`DELETE` pour `owner` — ni sur `users` (provisioning d'un
compte Owner/Director), ni sur les tables métier (Owner ne saisit pas). `is_owner()`
(point 4) existe pour une évolution future qui en aurait besoin, mais rien ne l'utilise
aujourd'hui.

### 8. "Gestion des présences" — hors MVP

Explicitement hors périmètre : aucune table, colonne, ni policy liée à un suivi de
présence (staff ou autre) n'est introduite ici. Le rôle Owner est un rôle de supervision
globale/approbation, pas un déclencheur de cette fonctionnalité — elle reste, comme les
rôles `manager`/`staff` eux-mêmes (cf. [[004-staff-sans-compte]]), réservée à une étape
future non spécifiée.

## Conséquences

- Provisionner un compte Owner suit exactly le même chemin que Director aujourd'hui :
  insertion manuelle via `service_role` (`auth.admin.createUser` + ligne `public.users`
  avec `role = 'owner'`), pas de script dédié ajouté par cette tâche.
- Toute tentative de créer un deuxième `salon_admin` ou un deuxième `owner` actif
  (`is_deleted = false`) sous le même tenant échoue au niveau base
  (`users_one_salon_admin_per_tenant` / `users_one_owner_per_tenant`), pas seulement au
  niveau applicatif.
- `requireSalonAdmin()` (`lib/db/auth.ts`) n'est pas modifié : Owner n'est **pas**
  automatiquement habilité aux actions réservées à Director (saisie du registre). Si un
  besoin futur veut qu'Owner puisse aussi agir comme Director, ce sera une décision
  explicite distincte (ex. `requireSalonAdmin()` élargi à `is_salon_admin() or is_owner()`),
  pas un effet de bord de cette migration.
- Aucune UI, aucune logique métier ajoutée ou modifiée — strictement schéma + RLS + test,
  conformément au périmètre demandé.

## Vérification

`npm run test:rls` relancé après application des migrations
`20260826140000_owner_role_enum` et `20260826140100_owner_role_rls`, contre l'instance
Supabase de test (voir [[007-verification-isolation-rls]] pour le prérequis
d'environnement) — **9/10 tests verts**, détail test par test :

| Test                                                                                                                          | Résultat                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur                            | ✅                                                                                                                     |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur                           | ✅                                                                                                                     |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur                       | ✅                                                                                                                     |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A (bloqué par Postgres, pas par l'app)      | ✅                                                                                                                     |
| (contrôle) un utilisateur de tenant A voit bien ses propres données                                                           | ✅                                                                                                                     |
| (analyse complémentaire, non demandée explicitement) un payment de tenant B ne peut pas référencer un appointment de tenant A | ❌ (gap FK cross-tenant préexistant, voir [[007-verification-isolation-rls]] — non lié à cette tâche, non corrigé ici) |
| un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted (is_deleted true -> false)                             | ✅                                                                                                                     |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A                                | ✅                                                                                                                     |
| **un owner de tenant A peut lire les données de son propre tenant (clients/services/appointments)**                           | ✅                                                                                                                     |
| **un owner de tenant A ne peut pas lire les utilisateurs de tenant B**                                                        | ✅                                                                                                                     |

Les deux derniers tests (nouveaux, ajoutés par cette tâche dans
`tests/rls/tenant-isolation.test.ts`) confirment par exécution réelle le point 6
ci-dessus : Owner lit son propre tenant sans policy dédiée, et reste isolé des autres
tenants exactement comme Director. Nettoyage post-run vérifié : aucune ligne
`rls-test-*` résiduelle en base (comptes `auth.users` et lignes `public.users`/`tenants`
correctement supprimés par `afterAll`).
