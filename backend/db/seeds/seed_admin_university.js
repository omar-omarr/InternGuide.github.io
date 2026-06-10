require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../../src/config/db');

const saltRounds = 12;

const config = {
  universityName: process.env.DEMO_UNIVERSITY_NAME || 'InternGuide Demo University',
  universityDomain: process.env.DEMO_UNIVERSITY_DOMAIN || 'demo.edu',
  universityLocation: process.env.DEMO_UNIVERSITY_LOCATION || 'Beirut',
  universityContactEmail: process.env.DEMO_UNIVERSITY_CONTACT_EMAIL || 'admin@demo.edu',
  departmentName: process.env.DEMO_DEPARTMENT_NAME || 'Computer Science',
  systemAdminName: process.env.DEMO_SYSTEM_ADMIN_NAME || 'Demo System Admin',
  systemAdminEmail: process.env.DEMO_SYSTEM_ADMIN_EMAIL || 'system.admin@internguide.local',
  systemAdminPassword: process.env.DEMO_SYSTEM_ADMIN_PASSWORD || 'ChangeMeSystemAdmin123!',
  universityAdminName: process.env.DEMO_UNIVERSITY_ADMIN_NAME || 'Demo University Admin',
  universityAdminEmail: process.env.DEMO_UNIVERSITY_ADMIN_EMAIL || 'university.admin@demo.edu',
  universityAdminPassword: process.env.DEMO_UNIVERSITY_ADMIN_PASSWORD || 'ChangeMeUniversityAdmin123!',
};

async function upsertAdminUser(client, { fullName, email, password, role, universityId }) {
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const result = await client.query(
    `INSERT INTO admin_users (full_name, email, password_hash, role, university_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (email)
     DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       university_id = EXCLUDED.university_id,
       status = 'active',
       updated_at = NOW()
     RETURNING id, email, role, university_id`,
    [fullName, email, passwordHash, role, universityId],
  );

  return result.rows[0];
}

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const universityResult = await client.query(
      `INSERT INTO universities (name, email_domain, location, contact_email, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (email_domain)
       DO UPDATE SET
         name = EXCLUDED.name,
         location = EXCLUDED.location,
         contact_email = EXCLUDED.contact_email,
         status = 'active',
         updated_at = NOW()
       RETURNING id, name, email_domain`,
      [config.universityName, config.universityDomain, config.universityLocation, config.universityContactEmail],
    );
    const university = universityResult.rows[0];

    const departmentResult = await client.query(
      `INSERT INTO departments (university_id, name)
       VALUES ($1, $2)
       ON CONFLICT (university_id, name)
       DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name`,
      [university.id, config.departmentName],
    );
    const department = departmentResult.rows[0];

    const systemAdmin = await upsertAdminUser(client, {
      fullName: config.systemAdminName,
      email: config.systemAdminEmail,
      password: config.systemAdminPassword,
      role: 'system_admin',
      universityId: null,
    });

    const universityAdmin = await upsertAdminUser(client, {
      fullName: config.universityAdminName,
      email: config.universityAdminEmail,
      password: config.universityAdminPassword,
      role: 'university_admin',
      universityId: university.id,
    });

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          university,
          department,
          systemAdmin: {
            id: systemAdmin.id,
            email: systemAdmin.email,
            role: systemAdmin.role,
          },
          universityAdmin: {
            id: universityAdmin.id,
            email: universityAdmin.email,
            role: universityAdmin.role,
            universityId: universityAdmin.university_id,
          },
          note: 'Local demo accounts seeded. Change demo passwords before any shared or deployed use.',
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
