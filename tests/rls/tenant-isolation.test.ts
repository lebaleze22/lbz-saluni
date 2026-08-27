/**
 * Test d'isolation multi-tenant — Row-Level Security.
 *
 * Ce test s'exécute contre une VRAIE instance Supabase (pas un mock) : il crée deux
 * tenants, deux utilisateurs salon_admin réels et un utilisateur owner (tenant A,
 * cf. docs/architecture/012-role-owner.md) via l'API admin, seed des données sous un
 * seul tenant, puis vérifie que les policies RLS isolent effectivement les tenants — en
 * passant par le VRAI chemin applicatif : Prisma (rôle Postgres `app_runtime`, réellement
 * soumis à RLS depuis docs/architecture/014-decouplage-rls-auth-provider.md) +
 * `withRlsSession()` (lib/db/rls-session.ts), exactement ce qu'utilisent
 * lib/db/register.ts et lib/db/reports.ts en production.
 *
 * Avant cette tâche, ce test interrogeait directement PostgREST via supabase-js
 * (`sessionX.from("table").select(...)`) — un chemin que l'application elle-même
 * n'emprunte jamais. Depuis le découplage RLS de `auth.uid()`
 * (docs/architecture/014-*.md), ce chemin PostgREST ne peut plus fonctionner : il n'a
 * aucun moyen de positionner les variables de session `app.tenant_id`/`app.role` que
 * lisent désormais les fonctions RLS. D'où cette migration vers le chemin réel.
 *
 * La vérification JWT reste réelle : chaque utilisateur se connecte via
 * `signInWithPassword` (vrai mot de passe, vrai JWT Supabase), puis ce JWT est vérifié
 * via `supabase.auth.getUser(accessToken)` — la même vérification cryptographique que
 * `resolveRlsIdentity()` fait en production via `getUser()` (sans argument, lu depuis les
 * cookies Next.js). Le seul écart avec la production est le mécanisme de transport du
 * JWT (argument explicite ici, cookies dans une vraie requête Next.js) — pas la
 * vérification elle-même.
 *
 * Volontairement séparé du reste de la suite de tests (voir vitest.rls.config.ts et le
 * script npm `test:rls`) : il a des effets de bord réels sur une base Supabase et ne
 * doit jamais tourner par défaut dans `npm test` / CI générique.
 *
 * Prérequis : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, ADMIN_DATABASE_URL et DIRECT_URL renseignés
 * (.env) et pointant vers un projet Supabase de test (jamais la prod) sur lequel les
 * migrations Prisma ont été appliquées.
 * Voir docs/architecture/007-verification-isolation-rls.md et
 * docs/architecture/014-decouplage-rls-auth-provider.md.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withRlsSession } from "../../lib/db/rls-session";
import { adminPrisma } from "../../lib/admin-prisma";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasEnv = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SERVICE_ROLE_KEY &&
  process.env.DATABASE_URL &&
  process.env.ADMIN_DATABASE_URL,
);

if (!hasEnv) {
  // eslint-disable-next-line no-console
  console.warn(
    "[tests/rls] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / " +
      "SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL / ADMIN_DATABASE_URL manquants — test " +
      "d'isolation RLS ignoré. Voir docs/architecture/007-verification-isolation-rls.md " +
      "et docs/architecture/014-decouplage-rls-auth-provider.md pour l'exécuter.",
  );
}

const runId = crypto.randomUUID().slice(0, 8);
const TEST_PASSWORD = `Rls-Test-${crypto.randomUUID()}`;

type Row = { id: string; [key: string]: unknown };

describe.skipIf(!hasEnv)("Isolation multi-tenant RLS — Étape 1", () => {
  let admin: SupabaseClient;

  let tenantA: Row;
  let tenantB: Row;
  let userA: { id: string; email: string };
  let userB: { id: string; email: string };
  let ownerA: { id: string; email: string };
  // Ids ré-authentifiés et re-vérifiés via un vrai JWT (voir signInAndVerify) — utilisés
  // pour ouvrir une vraie session RLS via withRlsSession(). En pratique identiques à
  // userA.id/userB.id/ownerA.id (auth.users.id = public.users.id dans ce schéma), mais
  // obtenus par une vraie vérification cryptographique, jamais réutilisés aveuglément.
  let userAAuthId: string;
  let userBAuthId: string;
  let ownerAAuthId: string;
  let clientA: Row;
  let serviceA: Row;
  let staffA: Row;
  let appointmentA: Row;
  let clientToRestoreOwnTenant: Row;
  let clientToRestoreCrossTenant: Row;

  async function createTestUser(
    tenantId: string,
    label: "tenant-a" | "tenant-b" | "tenant-a-owner",
    role: "salon_admin" | "owner",
  ) {
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
      role,
    });
    if (profileError) throw profileError;

    return { id: created.user.id, email };
  }

  /**
   * Connexion réelle (vrai mot de passe) + vérification réelle du JWT obtenu, via
   * `getUser(accessToken)` plutôt que `getUser()` sans argument (qui lit les cookies
   * Next.js, indisponibles ici) — même vérification cryptographique que
   * `resolveRlsIdentity()` en production, juste sans le transport par cookie.
   */
  async function signInAndVerify(email: string): Promise<string> {
    const client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: signInData, error: signInError } = await client.auth.signInWithPassword({
      email,
      password: TEST_PASSWORD,
    });
    if (signInError || !signInData.session) {
      throw signInError ?? new Error(`Échec de connexion pour ${email}`);
    }

    const { data: verified, error: verifyError } = await client.auth.getUser(
      signInData.session.access_token,
    );
    if (verifyError || !verified.user) {
      throw verifyError ?? new Error(`JWT invalide pour ${email}`);
    }

    return verified.user.id;
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

    // 2. Un salon_admin par tenant, et un owner supplémentaire sous tenant A (rôle
    // ajouté par docs/architecture/012-role-owner.md — cf. tests plus bas).
    userA = await createTestUser(tenantA.id, "tenant-a", "salon_admin");
    userB = await createTestUser(tenantB.id, "tenant-b", "salon_admin");
    ownerA = await createTestUser(tenantA.id, "tenant-a-owner", "owner");

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

    // 4. Vraies connexions + vraie vérification JWT, une par utilisateur.
    userAAuthId = await signInAndVerify(userA.email);
    userBAuthId = await signInAndVerify(userB.email);
    ownerAAuthId = await signInAndVerify(ownerA.email);
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
    if (ownerA?.id) await admin.auth.admin.deleteUser(ownerA.id).catch(() => {});
  }, 30_000);

  it("un utilisateur de tenant B lisant les clients de tenant A obtient un résultat vide, pas une erreur", async () => {
    const clients = await withRlsSession(
      (tx) => tx.client.findMany({ where: { id: clientA.id } }),
      userBAuthId,
    );
    expect(clients).toEqual([]);
  });

  it("un utilisateur de tenant B lisant les services de tenant A obtient un résultat vide, pas une erreur", async () => {
    const services = await withRlsSession(
      (tx) => tx.service.findMany({ where: { id: serviceA.id } }),
      userBAuthId,
    );
    expect(services).toEqual([]);
  });

  it("un utilisateur de tenant B lisant les appointments de tenant A obtient un résultat vide, pas une erreur", async () => {
    const appointments = await withRlsSession(
      (tx) => tx.appointment.findMany({ where: { id: appointmentA.id } }),
      userBAuthId,
    );
    expect(appointments).toEqual([]);
  });

  it("un utilisateur de tenant B ne peut pas insérer un payment sur une ligne de tenant A (bloqué par Postgres, pas par l'app)", async () => {
    // Le rejet doit venir de Postgres (violation de policy RLS), pas d'une validation
    // applicative : on vérifie que la promesse est rejetée ET que le message Postgres
    // sous-jacent mentionne bien la RLS.
    await expect(
      withRlsSession(
        (tx) =>
          tx.payment.create({
            data: {
              tenantId: tenantA.id, // tentative d'écriture directe dans le tenant A
              appointmentId: appointmentA.id,
              amount: 5000,
              method: "cash",
            },
          }),
        userBAuthId,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("(contrôle) un utilisateur de tenant A voit bien ses propres données", async () => {
    const [clients, services, appointments] = await withRlsSession(
      (tx) =>
        Promise.all([
          tx.client.findMany({ where: { id: clientA.id } }),
          tx.service.findMany({ where: { id: serviceA.id } }),
          tx.appointment.findMany({ where: { id: appointmentA.id } }),
        ]),
      userAAuthId,
    );

    expect(clients).toHaveLength(1);
    expect(clients[0]?.id).toBe(clientA.id);
    expect(services).toHaveLength(1);
    expect(appointments).toHaveLength(1);
  });

  it("(analyse complémentaire, non demandée explicitement) un payment de tenant B ne peut pas référencer un appointment de tenant A", async () => {
    // Ce test va au-delà de la demande initiale : il vérifie que même en respectant
    // son propre tenant_id (ce qui satisfait la policy RLS "with check"), un
    // utilisateur ne peut pas lier un payment de SON tenant à un appointment
    // appartenant à un AUTRE tenant. Les policies RLS actuelles ne valident que
    // `tenant_id = current_tenant_id()` sur la table payments elle-même — elles ne
    // vérifient pas que appointment_id référence bien un appointment du même tenant.
    // Gap confirmé par exécution réelle, non corrigé (voir
    // docs/architecture/007-verification-isolation-rls.md) : ce test échoue
    // volontairement, c'est le seul échec attendu de cette suite.
    let created: { id: string } | null = null;
    let rejected = false;
    try {
      created = await withRlsSession(
        (tx) =>
          tx.payment.create({
            data: {
              tenantId: tenantB.id, // respecte la policy RLS de payments...
              appointmentId: appointmentA.id, // ...mais pointe vers un appointment de tenant A
              amount: 5000,
              method: "cash",
            },
            select: { id: true },
          }),
        userBAuthId,
      );
    } catch {
      rejected = true;
    }

    if (created) {
      // Nettoyage immédiat si l'insertion a réussi, pour ne pas polluer tenant B.
      await adminPrisma.payment.delete({ where: { id: created.id } });
    }

    expect(rejected).toBe(true);
  });

  it("un salon_admin de tenant A peut restaurer sa propre ligne soft-deleted (is_deleted true -> false)", async () => {
    const restored = await withRlsSession(
      (tx) =>
        tx.client.update({
          where: { id: clientToRestoreOwnTenant.id },
          data: { isDeleted: false },
          select: { id: true, isDeleted: true },
        }),
      userAAuthId,
    );

    expect(restored.isDeleted).toBe(false);
  });

  it("un salon_admin de tenant B ne peut pas restaurer une ligne soft-deleted appartenant à tenant A", async () => {
    // Contrairement à PostgREST (qui renvoie data: [], error: null pour un UPDATE qui ne
    // matche aucune ligne), Prisma attend qu'une seule ligne corresponde à `where` et
    // lève une erreur (P2025 "Record to update not found") si RLS en filtre 0 — c'est
    // le même refus, exprimé différemment par la couche client.
    await expect(
      withRlsSession(
        (tx) =>
          tx.client.update({
            where: { id: clientToRestoreCrossTenant.id },
            data: { isDeleted: false },
          }),
        userBAuthId,
      ),
    ).rejects.toThrow();

    // Contrôle : la ligne de tenant A reste bien soft-deleted, inchangée par la
    // tentative de tenant B.
    const stillDeleted = await adminPrisma.client.findUniqueOrThrow({
      where: { id: clientToRestoreCrossTenant.id },
      select: { isDeleted: true },
    });
    expect(stillDeleted.isDeleted).toBe(true);
  });

  it("un owner de tenant A peut lire les données de son propre tenant (clients/services/appointments)", async () => {
    // Rôle 'owner' ajouté par docs/architecture/012-role-owner.md. Les policies
    // "*_select_tenant" ne filtrent que sur tenant_id (pas sur le rôle) : un owner en
    // hérite donc au même titre qu'un salon_admin, sans policy dédiée — vérifié ici par
    // exécution réelle, pas seulement par lecture du SQL.
    const [clients, services, appointments] = await withRlsSession(
      (tx) =>
        Promise.all([
          tx.client.findMany({ where: { id: clientA.id } }),
          tx.service.findMany({ where: { id: serviceA.id } }),
          tx.appointment.findMany({ where: { id: appointmentA.id } }),
        ]),
      ownerAAuthId,
    );

    expect(clients).toHaveLength(1);
    expect(services).toHaveLength(1);
    expect(appointments).toHaveLength(1);
  });

  it("un owner de tenant A ne peut pas lire les utilisateurs de tenant B", async () => {
    const users = await withRlsSession(
      (tx) => tx.user.findMany({ where: { id: userB.id } }),
      ownerAAuthId,
    );
    expect(users).toEqual([]);
  });
});
