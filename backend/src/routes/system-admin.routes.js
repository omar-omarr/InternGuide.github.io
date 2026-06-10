const express = require('express');
const { body, param, query } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, requireSystemAdmin } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');

const router = express.Router();
const statuses = ['active', 'inactive'];
const reviewStatuses = ['approved', 'rejected'];
const verificationStatuses = ['pending', 'approved', 'rejected'];
const studentVerificationStatuses = ['pending', 'verified', 'rejected'];
const approvalStatuses = ['pending', 'approved', 'rejected'];
const applicationStatuses = [
  'submitted',
  'viewed',
  'shortlisted',
  'interview_scheduled',
  'accepted',
  'rejected',
  'withdrawn',
];

router.use(authenticateToken, requireSystemAdmin);

function parsePagination(req) {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const requestedLimit = Number.parseInt(req.query.limit, 10) || 20;
  const limit = Math.min(Math.max(requestedLimit, 1), 100);

  return {
    limit,
    page,
    offset: (page - 1) * limit,
  };
}

function pageMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}

function likeTerm(value) {
  return `%${String(value || '').trim()}%`;
}

function auditActor(req) {
  return {
    actorRole: req.auth.role,
    actorId: req.auth.id,
  };
}

function domainValidator(field) {
  return body(field)
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[A-Za-z]{2,}$/)
    .withMessage('Email domain must look like example.edu.');
}

const idValidator = (name = 'id') => [param(name).isInt({ min: 1 }).withMessage(`Invalid ${name}.`)];

const universityCreateValidators = [
  body('name').trim().isLength({ min: 2, max: 180 }).withMessage('University name is required.'),
  domainValidator('email_domain'),
  body('location').optional({ checkFalsy: true }).trim().isLength({ max: 180 }),
  body('contact_email').optional({ checkFalsy: true }).isEmail().withMessage('Contact email must be valid.').normalizeEmail(),
  body('status').optional({ checkFalsy: true }).isIn(statuses).withMessage('Status must be active or inactive.'),
];

const universityUpdateValidators = [
  body('name').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 180 }),
  domainValidator('email_domain'),
  body('location').optional({ checkFalsy: true }).trim().isLength({ max: 180 }),
  body('contact_email').optional({ checkFalsy: true }).isEmail().withMessage('Contact email must be valid.').normalizeEmail(),
  body('status').optional({ checkFalsy: true }).isIn(statuses).withMessage('Status must be active or inactive.'),
];

const paginationValidators = [
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Page must be a positive number.'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('Limit must be 1 to 100.'),
];

async function writeAudit(req, action, entityType, entityId, metadata) {
  return logAudit({
    ...auditActor(req),
    action,
    entityType,
    entityId,
    metadata,
  });
}

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    role: 'system_admin',
  });
});

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const queries = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count FROM users'),
      pool.query('SELECT COUNT(*)::int AS count FROM recruiters'),
      pool.query('SELECT COUNT(*)::int AS count FROM universities'),
      pool.query('SELECT COUNT(*)::int AS count FROM departments'),
      pool.query('SELECT COUNT(*)::int AS count FROM internships'),
      pool.query("SELECT COUNT(*)::int AS count FROM internships WHERE status = 'active'"),
      pool.query("SELECT COUNT(*)::int AS count FROM internships WHERE status = 'closed'"),
      pool.query('SELECT COUNT(*)::int AS count FROM applications'),
      pool.query("SELECT COUNT(*)::int AS count FROM recruiter_verifications WHERE status = 'pending'"),
      pool.query("SELECT COUNT(*)::int AS count FROM student_university_profiles WHERE verification_status = 'pending'"),
      pool.query("SELECT COUNT(*)::int AS count FROM internship_university_approvals WHERE status = 'pending'"),
      pool.query(
        "SELECT COUNT(*)::int AS count FROM notifications WHERE recipient_role = 'system_admin' AND recipient_id = $1 AND is_read = false",
        [req.auth.id],
      ),
    ]);

    const [
      totalStudents,
      totalRecruiters,
      totalUniversities,
      totalDepartments,
      totalInternships,
      activeInternships,
      closedInternships,
      totalApplications,
      pendingRecruiterVerifications,
      pendingStudentUniversityVerifications,
      pendingInternshipUniversityApprovals,
      totalUnreadNotifications,
    ] = queries.map((result) => result.rows[0].count);

    res.json({
      summary: {
        totalStudents,
        totalRecruiters,
        totalUniversities,
        totalDepartments,
        totalInternships,
        activeInternships,
        closedInternships,
        totalApplications,
        pendingRecruiterVerifications,
        pendingStudentUniversityVerifications,
        pendingInternshipUniversityApprovals,
        totalUnreadNotifications,
      },
    });
  }),
);

