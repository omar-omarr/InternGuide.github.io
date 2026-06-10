# InternGuide

InternGuide is an internship platform with a static frontend and an Express API.

## Technical Direction

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: JWT
- Password hashing: bcrypt
- Resume uploads: local backend storage through Multer

InternGuide does not use MySQL, Firebase Auth, Firebase Storage, or paid APIs.

## Current Architecture

- Frontend pages live at the project root, with shared scripts in `assets/js/`.
- Recruiter-only pages live in `recruiter/`.
- Backend source lives in `backend/src/`.
- Database schema lives in `backend/db/schema.sql`.
- Uploaded resumes live in `backend/uploads/resumes/` and are ignored by Git except `.gitkeep`.
- Runtime logs and browser test screenshots are ignored by Git.

Backend structure:

```text
backend/src/
  app.js
  server.js
  config/
  middleware/
  routes/
  utils/
```

The route files currently contain the controller logic. That is acceptable for this project size; move code into `controllers/` and `services/` when routes become harder to scan or reuse.

## Role Strategy

The current working auth model uses separate `users` and `recruiters` tables. JWT payloads include `id` and `role`.

Supported role strings are prepared in backend middleware:

- `student`
- `recruiter`
- `university_admin`
- `system_admin`

For the current phase, keep the existing separate tables to avoid a risky account migration that could break signup, login, applications, and recruiter ownership checks. The cleaner long-term target is one `accounts` table with role-based profile tables, but migrate only after adding a tested migration script and compatibility layer.

## Backend Setup

From the project root:

```bash
cd backend
npm install
copy .env.example .env
```

Edit `backend/.env` and set:

- `DATABASE_URL`, or leave it commented and use the individual `PG*` variables
- `JWT_SECRET`
- `CLIENT_ORIGIN` for the frontend URL, or `*` for local static-server testing

Create and initialize the database:

```bash
createdb -h localhost -U postgres internguide
psql -h localhost -U postgres -d internguide -f db/schema.sql
```

Run non-destructive migrations when present:

```bash
psql -h localhost -U postgres -d internguide -f db/migrations/20260603_add_common_indexes.sql
psql -h localhost -U postgres -d internguide -f db/migrations/20260603_add_admin_university_foundation.sql
npm run migrate:portal-upgrade
```

If `psql` is not on PATH, run migrations through Node:

```bash
npm run migrate:admin-foundation
npm run migrate:portal-upgrade
```

Seed local-only demo university/admin accounts:

```bash
npm run seed:admin-university
```

Start the backend:

```bash
npm run dev
```

The API defaults to `http://localhost:5000`.

## Frontend Setup

From the project root:

```bash
npx http-server . -p 8080
```

Open `http://localhost:8080/index.html`. If port `8080` is busy, use another port such as `8081`.

When the frontend is opened from `localhost`, `127.0.0.1`, or a local file, it calls `http://localhost:5000/api` by default.

For a deployed frontend, set the public HTTPS backend URL once in `assets/js/config.js`:

```js
window.INTERNGUIDE_API_BASE = 'https://your-api-host.example/api';
```

For temporary testing, the same value can be set in the browser with:

```js
localStorage.setItem('internguide_api_base', 'https://your-api-host.example/api');
```

## API Summary

