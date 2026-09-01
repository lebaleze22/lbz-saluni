import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.client.local", ".env.local", ".env"], quiet: true });

const tenantName = (process.env.CLIENT_TENANT_NAME ?? "").trim();
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

if (!tenantName || !adminDatabaseUrl) {
  throw new Error("CLIENT_TENANT_NAME et ADMIN_DATABASE_URL sont requis.");
}

const prisma = new PrismaClient({ datasourceUrl: adminDatabaseUrl });

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
  });
  if (tenants.length !== 1 || tenants[0].name !== tenantName) {
    throw new Error(`Tenant attendu: « ${tenantName} »; état trouvé: ${JSON.stringify(tenants)}.`);
  }

  const tenantId = tenants[0].id;
  const [
    owners,
    directors,
    staff,
    jobTitles,
    categories,
    services,
    clients,
    appointments,
    payments,
    expenses,
  ] = await Promise.all([
    prisma.user.count({ where: { tenantId, role: "owner", isDeleted: false } }),
    prisma.user.count({ where: { tenantId, role: "salon_admin", isDeleted: false } }),
    prisma.staff.count({ where: { tenantId, isDeleted: false } }),
    prisma.jobTitle.count({ where: { tenantId, isDeleted: false } }),
    prisma.serviceCategory.count({ where: { tenantId, isDeleted: false } }),
    prisma.service.count({ where: { tenantId, isDeleted: false } }),
    prisma.client.count({ where: { tenantId } }),
    prisma.appointment.count({ where: { tenantId } }),
    prisma.payment.count({ where: { tenantId } }),
    prisma.expense.count({ where: { tenantId } }),
  ]);

  const actual = {
    owners,
    directors,
    staff,
    jobTitles,
    categories,
    services,
    clients,
    appointments,
    payments,
    expenses,
  };
  const expected = {
    owners: 1,
    directors: 0,
    staff: 1,
    jobTitles: 5,
    categories: 11,
    services: 81,
    clients: 0,
    appointments: 0,
    payments: 0,
    expenses: 0,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (actual[key] !== expectedValue) {
      throw new Error(
        `Installation non conforme: ${key}=${actual[key]}, valeur attendue=${expectedValue}.`,
      );
    }
  }

  console.log("\nInstallation client vérifiée avec succès.");
  console.table(actual);
}

main()
  .catch((error) => {
    console.error("\nÉchec de la vérification de l'installation client:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