router.get(
  '/universities',
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT id, name, email_domain, location, contact_email, status, created_at, updated_at
       FROM universities
       WHERE $1 = '%%'
          OR name ILIKE $1
          OR email_domain::text ILIKE $1
          OR location ILIKE $1
          OR contact_email::text ILIKE $1
       ORDER BY name ASC
       LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM universities
       WHERE $1 = '%%'
          OR name ILIKE $1
          OR email_domain::text ILIKE $1
          OR location ILIKE $1
          OR contact_email::text ILIKE $1`,
      [q],
    );

    res.json({
      universities: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.post(
  '/universities',
  universityCreateValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        `INSERT INTO universities (name, email_domain, location, contact_email, status)
         VALUES ($1, $2, $3, $4, COALESCE($5, 'active'))
         RETURNING id, name, email_domain, location, contact_email, status, created_at, updated_at`,
        [
          req.body.name.trim(),
          req.body.email_domain || null,
          req.body.location || null,
          req.body.contact_email || null,
          req.body.status || null,
        ],
      );
      const university = result.rows[0];

      await writeAudit(req, 'university_created', 'universities', university.id, { university });

      res.status(201).json({
        message: 'University created.',
        university,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'A university with this email domain already exists.' });
      }

      throw error;
    }
  }),
);

router.get(
  '/universities/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, email_domain, location, contact_email, status, created_at, updated_at
       FROM universities
       WHERE id = $1`,
      [req.params.id],
    );
    const university = result.rows[0];

    if (!university) {
      return res.status(404).json({ message: 'University not found.' });
    }

    const departments = await pool.query(
      `SELECT id, name, created_at
       FROM departments
       WHERE university_id = $1
       ORDER BY name ASC`,
      [req.params.id],
    );

    res.json({
      university,
      departments: departments.rows,
    });
  }),
);

router.patch(
  '/universities/:id',
  idValidator(),
  universityUpdateValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    if (!['name', 'email_domain', 'location', 'contact_email', 'status'].some((key) => key in req.body)) {
      return res.status(400).json({ message: 'At least one university field is required.' });
    }

    try {
      const result = await pool.query(
        `UPDATE universities
         SET name = COALESCE($1, name),
             email_domain = COALESCE($2, email_domain),
             location = COALESCE($3, location),
             contact_email = COALESCE($4, contact_email),
             status = COALESCE($5, status),
             updated_at = NOW()
         WHERE id = $6
         RETURNING id, name, email_domain, location, contact_email, status, created_at, updated_at`,
        [
          req.body.name ? req.body.name.trim() : null,
          req.body.email_domain || null,
          req.body.location || null,
          req.body.contact_email || null,
          req.body.status || null,
          req.params.id,
        ],
      );
      const university = result.rows[0];

      if (!university) {
        return res.status(404).json({ message: 'University not found.' });
      }

      await writeAudit(req, 'university_updated', 'universities', university.id, { updatedFields: req.body });

      res.json({
        message: 'University updated.',
        university,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'A university with this email domain already exists.' });
      }

      throw error;
    }
  }),
);

router.patch(
  '/universities/:id/status',
  idValidator(),
  body('status').isIn(statuses).withMessage('Status must be active or inactive.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE universities
       SET status = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, email_domain, location, contact_email, status, created_at, updated_at`,
      [req.body.status, req.params.id],
    );
    const university = result.rows[0];

    if (!university) {
      return res.status(404).json({ message: 'University not found.' });
    }

    await writeAudit(req, 'university_status_changed', 'universities', university.id, { status: university.status });

    res.json({
      message: 'University status updated.',
      university,
    });
  }),
);

router.get(
  '/universities/:universityId/departments',
  idValidator('universityId'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, university_id, name, created_at
       FROM departments
       WHERE university_id = $1
       ORDER BY name ASC`,
      [req.params.universityId],
    );

    res.json({ departments: result.rows });
  }),
);

