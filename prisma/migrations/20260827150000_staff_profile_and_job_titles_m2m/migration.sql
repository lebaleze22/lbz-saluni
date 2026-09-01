-- Staff : profil administratif (sexe, téléphone, résidence, pièce d'identité,
-- ancienneté) + relation many-to-many vers job_titles (staff_job_titles), en
-- remplacement de l'ancienne FK simple staff.job_title_id (un staff peut désormais
-- occuper plusieurs postes). Client : sexe optionnel.
-- Voir docs/architecture/015-staff-profil-et-postes-multiples.md pour la décision
-- complète (isPrimary, recommandation de chiffrement pour idNumber).
--
-- ATTENTION — rupture connue et assumée : lib/db/staff.ts et l'UI de gestion du staff
-- (app/(admin)/(owner)/staff/*) écrivent/lisent staff.jobTitleId comme FK simple ; cette
-- migration supprime cette colonne. Cette rupture est délibérée (confirmée avant
-- d'appliquer) — voir l'ADR pour le détail et ce qui doit être adapté côté application.

-- ---------------------------------------------------------------------------
-- CreateEnum
-- ---------------------------------------------------------------------------
CREATE TYPE "sex" AS ENUM ('homme', 'femme');
CREATE TYPE "id_type" AS ENUM ('cni', 'passeport');

-- ---------------------------------------------------------------------------
-- DropForeignKey / DropIndex / DropColumn — ancienne relation simple staff.job_title_id.
-- ---------------------------------------------------------------------------
ALTER TABLE "staff" DROP CONSTRAINT "staff_tenant_id_job_title_id_fkey";
DROP INDEX "staff_tenant_id_job_title_id_idx";
ALTER TABLE "staff" DROP COLUMN "job_title_id";

-- ---------------------------------------------------------------------------
-- AlterTable staff — profil administratif.
-- ---------------------------------------------------------------------------
ALTER TABLE "staff"
  ADD COLUMN "sex" "sex",
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "residence" TEXT,
  ADD COLUMN "id_type" "id_type",
  ADD COLUMN "id_number" TEXT,
  ADD COLUMN "years_of_experience" INTEGER;

-- Cible de la FK composite staff_job_titles(tenant_id, staff_id).
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenant_id_id_key" UNIQUE ("tenant_id", "id");

-- ---------------------------------------------------------------------------
-- AlterTable clients — sexe optionnel.
-- ---------------------------------------------------------------------------
ALTER TABLE "clients" ADD COLUMN "sex" "sex";

-- ---------------------------------------------------------------------------
-- CreateTable staff_job_titles — table de liaison pure (pas de isDeleted/active/
-- deletedAt à la différence des tables métier principales : retirer un poste à un
-- staff est un DELETE réel de la ligne de liaison).
-- ---------------------------------------------------------------------------
CREATE TABLE "staff_job_titles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "job_title_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "staff_job_titles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_job_titles_staff_id_job_title_id_key" ON "staff_job_titles"("staff_id", "job_title_id");
CREATE INDEX "staff_job_titles_tenant_id_idx" ON "staff_job_titles"("tenant_id");
CREATE INDEX "staff_job_titles_tenant_id_staff_id_idx" ON "staff_job_titles"("tenant_id", "staff_id");

-- FK composites (tenant_id, ...) : même pattern que staff/job_titles/users depuis
-- docs/architecture/013-job-title-vs-system-role.md — empêche par construction qu'une
-- ligne de liaison associe un staff et un job_title de deux tenants différents.
ALTER TABLE "staff_job_titles"
  ADD CONSTRAINT "staff_job_titles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_job_titles"
  ADD CONSTRAINT "staff_job_titles_tenant_id_staff_id_fkey"
  FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff"("tenant_id", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "staff_job_titles"
  ADD CONSTRAINT "staff_job_titles_tenant_id_job_title_id_fkey"
  FOREIGN KEY ("tenant_id", "job_title_id") REFERENCES "job_titles"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Contrainte base : au plus un isPrimary = true par staff.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "staff_job_titles_one_primary_per_staff"
  ON "staff_job_titles" ("staff_id")
  WHERE "is_primary";
