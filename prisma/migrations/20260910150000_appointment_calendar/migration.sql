-- Add appointment lifecycle fields while preserving historical register entries as completed visits.
CREATE TYPE appointment_status AS ENUM (
  'scheduled', 'confirmed', 'arrived', 'completed', 'cancelled', 'no_show'
);

ALTER TABLE appointments
  ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN status appointment_status NOT NULL DEFAULT 'completed',
  ADD COLUMN notes TEXT,
  ADD COLUMN completed_at TIMESTAMP(3);

UPDATE appointments SET completed_at = start_time WHERE status = 'completed';

ALTER TABLE appointments
  ADD CONSTRAINT appointments_duration_minutes_check
  CHECK (duration_minutes BETWEEN 5 AND 720),
  ADD CONSTRAINT appointments_completion_check
  CHECK (status = 'completed' OR completed_at IS NULL);

CREATE INDEX appointments_tenant_id_status_start_time_idx
  ON appointments(tenant_id, status, start_time);

-- PostgreSQL is the final concurrency guard: two simultaneous requests cannot reserve
-- overlapping time for the same staff member. Completed/cancelled/no-show history is excluded.
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments
  ADD CONSTRAINT appointments_staff_schedule_no_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    staff_id WITH =,
    tsrange(start_time, start_time + duration_minutes * interval '1 minute', '[)') WITH &&
  ) WHERE (status IN ('scheduled', 'confirmed', 'arrived') AND is_deleted = false);
