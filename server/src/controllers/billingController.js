const pool = require('../config/db');
const { PLANS, getUsage } = require('../utils/plans');
const { HttpError } = require('../utils/helpers');

const isSandbox = () => process.env.PADDLE_ENV !== 'production';
const apiBase = () => (isSandbox() ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');
const priceFor = (plan) => (plan === 'pro' ? process.env.PADDLE_PRICE_PRO : process.env.PADDLE_PRICE_AGENCY);

// GET /api/billing  (owner) — plan, limits, current usage; drives the paywall banner and settings page
exports.getBilling = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT plan_tier, subscription_status, trial_ends_at, paddle_subscription_id, custom_domain
       FROM organizations WHERE id = $1`,
    [req.tenant.organizationId]
  );
  const o = rows[0];
  const plan = PLANS[req.tenant.plan];
  res.json({
    plan: req.tenant.plan,              // effective plan (what limits apply)
    planTier: o.plan_tier,              // purchased tier
    subscriptionStatus: o.subscription_status,
    trialEndsAt: o.trial_ends_at,
    hasSubscription: !!o.paddle_subscription_id,
    customDomain: o.custom_domain,
    limits: plan.limits,
    features: plan.features,
    usage: await getUsage(req.tenant.organizationId),
    plans: Object.entries(PLANS).map(([key, p]) => ({ key, label: p.label, priceUsd: p.priceUsd, limits: p.limits, features: p.features })),
  });
};

// POST /api/billing/checkout  { plan: 'pro' | 'agency' }  (owner)
// Returns what Paddle.js needs to open the overlay checkout. The organization id travels in customData so the
// webhook can link the resulting subscription back to this workspace.
exports.createCheckout = async (req, res) => {
  const { plan } = req.body;
  if (!['pro', 'agency'].includes(plan)) throw new HttpError(400, "plan must be 'pro' or 'agency'");
  if (!priceFor(plan) || !process.env.PADDLE_CLIENT_TOKEN) throw new HttpError(501, 'Billing is not configured');

  const { rows } = await pool.query('SELECT paddle_subscription_id FROM organizations WHERE id = $1', [req.tenant.organizationId]);
  if (rows[0].paddle_subscription_id && ['active', 'past_due'].includes(req.tenant.subscriptionStatus))
    throw new HttpError(409, 'You already have a subscription. Use the billing portal to change plans.');

  res.json({
    environment: isSandbox() ? 'sandbox' : 'production',
    clientToken: process.env.PADDLE_CLIENT_TOKEN,
    priceId: priceFor(plan),
    customerEmail: req.user.email,
    customData: { organization_id: req.tenant.organizationId },
  });
};

// POST /api/billing/portal  (owner) — Paddle customer portal (update card, change plan, cancel, invoices)
exports.createPortalSession = async (req, res) => {
  if (!process.env.PADDLE_API_KEY) throw new HttpError(501, 'Billing is not configured');
  const { rows } = await pool.query(
    'SELECT paddle_customer_id, paddle_subscription_id FROM organizations WHERE id = $1',
    [req.tenant.organizationId]
  );
  const { paddle_customer_id: customerId, paddle_subscription_id: subId } = rows[0];
  if (!customerId) throw new HttpError(409, 'No subscription to manage yet');

  const r = await fetch(`${apiBase()}/customers/${customerId}/portal-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PADDLE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(subId ? { subscription_ids: [subId] } : {}),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Paddle portal session failed:', r.status, JSON.stringify(body));
    throw new HttpError(502, 'Could not open the billing portal');
  }
  res.json({ url: body.data.urls.general.overview });
};
