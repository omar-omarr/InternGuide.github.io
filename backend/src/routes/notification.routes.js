const express = require('express');
const { param, query } = require('express-validator');
const pool = require('../config/db');
const { authenticateToken } = require('../middleware/auth');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authenticateToken);

function recipient(req) {
  return [req.auth.role, req.auth.id];
}

router.get(
  '/',
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }),
  query('unread').optional({ checkFalsy: true }).isBoolean(),
  validateRequest,
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const unreadOnly = req.query.unread === 'true';
    const [role, id] = recipient(req);
    const result = await pool.query(
      `SELECT id, title, message, type, is_read, created_at
       FROM notifications
       WHERE recipient_role = $1
         AND recipient_id = $2
         AND ($3::boolean = false OR is_read = false)
       ORDER BY created_at DESC
       LIMIT $4`,
      [role, id, unreadOnly, limit],
    );
    const unread = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM notifications
       WHERE recipient_role = $1
         AND recipient_id = $2
         AND is_read = false`,
      [role, id],
    );

    return res.json({
      notifications: result.rows,
      unreadCount: unread.rows[0].count,
    });
  }),
);

router.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const [role, id] = recipient(req);
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE recipient_role = $1
         AND recipient_id = $2
         AND is_read = false
       RETURNING id`,
      [role, id],
    );

    return res.json({ message: 'Notifications marked as read.', updated: result.rowCount });
  }),
);

router.patch(
  '/:id/read',
  param('id').isInt({ min: 1 }).withMessage('Invalid notification id.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const [role, id] = recipient(req);
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1
         AND recipient_role = $2
         AND recipient_id = $3
       RETURNING id, title, message, type, is_read, created_at`,
      [req.params.id, role, id],
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: 'Notification not found.' });
    }

    return res.json({ message: 'Notification marked as read.', notification: result.rows[0] });
  }),
);

module.exports = router;
