const pool = require('../config/db');
const { issueMagicLink } = require('../utils/magic');
const { normalizeEmail, isEmail, HttpError } = require('../utils/helpers');

// POST /api/clients  { email, fullName, companyName? }  (owner/staff)
// Creates the client's user (password-less) if needed, adds them to this org, and emails a magic link.
exports.inviteClient = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { fullName, companyName } = req.body;
  if (!isEmail(email)) throw new HttpError(400, 'A valid email is required');
  if (typeof fullName !== 'string' || !fullName.trim() || fullName.length > 255)
    throw new HttpError(400, 'Full name is required');
  if (companyName !== undefined && (typeof companyName !== 'string' || companyName.length > 255))
    throw new HttpError(400, 'Invalid company name');

  const orgId = req.tenant.organizationId;
  // TODO(phase 4): enforce starter plan limit (1 active client) via requirePlan.

  const client = await pool.connect();
  let user;
  try {
    await client.query('BEGIN');
    // DO UPDATE no-op so RETURNING yields the existing row; we never overwrite an existing user's name.
    const u = await client.query(
      `INSERT INTO users (email, full_name) VALUES ($1, $2)
       ON CONFLICT (LOWER(email)) DO UPDATE SET email = users.email
       RETURNING id, email, full_name`,
      [email, fullName.trim()]
    );
    user = u.rows[0];
    const m = await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role, company_name)
       VALUES ($1, $2, 'client', $3)
       ON CONFLICT (organization_id, user_id) DO NOTHING
       RETURNING id`,
      [orgId, user.id, companyName?.trim() || null]
    );
    if (m.rows.length === 0) {
      await client.query('ROLLBACK');
      throw new HttpError(409, 'This person is already a member of your workspace');
    }
    await client.query('COMMIT');
  } catch (err) {
    if (!(err instanceof HttpError)) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query('SELECT slug FROM organizations WHERE id = $1', [orgId]);
  await issueMagicLink(user.id, user.email, rows[0].slug);

  res.status(201).json({
    client: { userId: user.id, email: user.email, fullName: user.full_name, companyName: companyName?.trim() || null },
  });
};

// POST /api/clients/:userId/resend-invite  (owner/staff)
exports.resendInvite = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, o.slug
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       JOIN organizations o ON o.id = om.organization_id
      WHERE om.organization_id = $1 AND om.user_id = $2 AND om.role = 'client'`,
    [req.tenant.organizationId, req.params.userId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Client not found');
  await issueMagicLink(rows[0].id, rows[0].email, rows[0].slug);
  res.json({ message: 'Invite sent' });
};

// GET /api/clients  (owner/staff)
exports.listClients = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id AS "userId", u.email, u.full_name AS "fullName", om.company_name AS "companyName",
            om.created_at AS "createdAt",
            (SELECT COUNT(*)::int FROM projects p
              WHERE p.organization_id = om.organization_id AND p.client_user_id = u.id) AS "projectCount"
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
      WHERE om.organization_id = $1 AND om.role = 'client'
      ORDER BY om.created_at DESC`,
    [req.tenant.organizationId]
  );
  res.json({ clients: rows });
};
