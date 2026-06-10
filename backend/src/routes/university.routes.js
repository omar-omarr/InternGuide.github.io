const express = require('express');
const { body, param, query } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, requireUniversityAdmin } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');

const router = express.Router();
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
const reviewStatuses = ['approved', 'rejected'];
const verifyStatuses = ['verified', 'rejected'];

router.use(authenticateToken, requireUniversityAdmin, requireUniversityScope);

function requireUniversityScope(req, res, next) {
  if (!req.auth.universityId) {
    return res.status(403).json({ message: 'University admin account is not linked to a university.' });
  }

  return next();
}

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

async function writeAudit(req, action, entityType, entityId, metadata) {
  return logAudit({
    ...auditActor(req),
    action,
    entityType,
    entityId,
    metadata: {
      universityId: req.auth.universityId,
      ...(metadata || {}),
    },
  });
}

const paginationValidators = [
  query('page').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Page must be a positive number.'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).withMessage('Limit must be 1 to 100.'),
];

const idValidator = (name) => [param(name).isInt({ min: 1 }).withMessage(`Invalid ${name}.`)];

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    role: 'university_admin',
    universityId: req.auth.universityId,
  });
});

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const universityId = req.auth.universityId;
    const queries = await Promise.all([
      pool.query(
        `SELECT id, name, email_domain, location, contact_email, status
         FROM universities
         WHERE id = $1`,
        [universityId],
      ),
      pool.query('SELECT COUNT(*)::int AS count FROM student_university_profiles WHERE university_id = $1', [
        universityId,
      ]),
      pool.query(
        `SELECT verification_status, COUNT(*)::int AS count
         FROM student_university_profiles
         WHERE university_id = $1
         GROUP BY verification_status`,
        [universityId],
      ),
      pool.query(
        `SELECT status, COUNT(*)::int AS count
         FROM internship_university_approvals
         WHERE university_id = $1
         GROUP BY status`,
        [universityId],
      ),
      pool.query(
        `SELECT COUNT(DISTINCT a.id)::int AS count
         FROM applications a
         JOIN student_university_profiles sup ON sup.student_id = a.student_id
         WHERE sup.university_id = $1`,
        [universityId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM notifications
         WHERE recipient_role = 'university_admin'
           AND recipient_id = $1
           AND is_read = false`,
        [req.auth.id],
      ),
    ]);

    const university = queries[0].rows[0];

    if (!university) {
      return res.status(404).json({ message: 'Linked university was not found.' });
    }

    const studentCounts = Object.fromEntries(queries[2].rows.map((row) => [row.verification_status, row.count]));
    const approvalCounts = Object.fromEntries(queries[3].rows.map((row) => [row.status, row.count]));

    return res.json({
      university,
      summary: {
        totalLinkedStudents: queries[1].rows[0].count,
        pendingStudentVerifications: studentCounts.pending || 0,
        verifiedStudents: studentCounts.verified || 0,
        rejectedStudentVerifications: studentCounts.rejected || 0,
        pendingInternshipApprovals: approvalCounts.pending || 0,
        approvedInternshipApprovals: approvalCounts.approved || 0,
        rejectedInternshipApprovals: approvalCounts.rejected || 0,
        totalRelatedApplications: queries[4].rows[0].count,
        unreadNotifications: queries[5].rows[0].count,
      },
    });
  }),
);

router.get(
  '/students',
  query('status').optional({ checkFalsy: true }).isIn(studentVerificationStatuses),
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const status = req.query.status || null;
    const q = likeTerm(req.query.q);
    const values = [req.auth.universityId, status, q, limit, offset];
    const rows = await pool.query(
      `SELECT
        sup.id AS profile_id,
        sup.student_id,
        sup.university_id,
        sup.department_id,
        sup.student_number,
        sup.faculty,
        sup.major AS profile_major,
        sup.academic_year,
        sup.skills,
        sup.gpa,
        sup.verification_status,
        sup.verified_at,
        sup.rejection_reason,
        sup.created_at,
        sup.updated_at,
        u.full_name,
        u.email,
        u.major,
        u.study_year,
        d.name AS department_name
       FROM student_university_profiles sup
       JOIN users u ON u.id = sup.student_id
       LEFT JOIN departments d ON d.id = sup.department_id
       WHERE sup.university_id = $1
         AND ($2::text IS NULL OR sup.verification_status = $2)
         AND ($3 = '%%'
              OR u.full_name ILIKE $3
              OR u.email::text ILIKE $3
              OR u.major ILIKE $3
              OR sup.student_number ILIKE $3
              OR d.name ILIKE $3)
       ORDER BY sup.created_at DESC
       LIMIT $4 OFFSET $5`,
      values,
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM student_university_profiles sup
       JOIN users u ON u.id = sup.student_id
       LEFT JOIN departments d ON d.id = sup.department_id
       WHERE sup.university_id = $1
         AND ($2::text IS NULL OR sup.verification_status = $2)
         AND ($3 = '%%'
              OR u.full_name ILIKE $3
              OR u.email::text ILIKE $3
              OR u.major ILIKE $3
              OR sup.student_number ILIKE $3
              OR d.name ILIKE $3)`,
      [req.auth.universityId, status, q],
    );

    return res.json({
      students: rows.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/students/:profileId',
  idValidator('profileId'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        sup.id AS profile_id,
        sup.student_id,
        sup.university_id,
        sup.department_id,
        sup.student_number,
        sup.faculty,
        sup.major AS profile_major,
        sup.academic_year,
        sup.skills,
        sup.gpa,
        sup.verification_status,
        sup.verified_by,
        sup.verified_at,
        sup.rejection_reason,
        sup.created_at,
        sup.updated_at,
        u.full_name,
        u.email,
        u.dob,
        u.gender,
        u.major,
        u.study_year,
        u.address,
        un.name AS university_name,
        d.name AS department_name,
        au.full_name AS verified_by_name
       FROM student_university_profiles sup
       JOIN users u ON u.id = sup.student_id
       JOIN universities un ON un.id = sup.university_id
       LEFT JOIN departments d ON d.id = sup.department_id
       LEFT JOIN admin_users au ON au.id = sup.verified_by
       WHERE sup.id = $1
         AND sup.university_id = $2`,
      [req.params.profileId, req.auth.universityId],
    );
    const student = result.rows[0];

    if (!student) {
      return res.status(404).json({ message: 'Student university profile not found.' });
    }

    return res.json({ student });
  }),
);

router.patch(
  '/students/:profileId/verify',
  idValidator('profileId'),
  body('status').isIn(verifyStatuses).withMessage('Status must be verified or rejected.'),
  body('rejection_reason')
    .if(body('status').equals('rejected'))
    .trim()
    .notEmpty()
    .withMessage('Rejection reason is required when rejecting a student profile.'),
  body('rejection_reason').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE student_university_profiles
       SET verification_status = $1,
           verified_by = $2,
           verified_at = NOW(),
           rejection_reason = $3,
           updated_at = NOW()
       WHERE id = $4
         AND university_id = $5
       RETURNING *`,
      [
        req.body.status,
        req.auth.id,
        req.body.status === 'rejected' ? req.body.rejection_reason : null,
        req.params.profileId,
        req.auth.universityId,
      ],
    );
    const profile = result.rows[0];

    if (!profile) {
      return res.status(404).json({ message: 'Student university profile not found.' });
    }

    await createNotification({
      recipientRole: 'student',
      recipientId: profile.student_id,
      title: `University verification ${profile.verification_status}`,
      message:
        profile.verification_status === 'verified'
          ? 'Your university profile was verified.'
          : `Your university profile was rejected: ${profile.rejection_reason}`,
      type: 'student_university_verification',
    });

    await writeAudit(
      req,
      profile.verification_status === 'verified' ? 'student_university_verified' : 'student_university_rejected',
      'student_university_profiles',
      profile.id,
      {
        studentId: profile.student_id,
        status: profile.verification_status,
      },
    );

    return res.json({
      message: profile.verification_status === 'verified' ? 'Student verified.' : 'Student rejected.',
      profile,
    });
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
    const q = likeTerm(req.query.q);
    const result = await pool.query(
      `SELECT
        iua.id AS approval_id,
        iua.internship_id,
        iua.university_id,
        iua.department_id,
        iua.status,
        iua.reviewed_at,
        iua.notes,
        iua.created_at,
        i.title,
        i.location,
        i.category,
        i.type,
        COALESCE(i.company_name, r.company_name) AS company_name,
        r.recruiter_name,
        r.email AS recruiter_email,
        d.name AS department_name
       FROM internship_university_approvals iua
       JOIN internships i ON i.id = iua.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       LEFT JOIN departments d ON d.id = iua.department_id
       WHERE iua.university_id = $1
         AND ($2::text IS NULL OR iua.status = $2)
         AND ($3 = '%%'
              OR i.title ILIKE $3
              OR i.location ILIKE $3
              OR r.company_name ILIKE $3
              OR r.recruiter_name ILIKE $3
              OR d.name ILIKE $3)
       ORDER BY iua.created_at DESC
       LIMIT $4 OFFSET $5`,
      [req.auth.universityId, status, q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM internship_university_approvals iua
       JOIN internships i ON i.id = iua.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       LEFT JOIN departments d ON d.id = iua.department_id
       WHERE iua.university_id = $1
         AND ($2::text IS NULL OR iua.status = $2)
         AND ($3 = '%%'
              OR i.title ILIKE $3
              OR i.location ILIKE $3
              OR r.company_name ILIKE $3
              OR r.recruiter_name ILIKE $3
              OR d.name ILIKE $3)`,
      [req.auth.universityId, status, q],
    );

    return res.json({
      approvals: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/internship-approvals/:approvalId',
  idValidator('approvalId'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT
        iua.id AS approval_id,
        iua.internship_id,
        iua.university_id,
        iua.department_id,
        iua.status,
        iua.reviewed_by,
        iua.reviewed_at,
        iua.notes,
        iua.created_at,
        iua.updated_at,
        i.title,
        i.description,
        i.location,
        i.category,
        i.type,
        i.requirements,
        i.stipend,
        i.deadline,
        i.status AS internship_status,
        COALESCE(i.company_name, r.company_name) AS company_name,
        r.recruiter_name,
        r.email AS recruiter_email,
        d.name AS department_name,
        au.full_name AS reviewed_by_name
       FROM internship_university_approvals iua
       JOIN internships i ON i.id = iua.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       LEFT JOIN departments d ON d.id = iua.department_id
       LEFT JOIN admin_users au ON au.id = iua.reviewed_by
       WHERE iua.id = $1
         AND iua.university_id = $2`,
      [req.params.approvalId, req.auth.universityId],
    );
    const approval = result.rows[0];

    if (!approval) {
      return res.status(404).json({ message: 'Internship approval not found.' });
    }

    return res.json({ approval });
  }),
);

router.patch(
  '/internship-approvals/:approvalId/review',
  idValidator('approvalId'),
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
           AND university_id = $5
         RETURNING *
       )
       SELECT
         updated.*,
         i.title,
         i.recruiter_id,
         COALESCE(i.company_name, r.company_name) AS company_name
       FROM updated
       JOIN internships i ON i.id = updated.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id`,
      [
        req.body.status,
        req.auth.id,
        req.body.notes || null,
        req.params.approvalId,
        req.auth.universityId,
      ],
    );
    const approval = result.rows[0];

    if (!approval) {
      return res.status(404).json({ message: 'Internship approval not found.' });
    }

    if (approval.recruiter_id) {
      await createNotification({
        recipientRole: 'recruiter',
        recipientId: approval.recruiter_id,
        title: `University internship approval ${approval.status}`,
        message:
          approval.status === 'approved'
            ? `Your internship "${approval.title}" was approved by the university.`
            : `Your internship "${approval.title}" was rejected by the university: ${approval.notes}`,
        type: 'internship_university_approval',
      });
    }

    await writeAudit(
      req,
      approval.status === 'approved' ? 'internship_university_approved' : 'internship_university_rejected',
      'internship_university_approvals',
      approval.id,
      {
        internshipId: approval.internship_id,
        recruiterId: approval.recruiter_id,
        status: approval.status,
      },
    );

    return res.json({
      message: approval.status === 'approved' ? 'Internship approval accepted.' : 'Internship approval rejected.',
      approval,
    });
  }),
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
      `SELECT DISTINCT
        a.id,
        a.status AS application_status,
        a.applied_at AS created_at,
        u.full_name AS student_name,
        u.email AS student_email,
        i.title AS internship_title,
        COALESCE(i.company_name, r.company_name) AS company_name,
        r.recruiter_name,
        sup.verification_status AS university_verification_status
       FROM applications a
       JOIN users u ON u.id = a.student_id
       JOIN internships i ON i.id = a.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       JOIN student_university_profiles sup ON sup.student_id = a.student_id
       WHERE sup.university_id = $1
         AND ($2::text IS NULL OR a.status = $2)
         AND ($3 = '%%'
              OR u.full_name ILIKE $3
              OR u.email::text ILIKE $3
              OR i.title ILIKE $3
              OR r.company_name ILIKE $3
              OR r.recruiter_name ILIKE $3)
       ORDER BY a.applied_at DESC
       LIMIT $4 OFFSET $5`,
      [req.auth.universityId, status, q, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(DISTINCT a.id)::int AS total
       FROM applications a
       JOIN users u ON u.id = a.student_id
       JOIN internships i ON i.id = a.internship_id
       JOIN recruiters r ON r.id = i.recruiter_id
       JOIN student_university_profiles sup ON sup.student_id = a.student_id
       WHERE sup.university_id = $1
         AND ($2::text IS NULL OR a.status = $2)
         AND ($3 = '%%'
              OR u.full_name ILIKE $3
              OR u.email::text ILIKE $3
              OR i.title ILIKE $3
              OR r.company_name ILIKE $3
              OR r.recruiter_name ILIKE $3)`,
      [req.auth.universityId, status, q],
    );

    return res.json({
      applications: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.get(
  '/notifications',
  paginationValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const result = await pool.query(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE recipient_role = 'university_admin'
         AND recipient_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.auth.id, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM notifications
       WHERE recipient_role = 'university_admin'
         AND recipient_id = $1`,
      [req.auth.id],
    );

    return res.json({
      notifications: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

router.patch(
  '/notifications/read-all',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE recipient_role = 'university_admin'
         AND recipient_id = $1
         AND is_read = false
       RETURNING id`,
      [req.auth.id],
    );

    return res.json({
      message: 'Notifications marked as read.',
      updatedCount: result.rowCount,
    });
  }),
);

router.patch(
  '/notifications/:id/read',
  idValidator('id'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1
         AND recipient_role = 'university_admin'
         AND recipient_id = $2
       RETURNING id, title, message, type, is_read, created_at`,
      [req.params.id, req.auth.id],
    );
    const notification = result.rows[0];

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    return res.json({
      message: 'Notification marked as read.',
      notification,
    });
  }),
);

router.get(
  '/audit-logs',
  paginationValidators,
  query('action').optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  validateRequest,
  asyncHandler(async (req, res) => {
    const { page, limit, offset } = parsePagination(req);
    const action = req.query.action || null;
    const result = await pool.query(
      `SELECT id, actor_role, actor_id, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE (
          (actor_role = 'university_admin' AND actor_id = $1)
          OR metadata->>'universityId' = $2
       )
       AND ($3::text IS NULL OR action = $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [req.auth.id, String(req.auth.universityId), action, limit, offset],
    );
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM audit_logs
       WHERE (
          (actor_role = 'university_admin' AND actor_id = $1)
          OR metadata->>'universityId' = $2
       )
       AND ($3::text IS NULL OR action = $3)`,
      [req.auth.id, String(req.auth.universityId), action],
    );

    return res.json({
      auditLogs: result.rows,
      pagination: pageMeta(count.rows[0].total, page, limit),
    });
  }),
);

module.exports = router;
