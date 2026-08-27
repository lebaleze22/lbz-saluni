# 013 — `job_titles` (libellé libre par tenant) séparé de `Staff.systemRole` (permission fermée)

## Statut

Implémenté et vérifié le 2026-08-26 contre l'instance Supabase de test — migrations
appliquées via `prisma migrate deploy`, résultat `npm run test:rls` détaillé en fin de
document.

**Note de contexte** : cette tâche a été formulée comme une "correction" d'un enum
`JobTitle` global et de policies `staff` déjà "corrigées (écriture Owner-only)"
préexistants. Vérification faite avant d'implémenter : ni l'un ni l'autre n'existaient
dans le schéma ou les migrations à ce moment (le seul état antérieur réel était celui
issu de [[012-role-owner]] : `staff_write_admin` réservé à `salon_admin`, `staff_select_tenant`
ouvert à tout le tenant, aucune colonne `job_title`/`systemRole`/`userId`). Cet ADR
documente donc l'état **établi par cette tâche**, pas une correction d'un état antérieur
réel — voir la session pour la clarification demandée et confirmée avant implémentation.

## Contexte

Le besoin métier distingue deux choses qui pourraient être confondues dans un seul champ
"poste" :

1. **Comment on appelle le poste d'un membre du staff** — "Coiffeuse", "Réceptionniste",
   "Assistante manager"... Ça varie par salon, par culture métier, par langue. Un enum
   figé dans le code (`JobTitle`) imposerait la même liste à tous les tenants, ce qu'un
   SaaS multi-salons ne peut pas se permettre — chaque salon doit pouvoir nommer ses
   postes comme il l'entend.
