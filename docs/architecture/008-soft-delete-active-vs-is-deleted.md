# 008 — Soft delete : `isDeleted`, `active`, `deletedAt`

## Statut

Implémenté et vérifié le 2026-08-21 contre l'instance Supabase de test (voir
[[007-verification-isolation-rls]] pour la suite `npm run test:rls` — les 6 tests
d'isolation qu'elle couvrait avant l'ajout de la policy de restauration restent verts
après ce changement, voir aussi la section "Policy de restauration" ci-dessous, ajoutée
le 2026-08-21 dans la foulée).

## Contexte

Les 8 modèles métier (`Tenant`, `User`, `Staff`, `Client`, `Service`, `Appointment`,
`AppointmentService`, `Payment`) ont besoin d'un mécanisme de suppression logique :
supprimer une ligne physiquement (`DELETE`) casserait l'historique (ex. un `appointment`
supprimé alors qu'un rapport comptable y fait référence). Trois champs distincts portent
ce mécanisme, avec des responsabilités volontairement différentes.

## Les trois champs

| Champ       | Type                      | Rôle                                                                                                                                                                                |
| ----------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isDeleted` | `Boolean`, défaut `false` | Source de vérité pour la suppression logique. Pilote le filtrage RLS.                                                                                                               |
| `active`    | `Boolean`, défaut `true`  | Bascule applicative (ex. exclure un service désactivé d'une liste de sélection pour une nouvelle prestation). N'a **aucun** effet sur la visibilité RLS.                            |
| `deletedAt` | `DateTime?`, nullable     | Horodatage informatif : NULL tant que `isDeleted = false`, rempli au moment où `isDeleted` passe à `true`. Ne pilote rien — c'est un simple "quand", jamais un critère de filtrage. |

`Staff` et `Service` avaient déjà un champ `active` avant cette tâche (utilisé par
l'application, cf. `lib/db/register.ts`, pour exclure les entrées désactivées des listes
de sélection du formulaire de saisie) — il n'a pas été dupliqué, seuls `isDeleted` et
`deletedAt` leur ont été ajoutés. Les 6 autres modèles reçoivent les trois champs.

## Hiérarchie — à respecter dans toute logique future, RLS ou applicative

**`isDeleted` prime sur `active`.** Si `isDeleted = true`, la ligne est considérée
supprimée, point final — peu importe la valeur de `active`. `active` ne veut dire quelque
chose que tant que `isDeleted = false`. Il ne faut jamais lire `active` sans avoir
d'abord vérifié `isDeleted` : une ligne peut être `active = true` et pourtant supprimée
(`isDeleted = true`), auquel cas elle reste supprimée.

`deletedAt` ne fait partie d'aucune condition de décision : ni la RLS ni une future
logique applicative ne doivent filtrer ou brancher sur sa valeur. Il sert uniquement à
afficher/auditer "supprimé le X" une fois qu'on sait déjà, via `isDeleted`, que la ligne
est supprimée.

```
isDeleted = true   → supprimée, quel que soit `active`. `deletedAt` renseigné.
isDeleted = false, active = true  → visible et utilisable normalement.
isDeleted = false, active = false → visible (RLS), mais exclue des listes de sélection
                                     applicatives (à implémenter par Codex).
