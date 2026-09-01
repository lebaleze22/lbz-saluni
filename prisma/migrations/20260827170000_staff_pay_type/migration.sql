-- Le schéma historique ne portait que commission_rate. On ajoute le type de paie
-- et le montant du salaire fixe sans perdre les taux de commission existants.
CREATE TYPE "staff_pay_type" AS ENUM ('fixed_salary', 'commission');

ALTER TABLE "staff"
  ADD COLUMN "pay_type" "staff_pay_type",
  ADD COLUMN "fixed_salary" INTEGER;

UPDATE "staff"
SET "pay_type" = 'commission'
WHERE "commission_rate" IS NOT NULL;

ALTER TABLE "staff"
  ADD CONSTRAINT "staff_pay_details_check"
  CHECK (
    ("pay_type" IS NULL AND "fixed_salary" IS NULL AND "commission_rate" IS NULL)
    OR
    ("pay_type" = 'fixed_salary' AND "fixed_salary" > 0 AND "commission_rate" IS NULL)
    OR
    ("pay_type" = 'commission' AND "commission_rate" > 0 AND "commission_rate" <= 100 AND "fixed_salary" IS NULL)
  );
