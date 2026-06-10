require('dotenv').config();

const bcrypt = require('bcrypt');
const pool = require('../src/config/db');

const password = process.env.DEMO_DATA_PASSWORD || 'CareerCenterDemo123!';

async function upsertAdmin(client, fullName, email, role, universityId, passwordHash) {
  const result = await client.query(
    `INSERT INTO admin_users (full_name, email, password_hash, role, university_id, status)
     VALUES ($1, $2, $3, $4, $5, 'active')
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       university_id = EXCLUDED.university_id,
       status = 'active',
       updated_at = NOW()
     RETURNING id`,
    [fullName, email, passwordHash, role, universityId],
  );
  return result.rows[0].id;
}

async function upsertRecruiter(client, company, name, email, city, passwordHash, verificationStatus) {
  const result = await client.query(
    `INSERT INTO recruiters (company_name, recruiter_name, email, password_hash, city, country, about_company)
     VALUES ($1, $2, $3, $4, $5, 'Lebanon', 'Demo company for the BAU Career Center Portal.')
     ON CONFLICT (email) DO UPDATE SET
       company_name = EXCLUDED.company_name,
       recruiter_name = EXCLUDED.recruiter_name,
       password_hash = EXCLUDED.password_hash,
       city = EXCLUDED.city,
       country = EXCLUDED.country,
       about_company = EXCLUDED.about_company
     RETURNING id`,
    [company, name, email, passwordHash, city],
  );
  const recruiterId = result.rows[0].id;
  const latest = await client.query(
    `SELECT id FROM recruiter_verifications WHERE recruiter_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
    [recruiterId],
  );

  if (latest.rows[0]) {
    await client.query(
      `UPDATE recruiter_verifications
       SET status = $1::text, reviewed_at = CASE WHEN $1::text = 'pending' THEN NULL ELSE NOW() END, updated_at = NOW()
       WHERE id = $2`,
      [verificationStatus, latest.rows[0].id],
    );
  } else {
    await client.query(
      `INSERT INTO recruiter_verifications (recruiter_id, document_path, status)
       VALUES ($1, 'demo-account-registration', $2)`,
      [recruiterId, verificationStatus],
    );
  }

  return recruiterId;
}

async function upsertStudent(client, fullName, email, major, year, address, passwordHash, universityId, departmentId, index) {
  const result = await client.query(
    `INSERT INTO users (full_name, email, password_hash, major, study_year, address)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       password_hash = EXCLUDED.password_hash,
       major = EXCLUDED.major,
       study_year = EXCLUDED.study_year,
       address = EXCLUDED.address
     RETURNING id`,
    [fullName, email, passwordHash, major, year, address],
  );
  const studentId = result.rows[0].id;
  await client.query(
    `INSERT INTO student_university_profiles
      (student_id, university_id, department_id, student_number, faculty, major, academic_year, skills,
       location_preference, internship_type_preference, gpa, verification_status, verified_at)
     VALUES ($1, $2, $3, $4, 'Faculty of Science', $5, $6, $7, $8, $9, $10, 'verified', NOW())
     ON CONFLICT (student_id, university_id) DO UPDATE SET
       department_id = EXCLUDED.department_id,
       student_number = EXCLUDED.student_number,
       faculty = EXCLUDED.faculty,
       major = EXCLUDED.major,
       academic_year = EXCLUDED.academic_year,
       skills = EXCLUDED.skills,
       location_preference = EXCLUDED.location_preference,
       internship_type_preference = EXCLUDED.internship_type_preference,
       gpa = EXCLUDED.gpa,
       verification_status = 'verified',
       verified_at = NOW(),
       updated_at = NOW()`,
    [
      studentId,
      universityId,
      departmentId,
      `BAU-DEMO-${String(index).padStart(3, '0')}`,
      major,
      `${year === 3 ? 'Third' : 'Fourth'} Year`,
      major === 'Computer Science' ? 'JavaScript, SQL, Node.js, teamwork' : 'Excel, communication, reporting, teamwork',
      address,
      index % 2 ? 'Full Time' : 'Remote',
      3 + index / 10,
    ],
  );
  return studentId;
}

async function upsertInternship(client, recruiterId, data) {
  const existing = await client.query(
    `SELECT id FROM internships WHERE recruiter_id = $1 AND title = $2 ORDER BY id LIMIT 1`,
    [recruiterId, data.title],
  );
  const values = [
    data.title,
    data.description,
    data.location,
    data.category,
    data.type,
    data.requirements,
    data.requiredSkills,
    data.academicYear,
    data.stipend,
    data.deadline,
    data.listingStatus,
  ];

  if (existing.rows[0]) {
    await client.query(
      `UPDATE internships SET title = $1, description = $2, location = $3, category = $4, type = $5,
       requirements = $6, required_skills = $7, academic_year = $8, stipend = $9, deadline = $10,
       status = $11, updated_at = NOW() WHERE id = $12`,
      [...values, existing.rows[0].id],
    );
    return existing.rows[0].id;
  }

  const result = await client.query(
    `INSERT INTO internships
      (recruiter_id, title, description, location, category, type, requirements, required_skills, academic_year,
       stipend, deadline, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [recruiterId, ...values],
  );
  return result.rows[0].id;
}

async function upsertApproval(client, internshipId, universityId, departmentId, status, adminId) {
  const existing = await client.query(
    `SELECT id FROM internship_university_approvals
     WHERE internship_id = $1 AND university_id = $2 AND department_id = $3
     ORDER BY id LIMIT 1`,
    [internshipId, universityId, departmentId],
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE internship_university_approvals
       SET status = $1::text, reviewed_by = $2, reviewed_at = CASE WHEN $1::text = 'pending' THEN NULL ELSE NOW() END,
           notes = CASE WHEN $1::text = 'rejected' THEN 'Demo rejection for presentation.' ELSE NULL END, updated_at = NOW()
       WHERE id = $3`,
      [status, adminId, existing.rows[0].id],
    );
    return;
  }

  await client.query(
    `INSERT INTO internship_university_approvals
      (internship_id, university_id, department_id, status, reviewed_by, reviewed_at, notes)
     VALUES ($1, $2, $3, $4::text, $5, CASE WHEN $4::text = 'pending' THEN NULL ELSE NOW() END,
       CASE WHEN $4::text = 'rejected' THEN 'Demo rejection for presentation.' ELSE NULL END)`,
    [internshipId, universityId, departmentId, status, adminId],
  );
}

async function upsertApplication(client, internshipId, studentId, status, interview) {
  const result = await client.query(
    `INSERT INTO applications
      (internship_id, student_id, cover_letter, resume_path, status, interview_date, interview_time,
       interview_location, meeting_link, interview_notes, interview_created_at, interview_updated_at)
     VALUES ($1, $2, 'Demo application for the BAU Career Center Portal.', 'demo-resume.pdf', $3,
       $4, $5, $6, $7, $8, CASE WHEN $4::date IS NULL THEN NULL ELSE NOW() END,
       CASE WHEN $4::date IS NULL THEN NULL ELSE NOW() END)
     ON CONFLICT (internship_id, student_id) DO UPDATE SET
       status = EXCLUDED.status,
       interview_date = EXCLUDED.interview_date,
       interview_time = EXCLUDED.interview_time,
       interview_location = EXCLUDED.interview_location,
       meeting_link = EXCLUDED.meeting_link,
       interview_notes = EXCLUDED.interview_notes,
       interview_updated_at = EXCLUDED.interview_updated_at,
       updated_at = NOW()
     RETURNING id`,
    [
      internshipId,
      studentId,
      status,
      interview?.date || null,
      interview?.time || null,
      interview?.location || null,
      interview?.meetingLink || null,
      interview?.notes || null,
    ],
  );
  return result.rows[0].id;
}

async function seed() {
  const passwordHash = await bcrypt.hash(password, 10);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const university = await client.query(
      `INSERT INTO universities (name, email_domain, location, contact_email, status)
       VALUES ('BAU Career Center Demo University', 'bau-demo.edu.lb', 'Beirut', 'career.center@bau-demo.edu.lb', 'active')
       ON CONFLICT (email_domain) DO UPDATE SET name = EXCLUDED.name, location = EXCLUDED.location,
         contact_email = EXCLUDED.contact_email, status = 'active', updated_at = NOW()
       RETURNING id`,
    );
    const universityId = university.rows[0].id;
    const department = await client.query(
      `INSERT INTO departments (university_id, name) VALUES ($1, 'Computer Science')
       ON CONFLICT (university_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [universityId],
    );
    const departmentId = department.rows[0].id;
    const systemAdminId = await upsertAdmin(
      client,
      'Demo System Admin',
      'system.admin@career-demo.local',
      'system_admin',
      null,
      passwordHash,
    );
    const universityAdminId = await upsertAdmin(
      client,
      'Demo University Admin',
      'university.admin@bau-demo.edu.lb',
      'university_admin',
      universityId,
      passwordHash,
    );
    const recruiters = [
      await upsertRecruiter(client, 'Cedar Digital Labs', 'Maya Haddad', 'maya@cedar-demo.local', 'Beirut', passwordHash, 'approved'),
      await upsertRecruiter(client, 'Levant Analytics', 'Karim Nassar', 'karim@levant-demo.local', 'Beirut', passwordHash, 'approved'),
      await upsertRecruiter(client, 'Pending Demo Company', 'Rana Salem', 'rana@pending-demo.local', 'Tripoli', passwordHash, 'pending'),
    ];
    const students = [];
    const studentData = [
      ['Demo Student One', 'student.one@career-demo.local', 'Computer Science', 3, 'Beirut'],
      ['Demo Student Two', 'student.two@career-demo.local', 'Computer Science', 4, 'Beirut'],
      ['Demo Student Three', 'student.three@career-demo.local', 'Business Administration', 3, 'Remote'],
      ['Demo Student Four', 'student.four@career-demo.local', 'Computer Science', 4, 'Tripoli'],
    ];
    for (let index = 0; index < studentData.length; index += 1) {
      students.push(await upsertStudent(client, ...studentData[index], passwordHash, universityId, departmentId, index + 1));
    }

    const baseInternship = {
      description: 'Demo internship used to present the BAU Career Center workflow.',
      category: 'Computer Science',
      requirements: 'Third Year or Fourth Year student with communication and teamwork skills.',
      requiredSkills: 'JavaScript, SQL, communication, teamwork',
      academicYear: 'Third Year',
      stipend: 'Paid',
      deadline: '2026-12-31',
      listingStatus: 'active',
    };
    const internshipData = [
      [recruiters[0], { ...baseInternship, title: 'Software Engineering Intern', location: 'Beirut', type: 'Full Time' }, 'approved'],
      [recruiters[0], { ...baseInternship, title: 'Remote Web Development Intern', location: 'Remote', type: 'Remote' }, 'approved'],
      [recruiters[1], { ...baseInternship, title: 'Data Analytics Intern', location: 'Beirut', type: 'Part Time' }, 'pending'],
      [recruiters[1], { ...baseInternship, title: 'Business Reporting Intern', location: 'Beirut', type: 'Office Internship' }, 'rejected'],
      [recruiters[0], { ...baseInternship, title: 'Closed Quality Assurance Internship', location: 'Beirut', type: 'Full Time', listingStatus: 'closed' }, 'approved'],
    ];
    const internships = [];
    for (const [recruiterId, data, approvalStatus] of internshipData) {
      const id = await upsertInternship(client, recruiterId, data);
      await upsertApproval(client, id, universityId, departmentId, approvalStatus, universityAdminId);
      internships.push(id);
    }

    const applicationPlan = [
      [internships[0], students[0], 'accepted'],
      [internships[0], students[1], 'interview_scheduled'],
      [internships[0], students[2], 'shortlisted'],
      [internships[1], students[0], 'accepted'],
      [internships[1], students[2], 'viewed'],
      [internships[1], students[3], 'submitted'],
      [internships[2], students[1], 'rejected'],
      [internships[2], students[3], 'accepted'],
      [internships[3], students[2], 'withdrawn'],
      [internships[4], students[3], 'accepted'],
    ];
    const applications = [];
    for (let index = 0; index < applicationPlan.length; index += 1) {
      const [internshipId, studentId, status] = applicationPlan[index];
      applications.push(
        await upsertApplication(
          client,
          internshipId,
          studentId,
          status,
          status === 'interview_scheduled'
            ? { date: '2026-07-15', time: '10:00', location: 'BAU Career Center', meetingLink: 'https://meet.example.com/demo', notes: 'Bring a portfolio.' }
            : null,
        ),
      );
    }

    for (const applicationId of [applications[0], applications[3], applications[7], applications[9]]) {
      await client.query(
        `INSERT INTO training_records (application_id, student_id, recruiter_id, internship_id, university_id, status, start_date, end_date)
         SELECT a.id, a.student_id, i.recruiter_id, a.internship_id, $2, 'training_started', '2026-07-01', '2026-09-30'
         FROM applications a JOIN internships i ON i.id = a.internship_id WHERE a.id = $1
         ON CONFLICT (application_id) DO UPDATE SET university_id = EXCLUDED.university_id, updated_at = NOW()`,
        [applicationId, universityId],
      );
    }
    const training = await client.query(`SELECT id, recruiter_id FROM training_records WHERE application_id = $1`, [applications[0]]);
    await client.query(
      `INSERT INTO company_evaluations
        (training_record_id, attendance_score, technical_skills_score, communication_score, teamwork_score,
         punctuality_score, overall_score, recommended_for_hiring, comments, submitted_by)
       VALUES ($1, 5, 4, 5, 5, 5, 4.8, true, 'Strong demo trainee performance.', $2)
       ON CONFLICT (training_record_id) DO UPDATE SET overall_score = 4.8, recommended_for_hiring = true,
         comments = EXCLUDED.comments, submitted_at = NOW(), updated_at = NOW()`,
      [training.rows[0].id, training.rows[0].recruiter_id],
    );
    await client.query(
      `INSERT INTO notifications (recipient_role, recipient_id, title, message, type)
       SELECT 'student', $1, 'Demo career center notification', 'Your demo training record is ready for review.', 'demo_training'
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications WHERE recipient_role = 'student' AND recipient_id = $1 AND type = 'demo_training'
       )`,
      [students[0]],
    );
    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          message: 'Idempotent BAU Career Center demo data seeded.',
          demoPassword: password,
          accounts: {
            systemAdmin: 'system.admin@career-demo.local',
            universityAdmin: 'university.admin@bau-demo.edu.lb',
            approvedRecruiters: ['maya@cedar-demo.local', 'karim@levant-demo.local'],
            pendingRecruiter: 'rana@pending-demo.local',
            students: studentData.map((student) => student[1]),
          },
          ids: { universityId, systemAdminId, universityAdminId },
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
