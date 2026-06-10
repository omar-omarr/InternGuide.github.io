const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const pool = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { signAuthToken } = require('../utils/token');
const validateRequest = require('../middleware/validate');
const { removeUploadedFile, resumeUpload } = require('../middleware/upload');
const { createNotification } = require('../services/notification.service');

const router = express.Router();
const saltRounds = 12;

function duplicateEmailResponse(res) {
  return res.status(409).json({ message: 'An account with this email already exists.' });
}

function studentPayload(row) {
  return {
    id: row.id,
    role: 'student',
    fullName: row.full_name,
    email: row.email,
  };
}

function recruiterPayload(row) {
  return {
    id: row.id,
    role: 'recruiter',
    companyName: row.company_name,
    recruiterName: row.recruiter_name,
    email: row.email,
    verificationStatus: row.verification_status || 'pending',
  };
}

async function notifySystemAdmins(recruiter) {
  const admins = await pool.query(
    `SELECT id
     FROM admin_users
     WHERE role = 'system_admin'
       AND status = 'active'`,
  );

  await Promise.all(
    admins.rows.map((admin) =>
      createNotification({
        recipientRole: 'system_admin',
        recipientId: admin.id,
        title: 'Recruiter verification required',
        message: `${recruiter.companyName} registered and is waiting for verification.`,
        type: 'recruiter_verification_submitted',
      }),
    ),
  );
}

const studentSignupValidators = [
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('pass').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('repass').optional({ checkFalsy: true }).isString(),
  body('full_name').trim().isLength({ min: 2, max: 120 }).withMessage('Full name is required.'),
  body('dob').optional({ checkFalsy: true }).isISO8601().withMessage('Date of birth must be a valid date.'),
  body('gender')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['Male', 'Female'])
    .withMessage('Gender must be Male or Female.'),
  body(['major', 'Major']).optional({ checkFalsy: true }).trim().isLength({ max: 120 }),
  body('year').optional({ checkFalsy: true }).isInt({ min: 1, max: 10 }).withMessage('Year must be between 1 and 10.'),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
];

router.post(
  '/signup',
  resumeUpload.single('file_cv'),
  studentSignupValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    if (req.body.repass && req.body.pass !== req.body.repass) {
      removeUploadedFile(req.file);
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const passwordHash = await bcrypt.hash(req.body.pass, saltRounds);
    const major = req.body.major || req.body.Major || null;
    const resumePath = req.file ? req.file.filename : null;

    try {
      const result = await pool.query(
        `INSERT INTO users
          (full_name, email, password_hash, dob, gender, major, study_year, address, resume_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, full_name, email`,
        [
          req.body.full_name.trim(),
          req.body.email,
          passwordHash,
          req.body.dob || null,
          req.body.gender || null,
          major,
          req.body.year || null,
          req.body.address || null,
          resumePath,
        ],
      );

      const user = studentPayload(result.rows[0]);
      return res.status(201).json({
        message: 'Student account created.',
        token: signAuthToken({ id: user.id, role: user.role }),
        user,
      });
    } catch (error) {
      if (error.code === '23505') {
        removeUploadedFile(req.file);
        return duplicateEmailResponse(res);
      }

      removeUploadedFile(req.file);
      throw error;
    }
  }),
);

const loginValidators = [
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('username').optional({ checkFalsy: true }).isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('pass').notEmpty().withMessage('Password is required.'),
];

router.post(
  '/login',
  loginValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const email = req.body.email || req.body.username;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const result = await pool.query('SELECT id, full_name, email, password_hash FROM users WHERE email = $1', [email]);
    const userRow = result.rows[0];

    if (!userRow || !(await bcrypt.compare(req.body.pass, userRow.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = studentPayload(userRow);
    return res.json({
      message: 'Login successful.',
      token: signAuthToken({ id: user.id, role: user.role }),
      user,
    });
  }),
);

const recruiterSignupValidators = [
  body('company_name').trim().isLength({ min: 2, max: 160 }).withMessage('Company name is required.'),
  body('recruiter_name').trim().isLength({ min: 2, max: 120 }).withMessage('Recruiter name is required.'),
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('pass').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('repass').optional({ checkFalsy: true }).isString(),
  body('contact').optional({ checkFalsy: true }).trim().isLength({ max: 50 }),
  body('address').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('country').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('city').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body(['about_company', 'message']).optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
];

router.post(
  '/recruiter/signup',
  recruiterSignupValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    if (req.body.repass && req.body.pass !== req.body.repass) {
      return res.status(400).json({ message: 'Passwords do not match.' });
    }

    const passwordHash = await bcrypt.hash(req.body.pass, saltRounds);
    const aboutCompany = req.body.about_company || req.body.message || null;

    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO recruiters
          (company_name, recruiter_name, email, password_hash, contact, address, country, city, about_company)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, company_name, recruiter_name, email`,
        [
          req.body.company_name.trim(),
          req.body.recruiter_name.trim(),
          req.body.email,
          passwordHash,
          req.body.contact || null,
          req.body.address || null,
          req.body.country || null,
          req.body.city || null,
          aboutCompany,
        ],
      );

      await client.query(
        `INSERT INTO recruiter_verifications (recruiter_id, document_path, status)
         VALUES ($1, 'account-registration', 'pending')`,
        [result.rows[0].id],
      );
      await client.query('COMMIT');

      const recruiter = recruiterPayload({ ...result.rows[0], verification_status: 'pending' });
      await notifySystemAdmins(recruiter).catch((error) => {
        console.error('Failed to notify system admins about recruiter signup:', error.message);
      });

      return res.status(201).json({
        message: 'Recruiter account created and submitted for admin verification.',
        token: signAuthToken({ id: recruiter.id, role: recruiter.role }),
        user: recruiter,
      });
    } catch (error) {
      await client.query('ROLLBACK');

      if (error.code === '23505') {
        return duplicateEmailResponse(res);
      }

      throw error;
    } finally {
      client.release();
    }
  }),
);

router.post(
  '/recruiter/login',
  loginValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const email = req.body.email || req.body.username;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    const result = await pool.query(
      `SELECT
        r.id,
        r.company_name,
        r.recruiter_name,
        r.email,
        r.password_hash,
        COALESCE((
          SELECT rv.status
          FROM recruiter_verifications rv
          WHERE rv.recruiter_id = r.id
          ORDER BY rv.created_at DESC, rv.id DESC
          LIMIT 1
        ), 'pending') AS verification_status
       FROM recruiters r
       WHERE r.email = $1`,
      [email],
    );
    const recruiterRow = result.rows[0];

    if (!recruiterRow || !(await bcrypt.compare(req.body.pass, recruiterRow.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const recruiter = recruiterPayload(recruiterRow);
    return res.json({
      message: 'Login successful.',
      token: signAuthToken({ id: recruiter.id, role: recruiter.role }),
      user: recruiter,
    });
  }),
);

module.exports = router;
