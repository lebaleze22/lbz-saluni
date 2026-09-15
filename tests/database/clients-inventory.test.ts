import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { adminPrisma } from "../../lib/admin-prisma";
import { prisma } from "../../lib/prisma";
import { requireAdminMember } from "../../lib/db/auth";
import { runInTenantTransaction } from "../../lib/db/rls-session";
import { createRegisterEntry, getRegisterPageData } from "../../lib/db/register";
import {
  saveClient,
  changeClientStatus,
  getClientDetail,
  getClientsPageData,
} from "../../lib/db/clients";
import {
  createProduct,
  moveStock,
  changeProductStatus,
  updateProduct,
  saveServiceProduct,
  getInventoryPageData,
} from "../../lib/db/inventory";
import { recordStockChange } from "../../lib/db/stock";
import { registerEntrySchema } from "../../lib/validation/register";
import { clientFiltersSchema } from "../../lib/validation/clients";
import { inventoryFiltersSchema } from "../../lib/validation/inventory";
import { addCalendarDays, startOfDoualaDay, todayInDouala } from "../../lib/dates";
import { importClients, exportClients } from "../../lib/db/client-transfer";
import { addClientActivity } from "../../lib/db/client-activities";
import { createRetailSale, getRetailReceipt } from "../../lib/db/retail";
import { getReportData } from "../../lib/db/reports";
import { importInventory } from "../../lib/db/inventory-transfer";
import {
  changeAppointmentStatus,
  completeAppointment,
  createAppointment,
  getAppointment,
  getCalendarData,
  recordAppointmentPayment,
} from "../../lib/db/appointments";
import { calendarFiltersSchema } from "../../lib/validation/appointments";

// Only HTTP/cookie identity transport is replaced. All queries, transactions,
// constraints and RLS below execute against real PostgreSQL as app_runtime.
vi.mock("../../lib/db/auth", () => ({
  requireAdminMember: vi.fn(),
  AccessDeniedError: class AccessDeniedError extends Error {},
}));

if (process.env.SALUNI_DISPOSABLE_TEST !== "1") throw new Error("Disposable QA runner required.");

type Member = Awaited<ReturnType<typeof requireAdminMember>>;
let memberA: Member;
let memberB: Member;
let serviceId: string;
let secondServiceId: string;
const tenantIds: string[] = [];
const identity = (member: Member) => ({
  userId: member.id,
  tenantId: member.tenantId,
  role: member.role,
});
const productFields = (name = crypto.randomUUID()) => ({
  name,
  sku: undefined,
  unit: "ml" as const,
  costPrice: 10,
  salePrice: 20,
  lowStockThreshold: "2.000",
});

function visit(clientName: string, extra: Record<string, unknown> = {}) {
  return registerEntrySchema.parse({
    clientName,
    staffId: memberA.staffProfile.id,
    source: "walk_in",
    startTime: new Date(),
    services: [{ serviceId, price: 1000 }],
    paymentAmount: 1000,
    paymentMethod: "cash",
    ...extra,
  });
}

async function member(label: string): Promise<Member> {
  const tenant = await adminPrisma.tenant.create({
    data: { name: `qa-${label}-${crypto.randomUUID()}` },
  });
  tenantIds.push(tenant.id);
  const user = await adminPrisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `${crypto.randomUUID()}@qa.invalid`,
      fullName: `QA ${label}`,
      role: "owner",
    },
  });
  const staffProfile = await adminPrisma.staff.create({
    data: { tenantId: tenant.id, userId: user.id, name: `QA ${label}`, systemRole: "manager" },
  });
  return { ...user, tenant, staffProfile };
}

beforeAll(async () => {
  memberA = await member("A");
  memberB = await member("B");
  const service = await adminPrisma.service.create({
    data: { tenantId: memberA.tenantId, name: "QA first service", defaultPrice: 1000 },
  });
  const second = await adminPrisma.service.create({
    data: { tenantId: memberA.tenantId, name: "QA second service", defaultPrice: 1000 },
  });
  serviceId = service.id;
  secondServiceId = second.id;
});

beforeEach(async () => {
  vi.mocked(requireAdminMember).mockResolvedValue(memberA);
  await adminPrisma.serviceProduct.deleteMany({ where: { tenantId: { in: tenantIds } } });
});

