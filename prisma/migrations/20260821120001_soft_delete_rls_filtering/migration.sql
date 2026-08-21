-- Filtrage RLS des lignes soft-deleted (is_deleted = true).
--
-- isDeleted est la seule colonne des trois (active, isDeleted, deletedAt) qui pilote
-- la visibilité RLS — voir docs/architecture/008-soft-delete-active-vs-is-deleted.md
-- pour la hiérarchie isDeleted > active > deletedAt. active reste un filtre purement
-- applicatif (ex. exclure un service désactivé des listes de sélection), il n'apparaît
-- volontairement dans aucune policy ci-dessous.
--
-- On modifie les policies existantes via ALTER POLICY (pas de DROP/CREATE) pour ne
-- jamais laisser la table sans policy active, même le temps d'une transaction.

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires : un utilisateur dont la propre ligne est soft-deleted
-- ne doit plus rien pouvoir résoudre (tenant, rôle) via ces fonctions.
-- ---------------------------------------------------------------------------
create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid() and not is_deleted
$$;

create or replace function public.is_salon_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'salon_admin' and not is_deleted
  )
$$;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
alter policy "tenants_select_own" on "tenants"
  using (id = public.current_tenant_id() and not is_deleted);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter policy "users_select_tenant" on "users"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "users_update_self" on "users"
  using (id = auth.uid() and not is_deleted);

-- ---------------------------------------------------------------------------
-- staff / clients / services
-- ---------------------------------------------------------------------------
alter policy "staff_select_tenant" on "staff"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "staff_write_admin" on "staff"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

alter policy "clients_select_tenant" on "clients"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "clients_write_admin" on "clients"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

alter policy "services_select_tenant" on "services"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "services_write_admin" on "services"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- appointments / appointment_services / payments
-- ---------------------------------------------------------------------------
alter policy "appointments_select_tenant" on "appointments"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "appointments_write_admin" on "appointments"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

alter policy "appointment_services_select_tenant" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "appointment_services_write_admin" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

alter policy "payments_select_tenant" on "payments"
  using (tenant_id = public.current_tenant_id() and not is_deleted);

alter policy "payments_write_admin" on "payments"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);
