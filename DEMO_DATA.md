# BAU Career Center Demo Data

The demo seed is intended only for local development, presentations, and disposable test environments.

```bash
cd backend
npm run db:init
npm run migrate:portal-upgrade
npm run migrate:bau-career-center
npm run seed:demo
```

The seed is idempotent. Running it again updates the same demo accounts and records instead of duplicating them.

## Demo Password

All demo accounts use:

`CareerCenterDemo123!`

Override it locally with `DEMO_DATA_PASSWORD`. Never treat this password as a production credential.

## Demo Accounts

| Role | Email |
| --- | --- |
| System Admin | `system.admin@career-demo.local` |
| University Admin | `university.admin@bau-demo.edu.lb` |
| Approved Recruiter | `maya@cedar-demo.local` |
| Approved Recruiter | `karim@levant-demo.local` |
| Pending Recruiter | `rana@pending-demo.local` |
| Student | `student.one@career-demo.local` |
| Student | `student.two@career-demo.local` |
| Student | `student.three@career-demo.local` |
| Student | `student.four@career-demo.local` |

The seed creates five internships, ten applications across multiple statuses, interview details, training records, a company evaluation, and sample notifications.
