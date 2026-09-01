import { PrismaClient } from "@prisma/client";

const password = process.env.LOCAL_APP_RUNTIME_PASSWORD;
const adminUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

if (!password || !adminUrl) {
  throw new Error("LOCAL_APP_RUNTIME_PASSWORD et ADMIN_DATABASE_URL sont requis.");
}

if (password.length < 16) {
  throw new Error("LOCAL_APP_RUNTIME_PASSWORD doit contenir au moins 16 caractères.");
}

const escapedPassword = password.replaceAll("'", "''");
const prisma = new PrismaClient({ datasourceUrl: adminUrl });

try {
  await prisma.$executeRawUnsafe(`ALTER ROLE app_runtime WITH PASSWORD '${escapedPassword}'`);
  console.log("Mot de passe du rôle app_runtime configuré.");
} finally {
  await prisma.$disconnect();
}
