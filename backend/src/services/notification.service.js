const pool = require('../config/db');

async function createNotification({ recipientRole, recipientId, title, message, type }) {
  const result = await pool.query(
    `INSERT INTO notifications (recipient_role, recipient_id, title, message, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [recipientRole, recipientId, title, message, type],
  );

  return result.rows[0];
}

module.exports = {
  createNotification,
};
