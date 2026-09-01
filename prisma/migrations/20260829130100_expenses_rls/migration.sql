-- RLS pour expenses — même pattern que Partie 2
-- (docs/architecture/018-owner-director-parite-operationnelle.md) : lecture ET écriture
-- pour Director (is_salon_admin()) ET Owner (is_owner()), les deux rôles explicitement
-- listés sur CHAQUE policy (jamais d'accès implicite via combinaison OR d'une policy
-- FOR ALL). Pas de policy pour manager/staff (rôles non opérationnels à ce stade,
-- cf. docs/steps/Etape_01_Registre_Activite.md).
--
-- GRANT explicite à app_runtime : nécessaire pour toute table créée après le GRANT
-- initial (docs/architecture/015-staff-profil-et-postes-multiples.md point 6/7) — sans
-- cette ligne, app_runtime n'aurait aucun privilège sur expenses.
alter table "expenses" enable row level security;
alter table "expenses" force row level security;

grant select, insert, update, delete on "expenses" to app_runtime;

create policy "expenses_select_tenant" on "expenses"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

create policy "expenses_write_admin" on "expenses"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

create policy "expenses_restore_admin" on "expenses"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

create policy "expenses_select_deleted_admin" on "expenses"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);
