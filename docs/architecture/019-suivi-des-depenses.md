# 019 — Suivi des dépenses (`Expense`)

## Statut

Implémenté et vérifié le 2026-08-29 — migrations appliquées, contrainte composite et
droits `app_runtime` vérifiés par exécution réelle, résultat complet de
`npm run test:rls` en fin de document (rapporté avec les Parties 1 et 2, voir la session).

## Contexte

Le salon a besoin de suivre ses dépenses (loyer, fournitures, salaires...),
indépendamment du registre d'activité (`Appointment`/`Payment`, qui suit les
encaissements, pas les sorties d'argent).

## Décision

### 1. `Expense` — mêmes conventions que les autres tables métier

```prisma
model Expense {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String    @map("tenant_id") @db.Uuid
  description  String
  amount       Int // FCFA, entier — même convention que Service.defaultPrice/Payment.amount
  category     String?
  recordedById String    @map("recorded_by") @db.Uuid
  occurredAt   DateTime  @map("occurred_at")
  active       Boolean   @default(true)
  isDeleted    Boolean   @default(false) @map("is_deleted")
  deletedAt    DateTime? @map("deleted_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @default(now()) @updatedAt @map("updated_at")

  tenant     Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  recordedBy Staff  @relation(fields: [tenantId, recordedById], references: [tenantId, id], onDelete: Restrict)
}
```

- **`amount`** : `Int`, FCFA — même convention que `Service.defaultPrice`/
  `Payment.amount` ([[002-montants-en-fcfa]]), pas de décimales.
- **`category`** : `String?`, texte libre. Pas de table de référence dédiée (contrairement
  à `ServiceCategory`/`JobTitle`, [[013-job-title-vs-system-role]],
  [[016-catalogue-prestations-caprice]]) — non demandé pour ce champ ; une catégorie de
  dépense mal orthographiée deux fois n'a pas le même impact opérationnel qu'une
  catégorie de service dupliquée dans un sélecteur de saisie.
- **`recordedById`** : requis (`NOT NULL`), référence `Staff` — "person/staff selon le
  modèle actuel" : ce projet n'a pas de modèle `Person` (délibérément hors périmètre de
  cette tâche, voir la consigne explicite), et `Staff` est l'entité qui représente "un
  membre du salon" ([[004-staff-sans-compte]]), la plus complète pour cet usage face à
  `User` (compte de connexion, pas systématiquement lié à une personne du salon — un
  Owner par exemple peut ne pas avoir de fiche `Staff`). Requis, pas optionnel : à la
  différence de `Staff.jobTitleId`/`Service.categoryId` (rendus optionnels parce que des
  lignes existantes en base n'avaient pas de valeur), `expenses` est une table neuve,
  sans ligne préexistante — aucune contrainte technique n'empêche `NOT NULL` ici, et
  "qui a enregistré la dépense" est une donnée d'audit qui doit toujours être connue.
- **`occurredAt`** : `DateTime`, requis — quand la dépense a eu lieu, distinct de
  `createdAt` (quand la ligne a été créée en base) — même distinction que
  `Appointment.startTime` vs `createdAt`.
- FK composite `(tenant_id, recorded_by)` → `staff(tenant_id, id)` : même pattern que
  toutes les relations tenant-scopées posées depuis [[013-job-title-vs-system-role]] —
  empêche par construction qu'une dépense soit attribuée à un membre du staff d'un
  **autre** tenant. **Vérifié par exécution réelle**, pas seulement lu dans le SQL : voir
  "Vérification".

### 2. RLS — même pattern que Partie 2 (Director + Owner, lecture et écriture)

```sql
create policy "expenses_select_tenant" on "expenses"
  for select to authenticated
  using (tenant_id = current_tenant_id() and (is_salon_admin() or is_owner()) and not is_deleted);

create policy "expenses_write_admin" on "expenses"
  for all to authenticated
  using (tenant_id = current_tenant_id() and (is_salon_admin() or is_owner()) and not is_deleted)
  with check (tenant_id = current_tenant_id() and (is_salon_admin() or is_owner()));
```

Plus `expenses_restore_admin`/`expenses_select_deleted_admin`, même forme que les autres
tables à soft-delete ([[008-soft-delete-active-vs-is-deleted]]). Les deux rôles sont
explicitement listés sur chaque policy — même discipline que
[[018-owner-director-parite-operationnelle]], pas d'accès implicite via une policy `FOR
ALL`. Aucune policy pour `manager`/`staff` : rôles non opérationnels à ce stade
([[004-staff-sans-compte]]).

**`GRANT` explicite à `app_runtime`** : nécessaire, `expenses` est une table neuve créée
après le `GRANT` initial ([[015-staff-profil-et-postes-multiples]] point 6/7,
[[016-catalogue-prestations-caprice]]) — sans cette ligne, `app_runtime` n'aurait aucun
privilège dessus, quelle que soit la policy RLS. `ENABLE`/`FORCE ROW LEVEL SECURITY`
posés comme pour toute nouvelle table depuis [[014-decouplage-rls-auth-provider]].

## Ce qui n'a volontairement pas été fait

- Aucune UI, aucun endpoint de saisie des dépenses.
- Aucune table de référence pour `category` — voir point 1.
- Aucun rattachement à `Appointment`/`Payment` : une dépense est indépendante du
  registre d'activité, par construction (demande explicite).
- `Person`/`Client`/`Organization`/`Site` non touchés — hors périmètre explicite de
  cette tâche.

## Vérification

### Contrainte composite et droits — vérifiés par exécution réelle, puis nettoyés

| Vérification                                                                           | Résultat                                                                            |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FK composite : une `expense` ne peut pas être attribuée à un `staff` d'un AUTRE tenant | ✅ rejeté — `violates foreign key constraint "expenses_tenant_id_recorded_by_fkey"` |
| `app_runtime` a bien SELECT/INSERT/UPDATE/DELETE sur `expenses`                        | ✅ confirmé via `information_schema.role_table_grants`                              |

### `npm run test:rls`

Résultat rapporté avec l'ensemble des trois parties traitées dans cette session — voir
le rapport final (9/10, sans régression, seul échec le gap FK cross-tenant préexistant
et déjà documenté).