router.post(
  '/universities/:universityId/departments',
  idValidator('universityId'),
  body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Department name is required.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const university = await pool.query('SELECT id FROM universities WHERE id = $1', [req.params.universityId]);

    if (!university.rows[0]) {
      return res.status(404).json({ message: 'University not found.' });
    }

    try {
      const result = await pool.query(
        `INSERT INTO departments (university_id, name)
         VALUES ($1, $2)
         RETURNING id, university_id, name, created_at`,
        [req.params.universityId, req.body.name.trim()],
      );
      const department = result.rows[0];

      await writeAudit(req, 'department_created', 'departments', department.id, {
        universityId: department.university_id,
        name: department.name,
      });

      res.status(201).json({
        message: 'Department created.',
        department,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'This department already exists for the selected university.' });
      }

      throw error;
    }
  }),
);

router.patch(
  '/departments/:id',
  idValidator(),
  body('name').trim().isLength({ min: 2, max: 160 }).withMessage('Department name is required.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE departments
         SET name = $1
         WHERE id = $2
         RETURNING id, university_id, name, created_at`,
        [req.body.name.trim(), req.params.id],
      );
      const department = result.rows[0];

      if (!department) {
        return res.status(404).json({ message: 'Department not found.' });
      }

      await writeAudit(req, 'department_updated', 'departments', department.id, {
        universityId: department.university_id,
        name: department.name,
      });

      res.json({
        message: 'Department updated.',
        department,
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'This department already exists for the selected university.' });
      }

      throw error;
    }
  }),
);

router.delete(
  '/departments/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const references = await pool.query(
      `SELECT
        d.id,
        d.university_id,
        d.name,
        (SELECT COUNT(*)::int FROM student_university_profiles s WHERE s.department_id = d.id) AS student_profiles,
        (SELECT COUNT(*)::int FROM internship_university_approvals a WHERE a.department_id = d.id) AS approvals
       FROM departments d
       WHERE d.id = $1`,
      [req.params.id],
    );
    const department = references.rows[0];

    if (!department) {
      return res.status(404).json({ message: 'Department not found.' });
    }

    if (department.student_profiles > 0 || department.approvals > 0) {
      return res.status(409).json({
        message: 'Department is referenced by student profiles or internship approvals and cannot be deleted.',
      });
    }

    await pool.query('DELETE FROM departments WHERE id = $1', [req.params.id]);
    await writeAudit(req, 'department_deleted', 'departments', department.id, {
      universityId: department.university_id,
      name: department.name,
    });

    res.json({ message: 'Department deleted.' });
  }),
);

router.get(
  '/recruiter-verifications',
  query('status').optional({ checkFalsy: true }).isIn(verificationStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const result = await pool.query(
      `SELECT
        rv.id,
        rv.recruiter_id,
        rv.document_path,
        rv.status,
        rv.reviewed_at,
        rv.rejection_reason,
        rv.created_at,
        r.company_name,
        r.recruiter_name,
        r.email
       FROM recruiter_verifications rv
       JOIN recruiters r ON r.id = rv.recruiter_id
       WHERE $1::text IS NULL OR rv.status = $1
       ORDER BY rv.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM recruiter_verifications
       WHERE $1::text IS NULL OR status = $1`,
      [status],
    );

    res.json({
      verifications: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/recruiter-verifications/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        rv.*,
        r.company_name,
        r.recruiter_name,
        r.email,
        r.contact,
        r.country,
        r.city,
        r.about_company,
        au.full_name AS reviewed_by_name
       FROM recruiter_verifications rv
       JOIN recruiters r ON r.id = rv.recruiter_id
       LEFT JOIN admin_users au ON au.id = rv.reviewed_by
       WHERE rv.id = $1`,
      [req.params.id],
    );
    const verification = result.rows[0];

    if (!verification) {
      return res.status(404).json({ message: 'Recruiter verification not found.' });
    }

    res.json({ verification });
  }),
);

