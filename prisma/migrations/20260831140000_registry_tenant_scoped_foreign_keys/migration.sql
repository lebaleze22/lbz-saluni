-- Empêche les références croisées entre tenants au niveau structurel du registre.
-- Les policies RLS contrôlent tenant_id sur la ligne écrite ; ces FK composites
-- garantissent que ses parents appartiennent au même tenant.

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "services"
  ADD CONSTRAINT "services_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_tenant_id_id_key" UNIQUE ("tenant_id", "id");

ALTER TABLE "appointments"
  DROP CONSTRAINT "appointments_client_id_fkey",
  DROP CONSTRAINT "appointments_staff_id_fkey",
  DROP CONSTRAINT "appointments_created_by_fkey";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_tenant_id_client_id_fkey"
    FOREIGN KEY ("tenant_id", "client_id") REFERENCES "clients" ("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_tenant_id_staff_id_fkey"
    FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff" ("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_tenant_id_created_by_fkey"
    FOREIGN KEY ("tenant_id", "created_by") REFERENCES "users" ("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointment_services"
  DROP CONSTRAINT "appointment_services_appointment_id_fkey",
  DROP CONSTRAINT "appointment_services_service_id_fkey";

ALTER TABLE "appointment_services"
  ADD CONSTRAINT "appointment_services_tenant_id_appointment_id_fkey"
    FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments" ("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_services_tenant_id_service_id_fkey"
    FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services" ("tenant_id", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments"
  DROP CONSTRAINT "payments_appointment_id_fkey";

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_tenant_id_appointment_id_fkey"
    FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments" ("tenant_id", "id")
    ON DELETE CASCADE ON UPDATE CASCADE;
