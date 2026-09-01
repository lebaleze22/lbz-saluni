-- ServiceCategory — regroupement des prestations, propre à chaque salon (texte libre,
-- pas un enum global), même pattern structurel que JobTitle. Service.categoryId,
-- optionnel, référence composite (tenant_id, id) — même pattern que les autres relations
-- tenant-scopées (staff_job_titles, staff.jobTitle historique...).
-- Voir docs/architecture/016-catalogue-prestations-caprice.md.

-- ---------------------------------------------------------------------------
-- CreateTable service_categories
-- ---------------------------------------------------------------------------
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "service_categories_tenant_id_id_key" ON "service_categories"("tenant_id", "id");
CREATE INDEX "service_categories_tenant_id_idx" ON "service_categories"("tenant_id");

ALTER TABLE "service_categories"
  ADD CONSTRAINT "service_categories_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AlterTable services — categoryId optionnel (les services existants n'ont pas de
-- catégorie ; pas de valeur par défaut sensée).
-- ---------------------------------------------------------------------------
ALTER TABLE "services" ADD COLUMN "category_id" UUID;

CREATE INDEX "services_tenant_id_category_id_idx" ON "services"("tenant_id", "category_id");

-- FK composite (tenant_id, category_id) -> service_categories(tenant_id, id) : empêche
-- par construction qu'un service référence une catégorie d'un AUTRE tenant — même
-- garantie que staff_job_titles (docs/architecture/013-*.md,
-- docs/architecture/015-*.md). onDelete Restrict : cohérent avec le style déjà utilisé
-- pour les relations tenant-scopées optionnelles de ce projet.
ALTER TABLE "services"
  ADD CONSTRAINT "services_tenant_id_category_id_fkey"
  FOREIGN KEY ("tenant_id", "category_id") REFERENCES "service_categories"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
