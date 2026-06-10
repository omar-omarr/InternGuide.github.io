const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const defaultResumeDir = path.join(__dirname, '..', '..', 'uploads', 'resumes');
const resumeDir = path.resolve(process.env.UPLOAD_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || defaultResumeDir);
const reportDir = path.resolve(process.env.REPORT_UPLOAD_DIR || path.join(path.dirname(resumeDir), 'reports'));
const allowedExtensions = new Set(['.pdf']);
const allowedMimeTypes = new Set(['application/pdf']);

fs.mkdirSync(resumeDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(reportDir, { recursive: true, mode: 0o700 });

function createStorage(destination) {
  return multer.diskStorage({
    destination,
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  });
}

function pdfFileFilter(message) {
  return function filterPdf(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error(message));
  }

  return cb(null, true);
  };
}

const resumeUpload = multer({
  storage: createStorage(resumeDir),
  fileFilter: pdfFileFilter('Resume must be a PDF file.'),
  preservePath: false,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

const reportUpload = multer({
  storage: createStorage(reportDir),
  fileFilter: pdfFileFilter('Final report must be a PDF file.'),
  preservePath: false,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

function removeUploadedFile(file) {
  if (!file || !file.path) {
    return;
  }

  fs.promises.unlink(file.path).catch(() => {});
}

function resolvePdfPath(directory, filename, downloadPrefix) {
  if (!filename || path.basename(filename) !== filename) {
    return null;
  }

  const ext = path.extname(filename).toLowerCase();

  if (!allowedExtensions.has(ext)) {
    return null;
  }

  const resolvedDir = path.resolve(directory);
  const fullPath = path.resolve(resolvedDir, filename);

  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    return null;
  }

  return {
    fullPath,
    downloadName: `${downloadPrefix}-${filename}`,
  };
}

function resolveResumePath(filename) {
  return resolvePdfPath(resumeDir, filename, 'resume');
}

function resolveReportPath(filename) {
  return resolvePdfPath(reportDir, filename, 'internship-final-report');
}

module.exports = {
  removeUploadedFile,
  reportDir,
  reportUpload,
  resolveReportPath,
  resolveResumePath,
  resumeDir,
  resumeUpload,
};
