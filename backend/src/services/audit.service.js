const pool = require('../config/db');

async function logAudit({ actorRole, actorId, action, entityType, entityId, metadata }) {
  try {
    const result = await pool.query(
      `INSERT INTO audit_logs (actor_role, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb))
       RETURNING id, created_at`,
      [
        actorRole || null,
        actorId || null,
        action,
        entityType,
        entityId || null,
        JSON.stringify(metadata || {}),
      ],
    );

    return result.rows[0];
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to write audit log:', error.message);
    }

    return null;
  }
}

module.exports = {
  logAudit,
};
