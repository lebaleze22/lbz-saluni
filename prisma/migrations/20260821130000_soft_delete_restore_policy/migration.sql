-- Policy de restauration RLS pour les lignes soft-deleted (isDeleted true -> false).
--
-- Contexte (voir docs/architecture/008-soft-delete-active-vs-is-deleted.md) : depuis la
-- migration 20260821120001, le USING de chaque policy "*_write_admin" filtre
-- `not is_deleted`. Une fois `is_deleted = true`, plus aucune session `authenticated`
-- (même salon_admin) ne peut cibler la ligne par UPDATE — y compris pour la restaurer.
--
-- Cette migration ajoute, pour les 6 tables qui portent une policy "*_write_admin"
-- (staff, clients, services, appointments, appointment_services, payments), DEUX
-- nouvelles policies par table :
--
--   1. "*_restore_admin" (UPDATE) :
--      - USING ne vérifie QUE tenant_id + is_salon_admin() (pas is_deleted, puisque la
--        ligne ciblée EST soft-deleted par définition dans ce cas d'usage) ;
--      - WITH CHECK exige que la ligne résultante ait is_deleted = false, pour qu'un
--        salon_admin ne puisse pas se servir de cette policy pour autre chose qu'une
--        restauration (ex. re-poser is_deleted = true ne satisferait pas ce CHECK).
--
--   2. "*_select_deleted_admin" (SELECT) :
--      - Nécessaire pour que la policy UPDATE ci-dessus fonctionne du tout. Postgres
--        RLS, pour une commande UPDATE, exige que la ligne ciblée passe à la fois le
--        USING d'une policy applicable à UPDATE ET le USING d'une policy applicable à
--        SELECT (la commande UPDATE a besoin de "voir" la ligne pour la modifier) — les
--        deux sont combinés par AND, pas seulement le USING de la policy UPDATE.
--        Vérifié empiriquement en isolant les policies une à une (une policy UPDATE
--        avec `using (true) / with check (true)`, seule, sans aucune policy SELECT
--        permissive sur la table, bloque déjà 100% des UPDATE pour le rôle
--        `authenticated` : rowCount = 0 systématiquement) : sans cette policy SELECT
--        dédiée aux lignes supprimées, "*_restore_admin" est inopérante, quelle que
--        soit sa propre définition. Ce n'est pas documenté explicitement dans un
--        paragraphe unique de la doc PostgreSQL sur CREATE POLICY, d'où la nécessité de
--        le vérifier par le test end-to-end (voir tests/rls/tenant-isolation.test.ts).
--      - Portée volontairement étroite : ne révèle les lignes soft-deleted qu'au
--        salon_admin de LEUR PROPRE tenant (tenant_id + is_salon_admin() + is_deleted).
--        Un staff/manager ne voit toujours aucune ligne supprimée (pas de policy SELECT
--        qui le permette) ; un salon_admin d'un autre tenant non plus (tenant_id ne
--        correspond pas). Effet de bord assumé : un salon_admin peut désormais aussi
--        lister/lire ses propres lignes soft-deleted via un SELECT direct (pas
--        seulement les cibler pour restauration) — cohérent avec l'objectif d'une
--        future UI de restauration ("corbeille"), qui aura besoin de lister les lignes
--        supprimées avant de proposer de les restaurer une à une.
--
-- Les policies "*_write_admin" existantes ne sont PAS modifiées : elles continuent de
-- gérer l'INSERT/UPDATE/DELETE normal sur une ligne vivante (is_deleted = false), avec
-- le même comportement qu'avant cette migration.
--
-- Limite connue (documentée en détail dans l'ADR 008) : Postgres combine par OR les
-- USING (et, séparément, les WITH CHECK) des policies permissives applicables à une même
-- commande. Le WITH CHECK de "*_write_admin" n'a jamais filtré sur is_deleted (il ne
-- vérifie que tenant_id + is_salon_admin) ; une fois qu'une ligne devient candidate via
-- le USING de la policy de restauration, le WITH CHECK final est la disjonction de TOUS
-- les WITH CHECK des policies UPDATE-applicables, y compris celui de "*_write_admin" qui
-- n'impose aucune contrainte sur les autres colonnes. RLS seul ne peut donc pas garantir
-- qu'une restauration ne modifie QUE isDeleted/deletedAt : cette contrainte reste une
-- responsabilité applicative (futur endpoint dédié de restauration), hors scope de
-- cette migration.
--
-- Tables hors scope, volontairement : "tenants" n'a aucune policy d'écriture exposée au
-- rôle authenticated (onboarding via service_role uniquement, cf. migration
-- 00000000000001_rls_policies) — rien à restaurer côté RLS applicative. "users" n'a que
-- "users_update_self" (auto-service, sans vérification is_salon_admin, ni notion de
-- restauration par un tiers) — un salon_admin ne peut pas y restaurer la ligne d'un
-- autre utilisateur, et ce n'est pas dans le périmètre de cette tâche.

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
create policy "staff_select_deleted_admin" on "staff"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "staff_restore_admin" on "staff"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create policy "clients_select_deleted_admin" on "clients"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "clients_restore_admin" on "clients"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------
create policy "services_select_deleted_admin" on "services"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "services_restore_admin" on "services"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------------
create policy "appointments_select_deleted_admin" on "appointments"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "appointments_restore_admin" on "appointments"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- appointment_services
-- ---------------------------------------------------------------------------
create policy "appointment_services_select_deleted_admin" on "appointment_services"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "appointment_services_restore_admin" on "appointment_services"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create policy "payments_select_deleted_admin" on "payments"
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin() and is_deleted);

create policy "payments_restore_admin" on "payments"
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_salon_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_salon_admin() and not is_deleted);