router.patch(
  '/recruiter-verifications/:id/review',
  idValidator(),
  body('status').isIn(reviewStatuses).withMessage('Status must be approved or rejected.'),
  body('rejection_reason')
    .if(body('status').equals('rejected'))
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting a verification.'),
  body('rejection_reason').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE recruiter_verifications
       SET status = $1,
           reviewed_by = $2,
           reviewed_at = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $4 AND status = 'pending'
       RETURNING *`,
      [
        req.body.status,
        req.auth.id,
        req.body.status === 'rejected' ? req.body.rejection_reason : null,
        req.params.id,
      ],
    );
    const verification = result.rows[0];

    if (!verification) {
      return res.status(404).json({ message: 'Pending recruiter verification not found.' });
    }

    await createNotification({
      recipientRole: 'recruiter',
      recipientId: verification.recruiter_id,
      title: `Recruiter verification ${verification.status}`,
      message:
        verification.status === 'approved'
          ? 'Your recruiter verification was approved.'
          : `Your recruiter verification was rejected: ${verification.rejection_reason}`,
      type: 'recruiter_verification_review',
    });

    await writeAudit(req, 'recruiter_verification_reviewed', 'recruiter_verifications', verification.id, {
      recruiterId: verification.recruiter_id,
      status: verification.status,
    });

    res.json({
      message: 'Recruiter verification reviewed.',
      verification,
    });
  }),
);

router.get(
  '/student-verifications',
  query('status').optional({ checkFalsy: true }).isIn(studentVerificationStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const result = await pool.query(
      `SELECT
        sup.id,
        sup.student_id,
        sup.university_id,
        sup.department_id,
        sup.student_number,
        sup.verification_status,
        sup.verified_at,
        sup.rejection_reason,
        sup.created_at,
        u.full_name,
        u.email,
        u.major,
        un.name AS university_name,
        d.name AS department_name
       FROM student_university_profiles sup
       JOIN users u ON u.id = sup.student_id
       JOIN universities un ON un.id = sup.university_id
       LEFT JOIN departments d ON d.id = sup.department_id
       WHERE $1::text IS NULL OR sup.verification_status = $1
       ORDER BY sup.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM student_university_profiles
       WHERE $1::text IS NULL OR verification_status = $1`,
      [status],
    );

    res.json({
      verifications: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/student-verifications/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        sup.*,
        u.full_name,
        u.email,
        u.major,
        u.study_year,
        un.name AS university_name,
        d.name AS department_name,
        au.full_name AS verified_by_name
       FROM student_university_profiles sup
       JOIN users u ON u.id = sup.student_id
       JOIN universities un ON un.id = sup.university_id
       LEFT JOIN departments d ON d.id = sup.department_id
       LEFT JOIN admin_users au ON au.id = sup.verified_by
       WHERE sup.id = $1`,
      [req.params.id],
    );
    const verification = result.rows[0];

    if (!verification) {
      return res.status(404).json({ message: 'Student verification not found.' });
    }

    res.json({ verification });
  }),
);

