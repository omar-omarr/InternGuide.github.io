CREATE INDEX IF NOT EXISTS idx_student_university_profiles_university_status
  ON student_university_profiles(university_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_internship_university_approvals_university_status
  ON internship_university_approvals(university_id, status);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON notifications(recipient_role, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING GIN (metadata);
