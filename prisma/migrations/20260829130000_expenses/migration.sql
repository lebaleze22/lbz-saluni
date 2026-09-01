-- Expense — suivi des dépenses du salon. Voir docs/architecture/019-suivi-des-depenses.md.
--
-- `category` : texte libre, pas de table de référence (pas demandé) — à la différence
-- de ServiceCategory/JobTitle. `recorded_by` référence `staff` (pas de modèle Person
-- dans ce projet — voir docs/architecture/004-staff-sans-compte.md et
-- docs/architecture/013-job-title-vs-system-role.md), en FK composite tenant-scopée,
-- même pattern que staff_job_titles/services.category_id.

CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" TEXT,
    "recorded_by" UUID NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");
CREATE INDEX "expenses_tenant_id_occurred_at_idx" ON "expenses"("tenant_id", "occurred_at");

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK composite (tenant_id, recorded_by) -> staff(tenant_id, id) : empêche par
-- construction qu'une dépense soit attribuée à un staff d'un AUTRE tenant — même
-- garantie que staff_job_titles/services.category_id
-- (docs/architecture/013-job-title-vs-system-role.md,
-- docs/architecture/016-catalogue-prestations-caprice.md). onDelete Restrict :
-- cohérent avec le style déjà utilisé pour les relations tenant-scopées obligatoires
-- de ce projet (ex. appointments.created_by -> users).
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_tenant_id_recorded_by_fkey"
  FOREIGN KEY ("tenant_id", "recorded_by") REFERENCES "staff"("tenant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
