# InternGuide University Portal Upgrade

> The university portal has been extended into a BAU Career Center internship management system. See `BAU_CAREER_CENTER_UPGRADE.md` and `DEMO_DATA.md` for training, evaluation, reporting, analytics, interview, matching, messaging, demo-data, and deployment details.

## What Was Added

- System-admin dashboard counts, notifications, searchable directories, internship approval actions, recruiter verification, and a platform-wide applications page.
- Automatic `pending` recruiter verification after signup. Only approved recruiters can create or edit internships.
- Verified Company badges for approved recruiters on public internship pages.
- University approval is required before internships appear publicly. Editing an internship resubmits it for approval.
- Expanded student university profiles: university, department, faculty, major, student ID, academic year, skills, and optional GPA.
- Full application workflow: `submitted`, `viewed`, `shortlisted`, `interview_scheduled`, `accepted`, `rejected`, and `withdrawn`.
- Student withdrawal, recruiter status updates, application timelines, and role-scoped notification lists with mark-as-read actions.
- PDF-only resume validation, protected resume downloads, JWT role guards, audit logs, and production migration commands.

## Required Database Migration

Run this once against every existing database:

```powershell
cd backend
npm run migrate:portal-upgrade
```

The migration is non-destructive and safe to rerun. It expands student profiles, upgrades application statuses, and creates pending verification records for legacy recruiters that do not have one.

`railway.json` and `render.yaml` now run both `db:init` and `migrate:portal-upgrade` during pre-deploy.

## Start Commands

Backend:

```powershell
cd backend
npm install
npm run db:init
npm run migrate:portal-upgrade
npm run dev
```

Frontend, from the repository root in a second terminal:

```powershell
npx http-server . -p 8080
```

Open `http://localhost:8080/index.html`. Local pages use `http://localhost:5000/api`; deployed pages use the Railway API configured in `assets/js/config.js`.

## Verification

```powershell
cd backend
npm run test:workflow
npm audit --omit=dev
```

The workflow smoke test covers:

- Student signup/login and university profile submission
- Recruiter signup/login and pending posting lock
- System-admin login and recruiter approval
- Recruiter internship creation and system-admin internship approval
- Public approved-internship search
- PDF application submission
- Recruiter viewing and changing application status
- Student seeing status updates and withdrawing
- Notification listing and mark-as-read
- Admin application visibility
- Student/recruiter rejection from protected admin routes

## Changed Files

Backend and database:

- `backend/db/schema.sql`
- `backend/db/migrations/20260610_university_portal_upgrade.sql`
- `backend/package.json`
- `backend/README.md`
- `backend/src/app.js`
- `backend/src/middleware/error.js`
- `backend/src/middleware/upload.js`
- `backend/src/routes/application.routes.js`
- `backend/src/routes/auth.routes.js`
- `backend/src/routes/internships.routes.js`
- `backend/src/routes/notification.routes.js`
- `backend/src/routes/recruiter.routes.js`
- `backend/src/routes/student.routes.js`
- `backend/src/routes/system-admin.routes.js`
- `backend/src/routes/university.routes.js`
- `backend/tests/portal-workflow.smoke.js`

Deployment and documentation:

- `README.md`
- `PORTAL_UPGRADE.md`
- `.github/workflows/static.yml`
- `railway.json`
- `render.yaml`

Admin frontend:

- `admin/applications.html`
- `admin/audit-logs.html`
- `admin/dashboard.html`
- `admin/internships.html`
- `admin/recruiter-verifications.html`
- `admin/universities.html`
- `admin/users.html`
- `assets/js/admin/admin-api.js`
- `assets/js/admin/admin-applications.js`
- `assets/js/admin/admin-dashboard.js`
- `assets/js/admin/admin-internships.js`
- `assets/js/admin/admin-recruiter-verifications.js`
- `assets/js/admin/admin-users.js`

Student, recruiter, university, and public frontend:

- `assets/css/admin.css`
- `assets/css/style.css`
- `assets/js/api.js`
- `assets/js/config.js`
- `assets/js/internship-detail.js`
- `assets/js/internship-search.js`
- `assets/js/recruiter-applicants.js`
- `assets/js/recruiter-dashboard.js`
- `assets/js/student-dashboard.js`
- `assets/js/student-university.js`
- `assets/js/university/university-applications.js`
- `assets/js/university/university-internship-approvals.js`
- `internship.html`
- `recruiter/dashboard.html`
- `student-university.html`
- `student/dashboard.html`
- `university/applications.html`
- `user_signup.html`

## Remaining TODOs

- Add an actual company-document upload flow for recruiter verification. New accounts currently enter the admin review queue using their submitted company/account information.
- Move resumes from a persistent filesystem volume to private object storage before large-scale production use; add malware scanning.
- Add email or push delivery on top of the current in-app notifications.
- Add browser-driven automated UI tests, pagination controls, and a formal accessibility review.
- Deploy these changes only after reviewing them and running the production database migration.
