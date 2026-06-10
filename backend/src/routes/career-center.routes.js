const express = require('express');
const fs = require('fs');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, ROLES } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { removeUploadedFile, reportUpload, resolveReportPath } = require('../middleware/upload');
const { createNotification } = require('../services/notification.service');

const router = express.Router();
const trainingStatuses = [
  'not_started',
  'training_started',
  'weekly_reports_pending',
  'company_evaluated',
  'student_report_submitted',
  'university_reviewed',
  'completed',
  'cancelled',
];
const scoreFields = [
  'attendance_score',
  'technical_skills_score',
  'communication_score',
  'teamwork_score',
  'punctuality_score',
];

router.use(authenticateToken);

function isAdmin(auth) {
  return auth.role === ROLES.SYSTEM_ADMIN || auth.role === ROLES.UNIVERSITY_ADMIN;
}

function canAccessTraining(auth, training) {
  return (
    auth.role === ROLES.SYSTEM_ADMIN ||
    (auth.role === ROLES.UNIVERSITY_ADMIN && Number(auth.universityId) === Number(training.university_id)) ||
    (auth.role === ROLES.STUDENT && Number(auth.id) === Number(training.student_id)) ||
    (auth.role === ROLES.RECRUITER && Number(auth.id) === Number(training.recruiter_id))
  );
}

function canSuperviseTraining(auth, training) {
  return (
    auth.role === ROLES.SYSTEM_ADMIN ||
    (auth.role === ROLES.UNIVERSITY_ADMIN && Number(auth.universityId) === Number(training.university_id))
  );
}

function canAccessApplication(auth, application) {
  return (
    auth.role === ROLES.SYSTEM_ADMIN ||
    (auth.role === ROLES.UNIVERSITY_ADMIN && Number(auth.universityId) === Number(application.university_id)) ||
    (auth.role === ROLES.STUDENT && Number(auth.id) === Number(application.student_id)) ||
    (auth.role === ROLES.RECRUITER && Number(auth.id) === Number(application.recruiter_id))
  );
}

