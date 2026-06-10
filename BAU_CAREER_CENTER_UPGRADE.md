# BAU Career Center Upgrade

InternGuide now supports a complete university-controlled internship lifecycle, from verified opportunity publication through supervised training, company evaluation, final-report review, analytics, and CSV export.

## New Portal Pages

- `student/training.html`: student training records, weekly reports, final report upload, evaluation review
- `recruiter/training.html`: company training supervision and evaluation form
- `university/training.html`: university training supervision, report review, analytics, exports
- `admin/training.html`: system-wide training supervision, analytics, exports
- `messages.html`: application-scoped student/recruiter messages

## New API Routes

All routes below require JWT authentication.

- `GET /api/student/matches`
- `GET /api/student/matches/:id`
- `PATCH /api/applications/:id/interview`
- `GET /api/career-center/training-records`
- `GET /api/career-center/training-records/:id`
- `PATCH /api/career-center/training-records/:id/status`
- `POST /api/career-center/training-records/:id/weekly-reports`
- `POST /api/career-center/training-records/:id/evaluation`
- `POST /api/career-center/training-records/:id/final-report`
- `GET /api/career-center/training-records/:id/final-report`
- `PATCH /api/career-center/training-records/:id/final-report/review`
- `GET /api/career-center/applications/:id/messages`
- `POST /api/career-center/applications/:id/messages`
- `PATCH /api/career-center/applications/:id/messages/read`
- `GET /api/career-center/analytics`
- `GET /api/career-center/exports/:dataset`

Export datasets: `applications`, `students`, `recruiters`, `training-records`, and `evaluations`.

## Database Modules

- `training_records`
- `weekly_reports`
- `company_evaluations`
- `application_messages`
- Interview fields on `applications`
- Matching preferences on `student_university_profiles`
- Required skills and academic year on `internships`

When a recruiter marks an application as `accepted`, the API creates one training record using `ON CONFLICT (application_id) DO NOTHING`.

## Commands

```bash
cd backend
npm install
npm run db:init
npm run migrate:portal-upgrade
npm run migrate:bau-career-center
npm run seed:demo
npm run test:workflow
npm run test:bau-career-center
npm start
```

The BAU migration is idempotent and can run repeatedly. Railway runs:

```bash
cd backend && npm run db:init && npm run migrate:portal-upgrade && npm run migrate:bau-career-center
```

Then starts:

```bash
cd backend && npm start
```

## Security

- Training, reports, evaluations, messages, analytics, and exports require JWT authentication.
- Students can access only their applications, training, reports, and messages.
- Recruiters can access only records linked to their internships.
- University admins are restricted to their university.
- System admins can supervise all records.
- Final reports are PDF-only, size-limited, stored outside public static folders, and downloaded only through protected routes.
- Messaging is application-scoped; random users cannot create threads.

## Known Limitations

- Messaging is request/response based and does not use real-time WebSockets.
- Matching is deterministic and profile-based, not an AI recommendation system.
- Weekly reports support submission and storage; a dedicated university weekly-report review UI can be expanded later.
- Report files require persistent Railway volume configuration for long-term production storage.
- Email and calendar invitations are not sent; interview details are delivered through portal notifications.

## Recommended Screenshots

- BAU Career Center landing page role cards
- Student match score and reasons
- Recruiter interview scheduling form
- Student training and final-report upload
- Recruiter company evaluation form
- University training supervision and report review
- Career-center analytics and CSV export controls
- Application message thread
