import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const tenantName = (process.env.CLIENT_TENANT_NAME ?? "").trim();
const ownerName = (process.env.CLIENT_OWNER_NAME ?? "").trim();
const ownerEmail = (process.env.CLIENT_OWNER_EMAIL ?? "").trim().toLowerCase();
const ownerPassword = process.env.CLIENT_OWNER_PASSWORD ?? "";
const authUrl =
  process.env.SUPABASE_INTERNAL_URL ??
  process.env.SUPABASE_PUBLIC_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL ?? process.env.DIRECT_URL;

const forbiddenPasswords = new Set(["CapriceDev2026!", "CapriceOwner2026!", "change-me"]);

if (!tenantName || !ownerName || !ownerEmail || !ownerPassword) {
  throw new Error(
    "CLIENT_TENANT_NAME, CLIENT_OWNER_NAME, CLIENT_OWNER_EMAIL et CLIENT_OWNER_PASSWORD sont requis.",
  );
}
if (!/^\S+@\S+\.\S+$/.test(ownerEmail)) {
  throw new Error("CLIENT_OWNER_EMAIL n'est pas une adresse e-mail valide.");
}
if (ownerPassword.length < 14 || forbiddenPasswords.has(ownerPassword)) {
  throw new Error(
    "CLIENT_OWNER_PASSWORD doit contenir au moins 14 caractères et ne peut pas être un mot de passe de développement.",
  );
}
if (!authUrl || !serviceRoleKey || !anonKey || !adminDatabaseUrl) {
  throw new Error(
    "SUPABASE_PUBLIC_URL (ou SUPABASE_INTERNAL_URL), SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY et ADMIN_DATABASE_URL sont requis.",
  );
}

const authAdmin = createClient(authUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(authUrl, anonKey, {
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

async function getOrCreateTenant() {
  const activeTenants = await prisma.tenant.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true },
  });
  const matching = activeTenants.filter(
    (tenant) => tenant.name.localeCompare(tenantName, undefined, { sensitivity: "accent" }) === 0,
  );

  if (matching.length > 1) {
    throw new Error(`Plusieurs tenants portent déjà le nom « ${tenantName} ».`);
  }
  if (activeTenants.some((tenant) => tenant.id !== matching[0]?.id)) {
    throw new Error(
      "Cette installation contient déjà un autre tenant actif. Initialisation client refusée.",
    );
  }
  if (matching[0]) {
    return prisma.tenant.update({
      where: { id: matching[0].id },
      data: { name: tenantName, active: true, isDeleted: false, deletedAt: null },
      select: { id: true, name: true },
    });
  }
  return prisma.tenant.create({
    data: { name: tenantName },
    select: { id: true, name: true },
  });
}

async function main() {
  const tenant = await getOrCreateTenant();
  const existingOwner = await prisma.user.findFirst({
    where: { tenantId: tenant.id, role: "owner", isDeleted: false },
    select: { id: true, email: true },
  });
  if (existingOwner && existingOwner.email.toLowerCase() !== ownerEmail) {
    throw new Error(`Un autre Owner existe déjà pour ${tenant.name} (${existingOwner.email}).`);
  }

  const existingAuthUser = await findAuthUserByEmail(ownerEmail);
  const metadata = { full_name: ownerName, role: "owner", tenant_id: tenant.id };
  const authResult = existingAuthUser
    ? await authAdmin.auth.admin.updateUserById(existingAuthUser.id, {
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: metadata,
      })
    : await authAdmin.auth.admin.createUser({
        email: ownerEmail,
        password: ownerPassword,
        email_confirm: true,
        user_metadata: metadata,
      });

  if (authResult.error || !authResult.data.user) {
    throw authResult.error ?? new Error("Le service Auth n'a retourné aucun utilisateur Owner.");
  }

  const authUser = authResult.data.user;
  const wasAuthCreated = !existingAuthUser;

  try {
    const profileByEmail = await prisma.user.findUnique({
      where: { email: ownerEmail },
      select: { id: true },
    });
    if (profileByEmail && profileByEmail.id !== authUser.id) {
      throw new Error(`Le profil ${ownerEmail} est lié à un autre identifiant Auth.`);
    }

    await prisma.user.upsert({
      where: { id: authUser.id },
      create: {
        id: authUser.id,
        tenantId: tenant.id,
        email: ownerEmail,
        fullName: ownerName,
        role: "owner",
      },
      update: {
        tenantId: tenant.id,
        email: ownerEmail,
        fullName: ownerName,
        role: "owner",
        active: true,
        isDeleted: false,
        deletedAt: null,
      },
    });

    const linkedStaff = await prisma.staff.findUnique({
      where: { userId: authUser.id },
      select: { id: true },
    });
    const staffData = {
      tenantId: tenant.id,
      name: ownerName,
      systemRole: "manager",
      userId: authUser.id,
      active: true,
      isDeleted: false,
      deletedAt: null,
    };
    if (linkedStaff) {
      await prisma.staff.update({ where: { id: linkedStaff.id }, data: staffData });
    } else {
      await prisma.staff.create({ data: staffData });
    }
  } catch (error) {
    if (wasAuthCreated) {
      await authAdmin.auth.admin.deleteUser(authUser.id).catch(() => undefined);
    }
    throw error;
  }

  const loginResult = await authClient.auth.signInWithPassword({
    email: ownerEmail,
    password: ownerPassword,
  });
  if (loginResult.error || loginResult.data.user?.id !== authUser.id) {
    throw loginResult.error ?? new Error("La connexion de contrôle de l'Owner a échoué.");
  }

  const counts = await Promise.all([
    prisma.user.count({ where: { tenantId: tenant.id, role: "owner", isDeleted: false } }),
    prisma.user.count({ where: { tenantId: tenant.id, role: "salon_admin", isDeleted: false } }),
    prisma.staff.count({ where: { tenantId: tenant.id, isDeleted: false } }),
  ]);

  console.log("\nInitialisation de l'installation client terminée.");
  console.log(`Tenant                 : ${tenant.name} (${tenant.id})`);
  console.log(`Owner                  : ${ownerName}`);
  console.log(`E-mail                 : ${ownerEmail}`);
  console.log("Profil Staff technique : Manager actif");
  console.log("Connexion Owner        : vérifiée");
  console.log(`Comptes Owner          : ${counts[0]}`);
  console.log(`Comptes Director       : ${counts[1]}`);
  console.log(`Profils Staff          : ${counts[2]}\n`);
}

main()
  .catch((error) => {
    console.error("\nÉchec de l'initialisation client:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
