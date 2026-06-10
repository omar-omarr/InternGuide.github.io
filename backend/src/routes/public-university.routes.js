const express = require('express');
const { param } = require('express-validator');
const pool = require('../config/db');
const validateRequest = require('../middleware/validate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT id, name, email_domain, location
       FROM universities
       WHERE status = 'active'
       ORDER BY name ASC`,
    );

    return res.json({ universities: result.rows });
  }),
);

router.get(
  '/:id/departments',
  param('id').isInt({ min: 1 }).withMessage('Invalid university id.'),
  validateRequest,
  asyncHandler(async (req, res) => {
    const result = await pool.query(
      `SELECT d.id, d.university_id, d.name
       FROM departments d
       JOIN universities u ON u.id = d.university_id
       WHERE d.university_id = $1
         AND u.status = 'active'
       ORDER BY d.name ASC`,
      [req.params.id],
    );

    return res.json({ departments: result.rows });
  }),
);

module.exports = router;
