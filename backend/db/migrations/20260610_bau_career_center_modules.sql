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
