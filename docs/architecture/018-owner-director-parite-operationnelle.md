# 018 — Parité Owner/Director sur les tables opérationnelles

## Statut

Implémenté et vérifié le 2026-08-29 : migration RLS appliquée, garde de route corrigée,
`npm run test:rls` relancé (résultat en fin de document), accès complet lecture/écriture
d'une vraie session Owner vérifié par exécution réelle sur les 4 tables concernées.

## Contexte

Jusqu'ici, `appointments`/`appointment_services`/`payments`/`services` suivaient le
pattern générique posé par [[001-tenant-id-et-rls]] : lecture ouverte à tout le tenant
authentifié, écriture réservée à `salon_admin` (Director). Owner
([[012-role-owner]]) n'avait donc, sur ces 4 tables, **aucun accès explicite** — un accès
en lecture existait de fait (la policy de lecture ne teste aucun rôle), mais aucun accès
en écriture. Séparément, les groupes de routes `(director)`/`(owner)`
([[013-job-title-vs-system-role]], [[015-staff-profil-et-postes-multiples]]) gardaient
`/register`, `/reports`, `/services` derrière `requireSalonAdmin()` (salon_admin
uniquement) et `/staff`, `/job-titles` derrière `requireOwner()` (owner uniquement) —
deux périmètres disjoints, sans recouvrement.

Cette tâche établit la parité complète : Owner doit pouvoir tout faire sur ces 4 tables
(et les 3 écrans qui en dépendent), en plus de son périmètre existant (`/staff`,
`/job-titles`).

## Décision

### 1. RLS — les deux rôles listés explicitement sur CHAQUE policy

```sql
-- avant (appointments, exemple représentatif des 4 tables)
create policy "appointments_select_tenant" ... using (tenant_id = current_tenant_id() and not is_deleted);
create policy "appointments_write_admin"   ... using (tenant_id = current_tenant_id() and is_salon_admin() and not is_deleted) ...;

-- après
create policy "appointments_select_tenant" ... using (tenant_id = current_tenant_id() and (is_salon_admin() or is_owner()) and not is_deleted);
create policy "appointments_write_admin"   ... using (tenant_id = current_tenant_id() and (is_salon_admin() or is_owner()) and not is_deleted) ...;
```

Appliqué identiquement aux 4 policies de chacune des 4 tables (`*_select_tenant`,
`*_write_admin`, `*_restore_admin`, `*_select_deleted_admin`) — 16 `ALTER POLICY` au
total, migration `20260829120000_owner_parity_operational_tables`.

**Différence assumée avec le pattern `staff`/`job_titles`**
([[013-job-title-vs-system-role]], [[014-decouplage-rls-auth-provider]]) : là-bas, Owner
remplace Director en écriture (Director garde la lecture seule — décision RH délibérée,
gestion du personnel = approbation globale). Ici, **les deux rôles gardent une capacité
identique et complète** — Director ne perd rien, Owner gagne exactement ce que Director
avait. C'est la définition même de "parité complète" demandée, pas une bascule
d'autorité.

