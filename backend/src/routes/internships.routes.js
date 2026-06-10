const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validateRequest = require('../middleware/validate');
const { authenticateToken, requireRecruiter, requireStudent } = require('../middleware/auth');
const { removeUploadedFile, resumeUpload } = require('../middleware/upload');

const router = express.Router();
const publicApprovalFilter = `EXISTS (
  SELECT 1
  FROM internship_university_approvals approved_iua
  WHERE approved_iua.internship_id = i.id
    AND approved_iua.status = 'approved'
)`;

async function resolveApprovalUniversity(client) {
  const demoUniversityName = process.env.DEMO_UNIVERSITY_NAME || 'InternGuide Demo University';
  const demoUniversityDomain = process.env.DEMO_UNIVERSITY_DOMAIN || 'demo.edu';
  const result = await client.query(
    `SELECT id
     FROM universities
     ORDER BY
       CASE
         WHEN status = 'active' AND (name = $1 OR email_domain = $2) THEN 0
         WHEN status = 'active' THEN 1
         WHEN name = $1 OR email_domain = $2 THEN 2
         ELSE 3
       END,
       id
     LIMIT 1`,
    [demoUniversityName, demoUniversityDomain],
  );

  if (result.rows[0]) {
    return result.rows[0];
  }

  const created = await client.query(
    `INSERT INTO universities (name, email_domain, location, contact_email, status)
     VALUES ($1, $2, $3, $4, 'active')
     RETURNING id`,
    [
      demoUniversityName,
      demoUniversityDomain,
      process.env.DEMO_UNIVERSITY_LOCATION || 'Beirut',
      process.env.DEMO_UNIVERSITY_CONTACT_EMAIL || 'admin@demo.edu',
    ],
  );

  return created.rows[0];
}

const internshipValidators = [
  body('title').trim().isLength({ min: 3, max: 180 }).withMessage('Title is required.'),
  body('description').trim().isLength({ min: 10, max: 5000 }).withMessage('Description is required.'),
  body('location').trim().isLength({ min: 2, max: 160 }).withMessage('Location is required.'),
  body('category').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('type')
    .trim()
    .isIn(['Full Time', 'Part Time', 'Remote', 'Office Internship'])
    .withMessage('Type must be Full Time, Part Time, Remote, or Office Internship.'),
  body('requirements').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  body('stipend').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('deadline').optional({ checkFalsy: true }).isISO8601().withMessage('Deadline must be a valid date.'),
  body('status').optional({ checkFalsy: true }).isIn(['active', 'closed']),
];

const idValidator = [param('id').isInt({ min: 1 }).withMessage('Invalid internship id.')];

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filters = ['i.status = $1', publicApprovalFilter];
    const values = ['active'];
    let index = 2;

    if (req.query.keyword) {
      filters.push(
        `(i.title ILIKE $${index} OR i.description ILIKE $${index} OR i.category ILIKE $${index} OR r.company_name ILIKE $${index})`,
      );
      values.push(`%${req.query.keyword}%`);
      index += 1;
    }

    if (req.query.location) {
      filters.push(`i.location ILIKE $${index}`);
      values.push(`%${req.query.location}%`);
      index += 1;
    }

    if (req.query.type) {
      filters.push(`i.type = $${index}`);
      values.push(req.query.type);
      index += 1;
    }

    if (req.query.category) {
      filters.push(`i.category ILIKE $${index}`);
      values.push(`%${req.query.category}%`);
    }

    const result = await pool.query(
      `SELECT
        i.id,
        i.title,
        COALESCE(i.company_name, r.company_name) AS company_name,
        i.location,
        i.category,
        i.type,
        i.stipend,
        i.deadline,
        i.status,
        'approved' AS approval_status,
        i.created_at
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE ${filters.join(' AND ')}
       ORDER BY i.created_at DESC`,
      values,
    );

    return res.json({ internships: result.rows });
  }),
);

