# 015 — Profil administratif Staff, postes multiples (`isPrimary`), sexe sur Client

## Statut

Implémenté et vérifié le 2026-08-27 contre l'instance Supabase de test — 3 migrations
appliquées via `prisma migrate deploy`, `npm run test:rls` relancé en entier (résultat en
fin de document), contraintes nouvelles vérifiées par exécution réelle. **Rupture
délibérée et confirmée avant application** : `lib/db/staff.ts` et l'UI de gestion du
staff (`app/(admin)/(owner)/staff/*`, écrites en parallèle de cette tâche) dépendent de
l'ancienne FK simple `staff.jobTitleId`, supprimée ici — voir "Rupture assumée" plus bas.

## Contexte

Trois extensions de schéma décidées et confirmées, indépendantes mais livrées ensemble :

1. **Profil administratif du Staff** : sexe, téléphone, résidence, pièce d'identité
   (type + numéro), ancienneté — données collectées à l'embauche, absentes du modèle
   initial ([[004-staff-sans-compte]] ne couvrait qu'un nom et un taux de commission).
2. **Postes multiples** : un membre du staff peut occuper plusieurs postes (ex. une
   coiffeuse qui fait aussi des manucures) — la FK simple `staff.jobTitleId`
   ([[013-job-title-vs-system-role]]) ne le permettait pas.
3. **Sexe optionnel sur Client** — cohérent avec la saisie rapide sans friction déjà
   actée pour les clients (nom, téléphone facultatif — voir la spec Étape 1).

## Décision

### 1. `Sex` — enum partagé Staff/Client

```prisma
enum Sex {
  homme
  femme
}
```

Un seul enum réutilisé sur les deux modèles plutôt que deux enums dupliqués — mêmes
valeurs, même sens, pas de raison de les faire diverger.

### 2. Nouveaux champs Staff — tous optionnels, y compris ceux non explicitement marqués nullable dans la demande

```prisma
sex               Sex?
phone             String?
residence         String?
idType            IdType?
idNumber          String?
yearsOfExperience Int?
```

**Écart assumé par rapport à la demande** : seuls `residence` et `yearsOfExperience`
étaient explicitement qualifiés "nullable" dans la mission ; `sex`, `phone`, `idType`,
`idNumber` ne l'étaient pas, ce qui aurait pu se lire comme "obligatoires". Rendus
optionnels quand même, pour une raison purement technique et non contournable : la table
`staff` contient déjà 2 lignes réelles (créées par la fonctionnalité de gestion du staff
développée en parallèle) sans aucune de ces valeurs. Ajouter une colonne `NOT NULL` sans
défaut sur une table qui a déjà des lignes échoue en base — et il n'existe aucun défaut
sensé pour un sexe, un numéro de pièce d'identité ou un type de pièce (contrairement à
`active BOOLEAN DEFAULT true` par exemple). Fabriquer des valeurs pour des membres du
staff réels aurait été pire que de les laisser vides. Si le produit a besoin que ces
champs deviennent obligatoires à la création (validation applicative empêchant de
soumettre un profil incomplet), c'est une contrainte à porter par la validation
(`lib/validation/staff.ts`), pas par le schéma — cohérent avec le fait que cette tâche
n'implémente aucune UI/logique métier.

### 3. Postes multiples — `staff_job_titles`, many-to-many avec `isPrimary`

```prisma
model StaffJobTitle {
  id         String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String  @map("tenant_id") @db.Uuid
  staffId    String  @map("staff_id") @db.Uuid
  jobTitleId String  @map("job_title_id") @db.Uuid
  isPrimary  Boolean @default(false) @map("is_primary")

  @@unique([staffId, jobTitleId])
}
```

**Pourquoi `isPrimary` plutôt qu'une autre approche** (ex. un ordre/rang, ou rien du
tout) : un staff avec plusieurs postes a besoin d'UN SEUL poste "par défaut" pour tout
endroit de l'application qui n'a la place ou le besoin d'afficher qu'un seul intitulé —
typiquement une liste courte (le sélecteur de staff du registre, une carte de profil
condensée). Un simple booléen, avec la garantie "au plus un `true` par staff" posée en
base, est la structure la plus simple qui répond à ce besoin exact, sans supposer un
ordre total entre tous les postes (ce qu'un champ de rang numérique aurait imposé,
au-delà du besoin réel — "un poste principal", pas "un poste n°1, n°2, n°3..."). Aucun
poste principal n'est imposé à la création (`isPrimary` par défaut `false` sur chaque
ligne) : un staff peut avoir plusieurs postes sans qu'aucun ne soit désigné comme
principal, l'application décidera si c'est acceptable ou si elle doit forcer un choix à
la création — hors scope schéma.

**Contrainte base**, pas seulement applicative :

