const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const validateRequest = require('../middleware/validate');
const { authenticateToken, requireRecruiter, requireStudent } = require('../middleware/auth');
const { removeUploadedFile, resumeUpload } = require('../middleware/upload');
const { createNotification } = require('../services/notification.service');

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
  body('required_skills').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
  body('academic_year').optional({ checkFalsy: true }).trim().isLength({ max: 80 }),
  body('stipend').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('deadline').optional({ checkFalsy: true }).isISO8601().withMessage('Deadline must be a valid date.'),
  body('status').optional({ checkFalsy: true }).isIn(['active', 'closed']),
];

const idValidator = [param('id').isInt({ min: 1 }).withMessage('Invalid internship id.')];

async function requireApprovedRecruiter(req, res, next) {
  const result = await pool.query(
    `SELECT status
     FROM recruiter_verifications
     WHERE recruiter_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [req.auth.id],
  );

  if (!result.rows[0] || result.rows[0].status !== 'approved') {
    return res.status(403).json({
      message: 'Your company must be verified by an admin before you can publish internships.',
      verificationStatus: result.rows[0]?.status || 'pending',
    });
  }

  return next();
}

async function notifyUniversityAdmins(universityId, internship) {
  const admins = await pool.query(
    `SELECT id
     FROM admin_users
     WHERE role = 'university_admin'
       AND university_id = $1
       AND status = 'active'`,
    [universityId],
  );

  await Promise.all(
    admins.rows.map((admin) =>
      createNotification({
        recipientRole: 'university_admin',
        recipientId: admin.id,
        title: 'Internship approval required',
        message: `"${internship.title}" was submitted for university approval.`,
        type: 'internship_approval_submitted',
      }),
    ),
  );
}

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
        i.required_skills,
        i.academic_year,
        i.deadline,
        i.status,
        'approved' AS approval_status,
        EXISTS (
          SELECT 1
          FROM recruiter_verifications rv
          WHERE rv.recruiter_id = r.id
            AND rv.status = 'approved'
        ) AS recruiter_verified,
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
        i.required_skills,
        i.academic_year,
        i.stipend,
        i.deadline,
        i.status,
        'approved' AS approval_status,
        EXISTS (
          SELECT 1
          FROM recruiter_verifications rv
          WHERE rv.recruiter_id = r.id
            AND rv.status = 'approved'
        ) AS recruiter_verified,
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
  requireApprovedRecruiter,
  internshipValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO internships
          (recruiter_id, title, company_name, description, location, category, type, requirements, required_skills,
           academic_year, stipend, deadline, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 'active'))
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
          req.body.required_skills || null,
          req.body.academic_year || null,
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
      await notifyUniversityAdmins(university.id, internship).catch((error) => {
        console.error('Failed to notify university admins about internship submission:', error.message);
      });

      return res.status(201).json({
        message: 'Internship created and submitted for university approval.',
        internship: { ...internship, approval_status: 'pending', workflow_status: 'pending' },
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
  requireApprovedRecruiter,
  idValidator,
  internshipValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE internships
         SET title = $1,
             company_name = $2,
             description = $3,
             location = $4,
             category = $5,
             type = $6,
             requirements = $7,
             required_skills = $8,
             academic_year = $9,
             stipend = $10,
             deadline = $11,
             status = COALESCE($12, status),
             updated_at = NOW()
         WHERE id = $13 AND recruiter_id = $14
         RETURNING *`,
        [
          req.body.title.trim(),
          req.body.company_name || null,
          req.body.description.trim(),
          req.body.location.trim(),
          req.body.category || null,
          req.body.type,
          req.body.requirements || null,
          req.body.required_skills || null,
          req.body.academic_year || null,
          req.body.stipend || null,
          req.body.deadline || null,
          req.body.status || null,
          req.params.id,
          req.auth.id,
        ],
      );

      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Internship not found or not owned by this recruiter.' });
      }

      await client.query(
        `UPDATE internship_university_approvals
         SET status = 'pending',
             reviewed_by = NULL,
             reviewed_at = NULL,
             notes = NULL,
             updated_at = NOW()
         WHERE internship_id = $1`,
        [req.params.id],
      );
      await client.query('COMMIT');

      return res.json({
        message: 'Internship updated and resubmitted for university approval.',
        internship: { ...result.rows[0], approval_status: 'pending', workflow_status: 'pending' },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
      `SELECT i.id, i.recruiter_id, i.title
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
      await createNotification({
        recipientRole: 'recruiter',
        recipientId: internship.rows[0].recruiter_id,
        title: 'New internship application',
        message: `A student applied to "${internship.rows[0].title}".`,
        type: 'application_submitted',
      }).catch((error) => {
        console.error('Failed to notify recruiter about application submission:', error.message);
      });

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
