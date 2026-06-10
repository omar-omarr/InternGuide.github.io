# InternGuide Backend

Express API for InternGuide.

## Stack

- Backend: Node.js + Express
- Database: PostgreSQL
- Authentication: JWT
- Password hashing: bcrypt
- Upload handling: Multer

This backend does not use MySQL, Firebase Auth, Firebase Storage, or paid APIs.

## Setup

```bash
npm install
copy .env.example .env
```

Edit `.env` and set PostgreSQL credentials, `JWT_SECRET`, and `CLIENT_ORIGIN`. Use either `DATABASE_URL` or the individual `PG*` variables; keep `DATABASE_URL` commented when using `PGHOST`, `PGUSER`, and `PGPASSWORD`.

Create the database and schema:

```bash
createdb internguide
psql -d internguide -f db/schema.sql
```

Run migrations when needed:

```bash
psql -d internguide -f db/migrations/20260603_add_common_indexes.sql
psql -d internguide -f db/migrations/20260603_add_admin_university_foundation.sql
```

If `psql` is not on PATH, run the admin/university foundation migration through Node:

```bash
npm run migrate:admin-foundation
```

Seed local-only demo university/admin accounts:

```bash
npm run seed:admin-university
```

Start the API:

```bash
npm run dev
```

The API defaults to `http://localhost:5000`.

## Production Configuration

The production entrypoint is `src/server.js`, and the production start command is:

```bash
npm start
```

Copy the required values from `.env.production.example` into the hosting provider:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
PGSSL=true
JWT_SECRET=generate-a-random-secret-at-least-32-characters-long
CLIENT_ORIGIN=https://omar-omarr.github.io
UPLOAD_DIR=/path/on-a-persistent-volume/resumes
```

Production startup fails early when `DATABASE_URL`, `PGSSL=true`, a sufficiently long `JWT_SECRET`, or a non-wildcard `CLIENT_ORIGIN` is missing. The API binds to the provider-supplied `PORT`.

Initialize a new production database with:

```bash
npm run db:init
```

The public health check is:

```text
GET /api/health
```

It returns `200` only when the API can query PostgreSQL.

## Deploy On Render

The repository-root `render.yaml` defines:

- A Node web service rooted at `backend/`
- A managed PostgreSQL database
- `npm ci`, `npm run db:init`, and `npm start`
- `/api/health` as the health check
- The GitHub Pages origin for CORS
- A persistent disk mounted at `/var/data` for resumes

Deploy it:

1. Push the repository to GitHub.
2. In Render, choose **New > Blueprint**.
3. Connect `omar-omarr/InternGuide.github.io`.
4. Select the root `render.yaml` and apply the Blueprint.
5. Confirm the generated `JWT_SECRET` and wait for the database and web service to become healthy.
6. Open `https://YOUR-SERVICE.onrender.com/api/health`.

The persistent disk and production PostgreSQL plan can incur hosting charges. Do not remove the disk unless resume uploads are moved to object storage.

## Deploy On Railway

The repository-root `railway.json` provides the build, database initialization, start, health-check, and restart commands.

1. Create a Railway project from `omar-omarr/InternGuide.github.io`.
2. Keep the service root at the repository root so `railway.json` can run its `cd backend` commands.
3. Add a PostgreSQL service.
4. Set backend variables:

```env
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
PGSSL=true
JWT_SECRET=generate-a-random-secret-at-least-32-characters-long
CLIENT_ORIGIN=https://omar-omarr.github.io
UPLOAD_DIR=/data/resumes
```

5. Attach a persistent volume to the backend service at `/data`.
6. Deploy, then generate a public domain from the backend service's Networking settings.
7. Verify `https://YOUR-DOMAIN/api/health`.

Railway volumes persist across deploys. Keep the volume attached while the current filesystem-based resume implementation is in use.

## Endpoints

