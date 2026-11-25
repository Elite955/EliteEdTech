CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'suspended', 'deactivated')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  age SMALLINT CHECK (age IS NULL OR age BETWEEN 1 AND 120),
  grade TEXT
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  bio TEXT,
  hourly_rate NUMERIC(10, 2) CHECK (hourly_rate IS NULL OR (hourly_rate >= 0 AND hourly_rate <= 4999)),
  approved BOOLEAN NOT NULL DEFAULT false
);

-- Teachers choose their own rate within the published INR 0-4999 range.
ALTER TABLE teacher_profiles DROP CONSTRAINT IF EXISTS teacher_profiles_hourly_rate_check;
ALTER TABLE teacher_profiles ADD CONSTRAINT teacher_profiles_hourly_rate_check
  CHECK (hourly_rate IS NULL OR (hourly_rate >= 0 AND hourly_rate <= 4999));

CREATE TABLE IF NOT EXISTS teacher_availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'booked', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  UNIQUE (module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions (module, action)
VALUES ('students', 'view'), ('students', 'edit'), ('teachers', 'view'), ('teachers', 'edit')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM admin_roles role
JOIN permissions permission ON permission.module IN ('students', 'teachers')
  AND permission.action IN ('view', 'edit')
ON CONFLICT DO NOTHING;

INSERT INTO permissions (module, action)
VALUES ('live_classes', 'manage')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM admin_roles role
JOIN permissions permission ON permission.module = 'live_classes' AND permission.action = 'manage'
WHERE role.code = 'operations_admin'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES admin_roles(id),
  mfa_secret_encrypted TEXT,
  mfa_pending_secret_encrypted TEXT,
  mfa_pending_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT
);

ALTER TABLE admin_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id),
  teacher_id UUID NOT NULL REFERENCES users(id),
  availability_id UUID REFERENCES teacher_availability_slots(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'completed', 'cancelled')),
  amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS availability_id UUID REFERENCES teacher_availability_slots(id);
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_availability_id_fkey;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_availability_id_fkey FOREIGN KEY (availability_id)
  REFERENCES teacher_availability_slots(id);
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_availability_id_key;

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES bookings(id),
  student_id UUID REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'razorpay',
  provider_transaction_id TEXT,
  provider_order_id TEXT,
  recorded_by UUID REFERENCES users(id),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payments_bank_transfer_reference_idx
  ON payments(provider_transaction_id)
  WHERE provider = 'bank_transfer' AND provider_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS class_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id),
  meeting_provider TEXT NOT NULL DEFAULT 'google_meet',
  meeting_url TEXT,
  meeting_creation_status TEXT NOT NULL DEFAULT 'not_created'
    CHECK (meeting_creation_status IN ('not_created', 'creating', 'created', 'failed', 'unknown')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'ongoing', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  recording_url TEXT,
  recording_consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE class_sessions ALTER COLUMN meeting_provider SET DEFAULT 'google_meet';

ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS meeting_creation_status TEXT NOT NULL DEFAULT 'not_created'
  CHECK (meeting_creation_status IN ('not_created', 'creating', 'created', 'failed', 'unknown'));

CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id),
  room TEXT NOT NULL DEFAULT 'global',
  content TEXT NOT NULL,
  reported BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  moderated_by UUID REFERENCES users(id),
  moderated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID,
  recipient_id UUID REFERENCES users(id),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'in_app')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS request_id UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'booking_confirmation';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('email', 'in_app'));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('booking_confirmation', 'booking_request', 'booking_approved', 'booking_rejected', 'join_details', 'general'));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('queued', 'sent', 'failed', 'unknown', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_request_id_idx
  ON notifications(request_id) WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_booking_id_idx
  ON notifications(booking_id) WHERE booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS managed_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  data JSONB NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  provider_refund_id TEXT UNIQUE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed', 'unknown')),
  requested_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_active_payment_idx
  ON payment_refunds(payment_id) WHERE status IN ('pending', 'processed', 'unknown');

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO platform_settings (key, value) VALUES
  ('platform_name', '"EdTech Platform"'::jsonb),
  ('currency', '"INR"'::jsonb),
  ('platform_commission_percent', '10'::jsonb),
  ('cancellation_window_hours', '24'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('maintenance_message', '"Scheduled maintenance in progress."'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID REFERENCES users(id),
  event TEXT NOT NULL,
  module TEXT NOT NULL,
  target_id TEXT,
  ip_address INET,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_role_status_idx ON users(role, status);
CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx ON user_sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS bookings_status_starts_at_idx ON bookings(status, starts_at);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_availability_active_idx
  ON bookings(availability_id)
  WHERE availability_id IS NOT NULL AND status IN ('pending', 'approved', 'paid');
CREATE INDEX IF NOT EXISTS teacher_availability_slots_teacher_start_idx ON teacher_availability_slots(teacher_id, starts_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS payments_status_created_at_idx ON payments(status, created_at);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS managed_records_module_created_at_idx ON managed_records(module, created_at DESC);

ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted TEXT;
ALTER TABLE student_profiles ADD COLUMN IF NOT EXISTS mfa_pending_expires_at TIMESTAMPTZ;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS mfa_secret_encrypted TEXT;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS mfa_pending_secret_encrypted TEXT;
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS mfa_pending_expires_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject TEXT,
  hourly_rate NUMERIC(10, 2),
  CHECK (end_time > start_time),
  CHECK (hourly_rate IS NULL OR (hourly_rate >= 0 AND hourly_rate <= 4999)),
  UNIQUE (teacher_id, weekday, start_time, end_time)
);
CREATE INDEX IF NOT EXISTS teacher_availability_teacher_idx ON teacher_availability(teacher_id, weekday);

-- Rates and subjects are set per availability slot. Backfill existing slots
-- from the legacy profile-level rate so current pricing never changes.
ALTER TABLE teacher_availability ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE teacher_availability ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10, 2);
ALTER TABLE teacher_availability DROP CONSTRAINT IF EXISTS teacher_availability_hourly_rate_check;
ALTER TABLE teacher_availability ADD CONSTRAINT teacher_availability_hourly_rate_check
  CHECK (hourly_rate IS NULL OR (hourly_rate >= 0 AND hourly_rate <= 4999));
UPDATE teacher_availability ta
   SET subject = tp.subjects[1], hourly_rate = tp.hourly_rate
  FROM teacher_profiles tp
 WHERE tp.user_id = ta.teacher_id
   AND (ta.hourly_rate IS NULL OR ta.subject IS NULL);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),
  teacher_id UUID NOT NULL REFERENCES users(id),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  testimony_text TEXT NOT NULL DEFAULT '',
  allow_display BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_teacher_idx ON feedback(teacher_id);

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records are append-only.';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Browser-recorded classes are stored directly in Neon. A 25 MB per-recording
-- cap keeps the free 0.5 GB database quota safe.
CREATE TABLE IF NOT EXISTS class_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES class_sessions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 26214400),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_recordings_teacher_idx ON class_recordings(teacher_id);

CREATE TABLE IF NOT EXISTS class_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  filename TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 10485760),
  content BYTEA,
  external_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((content IS NOT NULL AND external_url IS NULL) OR (content IS NULL AND external_url IS NOT NULL)),
  CHECK (external_url IS NULL OR external_url ~* '^https?://')
);
CREATE INDEX IF NOT EXISTS class_materials_session_idx ON class_materials(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS class_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS class_messages_session_idx ON class_messages(session_id, created_at);
