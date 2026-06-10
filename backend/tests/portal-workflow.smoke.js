require('dotenv').config();

process.env.NODE_ENV = 'test';

const assert = require('assert/strict');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const pool = require('../src/config/db');
const { resolveResumePath } = require('../src/middleware/upload');

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
  const data = text ? JSON.parse(text) : {};

  if (options.status) {
    assert.equal(response.status, options.status, `${pathname}: ${text}`);
  } else {
    assert.ok(response.ok, `${pathname}: ${response.status} ${text}`);
  }

  return data;
}

async function applySql(relativePath) {
  const sql = fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
  await pool.query(sql);
}

async function cleanup() {
  if (created.resumePath) {
    const resume = resolveResumePath(created.resumePath);
    if (resume) {
      await fs.promises.unlink(resume.fullPath).catch(() => {});
    }
  }

  if (created.adminId) {
    await pool.query("DELETE FROM notifications WHERE recipient_role = 'system_admin' AND recipient_id = $1", [
      created.adminId,
    ]);
    await pool.query("DELETE FROM audit_logs WHERE actor_role = 'system_admin' AND actor_id = $1", [created.adminId]);
    await pool.query('DELETE FROM admin_users WHERE id = $1', [created.adminId]);
  }

  if (created.recruiterId) {
    await pool.query("DELETE FROM notifications WHERE recipient_role = 'recruiter' AND recipient_id = $1", [
      created.recruiterId,
    ]);
    await pool.query("DELETE FROM audit_logs WHERE actor_role = 'recruiter' AND actor_id = $1", [created.recruiterId]);
    await pool.query('DELETE FROM recruiters WHERE id = $1', [created.recruiterId]);
  }

  if (created.studentId) {
    await pool.query("DELETE FROM notifications WHERE recipient_role = 'student' AND recipient_id = $1", [
      created.studentId,
    ]);
    await pool.query("DELETE FROM audit_logs WHERE actor_role = 'student' AND actor_id = $1", [created.studentId]);
    await pool.query('DELETE FROM users WHERE id = $1', [created.studentId]);
  }

  if (created.universityId) {
    await pool.query('DELETE FROM universities WHERE id = $1', [created.universityId]);
  }
}

