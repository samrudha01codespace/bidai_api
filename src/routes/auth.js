const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, mobile: user.mobile, email: user.email, created_at: user.created_at };
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, mobile, email, password } = req.body || {};

    if (!name || !mobile || !email || !password) {
      return res.status(400).json({ error: 'name, mobile, email and password are required' });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'password must be at least 6 characters' });
    }
    const mobileStr = String(mobile).trim();
    if (!/^[6-9]\d{9}$/.test(mobileStr)) {
      return res.status(400).json({ error: 'mobile must be a valid 10-digit Indian number starting with 6-9' });
    }

    const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingEmail.rowCount > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const existingMobile = await db.query('SELECT id FROM users WHERE mobile = $1', [mobileStr]);
    if (existingMobile.rowCount > 0) {
      return res.status(409).json({ error: 'Mobile number already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      'INSERT INTO users (name, mobile, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, mobile, email, created_at',
      [name.trim(), mobileStr, email.toLowerCase(), hash]
    );
    const user = result.rows[0];

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await db.query(
      'SELECT id, name, mobile, email, password_hash, created_at FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const result = await db.query('SELECT id, name, mobile, email, created_at FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user: result.rows[0] });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
