const multer = require('multer');

function sendError(res, status, message, details) {
  const body = { message };

  if (details) {
    body.errors = details;
  }

  return res.status(status).json(body);
}

function notFoundHandler(req, res) {
  return sendError(res, 404, 'Route not found.');
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Resume file must be 5MB or smaller.' : err.message;
    return sendError(res, 400, message);
  }

  if (err.message === 'Resume must be a PDF, DOC, or DOCX file.') {
    return sendError(res, 400, err.message);
  }

  const rawStatus = Number(err.status || err.statusCode);
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;

  if (process.env.NODE_ENV !== 'test') {
    console.error(err);
  }

  return sendError(res, status, status === 500 ? 'Internal server error.' : err.message || 'Request failed.');
}

module.exports = {
  errorHandler,
  notFoundHandler,
  sendError,
};
