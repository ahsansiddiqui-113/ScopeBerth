const pool = require('../config/db');
const { effectivePlan } = require('../utils/plans');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifies the authenticated user is a member of the organization named in
 * `x-organization-id` and attaches `req.tenant` (org id, role, plan info).
 * All tenant-scoped queries MUST filter by req.tenant.organizationId.
 */
async function tenantContext(req, res, next) {
  try {
    const orgId = req.headers['x-organization-id'];
    if (!orgId) return res.status(400).json({ error: 'Missing x-organization-id header' });
    if (!UUID_RE.test(orgId)) return res.status(400).json({ error: 'Invalid x-organization-id' });

    const { rows } = await pool.query(
      `SELECT om.role, o.plan_tier, o.subscription_status, o.trial_ends_at
         FROM organization_members om
         JOIN organizations o ON om.organization_id = o.id
        WHERE om.organization_id = $1 AND om.user_id = $2`,
      [orgId, req.user.id]
    );

    // Same response whether the org doesn't exist or the user isn't a member (no enumeration).
    if (rows.length === 0) return res.status(403).json({ error: 'Access denied to this organization' });

    req.tenant = {
      organizationId: orgId,
      role: rows[0].role,
      planTier: rows[0].plan_tier,
      plan: effectivePlan(rows[0].plan_tier, rows[0].subscription_status), // what limits actually apply
      subscriptionStatus: rows[0].subscription_status,
      trialEndsAt: rows[0].trial_ends_at,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Role guard: requireRole('owner', 'staff') */
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.tenant?.role)
    ? next()
    : res.status(403).json({ error: 'Insufficient role for this action' });

module.exports = tenantContext;
module.exports.requireRole = requireRole;
