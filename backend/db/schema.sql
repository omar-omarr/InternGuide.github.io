CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  dob DATE,
  gender VARCHAR(30),
  major VARCHAR(120),
  study_year INTEGER CHECK (study_year IS NULL OR (study_year >= 1 AND study_year <= 10)),
  address TEXT,
  resume_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recruiters (
  id BIGSERIAL PRIMARY KEY,
  company_name VARCHAR(160) NOT NULL,
  recruiter_name VARCHAR(120) NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  contact VARCHAR(50),
  address TEXT,
  country VARCHAR(100),
  city VARCHAR(100),
  about_company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS internships (
  id BIGSERIAL PRIMARY KEY,
  recruiter_id BIGINT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  company_name VARCHAR(160),
  description TEXT NOT NULL,
  location VARCHAR(160) NOT NULL,
  category VARCHAR(120),
  type VARCHAR(40) NOT NULL CHECK (type IN ('Full Time', 'Part Time', 'Remote', 'Office Internship')),
  requirements TEXT,
  required_skills TEXT,
  academic_year VARCHAR(80),
  stipend VARCHAR(120),
  deadline DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
  id BIGSERIAL PRIMARY KEY,
  internship_id BIGINT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_letter TEXT,
  resume_path TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'viewed', 'shortlisted', 'interview_scheduled', 'accepted', 'rejected', 'withdrawn')),
  interview_date DATE,
  interview_time TIME,
  interview_location VARCHAR(240),
  meeting_link TEXT,
  interview_notes TEXT,
  interview_created_at TIMESTAMPTZ,
  interview_updated_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (internship_id, student_id)
);

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
  faculty VARCHAR(160),
  major VARCHAR(160),
  academic_year VARCHAR(80),
  skills TEXT,
  location_preference VARCHAR(160),
  internship_type_preference VARCHAR(40),
  gpa NUMERIC(3, 2) CHECK (gpa IS NULL OR (gpa >= 0 AND gpa <= 4)),
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

CREATE TABLE IF NOT EXISTS training_records (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recruiter_id BIGINT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  internship_id BIGINT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  university_id BIGINT REFERENCES universities(id) ON DELETE SET NULL,
  university_supervisor_id BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  company_supervisor_name VARCHAR(160),
  start_date DATE,
  end_date DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'not_started'
    CHECK (status IN (
      'not_started',
      'training_started',
      'weekly_reports_pending',
      'company_evaluated',
      'student_report_submitted',
      'university_reviewed',
      'completed',
      'cancelled'
    )),
  final_report_path TEXT,
  final_report_status VARCHAR(30) NOT NULL DEFAULT 'not_submitted'
    CHECK (final_report_status IN ('not_submitted', 'submitted', 'approved', 'rejected')),
  final_report_submitted_at TIMESTAMPTZ,
  final_report_reviewed_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  final_report_reviewed_at TIMESTAMPTZ,
  final_report_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_reports (
  id BIGSERIAL PRIMARY KEY,
  training_record_id BIGINT NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 60),
  summary TEXT NOT NULL,
  challenges TEXT,
  next_steps TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by BIGINT REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  UNIQUE (training_record_id, week_number)
);

CREATE TABLE IF NOT EXISTS company_evaluations (
  id BIGSERIAL PRIMARY KEY,
  training_record_id BIGINT NOT NULL UNIQUE REFERENCES training_records(id) ON DELETE CASCADE,
  attendance_score INTEGER NOT NULL CHECK (attendance_score BETWEEN 1 AND 5),
  technical_skills_score INTEGER NOT NULL CHECK (technical_skills_score BETWEEN 1 AND 5),
  communication_score INTEGER NOT NULL CHECK (communication_score BETWEEN 1 AND 5),
  teamwork_score INTEGER NOT NULL CHECK (teamwork_score BETWEEN 1 AND 5),
  punctuality_score INTEGER NOT NULL CHECK (punctuality_score BETWEEN 1 AND 5),
  overall_score NUMERIC(3, 2) NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  recommended_for_hiring BOOLEAN NOT NULL DEFAULT FALSE,
  comments TEXT,
  submitted_by BIGINT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE company_evaluations
  DROP CONSTRAINT IF EXISTS company_evaluations_submitted_by_fkey;

ALTER TABLE company_evaluations
  ADD CONSTRAINT company_evaluations_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES recruiters(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS application_messages (
  id BIGSERIAL PRIMARY KEY,
  application_id BIGINT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recruiter_id BIGINT NOT NULL REFERENCES recruiters(id) ON DELETE CASCADE,
  internship_id BIGINT NOT NULL REFERENCES internships(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL,
  sender_role VARCHAR(40) NOT NULL CHECK (sender_role IN ('student', 'recruiter')),
  message_body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE student_university_profiles
  ADD COLUMN IF NOT EXISTS location_preference VARCHAR(160),
  ADD COLUMN IF NOT EXISTS internship_type_preference VARCHAR(40);

ALTER TABLE internships
  ADD COLUMN IF NOT EXISTS required_skills TEXT,
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(80);

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS interview_date DATE,
  ADD COLUMN IF NOT EXISTS interview_time TIME,
  ADD COLUMN IF NOT EXISTS interview_location VARCHAR(240),
  ADD COLUMN IF NOT EXISTS meeting_link TEXT,
  ADD COLUMN IF NOT EXISTS interview_notes TEXT,
  ADD COLUMN IF NOT EXISTS interview_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS interview_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_internships_recruiter_id ON internships(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_internships_status ON internships(status);
CREATE INDEX IF NOT EXISTS idx_internships_status_created_at ON internships(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internships_type ON internships(type);
CREATE INDEX IF NOT EXISTS idx_internships_location ON internships(location);
CREATE INDEX IF NOT EXISTS idx_applications_internship_id ON applications(internship_id);
CREATE INDEX IF NOT EXISTS idx_applications_student_id ON applications(student_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at ON applications(applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
CREATE INDEX IF NOT EXISTS idx_universities_email_domain ON universities(email_domain);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_student_id ON student_university_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_university_id ON student_university_profiles(university_id);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_verification_status
  ON student_university_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_student_university_profiles_university_status
  ON student_university_profiles(university_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_recruiter_verifications_recruiter_id ON recruiter_verifications(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_recruiter_verifications_status ON recruiter_verifications(status);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_internship_id
  ON internship_university_approvals(internship_id);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_university_id
  ON internship_university_approvals(university_id);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_status ON internship_university_approvals(status);
CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_university_status
  ON internship_university_approvals(university_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON notifications(recipient_role, recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON notifications(recipient_role, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_role, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_training_records_student ON training_records(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_records_recruiter ON training_records(recruiter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_records_university ON training_records(university_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_records_status ON training_records(status);
CREATE INDEX IF NOT EXISTS idx_training_records_report_status ON training_records(final_report_status);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_training ON weekly_reports(training_record_id, week_number);
CREATE INDEX IF NOT EXISTS idx_company_evaluations_submitted_at ON company_evaluations(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_messages_thread ON application_messages(application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_application_messages_recipient_read
  ON application_messages(application_id, sender_role, is_read);
CREATE INDEX IF NOT EXISTS idx_applications_interview_date ON applications(interview_date);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_internships_updated_at ON internships;
CREATE TRIGGER set_internships_updated_at
BEFORE UPDATE ON internships
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_applications_updated_at ON applications;
CREATE TRIGGER set_applications_updated_at
BEFORE UPDATE ON applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

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
