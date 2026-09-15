-- Separate the operational lifecycle of an appointment from when money is received.
CREATE TYPE payment_purpose AS ENUM ('advance', 'settlement');

ALTER TABLE payments
  ADD COLUMN purpose payment_purpose NOT NULL DEFAULT 'settlement',
  ADD COLUMN received_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Preserve the actual entry timestamp of every historical payment.
UPDATE payments SET received_at = created_at;

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_positive_check CHECK (amount > 0);

CREATE INDEX payments_tenant_id_received_at_idx
  ON payments(tenant_id, received_at);
