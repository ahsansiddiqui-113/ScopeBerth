const pool = require('../config/db');
const { issueMagicLink } = require('../utils/magic');
const { normalizeEmail, isEmail, isUuid, HttpError } = require('../utils/helpers');

// GET /api/team  (owner/staff)
exports.listTeam = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id AS "userId", u.email, u.full_name AS "fullName", om.role, om.created_at AS "createdAt"
       FROM organization_members om JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = $1 AND om.role IN ('owner', 'staff')
      ORDER BY om.role DESC, om.created_at`,
    [req.tenant.organizationId]
  );
  res.json({ team: rows });
};

// POST /api/team  { email, fullName }  (owner; seat limit enforced by requireLimit('seats'))
exports.inviteStaff = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { fullName } = req.body;
  if (!isEmail(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 255)
    throw new HttpError(400, 'Full name is required');

  const client = await pool.connect();
  let user;
  try {
    await client.query('BEGIN');
    const u = await client.query(
      `INSERT INTO users (email, full_name) VALUES ($1, $2)
       ON CONFLICT (LOWER(email)) DO UPDATE SET email = users.email
       RETURNING id, email, full_name`,
      [email, fullName.trim()]
    );
    user = u.rows[0];
    const m = await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'staff')
       ON CONFLICT (organization_id, user_id) DO NOTHING RETURNING id`,
      [req.tenant.organizationId, user.id]
    );
    if (m.rows.length === 0) throw new HttpError(409, 'This person is already a member of your workspace');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  await issueMagicLink(user.id, user.email);
  res.status(201).json({ member: { userId: user.id, email: user.email, fullName: user.full_name, role: 'staff' } });
};

// DELETE /api/team/:userId  (owner) — removes a staff member; owners can't be removed
exports.removeStaff = async (req, res) => {
  if (!isUuid(req.params.userId)) throw new HttpError(404, 'Member not found');
  const { rowCount } = await pool.query(
    `DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'staff'`,
    [req.tenant.organizationId, req.params.userId]
  );
  if (rowCount === 0) throw new HttpError(404, 'Staff member not found');
  res.status(204).end();
};
