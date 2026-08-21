-- gen_random_uuid() est fourni par pgcrypto sur les versions PostgreSQL
-- prises en charge par Supabase.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Les UUID doivent aussi être générés côté base pour les insertions effectuées
-- via PostgREST / Supabase, sans passer par Prisma Client.
ALTER TABLE "tenants" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "staff" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "clients" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "services" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "appointments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "appointment_services" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payments" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