afterAll(async () => {
  if (tenantIds.length) {
    const where = { tenantId: { in: tenantIds } };
    await adminPrisma.retailSale.deleteMany({ where });
    await adminPrisma.stockMovement.deleteMany({ where });
    await adminPrisma.clientActivity.deleteMany({ where });
    await adminPrisma.serviceProduct.deleteMany({ where });
    await adminPrisma.product.deleteMany({ where });
    await adminPrisma.payment.deleteMany({ where });
    await adminPrisma.appointmentService.deleteMany({ where });
    await adminPrisma.appointment.deleteMany({ where });
    await adminPrisma.client.deleteMany({ where });
    await adminPrisma.service.deleteMany({ where });
    await adminPrisma.staff.deleteMany({ where });
    await adminPrisma.user.deleteMany({ where });
    await adminPrisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
  await Promise.all([adminPrisma.$disconnect(), prisma.$disconnect()]);
});

describe("database role and tenant boundaries", () => {
  it("uses an actual non-superuser, non-bypass role", async () => {
    const roles = await prisma.$queryRaw<
      { rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(roles).toEqual([{ rolsuper: false, rolbypassrls: false }]);
  });
  it("isolates products and rejects cross-tenant recipe foreign keys", async () => {
    const product = await createProduct({ ...productFields(), initialStock: "1.000" });
    const otherService = await adminPrisma.service.create({
      data: { tenantId: memberB.tenantId, name: "B service", defaultPrice: 1000 },
    });
    expect(
      await runInTenantTransaction(identity(memberB), (tx) =>
        tx.product.findMany({ where: { id: product.id } }),
      ),
    ).toEqual([]);
    await expect(
      runInTenantTransaction(identity(memberB), (tx) =>
        tx.serviceProduct.create({
          data: {
            tenantId: memberB.tenantId,
            serviceId: otherService.id,
            productId: product.id,
            quantity: "1",
          },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      runInTenantTransaction(identity(memberB), (tx) =>
        tx.product.create({ data: { tenantId: memberA.tenantId, name: "Forbidden" } }),
      ),
    ).rejects.toThrow();
  });
  it("rejects a foreign client in the real register path", async () => {
    const foreign = await adminPrisma.client.create({
      data: { tenantId: memberB.tenantId, name: "Foreign client" },
    });
    await expect(
      createRegisterEntry(visit("Foreign client", { clientId: foreign.id })),
    ).rejects.toThrow("introuvable");
    expect(await getClientDetail(foreign.id)).toBeNull();
  });
});

describe("client management and stable identity", () => {
  it("saves addresses and referral links, filters sources and preserves archived dossiers", async () => {
    const prefix = `Address-${crypto.randomUUID()}`;
    const referrer = await saveClient(null, { name: prefix + " Referrer" });
    const details = {
      name: prefix + " Client",
      city: "Douala",
      neighbourhood: "Bonapriso",
      addressDetails: "Rue 12",
      discoverySource: "recommendation" as const,
      discoveryDetails: "Conseil",
      referredByClientId: referrer.id,
    };
    const client = await saveClient(null, details);
    expect((await getClientDetail(client.id))?.client).toMatchObject({
      city: "Douala",
      neighbourhood: "Bonapriso",
      referredByClient: { id: referrer.id },
    });
    const filtered = await getClientsPageData(
      clientFiltersSchema.parse({ q: prefix, discoverySource: "recommendation" }),
    );
    expect(filtered.clients.map((row) => row.id)).toEqual([client.id]);
    await expect(
      saveClient(client.id, { ...details, referredByClientId: client.id }),
    ).rejects.toThrow();
    const foreign = await adminPrisma.client.create({
      data: { tenantId: memberB.tenantId, name: prefix + " Foreign" },
    });
    await expect(
      saveClient(client.id, { ...details, referredByClientId: foreign.id }),
    ).rejects.toThrow();
    await expect(
      importClients(
        [{ ...details, name: prefix + " Import", referredByClientId: foreign.id }],
        true,
      ),
    ).rejects.toThrow();
    await changeClientStatus(client.id, "archive");
    expect((await getClientDetail(client.id))?.client.city).toBe("Douala");
    const exported = await exportClients("archived");
    expect(exported.find((row) => row.name === details.name)).toMatchObject({
      city: "Douala",
      discoverySource: "recommendation",
      referredByClientId: referrer.id,
    });
    await changeClientStatus(client.id, "restore");
    await saveClient(client.id, {
      ...details,
      discoverySource: "search",
      referredByClientId: undefined,
    });
    expect((await getClientDetail(client.id))?.client.referredByClientId).toBeNull();
  });
  it("previews imports without writes, skips duplicates, preserves notes and scopes exports", async () => {
    const name = `Import ${crypto.randomUUID()}`;
    const original = await saveClient(null, { name, phone: "699223344", notes: "Keep me" });
    const inputs = [
      { name, phone: "+237699223344", notes: "Do not overwrite" },
      { name: name + " new", email: "import@qa.invalid" },
      { name: name + " new", email: "IMPORT@qa.invalid" },
    ];
    expect(await importClients(inputs, false)).toEqual({ total: 3, added: 1, skipped: 2 });
    expect(
      await adminPrisma.client.count({
        where: { tenantId: memberA.tenantId, name: name + " new" },
      }),
    ).toBe(0);
    expect(await importClients(inputs, true)).toEqual({ total: 3, added: 1, skipped: 2 });
    expect((await getClientDetail(original.id))?.client.notes).toBe("Keep me");
    expect(await importClients(inputs, true)).toEqual({ total: 3, added: 0, skipped: 3 });
    await changeClientStatus(original.id, "archive");
    expect((await exportClients("archived")).some((row) => row.name === name)).toBe(true);
    expect((await exportClients("active")).some((row) => row.name === name)).toBe(false);
    await expect(importClients([{ name: "" }], true)).rejects.toThrow();
    vi.mocked(requireAdminMember).mockResolvedValue(memberB);
    expect((await exportClients("all")).some((row) => row.name.startsWith(name))).toBe(false);
  });
  it("records dated authored follow-up, preserves it when archived and isolates tenants", async () => {
    const client = await saveClient(null, { name: `Journal ${crypto.randomUUID()}` });
    const activity = await addClientActivity({
      clientId: client.id,
      kind: "consultation",
      body: "Conseils après prestation",
      occurredAt: new Date(),
    });
    const detail = await getClientDetail(client.id);
    expect(detail?.activities[0].author.fullName).toBe(memberA.fullName);
    expect(detail?.activityCount).toBe(1);
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.clientActivity.delete({ where: { id: activity.id } }),
      ),
    ).rejects.toThrow();
    await changeClientStatus(client.id, "archive");
    expect((await getClientDetail(client.id))?.activityCount).toBe(1);
    await expect(
      addClientActivity({ clientId: client.id, kind: "note", body: "No", occurredAt: new Date() }),
    ).rejects.toThrow("archivé");
    vi.mocked(requireAdminMember).mockResolvedValue(memberB);
    await expect(
      addClientActivity({ clientId: client.id, kind: "note", body: "No", occurredAt: new Date() }),
    ).rejects.toThrow("introuvable");
    expect(
      await runInTenantTransaction(identity(memberB), (tx) =>
        tx.clientActivity.findMany({ where: { id: activity.id } }),
      ),
    ).toEqual([]);
  });
  it("keeps namesakes separate using all four fields and reuses an exact match", async () => {
    const name = `Namesakes-${crypto.randomUUID()}`;
    const first = await saveClient(null, {
      name,
      phone: "699112233",
      email: "one@qa.invalid",
      sex: "femme",
    });
    const second = await saveClient(null, {
      name,
      phone: "699112233",
      email: "two@qa.invalid",
      sex: "femme",
    });
    const third = await saveClient(null, {
      name,
      phone: "699112233",
      email: "two@qa.invalid",
      sex: "homme",
    });
    const recorded = await createRegisterEntry(
      visit(name, { phone: "+237 699 11 22 33", email: "TWO@qa.invalid", sex: "femme" }),
    );
    expect(
      (await adminPrisma.appointment.findUniqueOrThrow({ where: { id: recorded.id } })).clientId,
    ).toBe(second.id);
    expect((await getClientDetail(first.id))?.visitCount).toBe(0);
    expect((await getClientDetail(third.id))?.visitCount).toBe(0);
    expect(await adminPrisma.client.count({ where: { tenantId: memberA.tenantId, name } })).toBe(3);
  });
  it("blocks normalized duplicates on creation and editing, including archived records", async () => {
    const name = `Duplicate ${crypto.randomUUID()}`;
    const input = {
      name,
      phone: "699112234",
      email: "duplicate@qa.invalid",
      sex: "femme" as const,
    };
    const first = await saveClient(null, input);
    const duplicate = {
      ...input,
      name: `  ${name.toUpperCase().replace(" ", "   ")}  `,
      phone: "00237 699-11-22-34",
      email: "DUPLICATE@qa.invalid",
    };
    await expect(saveClient(null, duplicate)).rejects.toThrow("existante");
    await saveClient(first.id, input);
    const other = await saveClient(null, { ...input, name: name + " other" });
    await expect(saveClient(other.id, duplicate)).rejects.toThrow("existante");
    await changeClientStatus(first.id, "archive");
    await expect(saveClient(null, duplicate)).rejects.toThrow("archivée");
    await expect(createRegisterEntry(visit(name, input))).rejects.toThrow("archivée");
    await changeClientStatus(first.id, "restore");
  });
  it("allows shared contacts for different names without mixing histories", async () => {
    const phone = "699112235";
    const prefix = crypto.randomUUID();
    const first = await saveClient(null, { name: prefix + " A", phone });
    const second = await saveClient(null, { name: prefix + " B", phone });
    const recorded = await createRegisterEntry(visit(prefix + " B", { phone }));
    expect(
      (await adminPrisma.appointment.findUniqueOrThrow({ where: { id: recorded.id } })).clientId,
    ).toBe(second.id);
    expect((await getClientDetail(first.id))?.visitCount).toBe(0);
  });
  it("requires explicit selection for an existing identity without contact details", async () => {
    const name = `No contact ${crypto.randomUUID()}`;
    const client = await saveClient(null, { name });
    await expect(saveClient(null, { name })).rejects.toThrow("existante");
    await expect(createRegisterEntry(visit(name))).rejects.toThrow("Sélectionnez");
    await createRegisterEntry(visit(name, { clientId: client.id }));
  });
  it("serializes simultaneous client creation and register submissions", async () => {
    const name = `Concurrent ${crypto.randomUUID()}`;
    const input = { name, phone: "699112236" };
    const results = await Promise.allSettled([saveClient(null, input), saveClient(null, input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await adminPrisma.client.count({ where: { tenantId: memberA.tenantId, name } })).toBe(1);
    const registerName = name + " register";
    await Promise.all([
      createRegisterEntry(visit(registerName, { phone: input.phone })),
      createRegisterEntry(visit(registerName, { phone: input.phone })),
    ]);
    expect(
      await adminPrisma.client.count({ where: { tenantId: memberA.tenantId, name: registerName } }),
    ).toBe(1);
  });
  it("archives without losing visit history and restores selection eligibility", async () => {
    const client = await saveClient(null, {
      name: "Archive history",
      notes: "Internal",
      preferences: "Morning",
      allergies: "Declared precaution",
    });
    await createRegisterEntry(visit("Archive history", { clientId: client.id }));
    await changeClientStatus(client.id, "archive");
    expect((await getClientDetail(client.id))?.visitCount).toBe(1);
    expect(
      (await getRegisterPageData(todayInDouala())).clients.some((row) => row.id === client.id),
    ).toBe(false);
    await expect(
      createRegisterEntry(visit("Archive history", { clientId: client.id })),
    ).rejects.toThrow("archivé");
    await changeClientStatus(client.id, "restore");
    await saveClient(client.id, { name: "Updated profile", preferences: "Evening" });
    const detail = await getClientDetail(client.id);
    expect(detail?.client).toMatchObject({
      name: "Updated profile",
      notes: null,
      preferences: "Evening",
      isDeleted: false,
    });
    expect(detail?.totalPaid).toBe(1000);
  });
  it("separates inactive, recent and never-visited clients", async () => {
    const prefix = `segment-${crypto.randomUUID()}`;
    const inactive = await saveClient(null, { name: `${prefix}-inactive` });
    const recent = await saveClient(null, { name: `${prefix}-recent` });
    const never = await saveClient(null, { name: `${prefix}-never` });
    await createRegisterEntry(
      visit(`${prefix}-inactive`, {
        clientId: inactive.id,
        startTime: startOfDoualaDay(addCalendarDays(todayInDouala(), -91)),
      }),
    );
    await createRegisterEntry(visit(`${prefix}-recent`, { clientId: recent.id }));
    for (const [segment, id] of [
      ["inactive", inactive.id],
      ["recent", recent.id],
      ["never", never.id],
    ]) {
      const data = await getClientsPageData(clientFiltersSchema.parse({ q: prefix, segment }));
      expect(data.clients.map((client) => client.id)).toEqual([id]);
    }
  });
});

describe("appointment calendar and visit conversion", () => {
  const scheduleInput = (clientId: string, staffId: string, startTime: Date) => ({
    clientId,
    clientName: "Scheduled client",
    staffId,
    startTime,
    durationMinutes: 60,
    services: [{ serviceId, price: 1500 }],
  });

  it("schedules day/week entries and rejects overlapping staff time", async () => {
    const client = await saveClient(null, { name: `Calendar ${crypto.randomUUID()}` });
    const date = addCalendarDays(todayInDouala(), 2);
    const start = new Date(`${date}T09:00:00+01:00`);
    const first = await createAppointment(scheduleInput(client.id, memberA.staffProfile.id, start));
    expect((await getAppointment(first.id))?.status).toBe("scheduled");
    await expect(
      createAppointment(
        scheduleInput(client.id, memberA.staffProfile.id, new Date(start.getTime() + 30 * 60_000)),
      ),
    ).rejects.toThrow("déjà un rendez-vous");
    const adjacent = await createAppointment(
      scheduleInput(client.id, memberA.staffProfile.id, new Date(start.getTime() + 60 * 60_000)),
    );
    const day = await getCalendarData(calendarFiltersSchema.parse({ date, view: "day" }));
    expect(day.appointments.map((row) => row.id)).toEqual([first.id, adjacent.id]);
    const week = await getCalendarData(
      calendarFiltersSchema.parse({ date, view: "week", status: "scheduled" }),
    );
    expect(week.appointments.map((row) => row.id)).toEqual(
      expect.arrayContaining([first.id, adjacent.id]),
    );
  });

  it("converts an arrived appointment into one paid visit with stock consumption", async () => {
    const client = await saveClient(null, { name: `Checkout ${crypto.randomUUID()}` });
    const product = await createProduct({ ...productFields(), initialStock: "2" });
    await saveServiceProduct(serviceId, product.id, "0.5");
    const date = addCalendarDays(todayInDouala(), 1);
    const appointment = await createAppointment(
      scheduleInput(client.id, memberA.staffProfile.id, new Date(`${date}T14:00:00+01:00`)),
    );
    await changeAppointmentStatus(appointment.id, "confirmed");
    await changeAppointmentStatus(appointment.id, "arrived");
    await completeAppointment(appointment.id, "orange_money");
    await completeAppointment(appointment.id, "orange_money");
    const stored = await adminPrisma.appointment.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(stored.status).toBe("completed");
    expect(stored.completedAt).not.toBeNull();
    expect(await adminPrisma.payment.count({ where: { appointmentId: appointment.id } })).toBe(1);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("1.5");
    const dossier = await getClientDetail(client.id);
    expect(dossier?.visitCount).toBe(1);
    expect(dossier?.appointmentCount).toBe(0);
    const report = await getReportData("week", date);
    expect(report.rows.some((row) => row.appointmentId === appointment.id)).toBe(true);
    expect(report.summary.appointmentOutcomes.completed).toBeGreaterThanOrEqual(1);
  });

  it("keeps booking status, payment and stock independent until checkout", async () => {
    const client = await saveClient(null, { name: `Paid booking ${crypto.randomUUID()}` });
    const product = await createProduct({ ...productFields(), initialStock: "2" });
    await saveServiceProduct(serviceId, product.id, "0.5");
    const date = addCalendarDays(todayInDouala(), 1);
    const appointment = await createAppointment({
      ...scheduleInput(client.id, memberA.staffProfile.id, new Date(`${date}T16:00:00+01:00`)),
      paymentAmount: 500,
      paymentMethod: "cash",
    });
    let stored = await getAppointment(appointment.id);
    expect(stored?.status).toBe("scheduled");
    expect(stored?.payments).toHaveLength(1);
    expect(stored?.payments[0]).toMatchObject({ amount: 500, purpose: "advance" });
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("2");
    await recordAppointmentPayment(appointment.id, 250, "orange_money");
    await expect(recordAppointmentPayment(appointment.id, 1_000, "cash")).rejects.toThrow(
      "dépasse le solde",
    );
    await changeAppointmentStatus(appointment.id, "arrived");
    await completeAppointment(appointment.id, "mtn_momo");
    stored = await getAppointment(appointment.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.payments.map((payment) => payment.amount)).toEqual([500, 250, 750]);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("1.5");
  });

  it("plans an unpaid appointment from the register without revenue or stock consumption", async () => {
    const product = await createProduct({ ...productFields(), initialStock: "1" });
    await saveServiceProduct(serviceId, product.id, "0.25");
    const date = addCalendarDays(todayInDouala(), 2);
    const appointment = await createRegisterEntry(
      visit(`Register booking ${crypto.randomUUID()}`, {
        entryMode: "appointment",
        source: "reservation",
        startTime: new Date(`${date}T18:00:00+01:00`),
        durationMinutes: 90,
        paymentAmount: 0,
        paymentMethod: undefined,
      }),
    );
    const stored = await getAppointment(appointment.id);
    expect(stored).toMatchObject({ status: "scheduled", durationMinutes: 90 });
    expect(stored?.payments).toHaveLength(0);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("1");
    const report = await getReportData("week", date);
    expect(report.summary.appointmentOutcomes.scheduled).toBeGreaterThanOrEqual(1);
    expect(report.rows.some((row) => row.appointmentId === appointment.id)).toBe(false);
  });

  it("tracks cancellations and no-shows without counting them as visits", async () => {
    const client = await saveClient(null, { name: `Outcome ${crypto.randomUUID()}` });
    const date = addCalendarDays(todayInDouala(), 3);
    const first = await createAppointment(
      scheduleInput(client.id, memberA.staffProfile.id, new Date(`${date}T09:00:00+01:00`)),
    );
    const second = await createAppointment(
      scheduleInput(client.id, memberA.staffProfile.id, new Date(`${date}T11:00:00+01:00`)),
    );
    await changeAppointmentStatus(first.id, "cancelled");
    await changeAppointmentStatus(second.id, "no_show");
    const dossier = await getClientDetail(client.id);
    expect(dossier?.visitCount).toBe(0);
    expect(dossier?.appointmentCount).toBe(2);
    const report = await getReportData("week", date);
    expect(report.summary.appointmentOutcomes.cancelled).toBeGreaterThanOrEqual(1);
    expect(report.summary.appointmentOutcomes.no_show).toBeGreaterThanOrEqual(1);
  });

  it("rejects foreign clients and invalid lifecycle transitions", async () => {
    const foreign = await adminPrisma.client.create({
      data: { tenantId: memberB.tenantId, name: `Foreign calendar ${crypto.randomUUID()}` },
    });
    const date = addCalendarDays(todayInDouala(), 4);
    await expect(
      createAppointment(
        scheduleInput(foreign.id, memberA.staffProfile.id, new Date(`${date}T09:00:00+01:00`)),
      ),
    ).rejects.toThrow("introuvable");
    const local = await saveClient(null, { name: `Lifecycle ${crypto.randomUUID()}` });
    const appointment = await createAppointment(
      scheduleInput(local.id, memberA.staffProfile.id, new Date(`${date}T10:30:00+01:00`)),
    );
    await expect(completeAppointment(appointment.id, "cash")).rejects.toThrow("arrivé");
    await changeAppointmentStatus(appointment.id, "cancelled");
    await expect(changeAppointmentStatus(appointment.id, "confirmed")).rejects.toThrow(
      "plus autorisé",
    );
  });
});

describe("stock ledger and automatic service consumption", () => {
  it("previews and atomically imports new and existing stock with audit movements", async () => {
    const suffix = crypto.randomUUID();
    const existing = await createProduct({
      ...productFields(`Import existing ${suffix}`),
      sku: `IMP-A-${suffix}`,
      initialStock: "5",
    });
    const rows = [
      {
        name: `Import updated ${suffix}`,
        sku: `IMP-A-${suffix}`,
        unit: "ml" as const,
        costPrice: 12,
        salePrice: 99,
        lowStockThreshold: "1",
        stockQuantity: "3",
        status: "active" as const,
      },
      {
        name: `Import new ${suffix}`,
        sku: `IMP-B-${suffix}`,
        unit: "g" as const,
        costPrice: 20,
        salePrice: 40,
        lowStockThreshold: "0.5",
        stockQuantity: "2",
        status: "active" as const,
      },
    ];
    expect(await importInventory(rows, false)).toMatchObject({
      created: 1,
      updated: 1,
      unchanged: 0,
      rejected: 0,
    });
    expect(
      (await adminPrisma.product.findUniqueOrThrow({ where: { id: existing.id } })).salePrice,
    ).toBe(20);

    expect(await importInventory(rows, true)).toMatchObject({
      created: 1,
      updated: 1,
      unchanged: 0,
    });
    const updated = await adminPrisma.product.findUniqueOrThrow({ where: { id: existing.id } });
    expect(updated).toMatchObject({ name: `Import updated ${suffix}`, salePrice: 99 });
    expect(updated.stockQuantity.toString()).toBe("3");
    const created = await adminPrisma.product.findFirstOrThrow({
      where: { tenantId: memberA.tenantId, sku: `IMP-B-${suffix}`.toUpperCase() },
    });
    expect(created.stockQuantity.toString()).toBe("2");
    const movements = await adminPrisma.stockMovement.findMany({
      where: { productId: { in: [existing.id, created.id] } },
      orderBy: { createdAt: "asc" },
    });
    expect(movements.map((movement) => movement.quantity.toString())).toEqual(["5", "-2", "2"]);
    expect(movements.map((movement) => movement.reason)).toEqual([
      "Stock initial",
      "Import inventaire — comptage physique",
      "Import inventaire — stock initial",
    ]);
    expect(await importInventory(rows, true)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(
      await adminPrisma.stockMovement.count({
        where: { productId: { in: [existing.id, created.id] } },
      }),
    ).toBe(3);
  });

  it("rejects foreign IDs and invalid archive plans without partially changing stock", async () => {
    const suffix = crypto.randomUUID();
    const local = await createProduct({
      ...productFields(`Atomic import ${suffix}`),
      sku: `ATOMIC-${suffix}`,
      initialStock: "4",
    });
    const foreign = await adminPrisma.product.create({
      data: { tenantId: memberB.tenantId, name: `Foreign ${suffix}`, sku: `FOREIGN-${suffix}` },
    });
    const validUpdate = {
      id: local.id,
      name: `Should roll back ${suffix}`,
      sku: `ATOMIC-${suffix}`,
      unit: "ml" as const,
      costPrice: 10,
      salePrice: 50,
      lowStockThreshold: "2",
      stockQuantity: "1",
      status: "active" as const,
    };
    await expect(
      importInventory(
        [
          validUpdate,
          {
            ...validUpdate,
            id: foreign.id,
            sku: `FOREIGN-${suffix}`,
            name: `Foreign ${suffix}`,
          },
        ],
        true,
      ),
    ).rejects.toThrow("inconnu dans ce salon");
    const unchanged = await adminPrisma.product.findUniqueOrThrow({ where: { id: local.id } });
    expect(unchanged.name).toBe(`Atomic import ${suffix}`);
    expect(unchanged.stockQuantity.toString()).toBe("4");

    await saveServiceProduct(serviceId, local.id, "0.1");
    await expect(
      importInventory([{ ...validUpdate, stockQuantity: "0", status: "archived" }], true),
    ).rejects.toThrow("consommations");
    expect(
      (await adminPrisma.product.findUniqueOrThrow({ where: { id: local.id } })).isDeleted,
    ).toBe(false);
    await expect(
      importInventory(
        [{ ...validUpdate, id: undefined, sku: undefined, name: `New without SKU ${suffix}` }],
        false,
      ),
    ).rejects.toThrow("SKU est obligatoire");
  });

  it("records paid product sales atomically in stock, client dossier and reports", async () => {
    const productName = `Retail-${crypto.randomUUID()}`;
    const product = await createProduct({
      ...productFields(productName),
      salePrice: 4_000,
      initialStock: "5",
    });
    const clientName = `Retail client ${crypto.randomUUID()}`;
    const client = await saveClient(null, { name: clientName });
    const id = crypto.randomUUID();
    const sale = await createRetailSale({
      id,
      productId: product.id,
      clientId: client.id,
      quantity: "1.500",
      expectedUnitPrice: 4_000,
      method: "orange_money",
      soldAt: new Date(),
    });
    expect(sale.id).toBe(id);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("3.5");
    const stored = await adminPrisma.retailSale.findUniqueOrThrow({ where: { id } });
    expect(stored).toMatchObject({ productName, unitPrice: 4_000, total: 6_000 });
    const receipt = await getRetailReceipt(id);
    expect(receipt?.sale.client?.name).toBe(clientName);
    const detail = await getClientDetail(client.id);
    expect(detail?.retailPaid).toBe(6_000);
    expect(detail?.retailSales[0].id).toBe(id);
    const report = await getReportData("week", todayInDouala());
    expect(report.retailSales.some((row) => row.id === id)).toBe(true);
    expect(report.summary.products.find((row) => row.id === product.id)).toMatchObject({
      amount: 6_000,
      saleCount: 1,
      quantity: "1.500",
    });
    expect(
      report.summary.paymentMethods.find((row) => row.method === "orange_money")?.amount,
    ).toBeGreaterThanOrEqual(6_000);
  });

  it("is idempotent and rejects stale prices, insufficient stock and foreign clients", async () => {
    const product = await createProduct({
      ...productFields(),
      salePrice: 2_000,
      initialStock: "1",
    });
    const id = crypto.randomUUID();
    const input = {
      id,
      productId: product.id,
      quantity: "1",
      expectedUnitPrice: 2_000,
      method: "cash",
      soldAt: new Date(),
    };
    await createRetailSale(input);
    await createRetailSale(input);
    expect(await adminPrisma.retailSale.count({ where: { id } })).toBe(1);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("0");

    const stocked = await createProduct({
      ...productFields(),
      salePrice: 3_000,
      initialStock: "1",
    });
    await expect(
      createRetailSale({
        ...input,
        id: crypto.randomUUID(),
        productId: stocked.id,
        expectedUnitPrice: 2_999,
      }),
    ).rejects.toThrow("prix");
    await expect(
      createRetailSale({
        ...input,
        id: crypto.randomUUID(),
        productId: stocked.id,
        quantity: "2",
        expectedUnitPrice: 3_000,
      }),
    ).rejects.toThrow("Stock insuffisant");
    expect(await adminPrisma.retailSale.count({ where: { productId: stocked.id } })).toBe(0);
    expect(
      await adminPrisma.stockMovement.count({ where: { productId: stocked.id, type: "sale" } }),
    ).toBe(0);

    const foreign = await adminPrisma.client.create({
      data: { tenantId: memberB.tenantId, name: "Foreign retail client" },
    });
    await expect(
      createRetailSale({
        ...input,
        id: crypto.randomUUID(),
        productId: stocked.id,
        clientId: foreign.id,
        expectedUnitPrice: 3_000,
      }),
    ).rejects.toThrow("introuvable");
  });

  it("allows only one simultaneous paid sale of the last unit and keeps receipts immutable", async () => {
    const product = await createProduct({
      ...productFields(),
      salePrice: 2_500,
      initialStock: "1",
    });
    const base = {
      productId: product.id,
      quantity: "1",
      expectedUnitPrice: 2_500,
      method: "mtn_momo",
      soldAt: new Date(),
    };
    const results = await Promise.allSettled([
      createRetailSale({ ...base, id: crypto.randomUUID() }),
      createRetailSale({ ...base, id: crypto.randomUUID() }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await adminPrisma.retailSale.count({ where: { productId: product.id } })).toBe(1);
    const sale = await adminPrisma.retailSale.findFirstOrThrow({
      where: { productId: product.id },
    });
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.retailSale.update({ where: { id: sale.id }, data: { total: 1 } }),
      ),
    ).rejects.toThrow();
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.retailSale.delete({ where: { id: sale.id } }),
      ),
    ).rejects.toThrow();
  });
  it("records initial stock, fractional receipts and a zero physical count", async () => {
    const product = await createProduct({ ...productFields(), initialStock: "0.100" });
    await moveStock({
      productId: product.id,
      type: "restock",
      quantity: "0.200",
      reason: "QA receipt",
    });
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("0.3");
    await moveStock({
      productId: product.id,
      type: "adjustment",
      quantity: "0.000",
      reason: "QA empty physical count",
    });
    const movements = await adminPrisma.stockMovement.findMany({
      where: { productId: product.id },
      orderBy: { createdAt: "asc" },
    });
    expect(movements.map((row) => row.quantity.toString())).toEqual(["0.1", "0.2", "-0.3"]);
    expect(movements[2].balanceAfter.toString()).toBe("0");
  });
  it("deducts shared products once per visit and shows them in client history", async () => {
    const product = await createProduct({
      ...productFields("QA shared shampoo"),
      initialStock: "10.000",
    });
    await saveServiceProduct(serviceId, product.id, "0.100");
    await saveServiceProduct(secondServiceId, product.id, "0.200");
    const recorded = await createRegisterEntry(
      visit("Consumption history", {
        services: [
          { serviceId, price: 1000 },
          { serviceId: secondServiceId, price: 1000 },
        ],
        paymentAmount: 2000,
      }),
    );
    const appointment = await adminPrisma.appointment.findUniqueOrThrow({
      where: { id: recorded.id },
    });
    const detail = await getClientDetail(appointment.clientId);
    expect(detail?.visits[0].stockMovements).toHaveLength(1);
    expect(detail?.visits[0].stockMovements[0].quantity.toString()).toBe("-0.3");
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("9.7");
  });
  it("rolls back client, visit, payment and earlier product deductions on shortage", async () => {
    const one = await createProduct({ ...productFields(), initialStock: "5.000" });
    const two = await createProduct({ ...productFields(), initialStock: "5.000" });
    const sorted = [one.id, two.id].sort();
    await moveStock({
      productId: sorted[1],
      type: "adjustment",
      quantity: "0",
      reason: "QA force shortage on second lock",
    });
    for (const id of sorted) await saveServiceProduct(serviceId, id, "1.000");
    const name = `rollback-${crypto.randomUUID()}`;
    const paymentsBefore = await adminPrisma.payment.count({
      where: { tenantId: memberA.tenantId },
    });
    await expect(createRegisterEntry(visit(name))).rejects.toThrow("Stock insuffisant");
    expect(await adminPrisma.client.count({ where: { tenantId: memberA.tenantId, name } })).toBe(0);
    expect(await adminPrisma.payment.count({ where: { tenantId: memberA.tenantId } })).toBe(
      paymentsBefore,
    );
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: sorted[0] } })
      ).stockQuantity.toString(),
    ).toBe("5");
    expect(
      await adminPrisma.stockMovement.count({
        where: { productId: { in: sorted }, type: "consumption" },
      }),
    ).toBe(0);
  });
  it("allows only one of two simultaneous deductions of the last unit", async () => {
    const product = await createProduct({ ...productFields(), initialStock: "1" });
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        runInTenantTransaction(identity(memberA), (tx) =>
          recordStockChange(tx, identity(memberA), {
            productId: product.id,
            type: "sale",
            quantity: "1",
            reason: "QA concurrent deduction",
          }),
        ),
      ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(
      (
        await adminPrisma.product.findUniqueOrThrow({ where: { id: product.id } })
      ).stockQuantity.toString(),
    ).toBe("0");
    expect(await adminPrisma.stockMovement.count({ where: { productId: product.id } })).toBe(2);
  });
  it("keeps movements immutable and enforces non-negative stock in PostgreSQL", async () => {
    const product = await createProduct({ ...productFields(), initialStock: "1" });
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.stockMovement.updateMany({
          where: { productId: product.id },
          data: { reason: "tampered" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.stockMovement.deleteMany({ where: { productId: product.id } }),
      ),
    ).rejects.toThrow();
    await expect(
      runInTenantTransaction(identity(memberA), (tx) =>
        tx.product.update({ where: { id: product.id }, data: { stockQuantity: "-1" } }),
      ),
    ).rejects.toThrow();
  });
  it("flags equality at the low-stock threshold and protects units and archives", async () => {
    const fields = productFields(`low-${crypto.randomUUID()}`);
    const product = await createProduct({ ...fields, initialStock: "2.000" });
    expect(
      (
        await getInventoryPageData(inventoryFiltersSchema.parse({ status: "low", q: fields.name }))
      ).products.map((row) => row.id),
    ).toEqual([product.id]);
    await expect(updateProduct(product.id, { ...fields, unit: "g" })).rejects.toThrow("L’unité");
    await expect(changeProductStatus(product.id, "archive")).rejects.toThrow("stock restant");
    await moveStock({
      productId: product.id,
      type: "adjustment",
      quantity: "0",
      reason: "QA empty stock",
    });
    await saveServiceProduct(serviceId, product.id, "1");
    await expect(changeProductStatus(product.id, "archive")).rejects.toThrow("consommations");
    await saveServiceProduct(serviceId, product.id, null);
    await changeProductStatus(product.id, "archive");
    await expect(
      moveStock({
        productId: product.id,
        type: "restock",
        quantity: "1",
        reason: "Not allowed while archived",
      }),
    ).rejects.toThrow("archivé");
    await changeProductStatus(product.id, "restore");
    await moveStock({
      productId: product.id,
      type: "restock",
      quantity: "1",
      reason: "Restored stock",
    });
  });
  it("blocks a stock movement referencing another tenant's visit", async () => {
    const appointment = await createRegisterEntry(visit("Tenant A visit"));
    const product = await adminPrisma.product.create({
      data: { tenantId: memberB.tenantId, name: "Tenant B product" },
    });
    await expect(
      runInTenantTransaction(identity(memberB), (tx) =>
        tx.stockMovement.create({
          data: {
            tenantId: memberB.tenantId,
            productId: product.id,
            recordedById: memberB.id,
            appointmentId: appointment.id,
            type: "consumption",
            quantity: "-1",
            balanceAfter: "0",
            productName: product.name,
            unit: "ml",
            unitCost: 0,
            reason: "Cross-tenant attempt",
          },
        }),
      ),
    ).rejects.toThrow();
  });
});
