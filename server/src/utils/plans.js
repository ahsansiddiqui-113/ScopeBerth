const pool = require('../config/db');

const GB = 1024 ** 3;

// null = unlimited. Starter is also what trialing and canceled workspaces get.
const PLANS = {
  starter: {
    label: 'Starter', priceUsd: 0,
    limits: { clients: 1, projects: 2, seats: 1, storageBytes: 1 * GB },
    features: { customDomain: false, whiteLabel: false },
  },
  pro: {
    label: 'Pro', priceUsd: 39,
    limits: { clients: null, projects: null, seats: 1, storageBytes: 25 * GB },
    features: { customDomain: false, whiteLabel: false },
  },
  agency: {
    label: 'Agency', priceUsd: 79,
    limits: { clients: null, projects: null, seats: 5, storageBytes: 100 * GB },
    features: { customDomain: true, whiteLabel: true },
  },
};

/** Paid access requires an active (or past_due grace) subscription; everything else is Starter. */
function effectivePlan(planTier, subscriptionStatus) {
  return PLANS[planTier] && ['active', 'past_due'].includes(subscriptionStatus) ? planTier : 'starter';
}

// Maps Paddle price ids (from env) to plan keys.
function planForPriceId(priceId) {
  if (priceId && priceId === process.env.PADDLE_PRICE_PRO) return 'pro';
  if (priceId && priceId === process.env.PADDLE_PRICE_AGENCY) return 'agency';
  return null;
}

async function getUsage(orgId, db = pool) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM organization_members WHERE organization_id = $1 AND role = 'client') AS clients,
       -- projects in play = non-archived projects + proposals awaiting signature (they become projects)
       ((SELECT COUNT(*) FROM projects WHERE organization_id = $1 AND status <> 'archived')
        + (SELECT COUNT(*) FROM proposals WHERE organization_id = $1 AND status = 'sent'))::int AS projects,
       (SELECT COUNT(*)::int FROM organization_members WHERE organization_id = $1 AND role IN ('owner','staff')) AS seats,
       (SELECT COALESCE(SUM(file_size_bytes), 0)::bigint FROM deliverables WHERE organization_id = $1) AS "storageBytes"`,
    [orgId]
  );
  const u = rows[0];
  return { clients: u.clients, projects: u.projects, seats: u.seats, storageBytes: Number(u.storageBytes) };
}

const NAMES = { clients: 'clients', projects: 'projects', seats: 'team seats', storageBytes: 'file storage' };

/**
 * Blocks (402) when adding `increment` of a resource would exceed the workspace's plan limit.
 * Needs req.tenant.plan (set by tenantContext).
 */
const requireLimit = (resource, increment = () => 1) => async (req, res, next) => {
  try {
    const limit = PLANS[req.tenant.plan].limits[resource];
    if (limit == null) return next();
    const usage = await getUsage(req.tenant.organizationId);
    if (usage[resource] + increment(req) > limit) {
      return res.status(402).json({
        error: `Your ${PLANS[req.tenant.plan].label} plan includes up to ${resource === 'storageBytes' ? `${limit / GB} GB of` : limit} ${NAMES[resource]}. Upgrade to add more.`,
        code: 'PLAN_LIMIT', resource, limit, plan: req.tenant.plan,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Blocks (402) features the current plan doesn't include. */
const requireFeature = (feature) => (req, res, next) =>
  PLANS[req.tenant.plan].features[feature]
    ? next()
    : res.status(402).json({
        error: `${feature === 'customDomain' ? 'Custom domains are' : 'This feature is'} available on the Agency plan.`,
        code: 'PLAN_FEATURE', feature, plan: req.tenant.plan,
      });

module.exports = { PLANS, effectivePlan, planForPriceId, getUsage, requireLimit, requireFeature };
