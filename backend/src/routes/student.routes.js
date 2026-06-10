const express = require('express');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');

const router = express.Router();

router.use(authenticateToken, requireStudent);

const profileValidators = [
  body('university_id').isInt({ min: 1 }).withMessage('University is required.'),
  body('department_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid department.'),
  body('student_number').trim().isLength({ min: 1, max: 80 }).withMessage('Student number is required.'),
];

async function getCurrentProfile(studentId) {
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
      sup.updated_at,
      un.name AS university_name,
      d.name AS department_name
     FROM student_university_profiles sup
     JOIN universities un ON un.id = sup.university_id
     LEFT JOIN departments d ON d.id = sup.department_id
     WHERE sup.student_id = $1
     ORDER BY sup.updated_at DESC, sup.created_at DESC
     LIMIT 1`,
    [studentId],
  );

  return result.rows[0] || null;
}

async function validateUniversitySelection(universityId, departmentId) {
  const university = await pool.query(
    `SELECT id, name
     FROM universities
     WHERE id = $1
       AND status = 'active'`,
    [universityId],
  );

  if (!university.rows[0]) {
    return { error: 'Selected university is not available.' };
  }

  if (departmentId) {
    const department = await pool.query(
      `SELECT id
       FROM departments
       WHERE id = $1
         AND university_id = $2`,
      [departmentId, universityId],
    );

    if (!department.rows[0]) {
      return { error: 'Selected department does not belong to the selected university.' };
    }
  }

  return { university: university.rows[0] };
}

async function notifyUniversityAdmins(universityId, studentId) {
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
        title: 'Student university profile submitted',
        message: 'A student submitted a university profile for verification.',
        type: 'student_university_profile_submitted',
      }),
    ),
  );

  return admins.rows.length;
}

async function upsertProfile(req, res) {
  const universityId = Number(req.body.university_id);
  const departmentId = req.body.department_id ? Number(req.body.department_id) : null;
  const studentNumber = req.body.student_number.trim();
  const selection = await validateUniversitySelection(universityId, departmentId);

  if (selection.error) {
    return res.status(400).json({ message: selection.error });
  }

  const existing = await getCurrentProfile(req.auth.id);

  if (existing && existing.verification_status === 'verified') {
    return res.status(409).json({ message: 'Verified university profiles cannot be edited.' });
  }

  let profile;

  if (existing) {
    const result = await pool.query(
      `UPDATE student_university_profiles
       SET university_id = $1,
           department_id = $2,
           student_number = $3,
           verification_status = 'pending',
           verified_by = NULL,
           verified_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $4
         AND student_id = $5
       RETURNING *`,
      [universityId, departmentId, studentNumber, existing.id, req.auth.id],
    );
    profile = result.rows[0];
  } else {
    try {
      const result = await pool.query(
        `INSERT INTO student_university_profiles (student_id, university_id, department_id, student_number)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [req.auth.id, universityId, departmentId, studentNumber],
      );
      profile = result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        return res.status(409).json({ message: 'A profile already exists for this university.' });
      }

      throw error;
    }
  }

  const notifiedAdmins = await notifyUniversityAdmins(universityId, req.auth.id);

  await logAudit({
    actorRole: req.auth.role,
    actorId: req.auth.id,
    action: 'student_university_profile_submitted',
    entityType: 'student_university_profiles',
    entityId: profile.id,
    metadata: {
      universityId,
      departmentId,
      studentId: req.auth.id,
      notifiedAdmins,
    },
  });

  return res.status(existing ? 200 : 201).json({
    message: existing ? 'University profile updated.' : 'University profile submitted.',
    profile,
  });
}

router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const [studentResult, applicationsResult, profile, availableResult] = await Promise.all([
      pool.query(
        `SELECT id, full_name, email, dob, gender, major, study_year, address, resume_path, created_at
         FROM users
         WHERE id = $1`,
        [req.auth.id],
      ),
      pool.query(
        `SELECT
          a.id,
          a.status,
          a.applied_at,
          a.updated_at,
          i.id AS internship_id,
          i.title,
          COALESCE(i.company_name, r.company_name) AS company_name,
          i.location,
          i.type,
          i.deadline,
          i.status AS internship_status,
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
            ELSE 'rejected'
          END AS approval_status
         FROM applications a
         JOIN internships i ON i.id = a.internship_id
         JOIN recruiters r ON r.id = i.recruiter_id
         WHERE a.student_id = $1
         ORDER BY a.applied_at DESC`,
        [req.auth.id],
      ),
      getCurrentProfile(req.auth.id),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM internships i
         WHERE i.status = 'active'
           AND EXISTS (
             SELECT 1
             FROM internship_university_approvals iua
             WHERE iua.internship_id = i.id
               AND iua.status = 'approved'
           )`,
      ),
    ]);

    const student = studentResult.rows[0];
    const completionFields = [
      student.full_name,
      student.email,
      student.dob,
      student.gender,
      student.major,
      student.study_year,
      student.address,
      student.resume_path,
      profile,
    ];
    const completedFields = completionFields.filter(Boolean).length;

    return res.json({
      student: {
        ...student,
        has_resume: Boolean(student.resume_path),
        profile_completion: Math.round((completedFields / completionFields.length) * 100),
      },
      universityProfile: profile,
      applications: applicationsResult.rows,
      summary: {
        totalApplications: applicationsResult.rows.length,
        availableInternships: availableResult.rows[0].count,
        shortlistedApplications: applicationsResult.rows.filter((item) => item.status === 'shortlisted').length,
        acceptedApplications: applicationsResult.rows.filter((item) => item.status === 'accepted').length,
      },
    });
  }),
);

router.get(
  '/university-profile',
  asyncHandler(async (req, res) => {
    const profile = await getCurrentProfile(req.auth.id);

    return res.json({ profile });
  }),
);

router.post('/university-profile', profileValidators, validateRequest, asyncHandler(upsertProfile));
router.patch('/university-profile', profileValidators, validateRequest, asyncHandler(upsertProfile));

module.exports = router;