2. **Qui peut se connecter, et avec quel niveau d'accès** — un ensemble **fermé** :
   aujourd'hui `none` (pas de compte), `director`, `manager`. Ce n'est pas une question
   de vocabulaire, c'est une question de sécurité : le code doit pouvoir raisonner sur
   un nombre fini de valeurs (`switch`, policy RLS, contrôle d'accès), pas sur du texte
   libre entré par un utilisateur.

## Décision

### 1. `job_titles` — table tenant-scopée, texte libre, sans permission

```prisma
model JobTitle {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String    @map("tenant_id") @db.Uuid
  name      String
  active    Boolean   @default(true)
  isDeleted Boolean   @default(false) @map("is_deleted")
  deletedAt DateTime? @map("deleted_at")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @default(now()) @updatedAt @map("updated_at")
}
```

Mêmes champs `active`/`isDeleted`/`deletedAt` que les 6 autres tables métier
([[008-soft-delete-active-vs-is-deleted]]), même convention `tenant_id` + RLS
([[001-tenant-id-et-rls]]). `name` est un `String` libre, sans contrainte de valeurs :
chaque salon construit sa propre liste. **Aucune valeur pré-remplie globalement** — un
nouveau tenant démarre avec une liste vide. Décision volontaire, laissée à la discrétion
de cette tâche par la mission : imposer même une liste de "suggestions" par défaut
supposerait une structure de poste commune à tous les salons (coiffure ? esthétique ?
les deux ?), ce qui n'est pas garanti à ce stade du produit. Une future UI de création de
salon pourra proposer des suggestions **côté client** (non persistées tant que l'Owner ne
les valide pas) sans que cela nécessite de données en base — hors scope ici (aucune UI
n'est implémentée par cette tâche).

Créée par l'Owner (cf. policies RLS, point 5) — cohérent avec le rôle Owner défini en
[[012-role-owner]] : gérer la liste des intitulés est une décision de configuration du
salon, pas une tâche opérationnelle quotidienne.

### 2. `Staff.jobTitleId` — référence optionnelle, tenant-scopée par contrainte FK composite

```prisma
jobTitleId String?   @map("job_title_id") @db.Uuid
jobTitle   JobTitle? @relation(fields: [tenantId, jobTitleId], references: [tenantId, id], onDelete: Restrict)
```

Optionnel : un membre du staff peut exister sans intitulé assigné (ex. juste après
création, avant configuration complète). **Cohérence tenant vérifiée par contrainte, pas
seulement par RLS** — RLS ne peut pas empêcher une référence croisée entre tenants sur
une FK dénormalisée (limite déjà démontrée par exécution réelle sur `payments.appointment_id`
dans [[007-verification-isolation-rls]] : une FK simple garantit que la ligne cible
existe quelque part, jamais qu'elle appartient au bon tenant). Plutôt que de laisser ce
risque latent pour une toute nouvelle relation, `job_titles` reçoit dès sa création
`@@unique([tenantId, id])`, et `staff.job_title_id` est lié par une **FK composite** :

```sql
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_tenant_id_job_title_id_fkey"
  FOREIGN KEY ("tenant_id", "job_title_id") REFERENCES "job_titles"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
```

PostgreSQL rejette alors nativement toute tentative de faire pointer un `staff` vers un
`job_titles` d'un autre tenant — garantie au niveau base, pas seulement applicative ou
RLS. **Extension au-delà de la demande explicite** : la même logique est appliquée à
`Staff.userId` → `users` (point 3), pour la même classe de risque, avec `users` recevant
elle aussi `@@unique([tenantId, id])`.

### 3. `Staff.systemRole` — enum fermé, contrôlé en code, indépendant du libellé

```prisma
enum StaffSystemRole {
  none
  director
  manager
}

systemRole StaffSystemRole @default(none) @map("system_role")
userId     String?         @unique @map("user_id") @db.Uuid
user       User?           @relation(fields: [tenantId, userId], references: [tenantId, id], onDelete: Restrict)
```

`systemRole` — pas `jobTitleId` — détermine l'éligibilité à un compte de connexion.
Défaut `none` : un membre du staff nouvellement créé n'est éligible à rien tant que
quelqu'un (Owner, via les policies du point 5) ne lui accorde explicitement `director`
ou `manager`. `userId` référence le compte `public.users`/`auth.users` effectivement
provisionné — reste `NULL` tant qu'aucun compte n'a été créé, même si `systemRole` a déjà
été positionné (une promotion d'éligibilité peut précéder le provisioning réel du
compte ; l'inverse est interdit, voir la contrainte CHECK ci-dessous).

Ce champ réalise l'évolution que [[004-staff-sans-compte]] anticipait explicitement sans
l'implémenter ("une future fonctionnalité de connexion staff nécessitera de relier une
entrée staff à une entrée users, probablement une FK optionnelle `staff.user_id`") — cette
tâche la construit, sans toucher au comportement décrit par ailleurs dans cet ADR (Staff
reste une entité de référence par défaut ; seuls les membres promus `director`/`manager`
gagnent un compte).

### 4. Pourquoi mélanger libellé et permission serait un risque de sécurité

C'est le cœur de la séparation demandée, explicité ici sans ambiguïté :

- **Le libellé est modifiable par construction** (texte libre, géré par l'Owner via une
  future UI). Si le contrôle d'accès dépendait du texte du libellé (ex. "l'utilisateur a
  accès aux fonctions Director si `job_title.name = 'Directeur'`"), alors **renommer un
  poste changerait silencieusement des permissions** — un Owner qui renomme "Directeur"
  en "Direction Générale" pour une raison purement cosmétique retirerait sans le savoir
  l'accès de tout le monde qui en dépendait, ou pire, un nom de poste mal orthographié
  ou dupliqué (deux libellés différents visant "la même fonction") créerait des trous
  d'accès invisibles au moment de la revue de sécurité.
- **Le texte libre n'est pas un ensemble fermé auditable.** Une policy RLS ou un contrôle
  applicatif doit pouvoir énumérer exhaustivement les valeurs possibles (`none`,
  `director`, `manager`) pour être vérifiable — un `WHERE job_title_name = 'Director'`
  dépend de la discipline de saisie de chaque tenant (fautes de frappe, traductions,
  variantes), qui n'est pas une garantie de sécurité.
- **Un salon multi-langue ou multi-convention casserait la logique de permission.** Le
  même poste s'appelle différemment selon le salon ("Gérant", "Manager", "Responsable") ;
  si la permission dépendait du texte, chaque salon devrait re-déclarer sa propre logique
  d'accès, dupliquée et divergente. `systemRole` reste un contrat stable, indépendant du
  vocabulaire choisi par chaque tenant.
- **Conséquence directe** : aucune policy RLS, aucun helper `SECURITY DEFINER`, aucune
  fonction de ce projet ne doit jamais lire `job_titles.name` pour décider d'un accès.
  Seul `Staff.systemRole` (et, pour les comptes `users` déjà existants,
  `User.role`/`is_salon_admin()`/`is_owner()`) entre dans une décision de permission.

### 5. Contrainte CHECK — `userId` seulement si `systemRole != 'none'`

```sql
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_user_id_requires_system_role"
  CHECK ("user_id" IS NULL OR "system_role" <> 'none');
```

Non modélisable dans `schema.prisma` (pas de primitive Prisma pour un `CHECK` arbitraire
à ce jour) — vit en SQL brut dans la migration de structure, à la manière dont RLS vit
hors de Prisma ([[005-prisma-et-supabase]]). Sens unique assumé (voir point 3) : la
contrainte interdit `userId` renseigné avec `systemRole = 'none'`, mais n'exige pas
l'inverse.

### 6. Contrainte base : au plus un Staff actif avec `systemRole = 'director'` par tenant

```sql
CREATE UNIQUE INDEX "staff_one_director_per_tenant"
  ON "staff" ("tenant_id")
  WHERE "system_role" = 'director' AND NOT "is_deleted";
```

Même mécanisme que `users_one_salon_admin_per_tenant` / `users_one_owner_per_tenant`
([[012-role-owner]]), appliqué ici à `staff.system_role` plutôt qu'à `users.role`. **Ce
sont deux contraintes indépendantes, sur deux tables différentes** — rien en base ne
garantit qu'un `Staff` avec `systemRole = 'director'` correspond effectivement (via
`userId`) à l'utilisateur `users` dont `role = 'salon_admin'`. Faire respecter cette
cohérence (un seul "Director" cohérent à la fois entre les deux tables) resterait une
responsabilité applicative future, non couverte par cette tâche — limite assumée,
documentée ici plutôt que découverte plus tard. `and not is_deleted`, sans dépendre
d'`active` : même raisonnement que [[012-role-owner]] (un Director soft-deleted libère le
rôle pour son remplaçant).

### 7. RLS — `job_titles` suit le pattern `staff`, `staff` est resserré vers Owner-only en écriture

Avant cette tâche, `staff` suivait le pattern générique des autres tables métier
(`staff_select_tenant` ouvert à tout le tenant ; `staff_write_admin` réservé à
`salon_admin`, comme `clients`/`services`). Cette tâche **change ce comportement** :

| Policy                                                   | Avant              | Après                                    |
| -------------------------------------------------------- | ------------------ | ---------------------------------------- |
| `staff_select_tenant` (SELECT)                           | tout le tenant     | `is_salon_admin()` (Director) uniquement |
| `staff_write_admin` (ALL)                                | `is_salon_admin()` | `is_owner()` (Owner) uniquement          |
| `staff_restore_admin` (UPDATE)                           | `is_salon_admin()` | `is_owner()`                             |
| `staff_select_deleted_admin` (SELECT, lignes supprimées) | `is_salon_admin()` | `is_owner()`                             |

`job_titles` reçoit exactement cette même forme finale dès sa création (4 policies,
mêmes conditions). **Raisonnement métier** : la fiche d'un membre du staff (taux de
commission, intitulé de poste, éligibilité à un compte) et la liste des intitulés
disponibles relèvent d'une décision d'approbation globale du salon (embauche, promotion,
configuration), pas d'une tâche opérationnelle quotidienne — cohérent avec la
définition d'Owner en [[012-role-owner]] ("approuvé/global, pas opérationnel"). Director
garde un accès en lecture (besoin réel : choisir un membre du staff dans le formulaire de
saisie du registre), mais ne peut plus créer/modifier/supprimer une fiche staff ni la
liste des postes.

**Vérifié avant d'appliquer ce resserrement, pas supposé** : `staff` est lu en
production exclusivement via `prisma.staff.findMany()`/`findFirst()`
(`lib/db/register.ts`), qui passe par la connexion `DATABASE_URL` — le rôle Postgres
propriétaire des tables, qui **contourne RLS** (RLS ne s'applique qu'au rôle
`authenticated` utilisé par le chemin PostgREST + JWT direct, jamais emprunté par
l'app Next.js aujourd'hui). Ce resserrement RLS est donc sans effet sur le comportement
actuel de l'application (toujours gouverné par `requireSalonAdmin()` côté code) ; il ne
change que la garantie de défense en profondeur pour un futur accès direct
PostgREST (mobile, intégration tierce...), exactement l'esprit de RLS déjà posé par
[[001-tenant-id-et-rls]].

Migration appliquée via `ALTER POLICY` (jamais `DROP`/`CREATE`) pour ne jamais laisser la
table sans policy active, même le temps d'une transaction — même précaution que
[[008-soft-delete-active-vs-is-deleted]].

### 8. Aucune UI, aucune logique métier

Cette tâche est strictement schéma + RLS + ADR. Aucun endpoint, formulaire, ou action
serveur n'est ajouté ou modifié pour créer/lister des `job_titles`, promouvoir un
`Staff.systemRole`, ou provisionner le `userId` correspondant.

## Conséquences

- Toute future UI de gestion du staff doit lire `Staff.systemRole` (jamais
  `JobTitle.name`) pour décider d'un accès, et respecter le sens unique de la contrainte
  CHECK (proposer/valider `systemRole` avant de proposer la création du compte associé,
  jamais l'inverse).
- Le provisioning d'un compte reste, comme pour Director/Owner ([[012-role-owner]]), une
  opération admin (script/`service_role`), pas self-service.
- `is_owner()` ([[012-role-owner]]) est désormais utilisée par une vraie policy (jusqu'ici
  posée mais non consommée) — `staff_write_admin`, `staff_restore_admin`,
  `staff_select_deleted_admin`, et les 4 policies `job_titles`.
- La cohérence `Staff.systemRole = 'director'` ↔ `User.role = 'salon_admin'` (même
  personne, même compte) n'est pas garantie par la base — limite assumée, à traiter par
  une future couche applicative si le produit en a besoin.
- `active` n'entre dans aucune des contraintes/policies ajoutées ici (ni le CHECK, ni
  l'index `staff_one_director_per_tenant`, ni les policies `job_titles`) — cohérent avec
  la hiérarchie `isDeleted > active` déjà établie ([[008-soft-delete-active-vs-is-deleted]]).

## Vérification

`npm run test:rls` relancé après application des migrations
`20260826150000_job_titles_and_staff_system_role` et `20260826150100_job_titles_staff_rls`,
contre l'instance Supabase de test — **9/10 tests verts**, identique au résultat
[[012-role-owner]] avant cette tâche (aucune régression introduite) :

| Test                                                                                                                          | Résultat                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur                            | ✅                                                                                                                             |
| un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur                           | ✅                                                                                                                             |
| un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur                       | ✅                                                                                                                             |
| un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A (bloqué par Postgres, pas par l'app)      | ✅                                                                                                                             |
| (contrôle) un utilisateur de tenant A voit bien ses propres données                                                           | ✅                                                                                                                             |
| (analyse complémentaire, non demandée explicitement) un payment de tenant B ne peut pas référencer un appointment de tenant A | ❌ (gap FK cross-tenant préexistant, voir [[007-verification-isolation-rls]] — sans rapport avec cette tâche, non corrigé ici) |
| un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted (is_deleted true -> false)                             | ✅                                                                                                                             |
| un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A                                | ✅                                                                                                                             |
| un owner de tenant A peut lire les données de son propre tenant (clients/services/appointments)                               | ✅                                                                                                                             |
| un owner de tenant A ne peut pas lire les utilisateurs de tenant B                                                            | ✅                                                                                                                             |

Cette tâche n'ajoute aucun test à `tests/rls/tenant-isolation.test.ts` (non demandé
explicitement, contrairement à [[012-role-owner]]) — la suite existante ne couvre ni
`job_titles` ni les nouvelles contraintes `staff`, seulement l'absence de régression sur
l'isolation déjà en place. Les trois contraintes ajoutées par cette tâche ont été
vérifiées séparément, par un script ponctuel (`service_role`, hors suite de tests, exécuté
puis nettoyé — aucune trace résiduelle) reproduisant les trois scénarios de rejet
attendus :

| Vérification                                                                             | Résultat                                                                          |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| FK composite : un `staff` de tenant Y ne peut pas référencer un `job_titles` de tenant X | ✅ rejeté — `violates foreign key constraint "staff_tenant_id_job_title_id_fkey"` |
| CHECK : `user_id` renseigné avec `system_role = 'none'`                                  | ✅ rejeté — `violates check constraint "staff_user_id_requires_system_role"`      |
| Unique partiel : un deuxième `staff` avec `system_role = 'director'` sur le même tenant  | ✅ rejeté — `violates unique constraint "staff_one_director_per_tenant"`          |

Le premier des trois confirme, par exécution réelle (pas seulement par lecture du SQL),
que la faille de référence croisée entre tenants documentée en
[[007-verification-isolation-rls]] est bien fermée pour cette nouvelle relation
`staff.job_title_id` — contrairement aux FK dénormalisées plus anciennes
(`payments.appointment_id` etc.), qui restent, elles, non corrigées (cf. tableau
ci-dessus).
