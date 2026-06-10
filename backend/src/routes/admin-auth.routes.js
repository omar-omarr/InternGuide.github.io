const express = require('express');
const bcrypt = require('bcrypt');
const { body } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken, authorizeRole, ROLES } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');
const { signAuthToken } = require('../utils/token');
const { logAudit } = require('../services/audit.service');

const router = express.Router();
const adminOnly = [authenticateToken, authorizeRole(ROLES.SYSTEM_ADMIN, ROLES.UNIVERSITY_ADMIN)];

function publicAdminPayload(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    universityId: row.university_id,
    status: row.status,
  };
}

function tokenPayload(row) {
  const payload = {
    id: row.id,
    role: row.role,
    email: row.email,
  };

  if (row.role === ROLES.UNIVERSITY_ADMIN) {
    payload.universityId = row.university_id;
  }

  return payload;
}

const loginValidators = [
  body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.'),
];

router.post(
  '/login',
  loginValidators,
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role, university_id, status
       FROM admin_users
       WHERE email = $1`,
      [req.body.email],
    );
    const admin = result.rows[0];

    if (!admin) {
      await logAudit({
        actorRole: null,
        actorId: null,
        action: 'admin_login_failed',
        entityType: 'admin_users',
        entityId: null,
        metadata: { email: req.body.email, reason: 'not_found' },
      });

      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!(await bcrypt.compare(req.body.password, admin.password_hash))) {
      await logAudit({
        actorRole: admin.role,
        actorId: admin.id,
        action: 'admin_login_failed',
        entityType: 'admin_users',
        entityId: admin.id,
        metadata: { email: admin.email, reason: 'invalid_password' },
      });

      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (admin.status !== 'active') {
      await logAudit({
        actorRole: admin.role,
        actorId: admin.id,
        action: 'admin_login_failed',
        entityType: 'admin_users',
        entityId: admin.id,
        metadata: { email: admin.email, reason: 'inactive' },
      });

      return res.status(403).json({ message: 'Admin account is inactive.' });
    }

    await logAudit({
      actorRole: admin.role,
      actorId: admin.id,
      action: 'admin_login_success',
      entityType: 'admin_users',
      entityId: admin.id,
      metadata: { email: admin.email },
    });

    return res.json({
      message: 'Login successful.',
      token: signAuthToken(tokenPayload(admin)),
      user: publicAdminPayload(admin),
    });
  }),
);

router.get(
  '/me',
  adminOnly,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, full_name, email, role, university_id, status
       FROM admin_users
       WHERE id = $1 AND role = $2`,
      [req.auth.id, req.auth.role],
    );
    const admin = result.rows[0];

    if (!admin || admin.status !== 'active') {
      return res.status(401).json({ message: 'Admin account is no longer active.' });
    }

    return res.json({ user: publicAdminPayload(admin) });
  }),
);

module.exports = router;
