const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const defaultResumeDir = path.join(__dirname, '..', '..', 'uploads', 'resumes');
const resumeDir = path.resolve(process.env.UPLOAD_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || defaultResumeDir);
const allowedExtensions = new Set(['.pdf']);
const allowedMimeTypes = new Set(['application/pdf']);

fs.mkdirSync(resumeDir, { recursive: true, mode: 0o700 });

const storage = multer.diskStorage({
  destination: resumeDir,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function resumeFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowedExtensions.has(ext) || !allowedMimeTypes.has(file.mimetype)) {
    return cb(new Error('Resume must be a PDF file.'));
  }

  return cb(null, true);
}

const resumeUpload = multer({
  storage,
  fileFilter: resumeFileFilter,
  preservePath: false,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

function removeUploadedFile(file) {
  if (!file || !file.path) {
    return;
  }

  fs.promises.unlink(file.path).catch(() => {});
}

function resolveResumePath(filename) {
  if (!filename || path.basename(filename) !== filename) {
    return null;
  }

  const ext = path.extname(filename).toLowerCase();

  if (!allowedExtensions.has(ext)) {
    return null;
  }

  const resolvedDir = path.resolve(resumeDir);
  const fullPath = path.resolve(resolvedDir, filename);

  if (!fullPath.startsWith(resolvedDir + path.sep)) {
    return null;
  }

  return {
    fullPath,
    downloadName: `resume-${filename}`,
  };
}

module.exports = {
  removeUploadedFile,
  resolveResumePath,
  resumeDir,
  resumeUpload,
};
