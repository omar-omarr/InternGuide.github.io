const express = require('express');
const { param } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validateRequest = require('../middleware/validate');
const { authenticateToken, requireRecruiter } = require('../middleware/auth');

const router = express.Router();
const recruiterOnly = [authenticateToken, requireRecruiter];
const idValidator = [param('id').isInt({ min: 1 }).withMessage('Invalid internship id.')];

router.get(
  '/internships',
  recruiterOnly,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        i.*,
        COALESCE(ac.application_count, 0)::int AS application_count,
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM internship_university_approvals iua
            WHERE iua.internship_id = i.id
              AND iua.status = 'approved'
          ) THEN 'approved'
          WHEN EXISTS (
            SELECT 1
            FROM internship_university_approvals iua
            WHERE iua.internship_id = i.id
              AND iua.status = 'pending'
          ) THEN 'pending'
          WHEN EXISTS (
            SELECT 1
            FROM internship_university_approvals iua
            WHERE iua.internship_id = i.id
              AND iua.status = 'rejected'
          ) THEN 'rejected'
          ELSE 'not_submitted'
        END AS approval_status
       FROM internships i
       LEFT JOIN (
         SELECT internship_id, COUNT(*)::int AS application_count
         FROM applications
         GROUP BY internship_id
       ) ac ON ac.internship_id = i.id
       WHERE i.recruiter_id = $1
       ORDER BY i.created_at DESC`,
      [req.auth.id],
    );

    return res.json({ internships: result.rows });
  }),
);

router.get(
  '/internships/:id/applications',
  recruiterOnly,
  idValidator,
  validateRequest,
  asyncHandler(async (req, res) => {
    const ownership = await pool.query('SELECT id, title FROM internships WHERE id = $1 AND recruiter_id = $2', [
      req.params.id,
      req.auth.id,
    ]);

    if (!ownership.rows[0]) {
      return res.status(404).json({ message: 'Internship not found or not owned by this recruiter.' });
    }

    const result = await pool.query(
      `SELECT
        a.id,
        a.cover_letter,
        a.resume_path,
        a.status,
        a.applied_at,
        a.updated_at,
        u.id AS student_id,
        u.full_name,
        u.email,
        u.major,
        u.study_year
       FROM applications a
       JOIN users u ON u.id = a.student_id
       WHERE a.internship_id = $1
       ORDER BY a.applied_at DESC`,
      [req.params.id],
    );

    return res.json({
      internship: ownership.rows[0],
      applications: result.rows,
    });
  }),
);

module.exports = router;
