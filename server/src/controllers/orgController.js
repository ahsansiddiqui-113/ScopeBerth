const pool = require('../config/db');
const { slugify, HttpError } = require('../utils/helpers');

const RESERVED_SLUGS = new Set(['app', 'www', 'api', 'portal', 'admin', 'login', 'static', 'assets']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// POST /api/orgs  { name, slug?, brandColor? }  — caller becomes owner
exports.createOrg = async (req, res) => {
  const { name, brandColor } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 255)
    throw new HttpError(400, 'Organization name is required');
  if (brandColor !== undefined && !HEX_COLOR.test(brandColor))
    throw new HttpError(400, 'brandColor must be a hex color like #2563EB');

  const slug = slugify(req.body.slug || name);
  if (slug.length < 3) throw new HttpError(400, 'Slug must be at least 3 characters');
  if (RESERVED_SLUGS.has(slug)) throw new HttpError(400, 'That slug is reserved');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const orgRes = await client.query(
      `INSERT INTO organizations (name, slug, brand_color)
       VALUES ($1, $2, COALESCE($3, '#2563EB'))
       RETURNING id, name, slug, logo_url, brand_color, plan_tier, subscription_status, trial_ends_at`,
      [name.trim(), slug, brandColor || null]
    );
    await client.query(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [orgRes.rows[0].id, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ organization: { ...orgRes.rows[0], role: 'owner' } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new HttpError(409, 'That workspace URL is already taken');
    throw err;
  } finally {
    client.release();
  }
};

// GET /api/orgs  — organizations the caller belongs to
exports.listMyOrgs = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.brand_color, o.plan_tier, om.role
       FROM organization_members om
       JOIN organizations o ON o.id = om.organization_id
      WHERE om.user_id = $1
      ORDER BY o.name`,
    [req.user.id]
  );
  res.json({ organizations: rows });
};

// GET /api/orgs/current  — requires x-organization-id (tenantContext)
exports.getCurrentOrg = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, slug, logo_url, brand_color, plan_tier, subscription_status, trial_ends_at
       FROM organizations WHERE id = $1`,
    [req.tenant.organizationId]
  );
  res.json({ organization: rows[0], role: req.tenant.role });
};

// PATCH /api/orgs/current  { name?, brandColor?, logoUrl? }  — owner only
exports.updateCurrentOrg = async (req, res) => {
  const { name, brandColor, logoUrl } = req.body;
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 255))
    throw new HttpError(400, 'Invalid name');
  if (brandColor !== undefined && !HEX_COLOR.test(brandColor))
    throw new HttpError(400, 'brandColor must be a hex color like #2563EB');
  if (logoUrl !== undefined && logoUrl !== null && !/^https:\/\//.test(logoUrl))
    throw new HttpError(400, 'logoUrl must be an https URL');

  const { rows } = await pool.query(
    `UPDATE organizations
        SET name = COALESCE($1, name),
            brand_color = COALESCE($2, brand_color),
            logo_url = CASE WHEN $3::boolean THEN $4 ELSE logo_url END
      WHERE id = $5
      RETURNING id, name, slug, logo_url, brand_color, plan_tier, subscription_status, trial_ends_at`,
    [name?.trim() ?? null, brandColor ?? null, logoUrl !== undefined, logoUrl ?? null, req.tenant.organizationId]
  );
  res.json({ organization: rows[0] });
};
