const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await db.query('SELECT id, name, slug FROM categories ORDER BY id');
    return res.json({ categories: result.rows });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
