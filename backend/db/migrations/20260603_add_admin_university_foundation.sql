CREATE EXTENSION IF NOT EXISTS citext;

BEGIN;

CREATE TABLE IF NOT EXISTS universities (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  email_domain CITEXT UNIQUE,
  location VARCHAR(180),
  contact_email CITEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(40) NOT NULL CHECK (role IN ('system_admin', 'university_admin')),
  university_id BIGINT REFERENCES universities(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS departments (
  id BIGSERIAL PRIMARY KEY,
  university_id BIGINT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (university_id, name)
);

CREATE TABLE IF NOT EXISTS student_university_profiles (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  university_id BIGINT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  student_number VARCHAR(80),
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'rejected')),
  verified_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, university_id)
);

CREATE TABLE IF NOT EXISTS recruiter_verifications (
  id BIGSERIAL PRIMARY KEY,
  recruiter_id BIGINT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  document_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internship_university_approvals (
  id BIGSERIAL PRIMARY KEY,
  internship_id BIGINT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  university_id BIGINT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  department_id BIGINT REFERENCES departments(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (internship_id, university_id, department_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_role VARCHAR(40) NOT NULL,
  recipient_id BIGINT NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(80) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_role VARCHAR(40),
  actor_id BIGINT,
  action VARCHAR(120) NOT NULL,
  entity_type VARCHAR(120) NOT NULL,
  entity_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_universities_email_domain ON universities(email_domain);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_student_id ON student_university_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_university_id ON student_university_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_verification_status
  ON student_university_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_recruiter_verifications_recruiter_id ON recruiter_verifications(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_verifications_status ON recruiter_verifications(status);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_internship_id
  ON internship_university_approvals(internship_id);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_university_id
  ON internship_university_approvals(university_id);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_status ON internship_university_approvals(status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_role, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_role, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_universities_updated_at ON universities;
CREATE TRIGGER set_universities_updated_at
BEFORE UPDATE ON universities
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_admin_users_updated_at ON admin_users;
CREATE TRIGGER set_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_student_university_profiles_updated_at ON student_university_profiles;
CREATE TRIGGER set_student_university_profiles_updated_at
BEFORE UPDATE ON student_university_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_recruiter_verifications_updated_at ON recruiter_verifications;
CREATE TRIGGER set_recruiter_verifications_updated_at
BEFORE UPDATE ON recruiter_verifications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_internship_university_approvals_updated_at ON internship_university_approvals;
CREATE TRIGGER set_internship_university_approvals_updated_at
BEFORE UPDATE ON internship_university_approvals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

COMMIT;
