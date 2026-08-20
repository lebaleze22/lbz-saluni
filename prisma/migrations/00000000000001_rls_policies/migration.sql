-- Row-Level Security — Étape 1
-- Non gérée par Prisma (schema.prisma ne modélise pas RLS) : migration SQL manuelle.
-- Voir docs/architecture/001-tenant-id-et-rls.md pour la justification du design.
--
-- Principe : chaque table métier porte tenant_id. L'isolation est appliquée par
-- deux fonctions SECURITY DEFINER qui lisent public.users en contournant RLS,
-- ce qui évite toute récursion de policy sur la table users elle-même.

-- ---------------------------------------------------------------------------
-- Fonctions utilitaires
-- ---------------------------------------------------------------------------

create or replace function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from public.users where id = auth.uid()
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
    where id = auth.uid() and role = 'salon_admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- tenants
-- Un utilisateur ne voit que son propre tenant. La création/mise à jour de
-- tenants (onboarding) passe par la clé service_role côté serveur, qui
-- contourne RLS — aucune policy d'écriture n'est exposée au rôle authenticated.
-- ---------------------------------------------------------------------------
alter table "tenants" enable row level security;

create policy "tenants_select_own" on "tenants"
  for select to authenticated
  using (id = public.current_tenant_id());

-- ---------------------------------------------------------------------------
-- users
-- Lecture : tous les membres du tenant (staff/manager pourront un jour se
-- voir mutuellement, ex. planning partagé). Écriture : un utilisateur ne
-- modifie que sa propre ligne. La création de comptes (signup) passe par
-- service_role, hors RLS.
-- ---------------------------------------------------------------------------
alter table "users" enable row level security;

create policy "users_select_tenant" on "users"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "users_update_self" on "users"
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- staff / clients / services
-- Lecture ouverte à tout le tenant, écriture réservée à salon_admin
-- (seul rôle habilité à saisir pour l'Étape 1, cf. Etape_01_Registre_Activite.md).
-- ---------------------------------------------------------------------------
alter table "staff" enable row level security;

create policy "staff_select_tenant" on "staff"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "staff_write_admin" on "staff"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

alter table "clients" enable row level security;

create policy "clients_select_tenant" on "clients"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "clients_write_admin" on "clients"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

alter table "services" enable row level security;

create policy "services_select_tenant" on "services"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "services_write_admin" on "services"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

-- ---------------------------------------------------------------------------
-- appointments / appointment_services / payments
-- Registre d'activité : mêmes règles (lecture tenant, écriture salon_admin).
-- ---------------------------------------------------------------------------
alter table "appointments" enable row level security;

create policy "appointments_select_tenant" on "appointments"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "appointments_write_admin" on "appointments"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

alter table "appointment_services" enable row level security;

create policy "appointment_services_select_tenant" on "appointment_services"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "appointment_services_write_admin" on "appointment_services"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

alter table "payments" enable row level security;

create policy "payments_select_tenant" on "payments"
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy "payments_write_admin" on "payments"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());
