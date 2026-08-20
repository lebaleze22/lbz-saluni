# 001 — tenant_id sur chaque table métier + RLS Postgres

## Contexte

LBZ est conçu comme un SaaS multi-salons dès le départ, même si l'Étape 1 est utilisée
en mono-tenant (un seul salon, Caprice D'Ebène). Retrofitter le multi-tenant après coup
sur un schéma qui ne le prévoit pas est risqué (migration de données, oublis de filtrage
côté application). La convention du projet impose donc `tenant_id` + RLS dès la première
table.

## Décision

- Toute table métier (`users`, `staff`, `clients`, `services`, `appointments`,
  `appointment_services`, `payments`) porte une colonne `tenant_id UUID NOT NULL`
  référençant `tenants.id`.
- `appointment_services`, bien que techniquement une table de liaison, porte aussi
  `tenant_id` en dénormalisé : cela évite à ses policies RLS de dépendre d'une jointure
  vers `appointments`, ce qui garde chaque policy lisible et indépendante.
- L'isolation n'est **pas** confiée à l'application (ex. `WHERE tenant_id = ...` ajouté
  manuellement dans chaque requête Prisma) mais à PostgreSQL via Row-Level Security :
  même un bug applicatif ou une requête Prisma mal filtrée ne peut pas traverser les
  tenants.

## Mécanisme RLS

Deux fonctions `SECURITY DEFINER` (voir `prisma/migrations/00000000000001_rls_policies/`) :

- `public.current_tenant_id()` — résout le tenant de l'utilisateur connecté
  (`auth.uid()`) en lisant `public.users`.
- `public.is_salon_admin()` — vérifie le rôle de l'utilisateur connecté.

Elles sont `SECURITY DEFINER` pour contourner RLS lors de leur propre lecture de
`public.users` : sans cela, une policy sur `users` qui s'auto-référence provoquerait une
récursion. C'est le pattern recommandé par Supabase pour ce cas.

Chaque table applique deux policies :

- **SELECT** : ouvert à tout membre du tenant (`tenant_id = current_tenant_id()`).
- **INSERT/UPDATE/DELETE** : réservé à `salon_admin` (cf. spec Étape 1 — seul le
  directeur/gérant saisit). Les rôles `manager`/`staff` pourront obtenir des policies
  d'écriture plus fines lors d'une étape future, sans changer le modèle de données.

`tenants` et `users` ont des policies plus restrictives : la création de ces deux tables
(onboarding d'un nouveau salon, provisioning d'un compte) passe par la clé
`service_role` côté serveur (hors RLS), pas par une policy exposée au rôle
`authenticated`.

## Conséquences

- Prisma ne modélise pas RLS (`schema.prisma` reste indépendant des policies) : les
  policies vivent en SQL brut dans une migration dédiée, appliquée après la migration
  de structure. Voir `prisma/migrations/`.
- Toute nouvelle table métier ajoutée dans une étape future doit reproduire ce même
  couple (colonne `tenant_id` + policies SELECT/write via les fonctions existantes).
- Le routing multi-tenant (sous-domaine, sélection de salon) reste hors scope de
  l'Étape 1 — seule la fondation données/sécurité est posée.
