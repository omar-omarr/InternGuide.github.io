require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../../src/config/db');

const saltRounds = 12;
const email = 'system.admin@demo.com';
const password = 'SystemAdmin123!';

async function seed() {
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const result = await pool.query(
    `INSERT INTO admin_users (full_name, email, password_hash, role, university_id, status)
     VALUES ($1, $2, $3, 'system_admin', NULL, 'active')
     ON CONFLICT (email)
     DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = 'system_admin',
       university_id = NULL,
       status = 'active',
       updated_at = NOW()
     RETURNING id, full_name, email, role, university_id, status`,
    ['Demo System Admin', email, passwordHash],
  );

  console.log(
    JSON.stringify(
      {
        message: 'Demo system admin created or reset.',
        user: result.rows[0],
      },
      null,
      2,
    ),
  );
}

seed()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
