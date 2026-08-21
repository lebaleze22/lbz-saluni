/**
 * Test d'isolation multi-tenant — Row-Level Security.
 *
 * Ce test s'exécute contre une VRAIE instance Supabase (pas un mock) : il crée deux
 * tenants et deux utilisateurs salon_admin réels via l'API admin, seed des données
 * sous un seul tenant, puis ouvre de vraies sessions authentifiées (JWT "authenticated")
 * pour vérifier que les policies RLS de prisma/migrations/00000000000001_rls_policies/
 * isolent effectivement les tenants — pas seulement en théorie SQL, mais via le même
 * chemin (PostgREST + JWT) que l'application utilisera en production.
 *
 * Volontairement séparé du reste de la suite de tests (voir vitest.rls.config.ts et le
 * script npm `test:rls`) : il a des effets de bord réels sur une base Supabase et ne
 * doit jamais tourner par défaut dans `npm test` / CI générique.
 *
 * Prérequis : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et
 * SUPABASE_SERVICE_ROLE_KEY renseignés (.env) et pointant vers un projet Supabase de
 * test (jamais la prod) sur lequel les migrations Prisma ont été appliquées.
 * Voir docs/architecture/007-verification-isolation-rls.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasEnv = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SERVICE_ROLE_KEY);

if (!hasEnv) {
  // eslint-disable-next-line no-console
  console.warn(
    "[tests/rls] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / " +
      "SUPABASE_SERVICE_ROLE_KEY manquants — test d'isolation RLS ignoré. " +
      "Voir docs/architecture/007-verification-isolation-rls.md pour l'exécuter.",
  );
}

const runId = crypto.randomUUID().slice(0, 8);
const TEST_PASSWORD = `Rls-Test-${crypto.randomUUID()}`;

type Row = { id: string; [key: string]: unknown };

describe.skipIf(!hasEnv)("Isolation multi-tenant RLS — Étape 1", () => {
  let admin: SupabaseClient;
  let sessionA: SupabaseClient;
  let sessionB: SupabaseClient;

  let tenantA: Row;
  let tenantB: Row;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let clientA: Row;
  let serviceA: Row;
  let staffA: Row;
  let appointmentA: Row;
  let clientToRestoreOwnTenant: Row;
  let clientToRestoreCrossTenant: Row;

  async function createSalonAdmin(tenantId: string, label: "tenant-a" | "tenant-b") {
    const email = `rls-test-${label}-${runId}@example.com`;

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createError || !created.user) {
      throw createError ?? new Error(`Échec de création de l'utilisateur ${label}`);
    }

    const { error: profileError } = await admin.from("users").insert({
      id: created.user.id,
      tenant_id: tenantId,
      email,
      full_name: `RLS Test ${label}`,
      role: "salon_admin",
    });
    if (profileError) throw profileError;

    return { id: created.user.id, email };
  }

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Deux tenants de test.
    const { data: tenants, error: tenantsError } = await admin
      .from("tenants")
      .insert([{ name: `rls-test-tenant-a-${runId}` }, { name: `rls-test-tenant-b-${runId}` }])
      .select();
    if (tenantsError || !tenants) throw tenantsError;
    tenantA = tenants.find((t) => (t.name as string).includes("tenant-a"))!;
    tenantB = tenants.find((t) => (t.name as string).includes("tenant-b"))!;

    // 2. Un salon_admin par tenant.
    userA = await createSalonAdmin(tenantA.id, "tenant-a");
    userB = await createSalonAdmin(tenantB.id, "tenant-b");

    // 3. Seed client + service + staff + appointment sous tenant A uniquement.
    const { data: seededClient, error: clientError } = await admin
      .from("clients")
      .insert({ tenant_id: tenantA.id, name: `RLS Test Client ${runId}` })
      .select()
      .single();
    if (clientError || !seededClient) throw clientError;
    clientA = seededClient;

    const { data: seededService, error: serviceError } = await admin
      .from("services")
      .insert({
        tenant_id: tenantA.id,
        name: `RLS Test Service ${runId}`,
        default_price: 5000,
      })
      .select()
      .single();
    if (serviceError || !seededService) throw serviceError;
    serviceA = seededService;

    // staff requis par appointments.staff_id (NOT NULL) — pas dans la liste demandée
    // explicitement mais indispensable pour insérer un appointment valide.
    const { data: seededStaff, error: staffError } = await admin
      .from("staff")
      .insert({ tenant_id: tenantA.id, name: `RLS Test Staff ${runId}` })
      .select()
      .single();
    if (staffError || !seededStaff) throw staffError;
    staffA = seededStaff;

    const { data: seededAppointment, error: appointmentError } = await admin
      .from("appointments")
      .insert({
        tenant_id: tenantA.id,
        client_id: clientA.id,
        staff_id: staffA.id,
        created_by: userA.id,
        source: "walk_in",
        start_time: new Date().toISOString(),
      })
      .select()
      .single();
    if (appointmentError || !seededAppointment) throw appointmentError;
    appointmentA = seededAppointment;

    // 3bis. Deux clients déjà soft-deleted sous tenant A (via service_role, qui
    // contourne RLS), pour les tests de restauration ci-dessous — un par test, pour ne
    // pas faire dépendre un test de l'état laissé par l'autre.
    const { data: seededRestoreClients, error: restoreClientsError } = await admin
      .from("clients")
      .insert([
        {
          tenant_id: tenantA.id,
          name: `RLS Test Client To Restore (own tenant) ${runId}`,
          is_deleted: true,
        },
        {
          tenant_id: tenantA.id,
          name: `RLS Test Client To Restore (cross tenant) ${runId}`,
          is_deleted: true,
        },
      ])
      .select();
    if (restoreClientsError || !seededRestoreClients) throw restoreClientsError;
    clientToRestoreOwnTenant = seededRestoreClients.find((c) =>
      (c.name as string).includes("own tenant"),
    )!;
    clientToRestoreCrossTenant = seededRestoreClients.find((c) =>
      (c.name as string).includes("cross tenant"),
    )!;

    // 4. Vraies sessions authentifiées (JWT "authenticated"), une par tenant.
    sessionA = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInAError } = await sessionA.auth.signInWithPassword({
      email: userA.email,
      password: TEST_PASSWORD,
    });
    if (signInAError) throw signInAError;

    sessionB = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: signInBError } = await sessionB.auth.signInWithPassword({
      email: userB.email,
      password: TEST_PASSWORD,
    });
    if (signInBError) throw signInBError;
  }, 30_000);

  afterAll(async () => {
    if (!admin) return;

    const tenantIds = [tenantA?.id, tenantB?.id].filter(Boolean) as string[];
    if (tenantIds.length) {
      // Enfants avant parents pour respecter les contraintes FK.
      await admin.from("payments").delete().in("tenant_id", tenantIds);
      await admin.from("appointment_services").delete().in("tenant_id", tenantIds);
      await admin.from("appointments").delete().in("tenant_id", tenantIds);
      await admin.from("clients").delete().in("tenant_id", tenantIds);
      await admin.from("services").delete().in("tenant_id", tenantIds);
      await admin.from("staff").delete().in("tenant_id", tenantIds);
      await admin.from("users").delete().in("tenant_id", tenantIds);
      await admin.from("tenants").delete().in("id", tenantIds);
    }

    // Suppression des comptes auth (non couverte par les deletes ci-dessus : public.users
    // n'a pas de FK vers auth.users dans ce schéma, cf. docs/architecture/005-*.md).
    if (userA?.id) await admin.auth.admin.deleteUser(userA.id).catch(() => {});
    if (userB?.id) await admin.auth.admin.deleteUser(userB.id).catch(() => {});
  }, 30_000);

  it("un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur", async () => {
    const { data, error } = await sessionB.from("clients").select("*").eq("id", clientA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur", async () => {
    const { data, error } = await sessionB.from("services").select("*").eq("id", serviceA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur", async () => {
    const { data, error } = await sessionB
      .from("appointments")
      .select("*")
      .eq("id", appointmentA.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A (bloqué par Postgres, pas par l'app)", async () => {
    const { data, error } = await sessionB
      .from("payments")
      .insert({
        tenant_id: tenantA.id, // tentative d'écriture directe dans le tenant A
        appointment_id: appointmentA.id,
        amount: 5000,
        method: "cash",
      })
      .select();

    // Le rejet doit venir de Postgres (violation de policy RLS), pas d'une validation
    // applicative : on vérifie qu'aucune ligne n'a été créée ET qu'une erreur Postgres
    // explicite est renvoyée.
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.message ?? "").toMatch(/row-level security/i);
  });

  it("(contrôle) un utilisateur de tenant A voit bien ses propres données", async () => {
    const [clients, services, appointments] = await Promise.all([
      sessionA.from("clients").select("*").eq("id", clientA.id),
      sessionA.from("services").select("*").eq("id", serviceA.id),
      sessionA.from("appointments").select("*").eq("id", appointmentA.id),
    ]);

    expect(clients.error).toBeNull();
    expect(clients.data).toHaveLength(1);
    expect(clients.data?.[0]?.id).toBe(clientA.id);

    expect(services.error).toBeNull();
    expect(services.data).toHaveLength(1);

    expect(appointments.error).toBeNull();
    expect(appointments.data).toHaveLength(1);
  });

  it("(analyse complémentaire, non demandée explicitement) un payment de tenant B ne peut pas référencer un appointment de tenant A", async () => {
    // Ce test va au-delà de la demande initiale : il vérifie que même en respectant
    // son propre tenant_id (ce qui satisfait la policy RLS "with check"), un
    // utilisateur ne peut pas lier un payment de SON tenant à un appointment
    // appartenant à un AUTRE tenant. Les policies RLS actuelles ne valident que
    // `tenant_id = current_tenant_id()` sur la table payments elle-même — elles ne
    // vérifient pas que appointment_id référence bien un appointment du même tenant.
    // Voir docs/architecture/007-verification-isolation-rls.md (limite identifiée à
    // la conception de ce test, non encore confirmée par exécution réelle).
    const { data, error } = await sessionB
      .from("payments")
      .insert({
        tenant_id: tenantB.id, // respecte la policy RLS de payments...
        appointment_id: appointmentA.id, // ...mais pointe vers un appointment de tenant A
        amount: 5000,
        method: "cash",
      })
      .select();

    if (!error && data && data.length > 0) {
      // Nettoyage immédiat si l'insertion a réussi, pour ne pas polluer tenant B.
      await admin
        .from("payments")
        .delete()
        .eq("id", (data[0] as Row).id);
    }

    expect(error).not.toBeNull();
  });

  it("un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted (is_deleted true -> false)", async () => {
    const { data, error } = await sessionA
      .from("clients")
      .update({ is_deleted: false })
      .eq("id", clientToRestoreOwnTenant.id)
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect((data?.[0] as Row).is_deleted).toBe(false);
  });

  it("un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A", async () => {
    const { data, error } = await sessionB
      .from("clients")
      .update({ is_deleted: false })
      .eq("id", clientToRestoreCrossTenant.id)
      .select();

    // Bloqué par la policy RLS "clients_restore_admin" (tenant_id ne correspond pas) :
    // aucune ligne ciblée, donc aucune erreur — un update qui matche 0 ligne n'est pas
    // un échec au sens de Postgres, cf. les autres tests de lecture cross-tenant.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    // Contrôle : la ligne de tenant A reste bien soft-deleted, inchangée par la
    // tentative de tenant B.
    const { data: stillDeleted, error: checkError } = await admin
      .from("clients")
      .select("is_deleted")
      .eq("id", clientToRestoreCrossTenant.id)
      .single();
    expect(checkError).toBeNull();
    expect(stillDeleted?.is_deleted).toBe(true);
  });
});
