const { validationResult } = require('express-validator');
const { removeUploadedFile } = require('./upload');

function validateRequest(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  removeUploadedFile(req.file);

  return res.status(400).json({
    message: 'Validation failed.',
    errors: result.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });
}

module.exports = validateRequest;
