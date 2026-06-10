const express = require('express');
const { body, param } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, requireStudent } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { logAudit } = require('../services/audit.service');
const { createNotification } = require('../services/notification.service');
const { calculateMatch } = require('../services/matching.service');

const router = express.Router();

router.use(authenticateToken, requireStudent);

const profileValidators = [
  body('university_id').isInt({ min: 1 }).withMessage('University is required.'),
  body('department_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Invalid department.'),
  body('student_number').trim().isLength({ min: 1, max: 80 }).withMessage('Student number is required.'),
  body('faculty').trim().isLength({ min: 2, max: 160 }).withMessage('Faculty is required.'),
  body('major').trim().isLength({ min: 2, max: 160 }).withMessage('Major is required.'),
  body('academic_year').trim().isLength({ min: 1, max: 80 }).withMessage('Academic year is required.'),
  body('skills').trim().isLength({ min: 2, max: 2000 }).withMessage('Add at least one skill.'),
  body('location_preference').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  body('internship_type_preference')
    .optional({ checkFalsy: true })
    .isIn(['Full Time', 'Part Time', 'Remote', 'Office Internship'])
    .withMessage('Invalid internship type preference.'),
  body('gpa').optional({ checkFalsy: true }).isFloat({ min: 0, max: 4 }).withMessage('GPA must be between 0 and 4.'),
];

async function getCurrentProfile(studentId) {
  const result = await pool.query(
    `SELECT
      sup.id,
      sup.student_id,
      sup.university_id,
      sup.department_id,
      sup.student_number,
      sup.faculty,
      sup.major,
      sup.academic_year,
      sup.skills,
      sup.location_preference,
      sup.internship_type_preference,
      sup.gpa,
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
  const faculty = req.body.faculty.trim();
  const major = req.body.major.trim();
  const academicYear = req.body.academic_year.trim();
  const skills = req.body.skills.trim();
  const locationPreference = req.body.location_preference || null;
  const internshipTypePreference = req.body.internship_type_preference || null;
  const gpa = req.body.gpa ? Number(req.body.gpa) : null;
  const selection = await validateUniversitySelection(universityId, departmentId);

  if (selection.error) {
    return res.status(400).json({ message: selection.error });
  }

  const existing = await getCurrentProfile(req.auth.id);

  let profile;

  if (existing) {
    const result = await pool.query(
      `UPDATE student_university_profiles
       SET university_id = $1,
           department_id = $2,
           student_number = $3,
           faculty = $4,
           major = $5,
           academic_year = $6,
           skills = $7,
           location_preference = $8,
           internship_type_preference = $9,
           gpa = $10,
           verification_status = 'pending',
           verified_by = NULL,
           verified_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
       WHERE id = $11
         AND student_id = $12
       RETURNING *`,
      [
        universityId,
        departmentId,
        studentNumber,
        faculty,
        major,
        academicYear,
        skills,
        locationPreference,
        internshipTypePreference,
        gpa,
        existing.id,
        req.auth.id,
      ],
    );
    profile = result.rows[0];
  } else {
    try {
      const result = await pool.query(
        `INSERT INTO student_university_profiles
          (student_id, university_id, department_id, student_number, faculty, major, academic_year, skills,
           location_preference, internship_type_preference, gpa)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.auth.id,
          universityId,
          departmentId,
          studentNumber,
          faculty,
          major,
          academicYear,
          skills,
          locationPreference,
          internshipTypePreference,
          gpa,
        ],
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
      faculty,
      major,
      academicYear,
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
  '/matches',
  asyncHandler(async (req, res) => {
    const profile = await pool.query(
      `SELECT
        sup.major AS profile_major,
        u.major AS user_major,
        sup.skills,
        sup.academic_year,
        sup.location_preference,
        sup.internship_type_preference,
        d.name AS department_name
       FROM users u
       LEFT JOIN LATERAL (
         SELECT *
         FROM student_university_profiles
         WHERE student_id = u.id
         ORDER BY updated_at DESC, id DESC
         LIMIT 1
       ) sup ON true
       LEFT JOIN departments d ON d.id = sup.department_id
       WHERE u.id = $1`,
      [req.auth.id],
    );
    const internships = await pool.query(
      `SELECT
        i.id, i.title, i.description, i.location, i.category, i.type, i.requirements, i.required_skills,
        i.academic_year, i.stipend, i.deadline, COALESCE(i.company_name, r.company_name) AS company_name
       FROM internships i
       JOIN recruiters r ON r.id = i.recruiter_id
       WHERE i.status = 'active'
         AND EXISTS (
           SELECT 1 FROM internship_university_approvals iua
           WHERE iua.internship_id = i.id AND iua.status = 'approved'
         )
       ORDER BY i.created_at DESC`,
    );
    const studentProfile = profile.rows[0] || {};

    return res.json({
      internships: internships.rows.map((internship) => ({
        ...internship,
        match: calculateMatch(studentProfile, internship),
      })),
    });
  }),
);

router.get(
  '/matches/:id',
  param('id').isInt({ min: 1 }).withMessage('Invalid internship id.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const [profile, internship] = await Promise.all([
      pool.query(
        `SELECT sup.major AS profile_major, u.major AS user_major, sup.skills, sup.academic_year,
          sup.location_preference, sup.internship_type_preference, d.name AS department_name
         FROM users u
         LEFT JOIN LATERAL (
           SELECT * FROM student_university_profiles WHERE student_id = u.id ORDER BY updated_at DESC, id DESC LIMIT 1
         ) sup ON true
         LEFT JOIN departments d ON d.id = sup.department_id
         WHERE u.id = $1`,
        [req.auth.id],
      ),
      pool.query(
        `SELECT i.*, COALESCE(i.company_name, r.company_name) AS company_name
         FROM internships i JOIN recruiters r ON r.id = i.recruiter_id
         WHERE i.id = $1 AND i.status = 'active'
           AND EXISTS (
             SELECT 1 FROM internship_university_approvals iua
             WHERE iua.internship_id = i.id AND iua.status = 'approved'
           )`,
        [req.params.id],
      ),
    ]);

    if (!internship.rows[0]) {
      return res.status(404).json({ message: 'Internship not found.' });
    }

    return res.json({ match: calculateMatch(profile.rows[0] || {}, internship.rows[0]) });
  }),
);

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
          a.interview_date,
          a.interview_time,
          a.interview_location,
          a.meeting_link,
          a.interview_notes,
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
      profile?.university_id,
      profile?.department_id,
      profile?.student_number,
      profile?.faculty,
      profile?.major,
      profile?.academic_year,
      profile?.skills,
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
