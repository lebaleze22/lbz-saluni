import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const TENANT_NAME = "Caprice D'Ebène";
const ADMIN_FULL_NAME = "SIRE";
const ADMIN_EMAIL = process.env.SEED_DEV_ADMIN_EMAIL ?? "sire.dev@caprice-ebene.com";
const ADMIN_PASSWORD = process.env.SEED_DEV_ADMIN_PASSWORD ?? "CapriceDev2026!";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être renseignés " +
      "dans .env.local ou .env pour le projet Supabase de développement.",
  );
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateTenant() {
  const { data: tenants, error: findError } = await admin
    .from("tenants")
    .select("id, name")
    .eq("name", TENANT_NAME)
    .limit(2);

  if (findError) throw findError;
  if (tenants.length > 1) {
    throw new Error(`Plusieurs tenants portent déjà le nom « ${TENANT_NAME} ».`);
  }

  if (tenants.length === 1) {
    const { data: tenant, error: updateError } = await admin
      .from("tenants")
      .update({ active: true, is_deleted: false, deleted_at: null })
      .eq("id", tenants[0].id)
      .select("id, name")
      .single();

    if (updateError) throw updateError;
    return tenant;
  }

  const { data: tenant, error: createError } = await admin
    .from("tenants")
    .insert({ name: TENANT_NAME })
    .select("id, name")
    .single();

  if (createError) throw createError;
  return tenant;
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
  const { data: profileByEmail, error: emailLookupError } = await admin
    .from("users")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (emailLookupError) throw emailLookupError;
  if (profileByEmail && profileByEmail.id !== authUserId) {
    throw new Error(`Le profil public ${normalizedEmail} existe avec un autre identifiant Auth.`);
  }

  const profile = {
    id: authUserId,
    tenant_id: tenantId,
    email: normalizedEmail,
    full_name: ADMIN_FULL_NAME,
    role: "salon_admin",
    active: true,
    is_deleted: false,
    deleted_at: null,
  };

  const { error } = await admin.from("users").upsert(profile, { onConflict: "id" });
  if (error) throw error;
}

async function main() {
  const tenant = await getOrCreateTenant();
  const { user, wasCreated } = await getOrCreateAuthUser(tenant.id);

  try {
    await upsertUserProfile(user.id, tenant.id);
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
  console.log(`E-mail       : ${ADMIN_EMAIL.toLowerCase()}`);
  console.log(`Mot de passe : ${ADMIN_PASSWORD}\n`);
}

main().catch((error) => {
  console.error("\nÉchec du seed de développement:", error);
  process.exitCode = 1;
});
