-- One-time, idempotent correction for the two bookings identified during the
-- 14 September review. Run only after the booking-payments migration and a backup.
BEGIN;

DO $$
DECLARE
  planned_id uuid := '062c9ade-998f-4f66-b0c9-f6fc13cb23e5';
  confirmed_id uuid := 'dd4e5c2c-5f18-4973-9b2b-6e86016f4c03';
  movement record;
  current_balance numeric(12,3);
  corrected_balance numeric(12,3);
  expected_count integer;
  active_payment_total bigint;
BEGIN
  SELECT count(*) INTO expected_count
  FROM appointments
  WHERE id IN (planned_id, confirmed_id)
    AND source = 'reservation'
    AND is_deleted = false;

  IF expected_count <> 2 THEN
    RAISE EXCEPTION 'Expected two active reservation records, found %', expected_count;
  END IF;

  SELECT coalesce(sum(amount), 0) INTO active_payment_total
  FROM payments
  WHERE appointment_id IN (planned_id, confirmed_id)
    AND is_deleted = false;

  IF active_payment_total NOT IN (0, 55000) THEN
    RAISE EXCEPTION 'Unexpected active payment total: % FCFA', active_payment_total;
  END IF;

  FOR movement IN
    SELECT sm.*
    FROM stock_movements sm
    WHERE sm.appointment_id IN (planned_id, confirmed_id)
      AND sm.type = 'consumption'
      AND sm.quantity < 0
      AND NOT EXISTS (
        SELECT 1
        FROM stock_movements correction
        WHERE correction.reason = 'Correction réservation non réalisée — mouvement ' || sm.id::text
      )
    ORDER BY sm.product_id, sm.created_at, sm.id
  LOOP
    SELECT stock_quantity INTO current_balance
    FROM products
    WHERE id = movement.product_id
      AND tenant_id = movement.tenant_id
    FOR UPDATE;

    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'Product % is missing for stock correction', movement.product_id;
    END IF;

    corrected_balance := current_balance - movement.quantity;

    UPDATE products
    SET stock_quantity = corrected_balance
    WHERE id = movement.product_id
      AND tenant_id = movement.tenant_id;

    INSERT INTO stock_movements (
      tenant_id,
      product_id,
      appointment_id,
      recorded_by,
      type,
      quantity,
      balance_after,
      product_name,
      unit,
      unit_cost,
      reason
    ) VALUES (
      movement.tenant_id,
      movement.product_id,
      null,
      movement.recorded_by,
      'adjustment',
      -movement.quantity,
      corrected_balance,
      movement.product_name,
      movement.unit,
      movement.unit_cost,
      'Correction réservation non réalisée — mouvement ' || movement.id::text
    );
  END LOOP;

  UPDATE payments
  SET active = false,
      is_deleted = true,
      deleted_at = coalesce(deleted_at, now())
  WHERE appointment_id IN (planned_id, confirmed_id)
    AND is_deleted = false;

  UPDATE appointments
  SET status = 'scheduled',
      completed_at = null
  WHERE id = planned_id;

  UPDATE appointments
  SET status = 'confirmed',
      completed_at = null
  WHERE id = confirmed_id;
END $$;

COMMIT;