```sql
CREATE UNIQUE INDEX "staff_job_titles_one_primary_per_staff"
  ON "staff_job_titles" ("staff_id")
  WHERE "is_primary";
```

**FK composite `(tenant_id, ...)`**, comme demandé, suivant le pattern déjà établi
([[013-job-title-vs-system-role]]) : `staff_job_titles.staff_id` référence
`staff(tenant_id, id)`, `staff_job_titles.job_title_id` référence
`job_titles(tenant_id, id)` — empêche par construction qu'une ligne de liaison associe un
staff et un job_title appartenant à deux tenants différents. **Vérifié par exécution
réelle** (pas seulement par lecture du SQL) : voir "Vérification" plus bas.

**Table de liaison pure** : ni `isDeleted`, ni `active`, ni `deletedAt`, à la différence
des tables métier principales — non demandé explicitement dans la liste de champs fournie
(`id, tenant_id, staff_id, job_title_id, isPrimary`), et cohérent avec sa nature : retirer
un poste à un staff est un `DELETE` réel de la ligne de liaison (l'association
elle-même n'a pas de valeur d'audit isolée en dehors du fait qu'elle existe ou non — la
suppression du STAFF ou du JOB_TITLE sous-jacent, eux, restent soft-deletables
normalement).

### 4. `Client.sex` — optionnel

```prisma
sex Sex?
```

Cohérent avec le principe de saisie rapide déjà en place pour `Client` (`phone` déjà
optionnel) — aucune raison de rendre `sex` plus contraignant qu'un champ existant du même
modèle.

### 5. Sécurité — recommandation sur `idNumber`

