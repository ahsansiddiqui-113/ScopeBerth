const pool = require('../config/db');
const { PLANS } = require('../utils/plans');
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
  const { name, brandColor, logoUrl, customDomain } = req.body;
  const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  if (customDomain !== undefined && customDomain !== null) {
    if (!PLANS[req.tenant.plan].features.customDomain)
      return res.status(402).json({ error: 'Custom domains are available on the Agency plan.', code: 'PLAN_FEATURE', feature: 'customDomain' });
    if (typeof customDomain !== 'string' || !DOMAIN_RE.test(customDomain.toLowerCase()))
      throw new HttpError(400, 'customDomain must be a hostname like portal.youragency.com');
  }
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
            logo_url = CASE WHEN $3::boolean THEN $4 ELSE logo_url END,
            custom_domain = CASE WHEN $5::boolean THEN $6 ELSE custom_domain END
      WHERE id = $7
      RETURNING id, name, slug, logo_url, brand_color, plan_tier, subscription_status, trial_ends_at, custom_domain AS "customDomain"`,
    [name?.trim() ?? null, brandColor ?? null, logoUrl !== undefined, logoUrl ?? null,
     customDomain !== undefined, customDomain ? customDomain.toLowerCase() : null, req.tenant.organizationId]
  ).catch((err) => {
    if (err.code === '23505') throw new HttpError(409, 'That domain is already in use');
    throw err;
  });
  res.json({ organization: rows[0] });
};

// GET /api/public/orgs/:slug  — unauthenticated branding for the white-labeled portal / login page.
// Exposes only presentation fields; white-label flag lets the client hide "Powered by ServiceFlow".
exports.getPublicBranding = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT name, slug, logo_url AS "logoUrl", brand_color AS "brandColor",
            (plan_tier = 'agency' AND subscription_status IN ('active', 'past_due')) AS "whiteLabel"
       FROM organizations WHERE slug = $1`,
    [String(req.params.slug).toLowerCase()]
  );
  if (rows.length === 0) throw new HttpError(404, 'Workspace not found');
  res.json({ organization: rows[0] });
};
