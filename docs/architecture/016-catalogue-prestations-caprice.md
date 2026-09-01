# 016 — `ServiceCategory`, `Service.categoryId`, et import du catalogue Caprice D'Ebène

## Statut

**Implémenté et validé au 2026-08-31.** Le schéma, les policies, l'interface et le script
d'initialisation ont été exécutés contre la stack PostgreSQL locale. Le tenant Caprice
D'Ebène contient les 11 catégories et 81 prestations de la source réelle, sans doublon.

## Contexte

Le catalogue de prestations de Caprice D'Ebène (81 prestations réelles, regroupées en
11 catégories : Barber, Tresses, Enfant, Beauty, Massage...) doit être importé tel quel,
sans dédoublonnage ni restructuration — voir "Décisions déjà tranchées" ci-dessous. Le
schéma actuel (`Service`, [[001-tenant-id-et-rls]]) n'a qu'un nom et un prix, aucun
regroupement par catégorie.

## Décision

### 1. `ServiceCategory` — même pattern structurel que `JobTitle`

```prisma
model ServiceCategory {
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

Tenant-scopée, texte libre, aucune valeur imposée globalement — même principe que
`JobTitle` ([[013-job-title-vs-system-role]]) : chaque salon construit sa propre liste de
catégories, rien n'est codé en dur au niveau plateforme.

### 2. `Service.categoryId` — optionnel, FK composite `(tenant_id, id)`

```prisma
categoryId String?          @map("category_id") @db.Uuid
category   ServiceCategory? @relation(fields: [tenantId, categoryId], references: [tenantId, id], onDelete: Restrict)
```

**Optionnel**, alors que la demande ne le précisait pas explicitement : 5 lignes
`services` réelles existent déjà (catalogue HAMMAM saisi manuellement avant cette tâche)
sans catégorie assignée — un `NOT NULL` sans défaut aurait échoué à l'application de la
migration, et il n'existe aucune catégorie "par défaut" sensée à leur assigner
automatiquement. Même raisonnement déjà appliqué à `Staff.jobTitleId`
([[013-job-title-vs-system-role]]) puis aux nouveaux champs `Staff`
([[015-staff-profil-et-postes-multiples]]).

FK composite `(tenant_id, category_id)` → `service_categories(tenant_id, id)`, même
pattern que toutes les relations tenant-scopées posées depuis
[[013-job-title-vs-system-role]] : empêche par construction qu'un service référence une
catégorie d'un autre tenant. **Vérifié par exécution réelle** (pas seulement lu dans le
SQL) : voir "Vérification".

### 3. RLS — confirmé par lecture directe de `pg_policies`, pas supposé

`service_categories` suit le **même pattern que `services`**, pas celui de `job_titles`/
`staff` :

| Policy                      | `services` (existant, vérifié via `pg_policies`)                               | `service_categories` (nouveau) |
| --------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| Lecture (`*_select_tenant`) | ouverte à tout le tenant (`tenant_id = current_tenant_id()`, aucun rôle testé) | identique                      |
| Écriture (`*_write_admin`)  | `is_salon_admin()` uniquement                                                  | identique                      |

**Pourquoi pas le pattern `job_titles`/`staff`** (lecture Director+Owner, écriture
Owner uniquement, [[013-job-title-vs-system-role]], [[014-decouplage-rls-auth-provider]]) :
ce pattern plus restrictif a été choisi pour `job_titles`/`staff` parce que ce sont des
préoccupations RH (qui peut travailler ici, avec quel intitulé, quelle éligibilité de
compte) — une décision d'approbation globale, pas opérationnelle. Une catégorie de
service, comme un service lui-même, est un élément du **catalogue** que Director doit
pouvoir gérer au quotidien (ajouter une prestation, la classer), et que n'importe quel
membre du tenant doit pouvoir consulter pour construire le formulaire de saisie du
registre — exactement le rôle que jouent déjà `services_select_tenant`/
`services_write_admin`. `service_categories` reprend donc leur policy telle quelle,
`GRANT` explicite à `app_runtime` ajouté (nécessaire pour toute table créée après le
`GRANT` initial, voir [[015-staff-profil-et-postes-multiples]] point 6/7) et policies de
restauration/lecture-des-supprimées incluses, comme pour `services`
([[008-soft-delete-active-vs-is-deleted]]).

### 4. Initialisation du catalogue et des postes — implémentée

`scripts/import-catalogue-caprice.mjs` lit la transcription validée de
`docs/Catalogue_Prestations_Caprice_Ebene.md` et applique les décisions suivantes :

- Séparé de `scripts/seed-dev.mjs` — ne modifie pas son contrat actuel ("identité
  uniquement" : tenant + compte Director de démo, rien d'autre). Script ponctuel dédié,
  pas fusionné.
- Idempotent : rejouable sans dupliquer si déjà exécuté (upsert par nom, sous le tenant
  Caprice D'Ebène existant plutôt que recréé).
- Prestations de même nom dans des catégories différentes (ex. "Nattes simples" en
  Barber/Tresses/Enfant, "Curly" en Barber/Beauty) : lignes distinctes, **aucune
  déduplication** — le nom seul n'identifie pas une prestation, `(catégorie, nom)` le
  fait.
- Massages : deux lignes séparées par durée (ex. "Massage dorsal 30 min" / "Massage
  dorsal 60 min"), **pas** de colonne durée-prix supplémentaire au schéma — la durée fait
  partie du nom de la ligne, cohérent avec le schéma `Service` actuel (un nom, un prix),
  aucune extension de schéma nécessaire pour ce cas.
- Cinq postes initiaux sont également préparés, sans créer de membre du staff :
  `Barbier / Barbière`, `Coiffeur / Coiffeuse`, `Esthéticien / Esthéticienne`,
  `Masseur / Masseuse`, `Prothésiste ongulaire`.
- La stack locale n'embarquant pas PostgREST, le script utilise `PrismaClient` avec
  `ADMIN_DATABASE_URL`/`DIRECT_URL`. Tout l'import s'exécute dans une transaction.
- Commande dédiée : `npm run import:catalogue` (dans la stack locale, via le conteneur
  `tooling`, comme documenté dans le README).

## Ce qui n'est volontairement pas initialisé

- Aucun client, rendez-vous, dépense ou membre du staff de démonstration.

## Vérification

### Contrainte composite — vérifiée par exécution réelle (service role, hors RLS)

| Vérification                                                                                      | Résultat                                                                            |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| FK composite : un `service` de tenant Y ne peut pas référencer une `service_category` de tenant X | ✅ rejeté — `violates foreign key constraint "services_tenant_id_category_id_fkey"` |

Nettoyage post-vérification confirmé : aucune ligne de test résiduelle.

### Initialisation réelle — stack locale

| Vérification                                    | Résultat                                             |
| ----------------------------------------------- | ---------------------------------------------------- |
| Première exécution                              | 5 postes, 11 catégories et 81 prestations créés      |
| Deuxième exécution                              | 0 création, 0 mise à jour, 81 prestations inchangées |
| Comptage SQL indépendant                        | 5 postes, 11 catégories, 81 prestations              |
| `POST /job-titles` avec session Owner réelle    | HTTP 200, création confirmée puis ligne QA supprimée |
| `POST /staff/nouveau` avec session Owner réelle | HTTP 200, création confirmée puis ligne QA supprimée |

La suite RLS complète est verte : **10 tests sur 10**. Le gap FK historique mentionné
dans la version précédente de cet ADR a été corrigé par les clés étrangères composites
tenant-scopées de la migration `20260831140000_registry_tenant_scoped_foreign_keys`.