async function getTrainingRecord(id) {
  const result = await pool.query(
    `SELECT
      tr.*,
      a.status AS application_status,
      a.interview_date,
      a.interview_time,
      a.interview_location,
      a.meeting_link,
      a.interview_notes,
      u.full_name AS student_name,
      u.email AS student_email,
      i.title AS internship_title,
      i.location AS internship_location,
      r.company_name,
      un.name AS university_name,
      ce.id AS evaluation_id,
      ce.attendance_score,
      ce.technical_skills_score,
      ce.communication_score,
      ce.teamwork_score,
      ce.punctuality_score,
      ce.overall_score,
      ce.recommended_for_hiring,
      ce.comments AS evaluation_comments,
      ce.submitted_at AS evaluation_submitted_at
     FROM training_records tr
     JOIN applications a ON a.id = tr.application_id
     JOIN users u ON u.id = tr.student_id
     JOIN internships i ON i.id = tr.internship_id
     JOIN recruiters r ON r.id = tr.recruiter_id
     LEFT JOIN universities un ON un.id = tr.university_id
     LEFT JOIN company_evaluations ce ON ce.training_record_id = tr.id
     WHERE tr.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

async function getApplication(id) {
  const result = await pool.query(
    `SELECT
      a.id,
      a.student_id,
      a.internship_id,
      i.recruiter_id,
      i.title AS internship_title,
      sup.university_id
     FROM applications a
     JOIN internships i ON i.id = a.internship_id
     LEFT JOIN LATERAL (
       SELECT university_id
       FROM student_university_profiles
       WHERE student_id = a.student_id
       ORDER BY updated_at DESC, id DESC
       LIMIT 1
     ) sup ON true
     WHERE a.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

function trainingIdValidator() {
  return param('id').isInt({ min: 1 }).withMessage('Invalid training record id.');
}

function applicationIdValidator() {
  return param('id').isInt({ min: 1 }).withMessage('Invalid application id.');
}

function csvCell(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function sendCsv(res, dataset, rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  const csv = [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))]
    .filter(Boolean)
    .join('\r\n');

  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`);
  return res.send(csv);
}

router.get(
  '/training-records',
  asyncHandler(async (req, res) => {
    const filters = [];
    const values = [];

    if (req.auth.role === ROLES.STUDENT) {
      values.push(req.auth.id);
      filters.push(`tr.student_id = $${values.length}`);
    } else if (req.auth.role === ROLES.RECRUITER) {
      values.push(req.auth.id);
      filters.push(`tr.recruiter_id = $${values.length}`);
    } else if (req.auth.role === ROLES.UNIVERSITY_ADMIN) {
      values.push(req.auth.universityId);
      filters.push(`tr.university_id = $${values.length}`);
    }

    if (req.query.status) {
      values.push(req.query.status);
      filters.push(`tr.status = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT
        tr.*,
        u.full_name AS student_name,
        u.email AS student_email,
        i.title AS internship_title,
        r.company_name,
        un.name AS university_name,
        ce.overall_score,
        ce.recommended_for_hiring,
        ce.attendance_score,
        ce.technical_skills_score,
        ce.communication_score,
        ce.teamwork_score,
        ce.punctuality_score,
        ce.comments AS evaluation_comments,
        ce.submitted_at AS evaluation_submitted_at
       FROM training_records tr
       JOIN users u ON u.id = tr.student_id
       JOIN internships i ON i.id = tr.internship_id
       JOIN recruiters r ON r.id = tr.recruiter_id
       LEFT JOIN universities un ON un.id = tr.university_id
       LEFT JOIN company_evaluations ce ON ce.training_record_id = tr.id
       ${where}
       ORDER BY tr.updated_at DESC, tr.id DESC`,
      values,
    );

    return res.json({ trainingRecords: result.rows });
  }),
);

router.get(
  '/training-records/:id',
  trainingIdValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (!canAccessTraining(req.auth, training)) {
      return res.status(403).json({ message: 'You do not have permission to access this training record.' });
    }

    const reports = await pool.query(
      `SELECT id, week_number, summary, challenges, next_steps, submitted_at, reviewed_at, review_notes
       FROM weekly_reports
       WHERE training_record_id = $1
       ORDER BY week_number`,
      [training.id],
    );

    return res.json({ trainingRecord: training, weeklyReports: reports.rows });
  }),
);

router.patch(
  '/training-records/:id/status',
  trainingIdValidator(),
  body('status').isIn(trainingStatuses).withMessage('Invalid training status.'),
  body('start_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid start date.'),
  body('end_date').optional({ checkFalsy: true }).isISO8601().withMessage('Invalid end date.'),
  body('company_supervisor_name').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    const recruiterStatuses = new Set(['not_started', 'training_started', 'weekly_reports_pending', 'company_evaluated', 'cancelled']);
    const allowed =
      canSuperviseTraining(req.auth, training) ||
      (req.auth.role === ROLES.RECRUITER &&
        Number(req.auth.id) === Number(training.recruiter_id) &&
        recruiterStatuses.has(req.body.status));

    if (!allowed) {
      return res.status(403).json({ message: 'You do not have permission to update this training status.' });
    }

    const result = await pool.query(
      `UPDATE training_records
       SET status = $1,
           start_date = COALESCE($2, start_date),
           end_date = COALESCE($3, end_date),
           company_supervisor_name = COALESCE($4, company_supervisor_name),
           university_supervisor_id = CASE
             WHEN $5::text = 'university_admin' THEN $6
             ELSE university_supervisor_id
           END,
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        req.body.status,
        req.body.start_date || null,
        req.body.end_date || null,
        req.body.company_supervisor_name || null,
        req.auth.role,
        req.auth.id,
        training.id,
      ],
    );

    await createNotification({
      recipientRole: 'student',
      recipientId: training.student_id,
      title: 'Training status updated',
      message: `Your training for "${training.internship_title}" is now ${req.body.status.replace(/_/g, ' ')}.`,
      type: 'training_status_changed',
    });

    return res.json({ message: 'Training status updated.', trainingRecord: result.rows[0] });
  }),
);

