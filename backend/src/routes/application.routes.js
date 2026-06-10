const express = require('express');
const fs = require('fs');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validateRequest = require('../middleware/validate');
const { authenticateToken, requireRecruiter } = require('../middleware/auth');
const { resolveResumePath } = require('../middleware/upload');

const router = express.Router();
const statuses = ['submitted', 'reviewed', 'shortlisted', 'rejected', 'accepted'];
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
  body('status').isIn(statuses).withMessage(`Status must be one of: ${statuses.join(', ')}.`),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE applications a
       SET status = $1,
           updated_at = NOW()
       FROM internships i
       WHERE a.id = $2
         AND a.internship_id = i.id
         AND i.recruiter_id = $3
       RETURNING a.*`,
      [req.body.status, req.params.id, req.auth.id],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Application not found or not owned by this recruiter.' });
    }

    return res.json({
      message: 'Application status updated.',
      application: result.rows[0],
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
