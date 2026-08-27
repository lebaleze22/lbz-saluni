-- job_titles (table libre par tenant) + Staff.systemRole/jobTitleId/userId.
-- Voir docs/architecture/013-job-title-vs-system-role.md pour la décision complète.
--
-- Remplace l'ancienne approche envisagée (un enum JobTitle global) par une vraie table
-- tenant-scopée : chaque salon définit ses propres intitulés, sans valeur imposée
-- globalement. La permission système (qui peut se connecter, avec quel accès) est un
-- champ séparé, fermé, contrôlé par le code (staff.system_role) — jamais dérivé du
-- libellé de poste. Voir l'ADR pour le raisonnement sécurité complet.

-- ---------------------------------------------------------------------------
-- CreateEnum
-- ---------------------------------------------------------------------------
CREATE TYPE "staff_system_role" AS ENUM ('none', 'director', 'manager');

-- ---------------------------------------------------------------------------
-- CreateTable — job_titles
-- ---------------------------------------------------------------------------
CREATE TABLE "job_titles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_titles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "job_titles_tenant_id_id_key" ON "job_titles"("tenant_id", "id");
CREATE INDEX "job_titles_tenant_id_idx" ON "job_titles"("tenant_id");

ALTER TABLE "job_titles"
  ADD CONSTRAINT "job_titles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AlterTable — staff : jobTitleId (libellé, optionnel), systemRole (permission,
-- fermé, défaut 'none' = pas de compte), userId (compte de connexion lié, optionnel).
-- ---------------------------------------------------------------------------
ALTER TABLE "staff"
  ADD COLUMN "job_title_id" UUID,
  ADD COLUMN "system_role" "staff_system_role" NOT NULL DEFAULT 'none',
  ADD COLUMN "user_id" UUID;

-- Cible de la FK composite users(tenant_id, id) — cf. docs/architecture/013-job-title-vs-system-role.md.
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_id_key" UNIQUE ("tenant_id", "id");

CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");
CREATE UNIQUE INDEX "staff_tenant_id_user_id_key" ON "staff"("tenant_id", "user_id");
CREATE INDEX "staff_tenant_id_job_title_id_idx" ON "staff"("tenant_id", "job_title_id");
CREATE INDEX "staff_tenant_id_system_role_idx" ON "staff"("tenant_id", "system_role");

-- FK composites (tenant_id, ...) plutôt que FK simples : empêche par construction
-- qu'un staff référence un job_title ou un compte user d'un AUTRE tenant — exactement
-- le type de faille (référence croisée entre tenants) identifié pour d'autres FK
-- dénormalisées dans docs/architecture/007-verification-isolation-rls.md, corrigé ici
-- directement pour ces deux nouvelles relations plutôt que laissé comme risque latent.
-- onDelete Restrict (pas SetNull) : cohérent avec le style Restrict déjà utilisé pour
-- les FK vers Client/Staff/Service depuis Appointment — en pratique non déclenché
-- puisque job_titles/users sont soft-deleted, jamais DELETE physiquement.
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_tenant_id_job_title_id_fkey"
  FOREIGN KEY ("tenant_id", "job_title_id") REFERENCES "job_titles"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_tenant_id_user_id_fkey"
  FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contrainte CHECK : userId ne peut être renseigné que si systemRole != 'none'.
-- Non modélisable par Prisma (schema.prisma n'a pas de primitive CHECK) — vit ici en
-- SQL brut, comme les policies RLS (cf. docs/architecture/005-prisma-et-supabase.md).
-- Notez le sens unique de la règle : systemRole != 'none' n'IMPOSE PAS un userId
-- (un staff peut être marqué "director" éligible avant que son compte soit
-- effectivement provisionné) ; seul le sens inverse est interdit.
-- ---------------------------------------------------------------------------
ALTER TABLE "staff"
  ADD CONSTRAINT "staff_user_id_requires_system_role"
  CHECK ("user_id" IS NULL OR "system_role" <> 'none');

-- ---------------------------------------------------------------------------
-- Contrainte base : au plus un Staff actif avec systemRole = 'director' par tenant.
-- Même logique que users_one_salon_admin_per_tenant / users_one_owner_per_tenant
-- (migration 20260826140100_owner_role_rls), appliquée ici au niveau Staff sur
-- systemRole plutôt que sur un libellé de poste. `and not is_deleted` par cohérence
-- avec ces index et avec docs/architecture/008-soft-delete-active-vs-is-deleted.md.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "staff_one_director_per_tenant"
  ON "staff" ("tenant_id")
  WHERE "system_role" = 'director' AND NOT "is_deleted";