```

## Ce qui a changé en RLS (migration `20260821120001_soft_delete_rls_filtering`)

Seul `isDeleted` entre dans les policies — `active` n'apparaît dans aucune d'entre elles,
volontairement, conformément à la hiérarchie ci-dessus.

- Les deux fonctions `SECURITY DEFINER` de [[001-tenant-id-et-rls]]
  (`current_tenant_id()`, `is_salon_admin()`) filtrent désormais aussi
  `and not is_deleted` sur `public.users` : un utilisateur dont le propre compte est
  soft-deleted ne peut plus rien résoudre (tenant, rôle), donc perd tout accès, cohérent
  avec "supprimée, point final".
- Chaque policy `*_select_tenant` (et `tenants_select_own`, `users_select_tenant`) ajoute
  `and not is_deleted` à son `USING`.
- Chaque policy `*_write_admin` (`for all`) ajoute aussi `and not is_deleted` à son
  `USING`. Nécessaire : en RLS Postgres, une policy `for all` accordée contribue aussi à
  la visibilité `SELECT` (les policies permissives sont combinées en OR pour une même
  commande) — sans ce filtre sur le `USING` de la policy d'écriture, une ligne
  soft-deleted resterait visible en lecture via cette policy même si la policy
  `*_select_tenant` la filtre correctement de son côté.
- Le `WITH CHECK` de ces mêmes policies **n'a pas changé** (il ne filtrait déjà pas sur
  `is_deleted`) : il continue de n'exiger que `tenant_id = current_tenant_id()` et
  `is_salon_admin()`. C'est ce qui permet à l'écriture qui _pose_ `isDeleted = true` (la
  suppression elle-même) de rester possible.

### Conséquence initialement assumée, puis levée : voir "Policy de restauration" plus bas

Parce que le `USING` de la policy d'écriture filtre `not is_deleted`, une fois qu'une
ligne a `isDeleted = true`, plus aucune session `authenticated` (même `salon_admin`) ne
peut la cibler par `UPDATE` via la policy `*_write_admin` — y compris pour la
"restaurer" en repassant `isDeleted` à `false`. Ce constat, initialement assumé comme
définitif dans cette tâche ("une fonctionnalité de restauration, si elle est construite
plus tard, nécessitera sa propre policy dédiée, hors scope ici"), a été levé dans une
tâche de suivi le 2026-08-21 : voir "Policy de restauration (isDeleted true -> false)"
ci-dessous. La policy `*_write_admin` elle-même n'a pas changé ; c'est une policy dédiée
supplémentaire qui couvre désormais ce cas.

## Policy de restauration (isDeleted true -> false) — migration `20260821130000_soft_delete_restore_policy`

Ajoutée en tâche de suivi le 2026-08-21, pour permettre à un `salon_admin` de restaurer
une ligne soft-deleted de son propre tenant, sans passer par `service_role`. Périmètre :
les 6 tables qui portent une policy `*_write_admin` (`staff`, `clients`, `services`,
`appointments`, `appointment_services`, `payments`). `tenants` et `users` sont hors
scope — voir "Tables hors scope" ci-dessous.

### Deux cas, deux policies UPDATE distinctes

- **Modifier une ligne vivante** (`isDeleted = false`) : comportement inchangé, toujours
  géré par `*_write_admin` (USING : `tenant_id` + `is_salon_admin()` + `not is_deleted`).
- **Restaurer une ligne supprimée** (`isDeleted` true -> false) : nouvelle policy
  `*_restore_admin`, `for update` uniquement :
  - `USING` : `tenant_id = current_tenant_id() and is_salon_admin()` — **sans** `not
is_deleted`, puisque la ligne ciblée par une restauration EST soft-deleted par
    définition ; un `USING` qui l'exigerait empêcherait de jamais cibler la ligne, exactement
    le bug que cette migration corrige.
  - `WITH CHECK` : `tenant_id = current_tenant_id() and is_salon_admin() and not
