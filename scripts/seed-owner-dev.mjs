import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const TENANT_NAME = "Caprice D'Ebène";
const OWNER_NAME = process.env.SEED_DEV_OWNER_NAME ?? "Owner Caprice D'Ebène";
const OWNER_EMAIL = (
  process.env.SEED_DEV_OWNER_EMAIL ?? "owner.dev@caprice-ebene.com"
).toLowerCase();
const OWNER_PASSWORD = process.env.SEED_DEV_OWNER_PASSWORD ?? "CapriceOwner2026!";
const supabaseUrl =
  process.env.SUPABASE_INTERNAL_URL ??
  process.env.SUPABASE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

if (!supabaseUrl || !serviceRoleKey || !adminDatabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et ADMIN_DATABASE_URL sont requis.",
  );
}

const authAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const prisma = new PrismaClient({ datasourceUrl: adminDatabaseUrl });

async function findAuthUserByEmail(email) {
  const perPage = 1_000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await authAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user || data.users.length < perPage) return user ?? null;
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirst({
    where: { name: TENANT_NAME, active: true, isDeleted: false },
    select: { id: true, name: true },
  });
  if (!tenant) throw new Error(`Le tenant « ${TENANT_NAME} » doit être seedé en premier.`);

  const currentOwner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "owner" },
    select: { id: true, email: true },
  });
  if (currentOwner && currentOwner.email.toLowerCase() !== OWNER_EMAIL) {
    throw new Error(`Un autre Owner existe déjà pour ${tenant.name} (${currentOwner.email}).`);
  }

  const existingAuthUser = await findAuthUserByEmail(OWNER_EMAIL);
  const metadata = { full_name: OWNER_NAME, role: "owner", tenant_id: tenant.id };
  const authResult = existingAuthUser
    ? await authAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      })
    : await authAdmin.auth.admin.createUser({
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      });
  if (authResult.error || !authResult.data.user) {
    throw authResult.error ?? new Error("GoTrue n’a retourné aucun utilisateur Owner.");
  }

  const authUser = authResult.data.user;
  const wasCreated = !existingAuthUser;
  try {
    const profileByEmail = await prisma.user.findUnique({
      where: { email: OWNER_EMAIL },
      select: { id: true },
    });
    if (profileByEmail && profileByEmail.id !== authUser.id) {
      throw new Error(`Le profil ${OWNER_EMAIL} est lié à un autre identifiant Auth.`);
    }

    await prisma.user.upsert({
      where: { id: authUser.id },
      create: {
        id: authUser.id,
        tenantId: tenant.id,
        email: OWNER_EMAIL,
        fullName: OWNER_NAME,
        role: "owner",
      },
      update: {
        tenantId: tenant.id,
        email: OWNER_EMAIL,
        fullName: OWNER_NAME,
        role: "owner",
        active: true,
        isDeleted: false,
        deletedAt: null,
      },
    });

    const staff = await prisma.staff.findUnique({
      where: { userId: authUser.id },
      select: { id: true },
    });
    const staffData = {
      tenantId: tenant.id,
      name: OWNER_NAME,
      systemRole: "manager",
      userId: authUser.id,
      active: true,
      isDeleted: false,
      deletedAt: null,
    };
    if (staff) await prisma.staff.update({ where: { id: staff.id }, data: staffData });
    else await prisma.staff.create({ data: staffData });
  } catch (error) {
    if (wasCreated) await authAdmin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    throw error;
  }

  console.log("\nSeed Owner de développement terminé.");
  console.log(`Tenant       : ${tenant.name} (${tenant.id})`);
  console.log(`Owner        : ${OWNER_NAME}`);
  console.log("Staff lié    : Manager actif (profil de connexion Owner)");
  console.log(`E-mail       : ${OWNER_EMAIL}`);
  console.log(`Mot de passe : ${OWNER_PASSWORD}\n`);
}

main()
  .catch((error) => {
    console.error("\nÉchec du seed Owner de développement:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