**Changement de comportement réel sur la lecture, vérifié avant d'agir, pas supposé** :
`appointments_select_tenant`/`appointment_services_select_tenant`/
`payments_select_tenant`/`services_select_tenant` étaient, avant cette tâche, **ouvertes
à tout le tenant** (aucune condition de rôle — confirmé par lecture directe de
`pg_policies`). Elles sont maintenant restreintes à Director+Owner. C'est un resserrement
réel, pas seulement un ajout : un futur rôle `manager`/`staff` ([[004-staff-sans-compte]],
non utilisé aujourd'hui) ne verrait plus ces tables par défaut. Demandé explicitement,
appliqué tel quel.

**`GRANT` non nécessaire** : ces 4 tables existaient déjà au moment du `GRANT ... ON ALL
TABLES IN SCHEMA public TO app_runtime` initial ([[014-decouplage-rls-auth-provider]]) —
à la différence des tables créées depuis (`staff_job_titles`, `service_categories`,
`expenses`), aucun `GRANT` supplémentaire n'était requis ici.

### 2. `service_categories` — incohérence notée, non corrigée (hors périmètre demandé)

`services` est maintenant Director+Owner uniquement en lecture, mais
`service_categories` ([[016-catalogue-prestations-caprice]]) reste ouverte à tout le
tenant (son propre pattern d'origine, non mentionné dans cette tâche). Un membre du
tenant qui n'est ni Director ni Owner pourrait donc voir la liste des catégories mais
plus les prestations elles-mêmes — incohérence mineure, sans conséquence pratique
aujourd'hui (aucun rôle `manager`/`staff` n'est utilisé). Non corrigée ici : la mission
liste explicitement "appointments, appointment_services, payments, services", pas
`service_categories`. Signalé pour une décision future plutôt que corrigé
silencieusement.

### 3. Garde de route — `(director)` accepte désormais Director ET Owner

```ts
// app/(admin)/(director)/layout.tsx
-(await requireSalonAdmin());
+(await requireAdminMember()); // autorise salon_admin ET owner
```

`requireAdminMember()` (déjà présent dans `lib/db/auth.ts`, utilisé en interne par
`requireSalonAdmin()`/`requireOwner()`) vérifie déjà "rôle owner ou salon_admin + profil
staff actif" — exactement la condition voulue ici, sans dupliquer de logique.

**Trouvaille en vérifiant, pas supposée** : corriger uniquement le layout n'aurait pas
suffi. `lib/db/register.ts` (2 sites), `lib/db/reports.ts` (1 site) et
`lib/db/services.ts` (4 sites) appellent chacun `requireSalonAdmin()` **directement**,
indépendamment du layout — Owner aurait franchi la garde de route puis se serait fait
bloquer une seconde fois à l'intérieur de la page. Les 7 sites ont été alignés sur
`requireAdminMember()`. `(owner)/layout.tsx`, `lib/db/job-titles.ts` et `lib/db/staff.ts`
restent inchangés (`requireOwner()`, Owner uniquement) — ce périmètre n'est pas concerné
par cette tâche.

## Ce qui n'a volontairement pas été fait

- `service_categories` non resserrée — voir point 2.
- Aucune UI nouvelle : les écrans `/register`, `/reports`, `/services` existent déjà,
  seule leur garde d'accès change.
- Aucun test ajouté à `tests/rls/tenant-isolation.test.ts` (non demandé explicitement
  ici) — vérification faite séparément par un script ponctuel, voir "Vérification".

## Vérification

### RLS — `npm run test:rls`, résultat complet

Relancé en entier après application de `20260829120000_owner_parity_operational_tables`,
contre l'instance Supabase de test — **9 tests verts sur 10**, identique au résultat
d'avant cette tâche (aucune régression ; la session `salon_admin` du test de contrôle
continue de voir ses propres données puisque `is_salon_admin()` reste une des deux
conditions acceptées) :

| Test                                                                                                    | Résultat                                                                                |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur      | ✅                                                                                      |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur     | ✅                                                                                      |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur | ✅                                                                                      |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A                     | ✅                                                                                      |
| (contrôle) un utilisateur de tenant A voit bien ses propres données                                     | ✅                                                                                      |
| (analyse complémentaire) un payment de tenant B ne peut pas référencer un appointment de tenant A       | ❌ (gap FK cross-tenant préexistant, [[007-verification-isolation-rls]] — sans rapport) |
| un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted                                  | ✅                                                                                      |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A          | ✅                                                                                      |
| un owner de tenant A peut lire les données de son propre tenant                                         | ✅                                                                                      |
| un owner de tenant A ne peut pas lire les utilisateurs de tenant B                                      | ✅                                                                                      |

### Accès complet Owner — vérifié par exécution réelle (script ponctuel, nettoyé après coup)

Session Owner réelle (JWT vérifié, `withRlsSession`/`runInTenantTransaction` — le même
mécanisme que `lib/db/register.ts`/`services.ts`, pas un raccourci de test) :

| Vérification                                        | Résultat |
| --------------------------------------------------- | -------- |
| Owner lit `services` de son tenant                  | ✅       |
| Owner lit `appointments` de son tenant              | ✅       |
| Owner crée un `service`                             | ✅       |
| Owner crée un `payment` sur un rendez-vous existant | ✅       |
| Owner crée une ligne `appointment_service`          | ✅       |

Nettoyage post-vérification confirmé : aucune ligne résiduelle (tenant, comptes,
données de test).

## Correctif du registre Owner — 2026-09-01

Le parcours `/register` crée ou complète un `Client` avant d'insérer la visite. La
migration initiale de parité couvrait les quatre tables opérationnelles de la visite,
mais pas cette première écriture. La garde applicative autorisait donc Owner tandis que
la policy `clients_write_admin` restait réservée à Director, ce qui provoquait une erreur
RLS et le message générique « Une erreur technique a empêché l’enregistrement de la
visite ».

La migration `20260901090000_owner_client_write_parity` aligne les policies d'écriture,
de restauration et de lecture des clients supprimés sur la règle
`is_salon_admin() OR is_owner()`. L'isolation par `tenant_id` et le filtrage des lignes
soft-deleted restent inchangés.

Une régression RLS couvre désormais les deux côtés de la règle : un Owner peut créer un
client dans son tenant, mais une création visant un autre tenant est rejetée. Le vrai
formulaire `/register` a aussi été soumis par HTTP avec le compte Owner local ; le client,
la visite, la prestation et le paiement ont été constatés en base avant nettoyage des
données QA.
