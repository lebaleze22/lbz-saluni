ALTER TABLE stock_movements
  ADD CONSTRAINT stock_movements_tenant_id_id_key UNIQUE (tenant_id, id);

CREATE TABLE retail_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  client_id UUID,
  product_id UUID NOT NULL,
  recorded_by UUID NOT NULL,
  stock_movement_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL CHECK (quantity > 0),
  unit_price INTEGER NOT NULL CHECK (unit_price > 0),
  total INTEGER NOT NULL CHECK (total > 0 AND total = round(quantity * unit_price)),
  method payment_method NOT NULL,
  sold_at TIMESTAMP(3) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id, client_id) REFERENCES clients(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (tenant_id, product_id) REFERENCES products(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (tenant_id, recorded_by) REFERENCES users(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  FOREIGN KEY (tenant_id, stock_movement_id) REFERENCES stock_movements(tenant_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT retail_sales_tenant_id_stock_movement_id_key UNIQUE (tenant_id, stock_movement_id)
);

CREATE INDEX retail_sales_tenant_id_sold_at_idx ON retail_sales(tenant_id, sold_at);
CREATE INDEX retail_sales_tenant_id_client_id_sold_at_idx ON retail_sales(tenant_id, client_id, sold_at);

ALTER TABLE retail_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE retail_sales FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON retail_sales TO app_runtime;

CREATE POLICY retail_sales_select ON retail_sales FOR SELECT TO authenticated
  USING (tenant_id = current_tenant_id() AND (is_owner() OR is_salon_admin()));

CREATE POLICY retail_sales_insert ON retail_sales FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = current_tenant_id()
    AND recorded_by = current_user_id()
    AND (is_owner() OR is_salon_admin())
    AND EXISTS (
      SELECT 1 FROM stock_movements movement
      WHERE movement.id = stock_movement_id
        AND movement.tenant_id = retail_sales.tenant_id
        AND movement.type = 'sale'
        AND movement.product_id = retail_sales.product_id
        AND movement.quantity = -retail_sales.quantity
    )
  );
