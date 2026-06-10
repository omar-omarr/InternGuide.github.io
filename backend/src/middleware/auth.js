const jwt = require('jsonwebtoken');

const ROLES = Object.freeze({
  STUDENT: 'student',
  RECRUITER: 'recruiter',
  UNIVERSITY_ADMIN: 'university_admin',
  SYSTEM_ADMIN: 'system_admin',
});

const validRoles = new Set(Object.values(ROLES));

function authenticateToken(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  const [scheme, token, extra] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token || extra) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (!payload || !payload.id || !validRoles.has(payload.role)) {
      return res.status(401).json({ message: 'Invalid or expired authentication token.' });
    }

    req.auth = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired authentication token.' });
  }
}

function authorizeRole(...roles) {
  const unknownRole = roles.find((role) => !validRoles.has(role));

  if (unknownRole) {
    throw new Error(`Unknown role guard: ${unknownRole}`);
  }

  return function roleGuard(req, res, next) {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'You do not have permission to access this resource.' });
    }

    return next();
  };
}

const requireStudent = authorizeRole(ROLES.STUDENT);
const requireRecruiter = authorizeRole(ROLES.RECRUITER);
const requireUniversityAdmin = authorizeRole(ROLES.UNIVERSITY_ADMIN);
const requireSystemAdmin = authorizeRole(ROLES.SYSTEM_ADMIN);

module.exports = {
  ROLES,
  authenticateToken,
  authorizeRole,
  requireStudent,
  requireRecruiter,
  requireUniversityAdmin,
  requireSystemAdmin,
};