**`idNumber` est une donnée sensible** (numéro de pièce d'identité officielle). Deux
recommandations distinctes, l'une sur le stockage, l'autre sur la lecture applicative.

#### Chiffrement au repos — recommandé, mais **pas implémenté par cette tâche**

Supabase chiffre déjà le volume de stockage sous-jacent par défaut (chiffrement au repos
au niveau infrastructure, contre le vol physique d'un disque) — ce n'est **pas** le risque
principal ici. Le risque réel : un accès direct à la base (identifiants compromis, dump de
sauvegarde exfiltré, accès `service_role`/`postgres` détourné) expose `idNumber` en clair,
puisqu'aucune de ces protections n'empêche une requête `SELECT id_number FROM staff` de
fonctionner. Un chiffrement **au niveau colonne** (le texte n'est jamais stocké en clair
en base, seule l'application qui détient la clé peut le déchiffrer) protégerait contre ce
scénario spécifiquement.

**Pas raisonnable à ce stade** : ce projet n'a aujourd'hui aucune gestion de secrets
séparée de `.env` (pas de KMS, pas de rotation de clé) — introduire un chiffrement
colonne maintenant demanderait de résoudre "où vit la clé de déchiffrement" avant même
d'écrire la première ligne de SQL, un problème plus large que cette tâche. Recommandation
concrète pour **avant la mise en production avec de vrais numéros de pièce d'identité**
(pas avant) : `pgcrypto` (`pgp_sym_encrypt`/`pgp_sym_decrypt`, extension Postgres
standard — délibérément préféré à une fonctionnalité propriétaire Supabase comme Vault/
pgsodium, pour rester cohérent avec l'effort de découplage de
[[014-decouplage-rls-auth-provider]]), avec la clé injectée via une variable
d'environnement dédiée, jamais committée. Même logique de report assumé que
[[011-auth-inter-services]] pour le secret partagé whatsapp-agent : poser la structure
maintenant (le schéma, la colonne), résoudre le mécanisme de chiffrement au moment où le
besoin réel (données de production) se présente.

#### Règle applicative — ne jamais inclure `idNumber` dans un SELECT de sélecteur

RLS est un mécanisme **au niveau de la ligne** (row-level security), jamais au niveau de
la colonne : une policy qui autorise Director à lire une ligne `staff` l'autorise à lire
**toutes ses colonnes**, `idNumber` compris — RLS ne peut pas exprimer "cette ligne est
lisible, sauf cette colonne-là". La seule protection possible contre une sur-exposition
de `idNumber` dans un contexte qui n'en a pas besoin (ex. le sélecteur de staff du
registre, une liste déroulante) est **disciplinaire, côté application** : chaque requête
Prisma qui lit `staff` pour un usage de liste/sélection doit utiliser un `select` explicite
qui omet `idNumber`, jamais un `select` implicite (`findMany()` sans `select`) ni un
`select` générique qui inclurait le champ par accident.

**Vérifié, pas supposé** : `lib/db/register.ts` (le sélecteur de staff du formulaire de
saisie) utilise déjà `select: { id: true, name: true }` — conforme à la règle,
n'expose déjà que ce dont il a besoin. `lib/db/staff.ts` (nouveau, écrit en parallèle de
cette tâche, gestion du staff par l'Owner) utilise lui aussi des `select` explicites sur
`tx.staff.findMany`/`findFirst` — également conforme aujourd'hui (n'incluait pas
`idNumber`, qui n'existait pas encore au moment de son écriture). **Point de vigilance
pour la suite, pas une correction faite ici** : toute future requête de liste/sélection
sur `staff` doit continuer cette discipline explicitement — `idNumber` ne doit apparaître
dans un `select` que sur un écran dédié au profil complet d'un staff, jamais dans une
liste ou un sélecteur.

### 6. RLS — confirmé, pas supposé, pour les colonnes existantes ; nouvelle policy pour la nouvelle table

**Staff/Client** : aucune nouvelle policy nécessaire pour les colonnes ajoutées
(`sex`, `phone`, `residence`, `idType`, `idNumber`, `yearsOfExperience` sur Staff ; `sex`
sur Client). Confirmé, pas supposé : RLS Postgres filtre des **lignes** (`USING`/`WITH
CHECK` évalués par ligne), jamais des colonnes individuelles — une policy qui autorise
l'accès à une ligne `staff`/`clients` autorise l'accès à TOUTES ses colonnes,
indépendamment de quand elles ont été ajoutées au schéma. Les policies existantes
(`staff_select_tenant`/`staff_write_admin`/... — [[013-job-title-vs-system-role]],
resserrées en [[014-decouplage-rls-auth-provider]] ; `clients_select_tenant`/
`clients_write_admin` — [[001-tenant-id-et-rls]]) couvrent donc ces nouveaux champs sans
modification. Vérifié directement : `information_schema.columns` confirme la présence
des nouvelles colonnes sur les deux tables, sans qu'aucune policy `pg_policies` n'ait eu
besoin d'être touchée.

**`staff_job_titles`** (table neuve) : nécessite ses propres policies, comme toute
nouvelle table. Même forme finale que `staff`/`job_titles`
([[013-job-title-vs-system-role]], [[014-decouplage-rls-auth-provider]]) : lecture
Director+Owner (`is_salon_admin() or is_owner()`), écriture Owner uniquement
(`is_owner()`). Pas de policies `*_restore_admin`/`*_select_deleted_admin` : cette table
n'a pas de `isDeleted` (voir point 3). **`GRANT` explicite à `app_runtime`** ajouté dans
la même migration — `grant ... on all tables in schema public` (posé lors du provisioning
du rôle, voir point 7) ne s'applique qu'aux tables qui existaient au moment du `GRANT`,
jamais rétroactivement aux tables créées ensuite ; sans cette ligne, `app_runtime` n'aurait
eu aucun privilège sur `staff_job_titles`, quelle que soit la policy RLS (le `GRANT` de
privilège SQL et la policy RLS sont deux couches indépendantes — la première doit exister
pour que la seconde ait quoi que ce soit à filtrer).

### 7. Trouvaille annexe, comblée avant cette migration : le provisioning d'`app_runtime` n'était pas reproductible

En préparant le `GRANT` du point 6, découvert que le rôle `app_runtime`
([[014-decouplage-rls-auth-provider]]) avait été créé par un script ponctuel, jamais
capturé dans une migration Prisma — un environnement neuf (`prisma migrate deploy` seul)
n'aurait pas pu reconstituer cet état, à l'inverse du principe déjà établi pour RLS
([[005-prisma-et-supabase]] : "reproductible sur un environnement neuf"). Comblé par la
migration `20260827140000_app_runtime_role_provisioning`, idempotente (bloc `DO`/`IF NOT
EXISTS` pour `CREATE ROLE`, `GRANT`/`FORCE ROW LEVEL SECURITY` naturellement idempotents) :
sans effet sur cet environnement (le rôle existe déjà, avec le vrai mot de passe déjà en
place), mais rend l'état reproductible ailleurs. Sur un environnement neuf, le mot de passe
posé par cette migration est un placeholder à écraser (`ALTER ROLE app_runtime WITH
PASSWORD '<secret>'`) avant de brancher `DATABASE_URL` dessus.

## Rupture assumée : `lib/db/staff.ts` et l'UI de gestion du staff

`Staff.jobTitleId` (FK simple) est supprimé par cette migration, remplacé par
`staff_job_titles`. Une fonctionnalité complète de gestion du staff (Owner) a été écrite
en parallèle de cette tâche — `lib/db/staff.ts` (`resolveJobTitle`, `createStaff`,
`updateStaff`), `lib/validation/staff.ts`, et l'UI
(`app/(admin)/(owner)/staff/staff-manager.tsx`,
`app/(admin)/(owner)/staff/nouveau/new-staff-form.tsx`,
`app/(admin)/(owner)/staff/actions.ts`) — et dépend entièrement de `jobTitleId` comme
valeur unique (un seul `<select>`, une seule colonne lue/écrite).

**Confirmé explicitement avant d'appliquer la migration** : cette rupture est assumée,
pas accidentelle. Elle casse immédiatement `lib/db/staff.ts` (erreurs Prisma/TypeScript :
`jobTitleId` n'existe plus sur `Staff`) et rend le formulaire de staff non fonctionnel
(il soumet toujours un seul `jobTitleId`, qui ne correspond plus à rien). Cette tâche
n'adapte ni l'un ni l'autre — conformément à la consigne explicite ("N'implémente aucune
UI") — l'adaptation revient à la fonctionnalité en cours d'écriture en parallèle : migrer
`resolveJobTitle`/`createStaff`/`updateStaff` vers des opérations sur
`staff_job_titles` (créer/mettre à jour une ligne de liaison au lieu d'une colonne), et
le formulaire vers une sélection multiple (ou au minimum vers "poste principal" +
possibilité d'en ajouter d'autres plus tard).

## Ce qui n'a volontairement pas été fait dans cette tâche

- Chiffrement de `idNumber` — voir point 5, reporté à l'approche de la mise en
  production avec des données réelles.
- Adaptation de `lib/db/staff.ts`/UI staff à la nouvelle relation many-to-many — voir
  "Rupture assumée" ci-dessus, hors scope explicite de cette tâche.
- Validation applicative rendant `sex`/`phone`/`idType`/`idNumber` obligatoires à la
  création — resterait, si voulu, une responsabilité de `lib/validation/staff.ts`, pas du
  schéma (voir point 2).
- Aucune UI, aucun endpoint pour gérer les postes multiples (assigner/retirer un poste,
  changer le poste principal) — schéma et contraintes seulement.

## Vérification

### Constraintes nouvelles — vérifiées par exécution réelle (service role, hors RLS)

| Vérification                                                                                                     | Résultat                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| FK composite : une ligne `staff_job_titles` ne peut pas associer un staff de tenant Y à un job_title de tenant X | ✅ rejeté — `violates foreign key constraint "staff_job_titles_tenant_id_job_title_id_fkey"` |
| Unique partiel : un deuxième `isPrimary = true` pour le même staff                                               | ✅ rejeté — `Key (staff_id)=(...) already exists`                                            |
| Unique : le même staff ne peut pas se voir assigner deux fois le même poste                                      | ✅ rejeté — `Key (staff_id, job_title_id)=(...) already exists`                              |
| `app_runtime` a bien SELECT/INSERT/UPDATE/DELETE sur `staff_job_titles`                                          | ✅ confirmé via `information_schema.role_table_grants`                                       |
| Nouvelles colonnes présentes sur `staff`/`clients`                                                               | ✅ confirmé via `information_schema.columns`                                                 |

Nettoyage post-vérification confirmé : aucune ligne de test résiduelle (tenants,
staff, job_titles, staff_job_titles).

### `npm run test:rls` — résultat complet, test par test

Relancé en entier après application des 3 migrations
(`20260827140000_app_runtime_role_provisioning`,
`20260827150000_staff_profile_and_job_titles_m2m`,
`20260827150100_staff_job_titles_rls`), contre l'instance Supabase de test — **9 tests
verts sur 10**, identique au résultat obtenu avant cette tâche (aucune régression) :

| Test                                                                                                    | Résultat                                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur      | ✅                                                                                                       |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur     | ✅                                                                                                       |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur | ✅                                                                                                       |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A                     | ✅                                                                                                       |
| (contrôle) un utilisateur de tenant A voit bien ses propres données                                     | ✅                                                                                                       |
| (analyse complémentaire) un payment de tenant B ne peut pas référencer un appointment de tenant A       | ❌ (gap FK cross-tenant préexistant, [[007-verification-isolation-rls]] — sans rapport avec cette tâche) |
| un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted                                  | ✅                                                                                                       |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A          | ✅                                                                                                       |
| un owner de tenant A peut lire les données de son propre tenant                                         | ✅                                                                                                       |
| un owner de tenant A ne peut pas lire les utilisateurs de tenant B                                      | ✅                                                                                                       |

**Résumé exécution** : `Test Files 1 failed (1)` / `Tests 1 failed | 9 passed (10)`.

### Non fait dans cette vérification

Le client Prisma (`npx prisma generate`) n'a pas pu être régénéré : verrou Windows sur le
moteur, tenu par un serveur `next dev` actuellement utilisé par le développement
concurrent de la fonctionnalité staff — confirmé avant d'agir plutôt que de l'arrêter
sans demander. Sans conséquence sur cette vérification : `npm run test:rls` n'exerce
aucun des nouveaux champs (`sex`, `phone`, `idNumber`...), donc n'a pas besoin de types
Prisma à jour pour s'exécuter correctement contre le nouveau schéma en base. La
régénération reste à faire au prochain redémarrage naturel de ce serveur.
