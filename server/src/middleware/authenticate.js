const jwt = require('jsonwebtoken');
const pool = require('../config/db');

module.exports = async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ error: 'Missing bearer token' });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const { rows } = await pool.query(
      'SELECT id, email, full_name FROM users WHERE id = $1',
      [payload.sub]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'User no longer exists' });

    req.user = { id: rows[0].id, email: rows[0].email, fullName: rows[0].full_name };
    next();
  } catch (err) {
    next(err);
  }
};
