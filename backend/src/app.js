require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const createCorsOptions = require('./config/cors');
const pool = require('./config/db');
const { errorHandler, notFoundHandler } = require('./middleware/error');
const asyncHandler = require('./utils/asyncHandler');
const authRoutes = require('./routes/auth.routes');
const adminAuthRoutes = require('./routes/admin-auth.routes');
const internshipRoutes = require('./routes/internships.routes');
const recruiterRoutes = require('./routes/recruiter.routes');
const applicationRoutes = require('./routes/application.routes');
const systemAdminRoutes = require('./routes/system-admin.routes');
const universityRoutes = require('./routes/university.routes');
const studentRoutes = require('./routes/student.routes');
const publicUniversityRoutes = require('./routes/public-university.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(helmet());
app.use(cors(createCorsOptions()));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'internguide-api' });
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/admin-auth', adminAuthRoutes);
app.use('/api/internships', internshipRoutes);
app.use('/api/recruiter', recruiterRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/system-admin', systemAdminRoutes);
app.use('/api/university', universityRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/universities', publicUniversityRoutes);
app.use('/api/notifications', notificationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
