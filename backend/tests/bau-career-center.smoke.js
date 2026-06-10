require('dotenv').config();

process.env.NODE_ENV = 'test';

const assert = require('assert/strict');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const pool = require('../src/config/db');
const { resolveReportPath, resolveResumePath } = require('../src/middleware/upload');

const backendRoot = path.resolve(__dirname, '..');
const created = {};
let server;
let baseUrl;

async function request(pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body = options.body;

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  if (body && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await response.text();
  const data = text && response.headers.get('content-type')?.includes('application/json') ? JSON.parse(text) : text;

  if (options.status) {
    assert.equal(response.status, options.status, `${pathname}: ${text}`);
  } else {
    assert.ok(response.ok, `${pathname}: ${response.status} ${text}`);
  }

  return { data, response };
}

async function applySql(relativePath) {
  const sql = fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
  await pool.query(sql);
}

async function cleanup() {
  for (const filename of [created.resumePath, created.reportPath]) {
    const resolved = filename === created.reportPath ? resolveReportPath(filename) : resolveResumePath(filename);
    if (resolved) {
      await fs.promises.unlink(resolved.fullPath).catch(() => {});
    }
  }

  if (created.trainingId) {
    await pool.query('DELETE FROM company_evaluations WHERE training_record_id = $1', [created.trainingId]);
  }
  const actorIds = [created.studentId, created.recruiterId, ...(created.adminIds || [])].filter(Boolean);
  if (actorIds.length) {
    await pool.query('DELETE FROM notifications WHERE recipient_id = ANY($1::bigint[])', [actorIds]);
    await pool.query('DELETE FROM audit_logs WHERE actor_id = ANY($1::bigint[])', [actorIds]);
  }
  if (created.adminIds?.length) {
    await pool.query('DELETE FROM admin_users WHERE id = ANY($1::bigint[])', [created.adminIds]);
  }
  if (created.recruiterId) {
    await pool.query('DELETE FROM recruiters WHERE id = $1', [created.recruiterId]);
  }
  if (created.studentId) {
    await pool.query('DELETE FROM users WHERE id = $1', [created.studentId]);
  }
  if (created.universityId) {
    await pool.query('DELETE FROM universities WHERE id = $1', [created.universityId]);
  }
}

async function run() {
  await applySql('db/schema.sql');
  await applySql('db/migrations/20260610_university_portal_upgrade.sql');
  await applySql('db/migrations/20260610_bau_career_center_modules.sql');

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const password = 'CareerCenterSmoke123!';
  const passwordHash = await bcrypt.hash(password, 4);
  const adminEmail = `career-system-${suffix}@internguide.test`;
  const universityAdminEmail = `career-university-${suffix}@internguide.test`;
  const studentEmail = `career-student-${suffix}@internguide.test`;
  const recruiterEmail = `career-recruiter-${suffix}@internguide.test`;

  const university = await pool.query(
    `INSERT INTO universities (name, email_domain, location, contact_email)
     VALUES ($1, $2, 'Beirut', $3) RETURNING id`,
    [`Career Center University ${suffix}`, `career-${suffix}.edu`, universityAdminEmail],
  );
  created.universityId = university.rows[0].id;
  const department = await pool.query(
    `INSERT INTO departments (university_id, name) VALUES ($1, 'Computer Science') RETURNING id`,
    [created.universityId],
  );
  const admins = await pool.query(
    `INSERT INTO admin_users (full_name, email, password_hash, role, university_id, status)
     VALUES
       ('Career System Admin', $1, $3, 'system_admin', NULL, 'active'),
       ('Career University Admin', $2, $3, 'university_admin', $4, 'active')
     RETURNING id, role`,
    [adminEmail, universityAdminEmail, passwordHash, created.universityId],
  );
  created.adminIds = admins.rows.map((admin) => admin.id);

  const adminLogin = (await request('/admin-auth/login', {
    method: 'POST',
    body: { email: adminEmail, password },
  })).data;
  const universityAdminLogin = (await request('/admin-auth/login', {
    method: 'POST',
    body: { email: universityAdminEmail, password },
  })).data;

  const studentSignup = (await request('/auth/signup', {
    method: 'POST',
    status: 201,
    body: {
      full_name: 'Career Center Student',
      email: studentEmail,
      pass: password,
      repass: password,
      major: 'Computer Science',
      year: 3,
      address: 'Beirut',
    },
  })).data;
  created.studentId = studentSignup.user.id;
  const studentLogin = (await request('/auth/login', {
    method: 'POST',
    body: { email: studentEmail, pass: password },
  })).data;
  await request('/student/university-profile', {
    method: 'POST',
    token: studentLogin.token,
    status: 201,
    body: {
      university_id: created.universityId,
      department_id: department.rows[0].id,
      student_number: `CAREER-${suffix}`,
      faculty: 'Faculty of Science',
      major: 'Computer Science',
      academic_year: 'Third Year',
      skills: 'JavaScript, SQL, communication, teamwork',
      location_preference: 'Beirut',
      internship_type_preference: 'Full Time',
      gpa: 3.5,
    },
  });

  const recruiterSignup = (await request('/auth/recruiter/signup', {
    method: 'POST',
    status: 201,
    body: {
      company_name: `Career Center Company ${suffix}`,
      recruiter_name: 'Career Center Recruiter',
      email: recruiterEmail,
      pass: password,
      repass: password,
      city: 'Beirut',
      country: 'Lebanon',
    },
  })).data;
  created.recruiterId = recruiterSignup.user.id;
  const verification = await pool.query(
    `SELECT id FROM recruiter_verifications WHERE recruiter_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [created.recruiterId],
  );
  await request(`/system-admin/recruiter-verifications/${verification.rows[0].id}/review`, {
    method: 'PATCH',
    token: adminLogin.token,
    body: { status: 'approved' },
  });
  const recruiterLogin = (await request('/auth/recruiter/login', {
    method: 'POST',
    body: { email: recruiterEmail, pass: password },
  })).data;

  const internship = (await request('/internships', {
    method: 'POST',
    token: recruiterLogin.token,
    status: 201,
    body: {
      title: `Career Center Software Internship ${suffix}`,
      description: 'A complete training lifecycle internship for the BAU Career Center smoke test.',
      location: 'Beirut',
      category: 'Computer Science',
      type: 'Full Time',
      requirements: 'Third Year student with JavaScript and SQL.',
      required_skills: 'JavaScript, SQL, teamwork',
      academic_year: 'Third Year',
    },
  })).data;
  created.internshipId = internship.internship.id;
  const approval = await pool.query(
    `SELECT id FROM internship_university_approvals WHERE internship_id = $1 ORDER BY id DESC LIMIT 1`,
    [created.internshipId],
  );
  await request(`/system-admin/internship-approvals/${approval.rows[0].id}/review`, {
    method: 'PATCH',
    token: adminLogin.token,
    body: { status: 'approved' },
  });

  const matches = (await request('/student/matches', { token: studentLogin.token })).data;
  const matchedInternship = matches.internships.find((item) => Number(item.id) === Number(created.internshipId));
  assert.ok(matchedInternship.match.score > 0);
  assert.ok(matchedInternship.match.reasons.length > 0);

  const applicationForm = new FormData();
  applicationForm.set('cover_letter', 'Career Center smoke test application.');
  applicationForm.set('resume', new Blob(['%PDF-1.4\n% Career Center resume\n'], { type: 'application/pdf' }), 'resume.pdf');
  const application = (await request(`/internships/${created.internshipId}/apply`, {
    method: 'POST',
    token: studentLogin.token,
    status: 201,
    body: applicationForm,
  })).data;
  created.applicationId = application.application.id;
  created.resumePath = application.application.resume_path;

  await request(`/applications/${created.applicationId}/interview`, {
    method: 'PATCH',
    token: recruiterLogin.token,
    body: {
      interview_date: '2026-07-20',
      interview_time: '10:30',
      interview_location: 'BAU Career Center',
      meeting_link: 'https://meet.example.com/career-smoke',
      interview_notes: 'Bring a portfolio.',
    },
  });
  const notifications = (await request('/notifications', { token: studentLogin.token })).data;
  assert.ok(notifications.notifications.some((item) => item.type === 'interview_scheduled'));

  await request(`/career-center/applications/${created.applicationId}/messages`, {
    method: 'POST',
    token: studentLogin.token,
    status: 201,
    body: { message_body: 'Thank you. I will bring my portfolio.' },
  });
  await request(`/career-center/applications/${created.applicationId}/messages`, {
    method: 'POST',
    token: recruiterLogin.token,
    status: 201,
    body: { message_body: 'Great. We look forward to meeting you.' },
  });
  const thread = (await request(`/career-center/applications/${created.applicationId}/messages`, {
    token: studentLogin.token,
  })).data;
  assert.equal(thread.messages.length, 2);

  await request(`/applications/${created.applicationId}/status`, {
    method: 'PATCH',
    token: recruiterLogin.token,
    body: { status: 'accepted' },
  });
  const trainingList = (await request('/career-center/training-records', { token: studentLogin.token })).data;
  const training = trainingList.trainingRecords.find((item) => Number(item.application_id) === Number(created.applicationId));
  assert.ok(training);
  created.trainingId = training.id;

  const reportForm = new FormData();
  reportForm.set('report', new Blob(['%PDF-1.4\n% Career Center final report\n'], { type: 'application/pdf' }), 'final-report.pdf');
  const report = (await request(`/career-center/training-records/${training.id}/final-report`, {
    method: 'POST',
    token: studentLogin.token,
    status: 201,
    body: reportForm,
  })).data;
  created.reportPath = report.trainingRecord.final_report_path;

  const evaluation = (await request(`/career-center/training-records/${training.id}/evaluation`, {
    method: 'POST',
    token: recruiterLogin.token,
    status: 201,
    body: {
      attendance_score: 5,
      technical_skills_score: 4,
      communication_score: 5,
      teamwork_score: 5,
      punctuality_score: 5,
      recommended_for_hiring: true,
      comments: 'Strong smoke-test performance.',
    },
  })).data;
  assert.equal(Number(evaluation.evaluation.overall_score), 4.8);

  await request(`/career-center/training-records/${training.id}/final-report/review`, {
    method: 'PATCH',
    token: universityAdminLogin.token,
    body: { status: 'approved', notes: 'Approved by the career center.' },
  });
  const analytics = (await request('/career-center/analytics', { token: universityAdminLogin.token })).data;
  assert.ok(Number(analytics.summary.total_applications) >= 1);
  assert.ok(Number(analytics.summary.submitted_final_reports) >= 1);

  const exported = await request('/career-center/exports/training-records', { token: adminLogin.token });
  assert.ok(exported.response.headers.get('content-type').includes('text/csv'));
  assert.ok(String(exported.data).includes('Career Center Software Internship'));

  await request('/career-center/training-records', { status: 401 });
  await request(`/career-center/training-records/${training.id}`, { token: recruiterSignup.token, status: 200 });

  console.log('BAU Career Center smoke test passed.');
}

run()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await cleanup().catch((error) => {
      console.error('Cleanup failed:', error.message);
      process.exitCode = 1;
    });
    await pool.end();
  });
