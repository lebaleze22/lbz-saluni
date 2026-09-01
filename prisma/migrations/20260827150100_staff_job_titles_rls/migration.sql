-- RLS pour staff_job_titles — même lecture/écriture que staff/job_titles
-- (docs/architecture/013-job-title-vs-system-role.md, resserré par
-- docs/architecture/014-decouplage-rls-auth-provider.md) : lecture Director+Owner,
-- écriture Owner uniquement. Pas de policies restore/select_deleted : cette table n'a
-- pas de isDeleted (voir migration de structure).
--
-- GRANT explicite à app_runtime : `grant ... on all tables in schema public` (posé par
-- 20260827140000_app_runtime_role_provisioning) ne s'applique qu'aux tables qui
-- existaient AU MOMENT du GRANT — jamais rétroactif aux tables créées ensuite. Sans
-- cette ligne, app_runtime n'aurait AUCUN privilège sur staff_job_titles (ni lecture, ni
-- écriture), quelle que soit la policy RLS.
alter table "staff_job_titles" enable row level security;
alter table "staff_job_titles" force row level security;

grant select, insert, update, delete on "staff_job_titles" to app_runtime;

create policy "staff_job_titles_select_tenant" on "staff_job_titles"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

create policy "staff_job_titles_write_admin" on "staff_job_titles"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner());
