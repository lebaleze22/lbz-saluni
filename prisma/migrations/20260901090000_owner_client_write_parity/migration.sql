-- Le registre Owner crée ou complète un Client avant de créer la visite. La migration
-- de parité opérationnelle 20260829120000 avait couvert appointments,
-- appointment_services, payments et services, mais pas cette première table du même
-- parcours. L'UI et requireAdminMember() autorisaient donc Owner, puis RLS rejetait
-- l'écriture du client.

alter policy "clients_write_admin" on "clients"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted)
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()));

alter policy "clients_restore_admin" on "clients"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()))
  with check (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and not is_deleted);

alter policy "clients_select_deleted_admin" on "clients"
  using (tenant_id = public.current_tenant_id() and (public.is_salon_admin() or public.is_owner()) and is_deleted);
