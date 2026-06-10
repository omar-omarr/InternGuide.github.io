const express = require('express');
const fs = require('fs');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validateRequest = require('../middleware/validate');
const { authenticateToken, requireRecruiter, requireStudent } = require('../middleware/auth');
const { resolveResumePath } = require('../middleware/upload');
const { createNotification } = require('../services/notification.service');
const { logAudit } = require('../services/audit.service');

const router = express.Router();
const recruiterStatuses = ['submitted', 'viewed', 'shortlisted', 'interview_scheduled', 'accepted', 'rejected'];
const applicationIdValidator = [param('id').isInt({ min: 1 }).withMessage('Invalid application id.')];

function canAccessResume(auth, application) {
  const id = Number(auth.id);

  return (
    (auth.role === 'recruiter' && Number(application.recruiter_id) === id) ||
    (auth.role === 'student' && Number(application.student_id) === id) ||
    auth.role === 'system_admin'
  );
}

router.patch(
  '/:id/status',
  authenticateToken,
  requireRecruiter,
  applicationIdValidator,
  body('status')
    .isIn(recruiterStatuses)
    .withMessage(`Status must be one of: ${recruiterStatuses.join(', ')}.`),
  validateRequest,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();
    let application;

    try {
      await client.query('BEGIN');
      const result = await client.query(
        `WITH updated AS (
           UPDATE applications a
           SET status = $1,
               updated_at = NOW()
           FROM internships i
           WHERE a.id = $2
             AND a.internship_id = i.id
             AND i.recruiter_id = $3
             AND a.status <> 'withdrawn'
           RETURNING a.*
         )
         SELECT updated.*, i.title, i.recruiter_id
         FROM updated
         JOIN internships i ON i.id = updated.internship_id`,
        [req.body.status, req.params.id, req.auth.id],
      );
      application = result.rows[0];

      if (!application) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Application not found or not owned by this recruiter.' });
      }

      if (req.body.status === 'accepted') {
        await client.query(
          `INSERT INTO training_records
            (application_id, student_id, recruiter_id, internship_id, university_id, status)
           SELECT
             a.id,
             a.student_id,
             i.recruiter_id,
             a.internship_id,
             sup.university_id,
             'not_started'
           FROM applications a
           JOIN internships i ON i.id = a.internship_id
           LEFT JOIN LATERAL (
             SELECT university_id
             FROM student_university_profiles
             WHERE student_id = a.student_id
             ORDER BY updated_at DESC, id DESC
             LIMIT 1
           ) sup ON true
           WHERE a.id = $1
           ON CONFLICT (application_id) DO NOTHING`,
          [application.id],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await createNotification({
      recipientRole: 'student',
      recipientId: application.student_id,
      title: 'Application status updated',
      message: `Your application for "${application.title}" is now ${req.body.status.replace(/_/g, ' ')}.`,
      type: 'application_status_changed',
    });
    await logAudit({
      actorRole: req.auth.role,
      actorId: req.auth.id,
      action: 'application_status_changed',
      entityType: 'applications',
      entityId: application.id,
      metadata: { status: req.body.status, studentId: application.student_id },
    });

    return res.json({
      message: 'Application status updated.',
      application,
    });
  }),
);

