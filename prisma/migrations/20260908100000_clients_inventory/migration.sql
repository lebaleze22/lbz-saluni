-- Additive CRM and inventory migration. Existing clients and visits are preserved.
ALTER TABLE clients ADD COLUMN email TEXT, ADD COLUMN notes TEXT,
  ADD COLUMN preferences TEXT, ADD COLUMN allergies TEXT;

CREATE TYPE stock_movement_type AS ENUM ('restock', 'sale', 'adjustment', 'consumption');

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name TEXT NOT NULL, sku TEXT, unit TEXT NOT NULL DEFAULT 'unité',
  cost_price INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price INTEGER NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  stock_quantity DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold DECIMAL(12,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  active BOOLEAN NOT NULL DEFAULT true, is_deleted BOOLEAN NOT NULL DEFAULT false,
  deleted_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id),
  CONSTRAINT products_tenant_id_sku_key UNIQUE (tenant_id, sku)
);
CREATE INDEX products_tenant_id_name_idx ON products(tenant_id, name);

CREATE TABLE service_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  service_id UUID NOT NULL, product_id UUID NOT NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  CONSTRAINT service_products_service_id_product_id_key UNIQUE(service_id, product_id),
  FOREIGN KEY(tenant_id, service_id) REFERENCES services(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX service_products_tenant_id_idx ON service_products(tenant_id);

CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  product_id UUID NOT NULL, appointment_id UUID, recorded_by UUID NOT NULL,
  type stock_movement_type NOT NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity <> 0),
  balance_after DECIMAL(12,3) NOT NULL CHECK (balance_after >= 0),
  product_name TEXT NOT NULL, unit TEXT NOT NULL,
  unit_cost INTEGER NOT NULL CHECK (unit_cost >= 0), reason TEXT NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(tenant_id, appointment_id) REFERENCES appointments(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY(tenant_id, recorded_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ((type = 'consumption' AND appointment_id IS NOT NULL) OR (type <> 'consumption' AND appointment_id IS NULL)),
  CHECK ((type = 'restock' AND quantity > 0) OR (type IN ('sale', 'consumption') AND quantity < 0) OR type = 'adjustment')
);
CREATE INDEX stock_movements_tenant_id_product_id_created_at_idx ON stock_movements(tenant_id, product_id, created_at);
CREATE INDEX stock_movements_tenant_id_appointment_id_idx ON stock_movements(tenant_id, appointment_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
ALTER TABLE service_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_products FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON products TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON service_products TO app_runtime;
GRANT SELECT, INSERT ON stock_movements TO app_runtime;

-- Include archived rows for history and explicit restoration; mutations validate status.
CREATE POLICY products_select ON products FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY products_insert ON products FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY products_update ON products FOR UPDATE TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()))
  WITH CHECK (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY service_products_access ON service_products FOR ALL TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()))
  WITH CHECK (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY stock_movements_select ON stock_movements FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));
CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT TO authenticated
  WITH CHECK (tenant_id = current_tenant_id() AND recorded_by = current_user_id() AND (is_owner() OR is_salon_admin()));
