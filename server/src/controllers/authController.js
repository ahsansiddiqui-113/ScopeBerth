const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendMagicLink } = require('../utils/mailer');
const {
  normalizeEmail, isEmail, sha256, newMagicToken, signSession, publicUser, HttpError,
} = require('../utils/helpers');

const MAGIC_TTL_MINUTES = 15;

// POST /api/auth/signup  { email, password, fullName }
// Creates a user only; they create/join a workspace via POST /api/orgs.
exports.signup = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password, fullName } = req.body;

  if (!isEmail(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    throw new HttpError(400, 'Password must be 8-128 characters');
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 255)
    throw new HttpError(400, 'Full name is required');

  const hash = await bcrypt.hash(password, 12);

  // Invited clients already have a password-less row; allow them to set a password only
  // through the magic-link flow, so an unauthenticated signup can never take over that row.
  const { rows } = await pool.query(
    `INSERT INTO users (email, full_name, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (LOWER(email)) DO NOTHING
     RETURNING id, email, full_name`,
    [email, fullName.trim(), hash]
  );
  if (rows.length === 0) throw new HttpError(409, 'An account with this email already exists');

  res.status(201).json({ token: signSession(rows[0]), user: publicUser(rows[0]) });
};

// POST /api/auth/login  { email, password }
exports.login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || typeof password !== 'string') throw new HttpError(400, 'Email and password are required');

  const { rows } = await pool.query(
    'SELECT id, email, full_name, password_hash FROM users WHERE LOWER(email) = $1',
    [email]
  );
  const user = rows[0];
  // Always run a bcrypt compare to keep timing roughly constant for unknown users / magic-only users.
  const ok = await bcrypt.compare(
    password,
    user?.password_hash || '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv'
  );
  if (!user || !user.password_hash || !ok) throw new HttpError(401, 'Invalid email or password');

  res.json({ token: signSession(user), user: publicUser(user) });
};

// POST /api/auth/magic-link  { email }
// Always returns 200 so the endpoint can't be used to discover which emails have accounts.
exports.requestMagicLink = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isEmail(email)) throw new HttpError(400, 'A valid email is required');

  const { rows } = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
  if (rows.length > 0) {
    const token = newMagicToken();
    await pool.query(
      `UPDATE users
          SET magic_token_hash = $1,
              magic_token_expires = NOW() + ($2 || ' minutes')::interval
        WHERE id = $3`,
      [sha256(token), String(MAGIC_TTL_MINUTES), rows[0].id]
    );
    const base = process.env.CLIENT_URL || 'http://localhost:3000';
    await sendMagicLink(email, `${base}/portal-login?token=${token}`);
  }
  res.json({ message: 'If that email has an account, a sign-in link is on its way.' });
};

// POST /api/auth/magic-link/verify  { token }
// Single-use: the token is cleared atomically in the same statement that validates it.
exports.verifyMagicLink = async (req, res) => {
  const { token } = req.body;
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token))
    throw new HttpError(400, 'Invalid link');

  const { rows } = await pool.query(
    `UPDATE users
        SET magic_token_hash = NULL, magic_token_expires = NULL
      WHERE magic_token_hash = $1 AND magic_token_expires > NOW()
      RETURNING id, email, full_name`,
    [sha256(token)]
  );
  if (rows.length === 0) throw new HttpError(401, 'This link is invalid or has expired');

  res.json({ token: signSession(rows[0]), user: publicUser(rows[0]) });
};

// GET /api/auth/me  — current user plus their workspace memberships
exports.me = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.brand_color, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.name`,
    [req.user.id]
  );
  res.json({ user: req.user, organizations: rows });
};
