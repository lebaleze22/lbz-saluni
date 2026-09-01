import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const TENANT_NAME = "Caprice D'Ebène";
const ADMIN_FULL_NAME = "SIRE";
const ADMIN_EMAIL = process.env.SEED_DEV_ADMIN_EMAIL ?? "sire.dev@caprice-ebene.com";
const ADMIN_PASSWORD = process.env.SEED_DEV_ADMIN_PASSWORD ?? "CapriceDev2026!";

// SUPABASE_INTERNAL_URL : uniquement pour la stack locale (docker-compose.local.yml,
// docs/architecture/017-stack-locale-caprice.md) — quand ce script tourne DANS un
// conteneur (ex. `docker compose run --rm core-api node scripts/seed-dev.mjs`),
// NEXT_PUBLIC_SUPABASE_URL (http://localhost, joignable depuis le navigateur) résout
// vers le conteneur lui-même, pas vers nginx. Non défini sur Supabase Cloud : aucun
// changement de comportement là où ce script tournait déjà.
const supabaseUrl =
  process.env.SUPABASE_INTERNAL_URL ??
  process.env.SUPABASE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

if (!supabaseUrl || !serviceRoleKey || !adminDatabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et ADMIN_DATABASE_URL doivent être renseignés " +
      "dans .env.local ou .env pour le projet Supabase de développement.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient({ datasourceUrl: adminDatabaseUrl });

async function getOrCreateTenant() {
  const tenants = await prisma.tenant.findMany({
    where: { name: TENANT_NAME },
    take: 2,
    select: { id: true, name: true },
  });
  if (tenants.length > 1) {
    throw new Error(`Plusieurs tenants portent déjà le nom « ${TENANT_NAME} ».`);
  }

  if (tenants.length === 1) {
    return prisma.tenant.update({
      where: { id: tenants[0].id },
      data: { active: true, isDeleted: false, deletedAt: null },
      select: { id: true, name: true },
    });
  }

  return prisma.tenant.create({
    data: { name: TENANT_NAME },
    select: { id: true, name: true },
  });
}

async function findAuthUserByEmail(email) {
  const perPage = 1_000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user || data.users.length < perPage) return user ?? null;
  }
}

async function getOrCreateAuthUser(tenantId) {
  const normalizedEmail = ADMIN_EMAIL.toLowerCase();
  const existingUser = await findAuthUserByEmail(normalizedEmail);
  const userMetadata = {
    full_name: ADMIN_FULL_NAME,
    role: "salon_admin",
    tenant_id: tenantId,
  };

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      email: normalizedEmail,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: userMetadata,
    });

    if (error) throw error;
    return { user: data.user, wasCreated: false };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (error || !data.user) {
    throw error ?? new Error("Supabase Auth n'a retourné aucun utilisateur.");
  }

  return { user: data.user, wasCreated: true };
}

async function upsertUserProfile(authUserId, tenantId) {
  const normalizedEmail = ADMIN_EMAIL.toLowerCase();
  const profileByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });
  if (profileByEmail && profileByEmail.id !== authUserId) {
    throw new Error(`Le profil public ${normalizedEmail} existe avec un autre identifiant Auth.`);
  }

  await prisma.user.upsert({
    where: { id: authUserId },
    create: {
      id: authUserId,
      tenantId,
      email: normalizedEmail,
      fullName: ADMIN_FULL_NAME,
      role: "salon_admin",
    },
    update: {
      tenantId,
      email: normalizedEmail,
      fullName: ADMIN_FULL_NAME,
      role: "salon_admin",
      active: true,
      isDeleted: false,
      deletedAt: null,
    },
  });
}

async function upsertDirectorStaff(authUserId, tenantId) {
  const linkedStaff = await prisma.staff.findUnique({
    where: { userId: authUserId },
    select: { id: true },
  });

  const staff = {
    tenantId,
    name: ADMIN_FULL_NAME,
    systemRole: "director",
    userId: authUserId,
    active: true,
    isDeleted: false,
    deletedAt: null,
  };

  if (linkedStaff) {
    await prisma.staff.update({ where: { id: linkedStaff.id }, data: staff });
    return;
  }

  const existingDirector = await prisma.staff.findFirst({
    where: { tenantId, systemRole: "director", isDeleted: false },
    select: { id: true, userId: true },
  });
  if (existingDirector?.userId && existingDirector.userId !== authUserId) {
    throw new Error("Un autre Staff Director est déjà lié à un compte dans ce tenant.");
  }

  if (existingDirector) {
    await prisma.staff.update({ where: { id: existingDirector.id }, data: staff });
    return;
  }

  await prisma.staff.create({ data: staff });
}

async function main() {
  const tenant = await getOrCreateTenant();
  const { user, wasCreated } = await getOrCreateAuthUser(tenant.id);

  try {
    await upsertUserProfile(user.id, tenant.id);
    await upsertDirectorStaff(user.id, tenant.id);
  } catch (error) {
    if (wasCreated) {
      const { error: rollbackError } = await admin.auth.admin.deleteUser(user.id);
      if (rollbackError) {
        console.error("Impossible d'annuler la création partielle du compte Auth:", rollbackError);
      }
    }
    throw error;
  }

  console.log("\nSeed de développement terminé.");
  console.log(`Tenant       : ${tenant.name} (${tenant.id})`);
  console.log(`Salon admin  : ${ADMIN_FULL_NAME}`);
  console.log("Staff lié    : Director actif");
  console.log(`E-mail       : ${ADMIN_EMAIL.toLowerCase()}`);
  console.log(`Mot de passe : ${ADMIN_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error("\nÉchec du seed de développement:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
