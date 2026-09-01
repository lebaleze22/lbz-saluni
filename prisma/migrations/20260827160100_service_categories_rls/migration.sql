-- RLS pour service_categories — même pattern que services (vérifié via pg_policies
-- avant d'écrire cette migration, pas supposé) : lecture ouverte à tout le tenant
-- (une catégorie de service, comme un service, doit être visible par quiconque
-- construit le formulaire de saisie du registre), écriture réservée à salon_admin
-- (Director gère le catalogue au quotidien — à la différence de job_titles/staff,
-- concern RH gaté à Owner depuis docs/architecture/013-job-title-vs-system-role.md et
-- docs/architecture/014-decouplage-rls-auth-provider.md).
--
-- GRANT explicite à app_runtime : nécessaire pour toute table créée après le GRANT
-- initial (docs/architecture/015-staff-profil-et-postes-multiples.md, point 6) — sans
-- cette ligne, app_runtime n'aurait aucun privilège sur service_categories.
alter table "service_categories" enable row level security;
alter table "service_categories" force row level security;

grant select, insert, update, delete on "service_categories" to app_runtime;

create policy "service_categories_select_tenant" on "service_categories"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and not is_deleted);

create policy "service_categories_write_admin" on "service_categories"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin());

-- Policies de restauration/lecture-des-supprimées, même forme que services
-- (docs/architecture/008-soft-delete-active-vs-is-deleted.md, "Policy de restauration").
create policy "service_categories_select_deleted_admin" on "service_categories"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "service_categories_restore_admin" on "service_categories"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);
