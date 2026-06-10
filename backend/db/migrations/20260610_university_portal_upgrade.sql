ALTER TABLE student_university_profiles
  ADD COLUMN IF NOT EXISTS faculty VARCHAR(160),
  ADD COLUMN IF NOT EXISTS major VARCHAR(160),
  ADD COLUMN IF NOT EXISTS academic_year VARCHAR(80),
  ADD COLUMN IF NOT EXISTS skills TEXT,
  ADD COLUMN IF NOT EXISTS gpa NUMERIC(3, 2);

ALTER TABLE student_university_profiles
  DROP CONSTRAINT IF EXISTS student_university_profiles_gpa_check;

ALTER TABLE student_university_profiles
  ADD CONSTRAINT student_university_profiles_gpa_check
  CHECK (gpa IS NULL OR (gpa >= 0 AND gpa <= 4));

ALTER TABLE applications
  DROP CONSTRAINT IF EXISTS applications_status_check;

UPDATE applications
SET status = 'viewed'
WHERE status = 'reviewed';

ALTER TABLE applications
  ADD CONSTRAINT applications_status_check
  CHECK (status IN ('submitted', 'viewed', 'shortlisted', 'interview_scheduled', 'accepted', 'rejected', 'withdrawn'));

INSERT INTO recruiter_verifications (recruiter_id, document_path, status)
SELECT r.id, 'account-registration', 'pending'
FROM recruiters r
WHERE NOT EXISTS (
  SELECT 1
  FROM recruiter_verifications rv
  WHERE rv.recruiter_id = r.id
);

CREATE INDEX IF NOT EXISTS idx_recruiter_verifications_recruiter_created
  ON recruiter_verifications(recruiter_id, created_at DESC);