router.patch(
  '/:id/interview',
  authenticateToken,
  requireRecruiter,
  applicationIdValidator,
  body('interview_date').isISO8601().withMessage('Interview date is required.'),
  body('interview_time').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('Interview time must use HH:MM.'),
  body('interview_location').trim().isLength({ min: 2, max: 240 }).withMessage('Interview location is required.'),
  body('meeting_link').optional({ checkFalsy: true }).isURL({ protocols: ['http', 'https'], require_protocol: true }),
  body('interview_notes').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const interviewAt = new Date(`${req.body.interview_date}T${req.body.interview_time}:00`);

    if (Number.isNaN(interviewAt.getTime()) || interviewAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: 'Interview date and time must be in the future.' });
    }

    const result = await pool.query(
      `WITH updated AS (
         UPDATE applications a
         SET status = 'interview_scheduled',
             interview_date = $1,
             interview_time = $2,
             interview_location = $3,
             meeting_link = $4,
             interview_notes = $5,
             interview_created_at = COALESCE(interview_created_at, NOW()),
             interview_updated_at = NOW(),
             updated_at = NOW()
         FROM internships i
         WHERE a.id = $6
           AND a.internship_id = i.id
           AND i.recruiter_id = $7
           AND a.status NOT IN ('accepted', 'rejected', 'withdrawn')
         RETURNING a.*, i.title
       )
       SELECT * FROM updated`,
      [
        req.body.interview_date,
        req.body.interview_time,
        req.body.interview_location.trim(),
        req.body.meeting_link || null,
        req.body.interview_notes || null,
        req.params.id,
        req.auth.id,
      ],
    );
    const application = result.rows[0];

    if (!application) {
      return res.status(404).json({ message: 'Application not found or interview cannot be scheduled.' });
    }

    await createNotification({
      recipientRole: 'student',
      recipientId: application.student_id,
      title: 'Interview scheduled',
      message: `An interview for "${application.title}" is scheduled on ${req.body.interview_date} at ${req.body.interview_time}.`,
      type: 'interview_scheduled',
    });
    await logAudit({
      actorRole: req.auth.role,
      actorId: req.auth.id,
      action: 'application_interview_scheduled',
      entityType: 'applications',
      entityId: application.id,
      metadata: { interviewDate: req.body.interview_date, interviewTime: req.body.interview_time },
    });

    return res.json({ message: 'Interview scheduled.', application });
  }),
);

router.patch(
  '/:id/withdraw',
  authenticateToken,
  requireStudent,
  applicationIdValidator,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `WITH updated AS (
         UPDATE applications
         SET status = 'withdrawn',
             updated_at = NOW()
         WHERE id = $1
           AND student_id = $2
           AND status IN ('submitted', 'viewed', 'shortlisted', 'interview_scheduled')
         RETURNING *
       )
       SELECT updated.*, i.title, i.recruiter_id
       FROM updated
       JOIN internships i ON i.id = updated.internship_id`,
      [req.params.id, req.auth.id],
    );
    const application = result.rows[0];

    if (!application) {
      return res.status(409).json({ message: 'This application cannot be withdrawn.' });
    }

    await createNotification({
      recipientRole: 'recruiter',
      recipientId: application.recruiter_id,
      title: 'Application withdrawn',
      message: `A student withdrew an application for "${application.title}".`,
      type: 'application_withdrawn',
    });
    await logAudit({
      actorRole: req.auth.role,
      actorId: req.auth.id,
      action: 'application_withdrawn',
      entityType: 'applications',
      entityId: application.id,
      metadata: { internshipId: application.internship_id },
    });

    return res.json({
      message: 'Application withdrawn.',
      application,
    });
  }),
);

router.get(
  '/:id/resume',
  authenticateToken,
  applicationIdValidator,
  validateRequest,
  asyncHandler(async (req, res, next) => {
    const result = await pool.query(
      `SELECT
        a.id,
        a.resume_path,
        a.student_id,
        i.recruiter_id
       FROM applications a
       JOIN internships i ON i.id = a.internship_id
       WHERE a.id = $1`,
      [req.params.id],
    );
    const application = result.rows[0];

    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (!canAccessResume(req.auth, application)) {
      return res.status(403).json({ message: 'You do not have permission to access this resume.' });
    }

    const resolvedResume = resolveResumePath(application.resume_path);

    if (!resolvedResume) {
      return res.status(404).json({ message: 'Resume file not found.' });
    }

    try {
      await fs.promises.access(resolvedResume.fullPath, fs.constants.R_OK);
    } catch (error) {
      return res.status(404).json({ message: 'Resume file not found.' });
    }

    return res.download(resolvedResume.fullPath, resolvedResume.downloadName, (error) => {
      if (error && !res.headersSent) {
        next(error);
      }
    });
  }),
);

module.exports = router;
