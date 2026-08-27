-- RLS pour job_titles + resserrement des policies staff.
-- Voir docs/architecture/013-job-title-vs-system-role.md.
--
-- job_titles suit exactement la même forme que staff (4 policies : select_tenant,
-- write_admin, restore_admin, select_deleted_admin — pattern posé par
-- 00000000000001_rls_policies puis 20260821130000_soft_delete_restore_policy) :
--   - Lecture (select_tenant)      : réservée à Director (is_salon_admin()), pas à
--     tout le tenant — ni job_titles ni staff ne suivent ici le pattern générique
--     "*_select_tenant ouvert à tout authenticated" des autres tables (clients,
--     services...). Un intitulé de poste ou une fiche staff (taux de commission,
--     etc.) n'a pas besoin d'être visible par un compte manager/staff au MVP.
--   - Écriture (write_admin/restore_admin/select_deleted_admin) : réservée à Owner
--     (is_owner()), plus à Director. Gérer la liste des intitulés de poste ou la
--     fiche d'un membre du staff (y compris lui accorder un systemRole, donc
--     l'éligibilité à un compte) est une décision d'approbation globale, pas une
--     tâche opérationnelle quotidienne — cohérent avec le rôle Owner défini en
--     docs/architecture/012-role-owner.md.
--
-- On modifie les policies staff existantes via ALTER POLICY (jamais DROP/CREATE),
-- même précaution que 20260821120001_soft_delete_rls_filtering : la table ne reste
-- jamais sans policy active, même le temps d'une transaction.

-- ---------------------------------------------------------------------------
-- staff — resserrement : lecture Director-only (au lieu de tout le tenant),
-- écriture Owner-only (au lieu de salon_admin).
-- ---------------------------------------------------------------------------
alter policy "staff_select_tenant" on "staff"
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

alter policy "staff_write_admin" on "staff"
  using (tenant_id = public.current_tenant_id() and public.is_owner() and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

alter policy "staff_restore_admin" on "staff"
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner() and not is_deleted);

alter policy "staff_select_deleted_admin" on "staff"
  using (tenant_id = public.current_tenant_id() and public.is_owner() and is_deleted);

-- ---------------------------------------------------------------------------
-- job_titles — même forme finale que staff ci-dessus, posée directement (table neuve,
-- pas de policy préexistante à faire évoluer).
-- ---------------------------------------------------------------------------
alter table "job_titles" enable row level security;

create policy "job_titles_select_tenant" on "job_titles"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

create policy "job_titles_write_admin" on "job_titles"
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner() and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and public.is_owner());

create policy "job_titles_restore_admin" on "job_titles"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner())
  with check (tenant_id = public.current_tenant_id() and public.is_owner() and not is_deleted);

create policy "job_titles_select_deleted_admin" on "job_titles"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_owner() and is_deleted);
