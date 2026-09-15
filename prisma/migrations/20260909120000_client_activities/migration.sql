CREATE TABLE client_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  client_id UUID NOT NULL,
  recorded_by UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('consultation', 'preference', 'follow_up', 'note')),
  body TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  occurred_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (tenant_id, recorded_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX client_activities_tenant_id_client_id_occurred_at_idx ON client_activities(tenant_id, client_id, occurred_at);
ALTER TABLE client_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_activities FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON client_activities TO app_runtime;
CREATE POLICY client_activities_select ON client_activities FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY client_activities_insert ON client_activities FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id() AND recorded_by = current_user_id()
    AND (is_owner() OR is_salon_admin())
    AND EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.tenant_id = client_activities.tenant_id AND NOT c.is_deleted AND c.active));
