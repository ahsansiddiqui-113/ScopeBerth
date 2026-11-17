const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Wraps async route handlers so rejected promises reach the error middleware (Express 4).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (e) => String(e || '').trim().toLowerCase();
const isEmail = (e) => EMAIL_RE.test(e) && e.length <= 255;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newMagicToken = () => crypto.randomBytes(32).toString('hex');

function signSession(user) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const publicUser = (u) => ({ id: u.id, email: u.email, fullName: u.full_name });

const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = {
  asyncHandler, normalizeEmail, isEmail, sha256, newMagicToken,
  signSession, publicUser, slugify, HttpError,
};
