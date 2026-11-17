const crypto = require('crypto');
const pool = require('../config/db');
const { planForPriceId } = require('../utils/plans');
const { isUuid } = require('../utils/helpers');

const TOLERANCE_SECONDS = 5 * 60;

/**
 * Verifies a Paddle Billing webhook: header `Paddle-Signature: ts=<unix>;h1=<hex>[;h1=<hex>]`,
 * where h1 = HMAC-SHA256(secret, `${ts}:${rawBody}`). Multiple h1 values appear during secret rotation.
 */
function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const parts = String(header).split(';').map((p) => p.split('='));
  const ts = parts.find(([k]) => k === 'ts')?.[1];
  const sigs = parts.filter(([k]) => k === 'h1').map(([, v]) => v);
  if (!ts || sigs.length === 0 || !/^\d+$/.test(ts)) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE_SECONDS) return false; // replay protection

  const expected = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  return sigs.some((s) => {
    const given = Buffer.from(s, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

// Paddle subscription status -> our subscription_status. Paused/canceled both lose paid access.
const STATUS_MAP = { active: 'active', trialing: 'active', past_due: 'past_due', paused: 'canceled', canceled: 'canceled' };

// POST /api/webhooks/paddle  (raw body; mounted before express.json)
exports.paddle = async (req, res) => {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return res.status(501).json({ error: 'Webhooks not configured' });

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifySignature(raw, req.headers['paddle-signature'], secret))
    return res.status(401).json({ error: 'Invalid signature' });

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Only subscription lifecycle events change entitlements; acknowledge the rest.
  if (!String(event.event_type).startsWith('subscription.') || !event.data?.id)
    return res.json({ received: true, ignored: true });

  const sub = event.data;
  const status = STATUS_MAP[sub.status];
  if (!status) return res.json({ received: true, ignored: true });

  const occurredAt = new Date(event.occurred_at || Date.now());
  const customOrg = sub.custom_data?.organization_id;
  const priceId = (sub.items || []).map((i) => i.price?.id).find((id) => planForPriceId(id));
  const purchasedPlan = planForPriceId(priceId);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency: Paddle retries; process each event id once.
    const seen = await client.query(
      'INSERT INTO paddle_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
      [String(event.event_id), String(event.event_type)]
    );
    if (seen.rows.length === 0) {
      await client.query('COMMIT');
      return res.json({ received: true, duplicate: true });
    }

    // Link to the workspace: first via custom_data set at checkout, then via an already-linked subscription.
    const found = await client.query(
      `SELECT id FROM organizations WHERE ($1::uuid IS NOT NULL AND id = $1::uuid) OR paddle_subscription_id = $2 LIMIT 1`,
      [isUuid(customOrg) ? customOrg : null, sub.id]
    );
    if (found.rows.length === 0) {
      console.warn(`Paddle ${event.event_type}: no workspace for subscription ${sub.id}`);
      await client.query('COMMIT');
      return res.json({ received: true, unmatched: true });
    }

    // Canceled/paused drops back to starter; otherwise take the purchased tier (keep current if price unknown).
    // paddle_updated_at guard: an older event must never overwrite newer state (webhooks can arrive out of order).
    const dropToStarter = status === 'canceled';
    await client.query(
      `UPDATE organizations SET
          plan_tier = CASE WHEN $1 THEN 'starter' ELSE COALESCE($2, plan_tier) END,
          subscription_status = $3,
          paddle_customer_id = COALESCE($4, paddle_customer_id),
          paddle_subscription_id = $5,
          paddle_updated_at = $6
        WHERE id = $7 AND (paddle_updated_at IS NULL OR paddle_updated_at < $6)`,
      [dropToStarter, purchasedPlan, status, sub.customer_id || null, sub.id, occurredAt, found.rows[0].id]
    );

    await client.query('COMMIT');
    res.json({ received: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Paddle webhook failed:', err);
    res.status(500).json({ error: 'Webhook processing failed' }); // non-2xx => Paddle retries
  } finally {
    client.release();
  }
};

module.exports.verifySignature = verifySignature;