- `GET /api/health`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/recruiter/signup`
- `POST /api/auth/recruiter/login`
- `GET /api/internships`
- `GET /api/internships/:id`
- `POST /api/internships`
- `PUT /api/internships/:id`
- `DELETE /api/internships/:id`
- `POST /api/internships/:id/apply`
- `GET /api/recruiter/internships`
- `GET /api/recruiter/internships/:id/applications`
- `PATCH /api/applications/:id/status`
- `GET /api/applications/:id/resume`
- `POST /api/admin-auth/login`
- `GET /api/admin-auth/me`
- `GET /api/system-admin/health`
- `GET /api/system-admin/dashboard`
- `GET /api/system-admin/universities`
- `POST /api/system-admin/universities`
- `GET /api/system-admin/universities/:id`
- `PATCH /api/system-admin/universities/:id`
- `PATCH /api/system-admin/universities/:id/status`
- `GET /api/system-admin/universities/:universityId/departments`
- `POST /api/system-admin/universities/:universityId/departments`
- `PATCH /api/system-admin/departments/:id`
- `DELETE /api/system-admin/departments/:id`
- `GET /api/system-admin/recruiter-verifications`
- `GET /api/system-admin/recruiter-verifications/:id`
- `PATCH /api/system-admin/recruiter-verifications/:id/review`
- `GET /api/system-admin/student-verifications`
- `GET /api/system-admin/student-verifications/:id`
- `GET /api/system-admin/internship-approvals`
- `GET /api/system-admin/internship-approvals/:id`
- `GET /api/system-admin/internships`
- `GET /api/system-admin/internships/:id`
- `PATCH /api/system-admin/internships/:id/close`
- `PATCH /api/system-admin/internships/:id/reopen`
- `GET /api/system-admin/students`
- `GET /api/system-admin/recruiters`
- `GET /api/system-admin/audit-logs`
- `GET /api/university/health`

Protected routes require a JWT in `Authorization: Bearer <token>`.

## Admin And University Foundation

This phase adds foundation tables for future admin dashboards, university integration, verification, reports, notifications, and recommendations. It does not migrate student/recruiter auth into one accounts table.

New tables:

- `universities`
- `departments`
- `admin_users`
- `student_university_profiles`
- `recruiter_verifications`
- `internship_university_approvals`
- `notifications`
- `audit_logs`

Local demo seed accounts are created by `npm run seed:admin-university`. The default demo passwords in `.env.example` are local-only and must be changed before any shared or deployed use.

Default local demo accounts:

- System admin: `system.admin@internguide.local`
- University admin: `university.admin@demo.edu`

System admin dashboard URL:

- `http://localhost:8080/admin/login.html`
- `http://localhost:8080/admin/dashboard.html`

System admin pages:

- `admin/dashboard.html`
- `admin/universities.html`
- `admin/recruiter-verifications.html`
- `admin/internships.html`
- `admin/users.html`
- `admin/audit-logs.html`

Main system admin features:

- Platform summary cards
- University create/edit/status management
- Department create/edit/delete with safe delete blocking
- Recruiter verification review
- Student verification and internship approval overview
- Internship close/reopen moderation
- Safe student/recruiter listing
- Audit log filtering

API test examples:

```bash
curl -X POST http://localhost:5000/api/admin-auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"system.admin@internguide.local\",\"password\":\"ChangeMeSystemAdmin123!\"}"
```

Use the returned token:

```bash
curl http://localhost:5000/api/system-admin/health ^
  -H "Authorization: Bearer YOUR_SYSTEM_ADMIN_TOKEN"
```

University admin:

```bash
curl -X POST http://localhost:5000/api/admin-auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"university.admin@demo.edu\",\"password\":\"ChangeMeUniversityAdmin123!\"}"

curl http://localhost:5000/api/university/health ^
  -H "Authorization: Bearer YOUR_UNIVERSITY_ADMIN_TOKEN"
```

## Manual Smoke Tests

After starting PostgreSQL and the backend:

1. Open `/api/health`.
2. Create and log in as a student.
3. Create and log in as a recruiter.
4. Create an internship as a recruiter.
5. Confirm internships appear in the public listing.
6. Apply as a student with a PDF resume.
7. View applicants as the owning recruiter and download the resume.
8. Log in as the demo system admin and open `/api/system-admin/health`.
9. Log in as the demo university admin and open `/api/university/health`.
10. Open `admin/login.html` and log in as the demo system admin.
11. Create, edit, activate, and deactivate a university.
12. Add and edit a department for that university.
13. Review a pending recruiter verification if test data exists.
14. Close and reopen an internship from the admin internships page.
15. Confirm student, recruiter, and university admin tokens receive `403` from system admin routes.

## Security Notes

- Keep `.env` out of Git.
- Keep `backend/uploads/resumes/` out of Git except `.gitkeep`.
- Do not serve uploaded resumes as static public files.
- Use `CLIENT_ORIGIN` instead of `*` in production.
- Use a long random `JWT_SECRET` in every environment.