- `GET /api/health` - API health check.
- `POST /api/auth/signup` - student signup; accepts `multipart/form-data` and optional `file_cv`.
- `POST /api/auth/login` - student login; returns a JWT.
- `POST /api/auth/recruiter/signup` - recruiter signup.
- `POST /api/auth/recruiter/login` - recruiter login; returns a JWT.
- `GET /api/internships` - list active internships; supports `keyword`, `location`, `type`, and `category`.
- `GET /api/internships/:id` - internship details.
- `POST /api/internships` - recruiter-only internship creation.
- `PUT /api/internships/:id` - recruiter-only update for owned internships.
- `DELETE /api/internships/:id` - recruiter-only delete for owned internships.
- `POST /api/internships/:id/apply` - student-only application with required `resume` upload.
- `GET /api/recruiter/internships` - recruiter-only list of own internships.
- `GET /api/recruiter/internships/:id/applications` - recruiter-only applicant list for an owned internship.
- `PATCH /api/applications/:id/status` - recruiter-only application status update.
- `GET /api/applications/:id/resume` - protected resume download for the owning recruiter, owning student, or system admin.
- `POST /api/admin-auth/login` - admin login for `system_admin` and `university_admin`.
- `GET /api/admin-auth/me` - current active admin profile.
- `GET /api/system-admin/health` - protected system-admin test route.
- `GET /api/system-admin/dashboard` - system admin summary counts.
- `GET /api/system-admin/universities` - list universities.
- `POST /api/system-admin/universities` - create a university.
- `GET /api/system-admin/universities/:id` - university details and departments.
- `PATCH /api/system-admin/universities/:id` - update university details.
- `PATCH /api/system-admin/universities/:id/status` - activate or deactivate a university.
- `GET /api/system-admin/universities/:universityId/departments` - list departments.
- `POST /api/system-admin/universities/:universityId/departments` - create a department.
- `PATCH /api/system-admin/departments/:id` - rename a department.
- `DELETE /api/system-admin/departments/:id` - delete an unreferenced department.
- `GET /api/system-admin/recruiter-verifications` - list recruiter verifications.
- `GET /api/system-admin/recruiter-verifications/:id` - recruiter verification details.
- `PATCH /api/system-admin/recruiter-verifications/:id/review` - approve or reject a pending recruiter verification.
- `GET /api/system-admin/student-verifications` - list student university verifications.
- `GET /api/system-admin/student-verifications/:id` - student university verification details.
- `GET /api/system-admin/internship-approvals` - list internship university approvals.
- `GET /api/system-admin/internship-approvals/:id` - internship university approval details.
- `GET /api/system-admin/internships` - list internships for moderation.
- `GET /api/system-admin/internships/:id` - internship moderation details.
- `PATCH /api/system-admin/internships/:id/close` - close an internship.
- `PATCH /api/system-admin/internships/:id/reopen` - reopen an internship.
- `GET /api/system-admin/students` - safe student listing.
- `GET /api/system-admin/recruiters` - safe recruiter listing.
- `GET /api/system-admin/audit-logs` - audit log listing with filters.
- `GET /api/university/health` - protected university-admin test route.

## Role Authorization

Reusable middleware is in `src/middleware/auth.js`:

- `authenticateToken`
- `authorizeRole`
- `requireStudent`
- `requireRecruiter`
- `requireUniversityAdmin`
- `requireSystemAdmin`

Current production flows use `student` and `recruiter`. `university_admin` and `system_admin` are reserved for future features.

## Database Notes

`db/schema.sql` is safe to rerun because tables, indexes, extensions, and triggers use `IF NOT EXISTS` or replace existing trigger functions. Migrations in `db/migrations/` are additive and should be run against existing databases when schema changes are introduced after deployment.

Current tables:

- `users`
- `recruiters`
- `internships`
- `applications`
- `universities`
- `departments`
- `admin_users`
- `student_university_profiles`
- `recruiter_verifications`
- `internship_university_approvals`
- `notifications`
- `audit_logs`

## Local Demo Seed

`npm run seed:admin-university` creates or updates:

- One demo university
- One demo department
- One system admin
- One university admin linked to the demo university

Default local-only demo accounts:

- System admin: `system.admin@internguide.local`
- University admin: `university.admin@demo.edu`

The default demo passwords are in `.env.example` for local testing only. Change them before any shared environment or deployment.

## Admin API Test Examples

System admin login:

```bash
curl -X POST http://localhost:5000/api/admin-auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"system.admin@internguide.local\",\"password\":\"ChangeMeSystemAdmin123!\"}"
```

System admin health:

```bash
curl http://localhost:5000/api/system-admin/health ^
  -H "Authorization: Bearer YOUR_SYSTEM_ADMIN_TOKEN"
```

University admin login:

```bash
curl -X POST http://localhost:5000/api/admin-auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"university.admin@demo.edu\",\"password\":\"ChangeMeUniversityAdmin123!\"}"
```

University admin health:

```bash
curl http://localhost:5000/api/university/health ^
  -H "Authorization: Bearer YOUR_UNIVERSITY_ADMIN_TOKEN"
```

## System Admin Frontend

Start the static frontend and open:

```bash
npx http-server .. -p 8080
```

Then visit:

- `http://localhost:8080/admin/login.html`
- `http://localhost:8080/admin/dashboard.html`
- `http://localhost:8080/admin/universities.html`
- `http://localhost:8080/admin/recruiter-verifications.html`
- `http://localhost:8080/admin/internships.html`
- `http://localhost:8080/admin/users.html`
- `http://localhost:8080/admin/audit-logs.html`

Manual checklist:

- Log in as the demo system admin.
- Confirm dashboard counts load.
- Create, edit, activate, and deactivate a university.
- Add and edit a department.
- Delete only an unreferenced department; referenced departments should be blocked.
- Review a pending recruiter verification if one exists.
- Close and reopen an internship.
- Search students and recruiters.
- Filter audit logs.
- Confirm student, recruiter, and university admin tokens receive `403` on system-admin routes.

## Security Notes

- Passwords are hashed with bcrypt.
- JWTs are required for protected routes.
- Role guards protect student/recruiter behavior.
- Recruiter routes only allow access to internships owned by that recruiter.
- Duplicate applications are blocked with a database unique constraint.
- Resume uploads are limited to PDF, DOC, and DOCX files up to 5MB.
- Resume filenames are randomized, paths are constrained to the configured upload directory, and failed requests remove uploaded files.
- Uploaded resumes are not served statically; downloads go through an authorization check.
- Production resume storage must use `UPLOAD_DIR` on a persistent disk or volume.
- Helmet, CORS, and rate limiting are enabled.
