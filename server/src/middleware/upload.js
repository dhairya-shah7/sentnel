const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${timestamp}_${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.csv') {
    return cb(
      Object.assign(new Error('Only CSV files are allowed'), {
        statusCode: 400,
        code: 'INVALID_FILE_TYPE',
      }),
      false
    );
  }
  if (file.mimetype && !['text/csv', 'application/csv', 'text/plain', 'application/octet-stream', 'application/vnd.ms-excel'].includes(file.mimetype)) {
    return cb(
      Object.assign(new Error('Invalid MIME type for CSV'), {
        statusCode: 400,
        code: 'INVALID_MIME_TYPE',
      }),
      false
    );
  }
  cb(null, true);
};

const maxUploadBytes = getUploadLimitBytes();
const maxUploadLabel = getUploadLimitLabel();

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: maxUploadBytes,
  },
});

// Multer error wrapper
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File too large. Maximum size is ${maxUploadLabel}`,
        code: 'FILE_TOO_LARGE',
      });
    }
    return res.status(400).json({ error: err.message, code: err.code });
  }
  if (err) {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      code: err.code || 'UPLOAD_ERROR',
    });
  }
  next();
};

module.exports = { upload, handleUploadError };

function getUploadLimitBytes() {
  const gb = Number.parseFloat(process.env.MAX_UPLOAD_SIZE_GB || '');
  if (Number.isFinite(gb) && gb > 0) {
    return Math.floor(gb * 1024 * 1024 * 1024);
  }

  const mb = Number.parseFloat(process.env.MAX_UPLOAD_SIZE_MB || '5120');
  if (Number.isFinite(mb) && mb > 0) {
    return Math.floor(mb * 1024 * 1024);
  }

  return 5 * 1024 * 1024 * 1024;
}

function getUploadLimitLabel() {
  const gb = Number.parseFloat(process.env.MAX_UPLOAD_SIZE_GB || '');
  if (Number.isFinite(gb) && gb > 0) {
    return `${gb}GB`;
  }

  const mb = Number.parseFloat(process.env.MAX_UPLOAD_SIZE_MB || '5120');
  if (Number.isFinite(mb) && mb > 0) {
    return `${mb}MB`;
  }

  return '5GB';
}
