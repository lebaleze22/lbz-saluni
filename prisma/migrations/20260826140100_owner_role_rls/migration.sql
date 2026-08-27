-- Rôle Owner — fonction helper RLS + contrainte "au plus un par tenant".
-- Voir docs/architecture/012-role-owner.md pour la décision complète.
--
-- Aucune policy SELECT/INSERT/UPDATE/DELETE n'est ajoutée ou modifiée par cette
-- migration :
--   - Lecture : toutes les policies "*_select_tenant" existantes (voir
--     00000000000001_rls_policies et 20260821120001_soft_delete_rls_filtering)
--     n'ont jamais conditionné l'accès à un rôle précis — seulement
--     `tenant_id = current_tenant_id() and not is_deleted`. Un utilisateur `owner` en
--     hérite donc automatiquement dès l'ajout de la valeur d'enum (migration
--     20260826140000_owner_role_enum), sans aucune policy supplémentaire. Confirmé par
--     lecture directe de ces policies, pas supposé.
--   - Écriture : aucune policy d'écriture pour `owner` à ce stade (MVP) — la création
--     d'un compte Owner ou Director reste une opération admin (script), comme c'est déjà
--     le cas pour Director. Voir docs/architecture/012-role-owner.md.

-- ---------------------------------------------------------------------------
-- Fonction utilitaire — même pattern que is_salon_admin() (SECURITY DEFINER pour
-- contourner RLS sur sa propre lecture de public.users, évite la récursion de policy ;
-- filtre `not is_deleted` pour cohérence avec current_tenant_id()/is_salon_admin()
-- depuis la migration 20260821120001).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Contrainte base : au plus un salon_admin (Director) et au plus un owner par tenant.
--
-- Index unique partiel plutôt qu'une contrainte UNIQUE(tenant_id, role) classique : cette
-- dernière autoriserait au plus UN utilisateur par (tenant, rôle) pour TOUS les rôles, ce
-- qui interdirait par exemple plusieurs `staff`/`manager` dans le même tenant — non
-- souhaité. L'index partiel cible précisément les deux rôles à un seul titulaire.
--
-- `and not is_deleted` (absent de l'exemple de la mission, ajouté par cohérence avec la
-- hiérarchie isDeleted > active du projet, voir
-- docs/architecture/008-soft-delete-active-vs-is-deleted.md) : une fois soft-deleted, un
-- ancien Director/Owner est "supprimé, point final" et ne doit pas bloquer indéfiniment
-- le provisioning de son remplaçant tant que la ligne historique n'est pas restaurée.
create unique index "users_one_salon_admin_per_tenant"
  on "users" ("tenant_id")
  where role = 'salon_admin' and not is_deleted;

create unique index "users_one_owner_per_tenant"
  on "users" ("tenant_id")
  where role = 'owner' and not is_deleted;