async function run() {
  await applySql('db/schema.sql');
  await applySql('db/migrations/20260610_university_portal_upgrade.sql');

  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const adminEmail = `workflow-admin-${suffix}@internguide.test`;
  const studentEmail = `workflow-student-${suffix}@internguide.test`;
  const recruiterEmail = `workflow-recruiter-${suffix}@internguide.test`;
  const password = 'PortalWorkflow123!';
  const passwordHash = await bcrypt.hash(password, 4);

  const university = await pool.query(
    `INSERT INTO universities (name, email_domain, location, contact_email)
     VALUES ($1, $2, 'Beirut', $3)
     RETURNING id`,
    [`Workflow University ${suffix}`, `workflow-${suffix}.edu`, adminEmail],
  );
  created.universityId = university.rows[0].id;
  const department = await pool.query(
    `INSERT INTO departments (university_id, name)
     VALUES ($1, 'Computer Science')
     RETURNING id`,
    [created.universityId],
  );
  created.departmentId = department.rows[0].id;
  const admin = await pool.query(
    `INSERT INTO admin_users (full_name, email, password_hash, role, status)
     VALUES ('Workflow Admin', $1, $2, 'system_admin', 'active')
     RETURNING id`,
    [adminEmail, passwordHash],
  );
  created.adminId = admin.rows[0].id;

  const studentSignup = await request('/auth/signup', {
    method: 'POST',
    body: {
      full_name: 'Workflow Student',
      email: studentEmail,
      pass: password,
      repass: password,
      major: 'Computer Science',
      year: 3,
    },
    status: 201,
  });
  created.studentId = studentSignup.user.id;
  const studentLogin = await request('/auth/login', {
    method: 'POST',
    body: { email: studentEmail, pass: password },
  });
  assert.equal(studentLogin.user.role, 'student');

  await request('/student/university-profile', {
    method: 'POST',
    token: studentLogin.token,
    body: {
      university_id: created.universityId,
      department_id: created.departmentId,
      student_number: `ST-${suffix}`,
      faculty: 'Faculty of Science',
      major: 'Computer Science',
      academic_year: 'Third Year',
      skills: 'JavaScript, SQL, teamwork',
      gpa: 3.4,
    },
    status: 201,
  });

  const recruiterSignup = await request('/auth/recruiter/signup', {
    method: 'POST',
    body: {
      company_name: `Workflow Company ${suffix}`,
      recruiter_name: 'Workflow Recruiter',
      email: recruiterEmail,
      pass: password,
      repass: password,
      city: 'Beirut',
      country: 'Lebanon',
    },
    status: 201,
  });
  created.recruiterId = recruiterSignup.user.id;
  assert.equal(recruiterSignup.user.verificationStatus, 'pending');
  const recruiterLogin = await request('/auth/recruiter/login', {
    method: 'POST',
    body: { email: recruiterEmail, pass: password },
  });

  const internshipPayload = {
    title: `Workflow Internship ${suffix}`,
    description: 'A production workflow internship used by the automated portal smoke test.',
    location: 'Beirut',
    category: 'Technology',
    type: 'Full Time',
    requirements: 'JavaScript and SQL',
  };
  await request('/internships', {
    method: 'POST',
    token: recruiterLogin.token,
    body: internshipPayload,
    status: 403,
  });

  const adminLogin = await request('/admin-auth/login', {
    method: 'POST',
    body: { email: adminEmail, password },
  });
  assert.equal(adminLogin.user.role, 'system_admin');
  const verification = await pool.query(
    `SELECT id FROM recruiter_verifications WHERE recruiter_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [created.recruiterId],
  );
  await request(`/system-admin/recruiter-verifications/${verification.rows[0].id}/review`, {
    method: 'PATCH',
    token: adminLogin.token,
    body: { status: 'approved' },
  });

  const approvedRecruiterLogin = await request('/auth/recruiter/login', {
    method: 'POST',
    body: { email: recruiterEmail, pass: password },
  });
  assert.equal(approvedRecruiterLogin.user.verificationStatus, 'approved');
  const internship = await request('/internships', {
    method: 'POST',
    token: approvedRecruiterLogin.token,
    body: internshipPayload,
    status: 201,
  });
  created.internshipId = internship.internship.id;
  const approval = await pool.query(
    `SELECT id FROM internship_university_approvals WHERE internship_id = $1 ORDER BY id DESC LIMIT 1`,
    [created.internshipId],
  );
  await request(`/system-admin/internship-approvals/${approval.rows[0].id}/review`, {
    method: 'PATCH',
    token: adminLogin.token,
    body: { status: 'approved', notes: 'Approved by workflow smoke test.' },
  });

  const publicInternships = await request(`/internships?keyword=${encodeURIComponent(suffix)}`);
  assert.equal(publicInternships.internships.length, 1);
  assert.equal(publicInternships.internships[0].recruiter_verified, true);

  const form = new FormData();
  form.set('cover_letter', 'Workflow smoke test application.');
  form.set('resume', new Blob(['%PDF-1.4\n% InternGuide workflow test\n'], { type: 'application/pdf' }), 'resume.pdf');
  const application = await request(`/internships/${created.internshipId}/apply`, {
    method: 'POST',
    token: studentLogin.token,
    body: form,
    status: 201,
  });
  created.applicationId = application.application.id;
  created.resumePath = application.application.resume_path;

  const applicants = await request(`/recruiter/internships/${created.internshipId}/applications`, {
    token: approvedRecruiterLogin.token,
  });
  assert.equal(applicants.applications[0].status, 'viewed');
  await request(`/applications/${created.applicationId}/status`, {
    method: 'PATCH',
    token: approvedRecruiterLogin.token,
    body: { status: 'shortlisted' },
  });
  const studentDashboard = await request('/student/dashboard', { token: studentLogin.token });
  assert.equal(studentDashboard.applications[0].status, 'shortlisted');

  const studentNotifications = await request('/notifications?limit=20', { token: studentLogin.token });
  assert.ok(studentNotifications.notifications.some((item) => item.type === 'application_status_changed'));
  const unreadNotification = studentNotifications.notifications.find((item) => !item.is_read);
  const markedRead = await request(`/notifications/${unreadNotification.id}/read`, {
    method: 'PATCH',
    token: studentLogin.token,
  });
  assert.equal(markedRead.notification.is_read, true);
  await request('/notifications/read-all', { method: 'PATCH', token: studentLogin.token });
  await request(`/applications/${created.applicationId}/withdraw`, {
    method: 'PATCH',
    token: studentLogin.token,
  });
  const adminApplications = await request(`/system-admin/applications?q=${encodeURIComponent(suffix)}`, {
    token: adminLogin.token,
  });
  assert.equal(adminApplications.applications[0].status, 'withdrawn');

  await request('/system-admin/dashboard', { token: studentLogin.token, status: 403 });
  await request('/system-admin/dashboard', { token: approvedRecruiterLogin.token, status: 403 });

  console.log('Portal workflow smoke test passed.');
}

run()
  .catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup().catch((error) => console.error('Cleanup failed:', error.message));
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await pool.end();
  });