router.post(
  '/training-records/:id/weekly-reports',
  trainingIdValidator(),
  body('week_number').isInt({ min: 1, max: 60 }).withMessage('Week number must be between 1 and 60.'),
  body('summary').trim().isLength({ min: 10, max: 5000 }).withMessage('Weekly summary is required.'),
  body('challenges').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  body('next_steps').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (req.auth.role !== ROLES.STUDENT || Number(req.auth.id) !== Number(training.student_id)) {
      return res.status(403).json({ message: 'Only the assigned student can submit weekly reports.' });
    }

    const result = await pool.query(
      `INSERT INTO weekly_reports (training_record_id, week_number, summary, challenges, next_steps)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (training_record_id, week_number)
       DO UPDATE SET
         summary = EXCLUDED.summary,
         challenges = EXCLUDED.challenges,
         next_steps = EXCLUDED.next_steps,
         submitted_at = NOW()
       RETURNING *`,
      [training.id, req.body.week_number, req.body.summary.trim(), req.body.challenges || null, req.body.next_steps || null],
    );
    await pool.query(
      `UPDATE training_records
       SET status = CASE WHEN status = 'not_started' THEN 'weekly_reports_pending' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [training.id],
    );

    return res.status(201).json({ message: 'Weekly report saved.', weeklyReport: result.rows[0] });
  }),
);

router.post(
  '/training-records/:id/evaluation',
  trainingIdValidator(),
  ...scoreFields.map((field) => body(field).isInt({ min: 1, max: 5 }).withMessage(`${field} must be from 1 to 5.`)),
  body('recommended_for_hiring').isBoolean().withMessage('Hiring recommendation must be true or false.'),
  body('comments').optional({ checkFalsy: true }).trim().isLength({ max: 5000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (req.auth.role !== ROLES.RECRUITER || Number(req.auth.id) !== Number(training.recruiter_id)) {
      return res.status(403).json({ message: 'Only the assigned recruiter can submit the company evaluation.' });
    }

    if (training.application_status !== 'accepted' || training.status === 'cancelled') {
      return res.status(409).json({ message: 'Evaluation is only available for an accepted, active training record.' });
    }

    const scores = scoreFields.map((field) => Number(req.body[field]));
    const overall = scores.reduce((total, score) => total + score, 0) / scores.length;
    const result = await pool.query(
      `INSERT INTO company_evaluations
        (training_record_id, attendance_score, technical_skills_score, communication_score, teamwork_score,
         punctuality_score, overall_score, recommended_for_hiring, comments, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (training_record_id)
       DO UPDATE SET
         attendance_score = EXCLUDED.attendance_score,
         technical_skills_score = EXCLUDED.technical_skills_score,
         communication_score = EXCLUDED.communication_score,
         teamwork_score = EXCLUDED.teamwork_score,
         punctuality_score = EXCLUDED.punctuality_score,
         overall_score = EXCLUDED.overall_score,
         recommended_for_hiring = EXCLUDED.recommended_for_hiring,
         comments = EXCLUDED.comments,
         submitted_by = EXCLUDED.submitted_by,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING *`,
      [
        training.id,
        ...scores,
        overall.toFixed(2),
        req.body.recommended_for_hiring,
        req.body.comments || null,
        req.auth.id,
      ],
    );
    await pool.query(
      `UPDATE training_records
       SET status = CASE WHEN status IN ('not_started', 'training_started', 'weekly_reports_pending') THEN 'company_evaluated' ELSE status END,
           updated_at = NOW()
       WHERE id = $1`,
      [training.id],
    );
    await createNotification({
      recipientRole: 'student',
      recipientId: training.student_id,
      title: 'Company evaluation submitted',
      message: `Your company evaluation for "${training.internship_title}" is available.`,
      type: 'company_evaluation_submitted',
    });

    return res.status(201).json({ message: 'Company evaluation saved.', evaluation: result.rows[0] });
  }),
);

router.post(
  '/training-records/:id/final-report',
  trainingIdValidator(),
  validateRequest,
  reportUpload.single('report'),
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      removeUploadedFile(req.file);
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (req.auth.role !== ROLES.STUDENT || Number(req.auth.id) !== Number(training.student_id)) {
      removeUploadedFile(req.file);
      return res.status(403).json({ message: 'Only the assigned student can upload the final report.' });
    }

    if (training.status === 'cancelled') {
      removeUploadedFile(req.file);
      return res.status(409).json({ message: 'A final report cannot be submitted for cancelled training.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Final report PDF is required.' });
    }

    const previous = resolveReportPath(training.final_report_path);
    const result = await pool.query(
      `UPDATE training_records
       SET final_report_path = $1,
           final_report_status = 'submitted',
           final_report_submitted_at = NOW(),
           final_report_reviewed_by = NULL,
           final_report_reviewed_at = NULL,
           final_report_notes = NULL,
           status = CASE WHEN status = 'completed' THEN status ELSE 'student_report_submitted' END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [req.file.filename, training.id],
    );

    if (previous) {
      fs.promises.unlink(previous.fullPath).catch(() => {});
    }

    const admins = await pool.query(
      `SELECT id
       FROM admin_users
       WHERE role = 'university_admin'
         AND university_id = $1
         AND status = 'active'`,
      [training.university_id],
    );
    await Promise.all(
      admins.rows.map((admin) =>
        createNotification({
          recipientRole: 'university_admin',
          recipientId: admin.id,
          title: 'Final internship report submitted',
          message: `${training.student_name} submitted a final report for "${training.internship_title}".`,
          type: 'final_report_submitted',
        }),
      ),
    );

    return res.status(201).json({ message: 'Final report submitted.', trainingRecord: result.rows[0] });
  }),
);