router.get(
  '/:id',
  idValidator,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        i.id,
        i.title,
        COALESCE(i.company_name, r.company_name) AS company_name,
        r.recruiter_name,
        i.description,
        i.location,
        i.category,
        i.type,
        i.requirements,
        i.stipend,
        i.deadline,
        i.status,
        'approved' AS approval_status,
        i.created_at,
        i.updated_at
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE i.id = $1
         AND i.status = 'active'
         AND ${publicApprovalFilter}`,
      [req.params.id],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Internship not found.' });
    }

    return res.json({ internship: result.rows[0] });
  }),
);

router.post(
  '/',
  authenticateToken,
  requireRecruiter,
  internshipValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO internships
          (recruiter_id, title, company_name, description, location, category, type, requirements, stipend, deadline, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, 'active'))
         RETURNING *`,
        [
          req.auth.id,
          req.body.title.trim(),
          req.body.company_name || null,
          req.body.description.trim(),
          req.body.location.trim(),
          req.body.category || null,
          req.body.type,
          req.body.requirements || null,
          req.body.stipend || null,
          req.body.deadline || null,
          req.body.status || null,
        ],
      );
      const internship = result.rows[0];
      const university = await resolveApprovalUniversity(client);

      await client.query(
        `INSERT INTO internship_university_approvals (internship_id, university_id, status)
         VALUES ($1, $2, 'pending')`,
        [internship.id, university.id],
      );

      await client.query('COMMIT');

      return res.status(201).json({
        message: 'Internship created.',
        internship,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }),
);

router.put(
  '/:id',
  authenticateToken,
  requireRecruiter,
  idValidator,
  internshipValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE internships
       SET title = $1,
           company_name = $2,
           description = $3,
           location = $4,
           category = $5,
           type = $6,
           requirements = $7,
           stipend = $8,
           deadline = $9,
           status = COALESCE($10, status),
           updated_at = NOW()
       WHERE id = $11 AND recruiter_id = $12
       RETURNING *`,
      [
        req.body.title.trim(),
        req.body.company_name || null,
        req.body.description.trim(),
        req.body.location.trim(),
        req.body.category || null,
        req.body.type,
        req.body.requirements || null,
        req.body.stipend || null,
        req.body.deadline || null,
        req.body.status || null,
        req.params.id,
        req.auth.id,
      ],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Internship not found or not owned by this recruiter.' });
    }

    return res.json({
      message: 'Internship updated.',
      internship: result.rows[0],
    });
  }),
);

router.delete(
  '/:id',
  authenticateToken,
  requireRecruiter,
  idValidator,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query('DELETE FROM internships WHERE id = $1 AND recruiter_id = $2 RETURNING id', [
      req.params.id,
      req.auth.id,
    ]);

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Internship not found or not owned by this recruiter.' });
    }

    return res.json({ message: 'Internship deleted.' });
  }),
);

router.post(
  '/:id/apply',
  authenticateToken,
  requireStudent,
  resumeUpload.single('resume'),
  idValidator,
  body('cover_letter').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'Resume file is required.' });
    }

    const internship = await pool.query(
      `SELECT i.id
       FROM internships i
       WHERE i.id = $1
         AND i.status = $2
         AND ${publicApprovalFilter}`,
      [req.params.id, 'active'],
    );

    if (!internship.rows[0]) {
      removeUploadedFile(req.file);
      return res.status(404).json({ message: 'Internship not found or closed.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO applications (internship_id, student_id, cover_letter, resume_path)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.params.id, req.auth.id, req.body.cover_letter || null, req.file.filename],
      );

      return res.status(201).json({
        message: 'Application submitted.',
        application: result.rows[0],
      });
    } catch (error) {
      if (error.code === '23505') {
        removeUploadedFile(req.file);
        return res.status(409).json({ message: 'You have already applied to this internship.' });
      }

      removeUploadedFile(req.file);
      throw error;
    }
  }),
);

module.exports = router;
