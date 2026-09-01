-- Parité complète Owner/Director sur les tables opérationnelles : appointments,
-- appointment_services, payments, services. Voir
-- docs/architecture/018-owner-director-parite-operationnelle.md.
--
-- Deux changements distincts par table, tous deux rendus explicites sur CHAQUE policy
-- (jamais d'accès implicite via combinaison OR d'une policy FOR ALL — même erreur déjà
-- corrigée pour staff/job_titles dans la migration
-- 20260826180000_staff_job_titles_select_owner_explicit) :
--
-- 1. Lecture (*_select_tenant) : AVANT cette migration, ouverte à tout le tenant, sans
--    aucune condition de rôle (vérifié directement via pg_policies avant d'écrire cette
--    migration, pas supposé). Resserrée à Director+Owner
--    (`is_salon_admin() or is_owner()`) — changement de comportement réel et assumé,
--    demandé explicitement, pas une correction d'un état halluciné.
-- 2. Écriture (*_write_admin, *_restore_admin, *_select_deleted_admin) : AVANT,
--    is_salon_admin() uniquement. Étendue à `is_salon_admin() or is_owner()` — les DEUX
--    rôles gardent un accès complet ("parité complète"), à la différence du pattern
--    staff/job_titles où Owner remplace Director en écriture (Director n'y garde que la
--    lecture). Ici, Director ne perd rien ; Owner gagne la même capacité complète.
--
-- On modifie les policies existantes via ALTER POLICY (jamais DROP/CREATE), même
-- précaution que 20260821120001_soft_delete_rls_filtering : la table ne reste jamais
-- sans policy active, même le temps d'une transaction.

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
alter policy "appointments_select_tenant" on "appointments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "appointments_write_admin" on "appointments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

alter policy "appointments_restore_admin" on "appointments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "appointments_select_deleted_admin" on "appointments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);

-- ---------------------------------------------------------------------------
-- appointment_services
-- ---------------------------------------------------------------------------
alter policy "appointment_services_select_tenant" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "appointment_services_write_admin" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

alter policy "appointment_services_restore_admin" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "appointment_services_select_deleted_admin" on "appointment_services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
alter policy "payments_select_tenant" on "payments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "payments_write_admin" on "payments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

alter policy "payments_restore_admin" on "payments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "payments_select_deleted_admin" on "payments"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
alter policy "services_select_tenant" on "services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "services_write_admin" on "services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

alter policy "services_restore_admin" on "services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "services_select_deleted_admin" on "services"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);
