const pool = require('../config/db');
const { sendMagicLink } = require('./mailer');
const { sha256, newMagicToken } = require('./helpers');

const MAGIC_TTL_MINUTES = 15;

// Issues a single-use sign-in link for a user and emails it. `orgSlug` lets the portal brand the login page.
async function issueMagicLink(userId, email, orgSlug) {
  const token = newMagicToken();
  await pool.query(
    `UPDATE users SET magic_token_hash = $1,
            magic_token_expires = NOW() + ($2 || ' minutes')::interval
      WHERE id = $3`,
    [sha256(token), String(MAGIC_TTL_MINUTES), userId]
  );
  const base = process.env.CLIENT_URL || 'http://localhost:3000';
  const qs = new URLSearchParams({ token, ...(orgSlug ? { org: orgSlug } : {}) });
  await sendMagicLink(email, `${base}/portal-login?${qs}`);
}

module.exports = { issueMagicLink };
