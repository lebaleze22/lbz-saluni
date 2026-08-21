-- @updatedAt seul ne génère qu'un comportement côté Prisma Client au moment de
-- l'UPDATE : ce n'est pas une vraie valeur par défaut Postgres. Toute insertion
-- effectuée hors Prisma Client (PostgREST / client admin Supabase, comme dans
-- tests/rls/tenant-isolation.test.ts) laissait donc "updated_at" NULL au INSERT,
-- alors que la colonne est NOT NULL. Même cause profonde que la migration
-- 20260821103000_database_uuid_defaults (uuid() vs dbgenerated).
ALTER TABLE "tenants" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "staff" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "clients" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "services" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "appointments" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
