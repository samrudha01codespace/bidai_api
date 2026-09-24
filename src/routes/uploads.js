const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILES = 5;
const MIN_FILES = 2;
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: MAX_FILES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error('Only jpg, png, webp images are allowed'));
    }
    return cb(null, true);
  },
});

router.post('/', requireAuth, (req, res, next) => {
  upload.array('images', MAX_FILES)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Each image must be 5MB or less' });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: `Maximum ${MAX_FILES} images allowed` });
      }
      return res.status(400).json({ error: err.message });
    }

    const files = req.files || [];
    if (files.length < MIN_FILES) {
      for (const f of files) {
        require('fs').unlink(f.path, () => {});
      }
      return res.status(400).json({ error: `Minimum ${MIN_FILES} images required` });
    }

    const urls = files.map((f) => `/uploads/${f.filename}`);
    return res.status(201).json({ urls });
  });
});

module.exports = router;
