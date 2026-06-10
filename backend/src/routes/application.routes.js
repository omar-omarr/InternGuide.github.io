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
    const result = await pool.query(
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
       SELECT updated.*, i.title
       FROM updated
       JOIN internships i ON i.id = updated.internship_id`,
      [req.body.status, req.params.id, req.auth.id],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Application not found or not owned by this recruiter.' });
    }

    await createNotification({
      recipientRole: 'student',
      recipientId: result.rows[0].student_id,
      title: 'Application status updated',
      message: `Your application for "${result.rows[0].title}" is now ${req.body.status.replace(/_/g, ' ')}.`,
      type: 'application_status_changed',
    });
    await logAudit({
      actorRole: req.auth.role,
      actorId: req.auth.id,
      action: 'application_status_changed',
      entityType: 'applications',
      entityId: result.rows[0].id,
      metadata: { status: req.body.status, studentId: result.rows[0].student_id },
    });

    return res.json({
      message: 'Application status updated.',
      application: result.rows[0],
    });
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