router.get(
  '/internship-approvals',
  query('status').optional({ checkFalsy: true }).isIn(approvalStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const result = await pool.query(
      `SELECT
        iua.id,
        iua.internship_id,
        iua.university_id,
        iua.department_id,
        iua.status,
        iua.reviewed_at,
        iua.created_at,
        i.title,
        r.company_name,
        un.name AS university_name,
        d.name AS department_name
       FROM internship_university_approvals iua
       JOIN internships i ON i.id = iua.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       JOIN universities un ON un.id = iua.university_id
       LEFT JOIN departments d ON d.id = iua.department_id
       WHERE $1::text IS NULL OR iua.status = $1
       ORDER BY iua.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM internship_university_approvals
       WHERE $1::text IS NULL OR status = $1`,
      [status],
    );

    res.json({
      approvals: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/internship-approvals/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        iua.*,
        i.title,
        i.description,
        i.location,
        i.category,
        i.type,
        i.status AS internship_status,
        r.company_name,
        r.recruiter_name,
        r.email AS recruiter_email,
        un.name AS university_name,
        d.name AS department_name,
        au.full_name AS reviewed_by_name
       FROM internship_university_approvals iua
       JOIN internships i ON i.id = iua.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       JOIN universities un ON un.id = iua.university_id
       LEFT JOIN departments d ON d.id = iua.department_id
       LEFT JOIN admin_users au ON au.id = iua.reviewed_by
       WHERE iua.id = $1`,
      [req.params.id],
    );
    const approval = result.rows[0];

    if (!approval) {
      return res.status(404).json({ message: 'Internship approval not found.' });
    }

    res.json({ approval });
  }),
);

router.patch(
  '/internship-approvals/:id/review',
  idValidator(),
  body('status').isIn(reviewStatuses).withMessage('Status must be approved or rejected.'),
  body('notes')
    .if(body('status').equals('rejected'))
    .trim()
    .notEmpty()
    .withMessage('Notes are required when rejecting an internship approval.'),
  body('notes').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `WITH updated AS (
         UPDATE internship_university_approvals
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = NOW(),
             notes = $3,
             updated_at = NOW()
         WHERE id = $4
         RETURNING *
       )
       SELECT updated.*, i.title, i.recruiter_id
       FROM updated
       JOIN internships i ON i.id = updated.internship_id`,
      [req.body.status, req.auth.id, req.body.notes || null, req.params.id],
    );
    const approval = result.rows[0];

    if (!approval) {
      return res.status(404).json({ message: 'Internship approval not found.' });
    }

    await createNotification({
      recipientRole: 'recruiter',
      recipientId: approval.recruiter_id,
      title: `Internship approval ${approval.status}`,
      message:
        approval.status === 'approved'
          ? `Your internship "${approval.title}" was approved.`
          : `Your internship "${approval.title}" was rejected: ${approval.notes}`,
      type: 'internship_university_approval',
    });
    await writeAudit(req, 'internship_approval_reviewed', 'internship_university_approvals', approval.id, {
      status: approval.status,
      internshipId: approval.internship_id,
    });

    return res.json({ message: 'Internship approval reviewed.', approval });
  }),
);

router.get(
  '/internships',
  query('status').optional({ checkFalsy: true }).isIn(['active', 'closed']),
  query('approval_status').optional({ checkFalsy: true }).isIn(approvalStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const approvalStatus = req.query.approval_status || null;
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT
        i.id,
        i.title,
        COALESCE(i.company_name, r.company_name) AS company_name,
        i.location,
        i.category,
        i.type,
        i.deadline,
        i.status,
        CASE
          WHEN i.status = 'closed' THEN 'closed'
          WHEN EXISTS (
            SELECT 1 FROM internship_university_approvals approved
            WHERE approved.internship_id = i.id AND approved.status = 'approved'
          ) THEN 'approved'
          WHEN EXISTS (
            SELECT 1 FROM internship_university_approvals rejected
            WHERE rejected.internship_id = i.id AND rejected.status = 'rejected'
          ) THEN 'rejected'
          ELSE 'pending'
        END AS workflow_status,
        (
          SELECT pending_approval.id
          FROM internship_university_approvals pending_approval
          WHERE pending_approval.internship_id = i.id
          ORDER BY pending_approval.created_at DESC, pending_approval.id DESC
          LIMIT 1
        ) AS approval_id,
        i.created_at,
        COUNT(a.id)::int AS application_count
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       LEFT JOIN applications a ON a.internship_id = i.id
       WHERE ($1::text IS NULL OR i.status = $1)
         AND ($2 = '%%' OR i.title ILIKE $2 OR i.location ILIKE $2 OR r.company_name ILIKE $2)
         AND (
           $3::text IS NULL
           OR ($3 = 'closed' AND i.status = 'closed')
           OR EXISTS (
             SELECT 1 FROM internship_university_approvals filtered_approval
             WHERE filtered_approval.internship_id = i.id
               AND filtered_approval.status = $3
           )
         )
       GROUP BY i.id, r.company_name
       ORDER BY i.created_at DESC
       LIMIT $4 OFFSET $5`,
      [status, q, approvalStatus, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE ($1::text IS NULL OR i.status = $1)
         AND ($2 = '%%' OR i.title ILIKE $2 OR i.location ILIKE $2 OR r.company_name ILIKE $2)
         AND (
           $3::text IS NULL
           OR ($3 = 'closed' AND i.status = 'closed')
           OR EXISTS (
             SELECT 1 FROM internship_university_approvals filtered_approval
             WHERE filtered_approval.internship_id = i.id
               AND filtered_approval.status = $3
           )
         )`,
      [status, q, approvalStatus],
    );

    res.json({
      internships: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/internships/:id',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        i.*,
        COALESCE(i.company_name, r.company_name) AS display_company_name,
        r.company_name AS recruiter_company_name,
        r.recruiter_name,
        r.email AS recruiter_email,
        COUNT(a.id)::int AS application_count
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       LEFT JOIN applications a ON a.internship_id = i.id
       WHERE i.id = $1
       GROUP BY i.id, r.company_name, r.recruiter_name, r.email`,
      [req.params.id],
    );
    const internship = result.rows[0];

    if (!internship) {
      return res.status(404).json({ message: 'Internship not found.' });
    }

    res.json({ internship });
  }),
);

async function updateInternshipStatus(req, res, status, action) {
  const result = await pool.query(
    `UPDATE internships
     SET status = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [status, req.params.id],
  );
  const internship = result.rows[0];

  if (!internship) {
    return res.status(404).json({ message: 'Internship not found.' });
  }

  await writeAudit(req, action, 'internships', internship.id, { status: internship.status });

  return res.json({
    message: status === 'closed' ? 'Internship closed.' : 'Internship reopened.',
    internship,
  });
}

router.patch(
  '/internships/:id/close',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => updateInternshipStatus(req, res, 'closed', 'internship_closed')),
);

router.patch(
  '/internships/:id/reopen',
  idValidator(),
  validateRequest,
  asyncHandler(async (req, res) => updateInternshipStatus(req, res, 'active', 'internship_reopened')),
);

router.get(
  '/applications',
  query('status').optional({ checkFalsy: true }).isIn(applicationStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT
        a.id,
        a.status,
        a.applied_at,
        a.updated_at,
        a.interview_date,
        a.interview_time,
        a.interview_location,
        a.meeting_link,
        a.interview_notes,
        u.full_name AS student_name,
        u.email AS student_email,
        i.title AS internship_title,
        COALESCE(i.company_name, r.company_name) AS company_name
       FROM applications a
       JOIN users u ON u.id = a.student_id
       JOIN internships i ON i.id = a.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE ($1::text IS NULL OR a.status = $1)
         AND ($2 = '%%'
              OR u.full_name ILIKE $2
              OR u.email::text ILIKE $2
              OR i.title ILIKE $2
              OR r.company_name ILIKE $2)
       ORDER BY a.applied_at DESC
       LIMIT $3 OFFSET $4`,
      [status, q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM applications a
       JOIN users u ON u.id = a.student_id
       JOIN internships i ON i.id = a.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE ($1::text IS NULL OR a.status = $1)
         AND ($2 = '%%'
              OR u.full_name ILIKE $2
              OR u.email::text ILIKE $2
              OR i.title ILIKE $2
              OR r.company_name ILIKE $2)`,
      [status, q],
    );

    return res.json({
      applications: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/students',
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT id, full_name, email, major, study_year, created_at
       FROM users
       WHERE $1 = '%%'
          OR full_name ILIKE $1
          OR email::text ILIKE $1
          OR major ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM users
       WHERE $1 = '%%'
          OR full_name ILIKE $1
          OR email::text ILIKE $1
          OR major ILIKE $1`,
      [q],
    );

    res.json({
      students: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/recruiters',
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT
        r.id,
        r.company_name,
        r.recruiter_name,
        r.email,
        r.contact,
        r.country,
        r.city,
        r.created_at,
        COALESCE((
          SELECT rv.status
          FROM recruiter_verifications rv
          WHERE rv.recruiter_id = r.id
          ORDER BY rv.created_at DESC, rv.id DESC
          LIMIT 1
        ), 'pending') AS verification_status
       FROM recruiters r
       WHERE $1 = '%%'
          OR r.company_name ILIKE $1
          OR r.recruiter_name ILIKE $1
          OR r.email::text ILIKE $1
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM recruiters
       WHERE $1 = '%%'
          OR company_name ILIKE $1
          OR recruiter_name ILIKE $1
          OR email::text ILIKE $1`,
      [q],
    );

    res.json({
      recruiters: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/audit-logs',
  paginationValidators,
  query('actor_role').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
  query('action').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  query('entity_type').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const filters = [];
    const values = [];

    ['actor_role', 'action', 'entity_type'].forEach((field) => {
      if (req.query[field]) {
        values.push(req.query[field]);
        filters.push(`${field} = $${values.length}`);
      }
    });

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT id, actor_role, actor_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM audit_logs
       ${where}`,
      values,
    );

    res.json({
      auditLogs: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

module.exports = router;