is_deleted` — la ligne résultante doit avoir `isDeleted = false`. Un `salon_admin` ne
    peut donc pas se servir de cette policy pour re-poser `isDeleted = true` (ni pour
    laisser `isDeleted` inchangé à `true`) : seule une transition vers `false` passe.

### Découverte non triviale : une policy SELECT dédiée est nécessaire pour que l'UPDATE fonctionne

Le point le plus surprenant de cette tâche, qui n'était pas anticipé par la mission
initiale : la policy `*_restore_admin` seule, même correctement définie comme ci-dessus,
**ne suffit pas**. Vérifié empiriquement (isolation des policies une à une, en SQL brut,
avec `role authenticated` + `request.jwt.claims` émulés) : une policy `UPDATE` avec un
`USING`/`WITH CHECK` volontairement permissifs (`using (true) with check (true)`, seule
sur la table, sans aucune policy `SELECT` permissive) bloque déjà 100% des `UPDATE` pour
le rôle `authenticated` — `rowCount = 0` systématiquement, sans erreur.

Raison : pour une commande `UPDATE`, PostgreSQL RLS exige que la ligne ciblée passe à la
fois le `USING` d'une policy applicable à `UPDATE` **et** le `USING` d'une policy
applicable à `SELECT` — la commande a besoin de "voir" la ligne pour la modifier, ce
n'est pas seulement le `USING` de la policy `UPDATE` qui filtre le `WHERE`. Ce n'est pas
mis en avant dans un paragraphe unique et explicite de la documentation officielle
`CREATE POLICY` ; il a fallu le vérifier par un test de bout en bout (harnais SQL brut
d'abord, puis confirmation via `tests/rls/tenant-isolation.test.ts` qui passe par le
vrai chemin PostgREST + JWT).

Concrètement : `clients_select_tenant` (et les policies `*_select_tenant` équivalentes)
filtrent `not is_deleted` — une ligne soft-deleted n'est donc visible par **aucune**
policy `SELECT` existante, ce qui bloquait `*_restore_admin` même correctement écrite.
Chaque table reçoit donc aussi une policy `*_select_deleted_admin` :

```sql
using (tenant_id = current_tenant_id() and is_salon_admin() and is_deleted)
```

Portée volontairement étroite : ne révèle les lignes soft-deleted qu'au `salon_admin` de
**leur propre** tenant. Un `staff`/`manager` ne voit toujours aucune ligne supprimée
(aucune policy `SELECT` ne le permet) ; un `salon_admin` d'un autre tenant non plus
(`tenant_id` ne correspond pas — vérifié par
`un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à
tenant A` dans la suite de tests).

**Effet de bord assumé** : un `salon_admin` peut désormais aussi lister/lire ses propres
lignes soft-deleted via un `SELECT` direct (`.eq('is_deleted', true)`), pas seulement les
cibler pour restauration. C'est cohérent avec l'objectif final (une future UI de
restauration — "corbeille" — aura besoin de lister les lignes supprimées avant de
proposer de les restaurer une à une) et reste strictement scopé au tenant + rôle admin.

### Limite assumée : RLS seul ne garantit pas qu'une restauration ne touche que `isDeleted`/`deletedAt`

PostgreSQL combine par OR les `USING` des policies permissives applicables à une même
commande, et **séparément** par OR les `WITH CHECK`. Le `WITH CHECK` de `*_write_admin`
n'a jamais filtré sur `is_deleted` (il ne vérifie que `tenant_id` + `is_salon_admin()`).
Conséquence : une fois qu'une ligne devient candidate à l'`UPDATE` via le `USING` de
`*_restore_admin`, la ligne résultante est acceptée si elle satisfait **n'importe quel**
`WITH CHECK` parmi les policies `UPDATE`-applicables — y compris celui de
`*_write_admin`, qui n'impose aucune contrainte sur les colonnes autres qu'`isDeleted`.

En pratique, cela veut dire que RLS seul ne peut pas empêcher un `salon_admin` de
modifier d'autres colonnes en même temps qu'il restaure `isDeleted` (ex. changer `name`
ou `price` dans le même `UPDATE` qui repasse `isDeleted` à `false`). Contraindre "un
`UPDATE` de restauration ne touche QUE `isDeleted`/`deletedAt`" nécessiterait soit un
trigger `BEFORE UPDATE` comparant colonne par colonne l'ancienne et la nouvelle ligne,
soit (plus simple) un endpoint applicatif dédié qui n'expose que ces deux champs en
écriture. Cette tâche n'implémente ni l'un ni l'autre — volontairement, hors scope
("N'implémente aucune UI ni endpoint de restauration — uniquement la policy RLS, la
migration, et le test qui la prouve"). Cette contrainte reste donc une **responsabilité
applicative future** (Codex, futur endpoint dédié de restauration), pas une garantie de
la base de données.

### Tables hors scope

- **`tenants`** : aucune policy d'écriture n'est exposée au rôle `authenticated`
  (onboarding via `service_role` uniquement, cf. `00000000000001_rls_policies`) — il n'y
  a pas de policy `*_write_admin` à compléter, donc rien à faire ici.
- **`users`** : porte seulement `users_update_self` (`id = auth.uid()`, sans vérification
  `is_salon_admin()`, auto-service pur — un utilisateur ne modifie que sa propre ligne).
  Il n'y a pas de notion de "salon_admin restaure la ligne d'un tiers" sur cette table
  avec les policies actuelles ; hors scope de cette tâche.

## Ce qui n'a volontairement pas été fait dans cette tâche

- Aucun endpoint, aucune UI, aucun hook qui écrirait réellement `isDeleted`/`deletedAt`
  au moment d'une suppression. Les trois champs existent, avec leurs valeurs par défaut
  (`isDeleted = false`, `active = true`, `deletedAt = NULL`) — toute ligne existante ou
  nouvelle reste pleinement visible tant que rien n'écrit explicitement dedans. Cette
  logique revient à Codex, à une étape ultérieure.
- Le filtrage `active` dans les listes de sélection applicatives (déjà en place pour
  `Staff`/`Service` dans `lib/db/register.ts`) n'a pas été étendu aux 6 autres modèles —
  hors scope ici, à faire quand un cas d'usage applicatif l'exigera.
- Aucun endpoint ni trigger qui contraindrait une restauration à ne modifier QUE
  `isDeleted`/`deletedAt` — voir "Limite assumée" ci-dessus, responsabilité applicative
  future.

## Vérification

`npm run test:rls` relancé après application de la migration
`20260821130000_soft_delete_restore_policy` (en plus des deux migrations soft-delete
précédentes) : **7 tests verts sur 8**. Le seul échec —
`(analyse complémentaire, non demandée explicitement) un payment de tenant B ne peut pas
référencer un appointment de tenant A` — est le gap FK croisé paiement/rendez-vous
documenté dans [[007-verification-isolation-rls]], non corrigé par décision assumée
(hors scope de cette tâche) ; ce test l'exécute réellement pour la première fois contre
l'instance de test et confirme, par l'exécution, ce que l'ADR 007 suspectait sans
l'avoir encore vérifié. Sans rapport avec le soft delete ou la restauration. Les 2 tests
de restauration ajoutés (`un salon_admin de tenant A peut restaurer sa propre ligne
soft-deleted`, `un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted
appartenant à tenant A`) passent, ainsi que les 5 tests d'isolation tenant préexistants.
Aucune régression : le seed du test insère des lignes avec les valeurs par défaut
(`isDeleted = false`), donc invisibles pour aucune des policies mises à jour.