router.get(
  '/training-records/:id/final-report',
  trainingIdValidator(),
  validateRequest,
  asyncHandler(async (req, res, next) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (!canAccessTraining(req.auth, training)) {
      return res.status(403).json({ message: 'You do not have permission to access this report.' });
    }

    const report = resolveReportPath(training.final_report_path);

    if (!report) {
      return res.status(404).json({ message: 'Final report not found.' });
    }

    try {
      await fs.promises.access(report.fullPath, fs.constants.R_OK);
    } catch (error) {
      return res.status(404).json({ message: 'Final report not found.' });
    }

    return res.download(report.fullPath, report.downloadName, (error) => {
      if (error && !res.headersSent) {
        next(error);
      }
    });
  }),
);

router.patch(
  '/training-records/:id/final-report/review',
  trainingIdValidator(),
  body('status').isIn(['approved', 'rejected']).withMessage('Report status must be approved or rejected.'),
  body('notes')
    .if(body('status').equals('rejected'))
    .trim()
    .notEmpty()
    .withMessage('Review notes are required when rejecting a report.'),
  body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 5000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const training = await getTrainingRecord(req.params.id);

    if (!training) {
      return res.status(404).json({ message: 'Training record not found.' });
    }

    if (!canSuperviseTraining(req.auth, training)) {
      return res.status(403).json({ message: 'Only an authorized university or system admin can review reports.' });
    }

    if (!training.final_report_path) {
      return res.status(409).json({ message: 'No final report has been submitted.' });
    }

    const result = await pool.query(
      `UPDATE training_records
       SET final_report_status = $1::text,
           final_report_reviewed_by = $2,
           final_report_reviewed_at = NOW(),
           final_report_notes = $3,
           status = CASE WHEN $1::text = 'approved' THEN 'university_reviewed' ELSE status END,
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [req.body.status, req.auth.id, req.body.notes || null, training.id],
    );
    await createNotification({
      recipientRole: 'student',
      recipientId: training.student_id,
      title: `Final report ${req.body.status}`,
      message: `Your final report for "${training.internship_title}" was ${req.body.status}.`,
      type: 'final_report_reviewed',
    });

    return res.json({ message: 'Final report reviewed.', trainingRecord: result.rows[0] });
  }),
);

router.get(
  '/applications/:id/messages',
  applicationIdValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const application = await getApplication(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (!canAccessApplication(req.auth, application)) {
      return res.status(403).json({ message: 'You do not have permission to view this message thread.' });
    }

    const result = await pool.query(
      `SELECT id, application_id, sender_id, sender_role, message_body, is_read, created_at
       FROM application_messages
       WHERE application_id = $1
       ORDER BY created_at, id`,
      [application.id],
    );

    return res.json({ application, messages: result.rows });
  }),
);

router.post(
  '/applications/:id/messages',
  applicationIdValidator(),
  body('message_body').trim().isLength({ min: 1, max: 4000 }).withMessage('Message is required.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const application = await getApplication(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (![ROLES.STUDENT, ROLES.RECRUITER].includes(req.auth.role) || !canAccessApplication(req.auth, application)) {
      return res.status(403).json({ message: 'Only the applicant and assigned recruiter can send messages.' });
    }

    const result = await pool.query(
      `INSERT INTO application_messages
        (application_id, student_id, recruiter_id, internship_id, sender_id, sender_role, message_body)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, application_id, sender_id, sender_role, message_body, is_read, created_at`,
      [
        application.id,
        application.student_id,
        application.recruiter_id,
        application.internship_id,
        req.auth.id,
        req.auth.role,
        req.body.message_body.trim(),
      ],
    );
    const recipientRole = req.auth.role === ROLES.STUDENT ? ROLES.RECRUITER : ROLES.STUDENT;
    const recipientId = recipientRole === ROLES.STUDENT ? application.student_id : application.recruiter_id;
    await createNotification({
      recipientRole,
      recipientId,
      title: 'New application message',
      message: `A new message was sent about "${application.internship_title}".`,
      type: 'application_message',
    });

    return res.status(201).json({ message: 'Message sent.', threadMessage: result.rows[0] });
  }),
);

router.patch(
  '/applications/:id/messages/read',
  applicationIdValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const application = await getApplication(req.params.id);

    if (!application || !canAccessApplication(req.auth, application)) {
      return res.status(404).json({ message: 'Application thread not found.' });
    }

    if (![ROLES.STUDENT, ROLES.RECRUITER].includes(req.auth.role)) {
      return res.status(403).json({ message: 'Only thread participants can mark messages as read.' });
    }

    const result = await pool.query(
      `UPDATE application_messages
       SET is_read = true
       WHERE application_id = $1
         AND sender_role <> $2
         AND is_read = false
       RETURNING id`,
      [application.id, req.auth.role],
    );

    return res.json({ message: 'Messages marked as read.', updated: result.rowCount });
  }),
);

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    if (!isAdmin(req.auth)) {
      return res.status(403).json({ message: 'Analytics are restricted to university and system admins.' });
    }

    const universityId = req.auth.role === ROLES.UNIVERSITY_ADMIN ? req.auth.universityId : null;
    const [summary, applicationsByDepartment, internshipsByDepartment, acceptedByMajor, topCompanies] = await Promise.all([
      pool.query(
        `SELECT
          (SELECT COUNT(DISTINCT sup.student_id)::int FROM student_university_profiles sup WHERE ($1::bigint IS NULL OR sup.university_id = $1)) AS total_students,
          (SELECT COUNT(DISTINCT i.recruiter_id)::int FROM internships i LEFT JOIN internship_university_approvals iua ON iua.internship_id = i.id WHERE ($1::bigint IS NULL OR iua.university_id = $1)) AS total_recruiters,
          (SELECT COUNT(DISTINCT rv.recruiter_id)::int FROM recruiter_verifications rv WHERE rv.status = 'approved') AS approved_recruiters,
          (SELECT COUNT(*)::int FROM recruiter_verifications rv WHERE rv.status = 'pending') AS pending_recruiters,
          (SELECT COUNT(DISTINCT i.id)::int FROM internships i LEFT JOIN internship_university_approvals iua ON iua.internship_id = i.id WHERE i.status = 'active' AND ($1::bigint IS NULL OR iua.university_id = $1)) AS active_internships,
          (SELECT COUNT(*)::int FROM internship_university_approvals iua WHERE iua.status = 'pending' AND ($1::bigint IS NULL OR iua.university_id = $1)) AS pending_internship_approvals,
          (SELECT COUNT(DISTINCT a.id)::int FROM applications a LEFT JOIN student_university_profiles sup ON sup.student_id = a.student_id WHERE ($1::bigint IS NULL OR sup.university_id = $1)) AS total_applications,
          (SELECT COUNT(DISTINCT a.id)::int FROM applications a LEFT JOIN student_university_profiles sup ON sup.student_id = a.student_id WHERE a.status = 'accepted' AND ($1::bigint IS NULL OR sup.university_id = $1)) AS accepted_applications,
          (SELECT COUNT(*)::int FROM training_records tr WHERE tr.status NOT IN ('completed', 'cancelled') AND ($1::bigint IS NULL OR tr.university_id = $1)) AS active_training_records,
          (SELECT COUNT(*)::int FROM training_records tr WHERE tr.status = 'completed' AND ($1::bigint IS NULL OR tr.university_id = $1)) AS completed_trainings,
          (SELECT COUNT(*)::int FROM training_records tr WHERE tr.final_report_status IN ('submitted', 'approved') AND ($1::bigint IS NULL OR tr.university_id = $1)) AS submitted_final_reports,
          (SELECT COUNT(*)::int FROM training_records tr LEFT JOIN company_evaluations ce ON ce.training_record_id = tr.id WHERE ce.id IS NULL AND tr.status <> 'cancelled' AND ($1::bigint IS NULL OR tr.university_id = $1)) AS pending_evaluations`,
        [universityId],
      ),
      pool.query(
        `SELECT COALESCE(d.name, 'Unassigned') AS department, COUNT(DISTINCT a.id)::int AS count
         FROM applications a
         LEFT JOIN student_university_profiles sup ON sup.student_id = a.student_id
         LEFT JOIN departments d ON d.id = sup.department_id
         WHERE ($1::bigint IS NULL OR sup.university_id = $1)
         GROUP BY d.name
         ORDER BY count DESC`,
        [universityId],
      ),
      pool.query(
        `SELECT COALESCE(d.name, 'University-wide') AS department, COUNT(DISTINCT iua.internship_id)::int AS count
         FROM internship_university_approvals iua
         LEFT JOIN departments d ON d.id = iua.department_id
         WHERE ($1::bigint IS NULL OR iua.university_id = $1)
         GROUP BY d.name
         ORDER BY count DESC`,
        [universityId],
      ),
      pool.query(
        `SELECT COALESCE(sup.major, u.major, 'Unspecified') AS major, COUNT(DISTINCT a.id)::int AS count
         FROM applications a
         JOIN users u ON u.id = a.student_id
         LEFT JOIN student_university_profiles sup ON sup.student_id = a.student_id
         WHERE a.status = 'accepted' AND ($1::bigint IS NULL OR sup.university_id = $1)
         GROUP BY COALESCE(sup.major, u.major, 'Unspecified')
         ORDER BY count DESC`,
        [universityId],
      ),
      pool.query(
        `SELECT r.company_name, COUNT(DISTINCT i.id)::int AS internships
         FROM recruiters r
         JOIN internships i ON i.recruiter_id = r.id
         LEFT JOIN internship_university_approvals iua ON iua.internship_id = i.id
         WHERE ($1::bigint IS NULL OR iua.university_id = $1)
         GROUP BY r.id, r.company_name
         ORDER BY internships DESC, r.company_name
         LIMIT 10`,
        [universityId],
      ),
    ]);
    const data = summary.rows[0];
    const trainingTotal = data.active_training_records + data.completed_trainings;

    return res.json({
      summary: {
        ...data,
        training_completion_rate: trainingTotal ? Math.round((data.completed_trainings / trainingTotal) * 100) : 0,
      },
      applicationsByDepartment: applicationsByDepartment.rows,
      internshipsByDepartment: internshipsByDepartment.rows,
      acceptedStudentsByMajor: acceptedByMajor.rows,
      topCompanies: topCompanies.rows,
    });
  }),
);

router.get(
  '/exports/:dataset',
  param('dataset').isIn(['applications', 'students', 'recruiters', 'training-records', 'evaluations']),
  validateRequest,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req.auth)) {
      return res.status(403).json({ message: 'Exports are restricted to university and system admins.' });
    }

    const universityId = req.auth.role === ROLES.UNIVERSITY_ADMIN ? req.auth.universityId : null;
    const queries = {
      applications: `SELECT a.id, u.full_name AS student, u.email, i.title AS internship, r.company_name, a.status, a.applied_at
        FROM applications a JOIN users u ON u.id = a.student_id JOIN internships i ON i.id = a.internship_id
        JOIN recruiters r ON r.id = i.recruiter_id LEFT JOIN student_university_profiles sup ON sup.student_id = a.student_id
        WHERE ($1::bigint IS NULL OR sup.university_id = $1) ORDER BY a.applied_at DESC`,
      students: `SELECT u.id, u.full_name, u.email, COALESCE(sup.major, u.major) AS major, d.name AS department,
        sup.verification_status, sup.gpa FROM users u LEFT JOIN student_university_profiles sup ON sup.student_id = u.id
        LEFT JOIN departments d ON d.id = sup.department_id WHERE ($1::bigint IS NULL OR sup.university_id = $1)
        ORDER BY u.full_name`,
      recruiters: `SELECT DISTINCT r.id, r.company_name, r.recruiter_name, r.email, r.city, r.country
        FROM recruiters r LEFT JOIN internships i ON i.recruiter_id = r.id
        LEFT JOIN internship_university_approvals iua ON iua.internship_id = i.id
        WHERE ($1::bigint IS NULL OR iua.university_id = $1) ORDER BY r.company_name`,
      'training-records': `SELECT tr.id, u.full_name AS student, i.title AS internship, r.company_name, un.name AS university,
        tr.status, tr.start_date, tr.end_date, tr.final_report_status, tr.created_at
        FROM training_records tr JOIN users u ON u.id = tr.student_id JOIN internships i ON i.id = tr.internship_id
        JOIN recruiters r ON r.id = tr.recruiter_id LEFT JOIN universities un ON un.id = tr.university_id
        WHERE ($1::bigint IS NULL OR tr.university_id = $1) ORDER BY tr.created_at DESC`,
      evaluations: `SELECT ce.id, u.full_name AS student, i.title AS internship, r.company_name, ce.attendance_score,
        ce.technical_skills_score, ce.communication_score, ce.teamwork_score, ce.punctuality_score, ce.overall_score,
        ce.recommended_for_hiring, ce.comments, ce.submitted_at
        FROM company_evaluations ce JOIN training_records tr ON tr.id = ce.training_record_id
        JOIN users u ON u.id = tr.student_id JOIN internships i ON i.id = tr.internship_id
        JOIN recruiters r ON r.id = tr.recruiter_id WHERE ($1::bigint IS NULL OR tr.university_id = $1)
        ORDER BY ce.submitted_at DESC`,
    };
    const result = await pool.query(queries[req.params.dataset], [universityId]);

    return sendCsv(res, req.params.dataset, result.rows);
  }),
);

module.exports = router;
