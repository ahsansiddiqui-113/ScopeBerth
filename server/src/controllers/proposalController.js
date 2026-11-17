const pool = require('../config/db');
const { isUuid, HttpError } = require('../utils/helpers');
const { parseLineItems, centsToAmount, CURRENCIES } = require('../utils/money');
const { nextInvoiceNumber, lockOrgInvoices } = require('./invoiceController');

const isStaff = (req) => req.tenant.role !== 'client';

const COLUMNS = `p.id, p.title, p.scope, p.timeline, p.line_items AS "lineItems",
  p.total_amount AS "totalAmount", p.currency, p.deposit_percent AS "depositPercent", p.status,
  p.client_user_id AS "clientUserId", u.full_name AS "clientName",
  p.signed_by_name AS "signedByName", p.signed_at AS "signedAt", p.sent_at AS "sentAt",
  p.declined_at AS "declinedAt", p.created_at AS "createdAt"`;
const FROM = 'FROM proposals p JOIN users u ON u.id = p.client_user_id';

/** Loads a proposal in the caller's tenant. Clients only see their own, and never drafts. */
async function loadProposal(req, id) {
  if (!isUuid(id)) throw new HttpError(404, 'Proposal not found');
  const params = [id, req.tenant.organizationId];
  let where = 'p.id = $1 AND p.organization_id = $2';
  if (!isStaff(req)) {
    params.push(req.user.id);
    where += ` AND p.client_user_id = $3 AND p.status <> 'draft'`;
  }
  const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE ${where}`, params);
  if (rows.length === 0) throw new HttpError(404, 'Proposal not found');
  return rows[0];
}

function validateCommon(body, { partial }) {
  const out = {};
  const { title, scope, timeline, currency, depositPercent } = body;
  if (!partial || title !== undefined) {
    if (typeof title !== 'string' || !title.trim() || title.length > 255) throw new HttpError(400, 'Title is required');
    out.title = title.trim();
  }
  for (const [k, v] of [['scope', scope], ['timeline', timeline]]) {
    if (v !== undefined && v !== null) {
      if (typeof v !== 'string' || v.length > 10000) throw new HttpError(400, `Invalid ${k}`);
      out[k] = v;
    }
  }
  if (currency !== undefined) {
    if (!CURRENCIES.includes(currency)) throw new HttpError(400, 'Unsupported currency');
    out.currency = currency;
  }
  if (depositPercent !== undefined) {
    if (!Number.isInteger(depositPercent) || depositPercent < 1 || depositPercent > 100)
      throw new HttpError(400, 'depositPercent must be an integer from 1 to 100');
    out.depositPercent = depositPercent;
  }
  return out;
}

// POST /api/proposals  { clientUserId, title, lineItems, scope?, timeline?, currency?, depositPercent?, send? }  (owner/staff)
exports.createProposal = async (req, res) => {
  const { clientUserId, lineItems, send } = req.body;
  const orgId = req.tenant.organizationId;
  if (!isUuid(clientUserId)) throw new HttpError(400, 'clientUserId is required');
  const fields = validateCommon(req.body, { partial: false });
  const { items, totalCents } = parseLineItems(lineItems);

  const member = await pool.query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'client'`,
    [orgId, clientUserId]
  );
  if (member.rows.length === 0) throw new HttpError(400, 'That user is not a client of this workspace');

  const { rows } = await pool.query(
    `INSERT INTO proposals (organization_id, client_user_id, title, scope, timeline, line_items, total_amount,
                            currency, deposit_percent, status, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::varchar, CASE WHEN $10::varchar = 'sent' THEN NOW() END)
     RETURNING id`,
    [orgId, clientUserId, fields.title, fields.scope ?? null, fields.timeline ?? null, JSON.stringify(items),
     centsToAmount(totalCents), fields.currency ?? 'USD', fields.depositPercent ?? 50, send ? 'sent' : 'draft']
  );
  res.status(201).json({ proposal: await loadProposal(req, rows[0].id) });
};

// GET /api/proposals
exports.listProposals = async (req, res) => {
  const params = [req.tenant.organizationId];
  let where = 'p.organization_id = $1';
  if (!isStaff(req)) {
    params.push(req.user.id);
    where += ` AND p.client_user_id = $2 AND p.status <> 'draft'`;
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY p.created_at DESC`,
    params
  );
  res.json({ proposals: rows });
};

// GET /api/proposals/:id
exports.getProposal = async (req, res) => {
  res.json({ proposal: await loadProposal(req, req.params.id) });
};

// PATCH /api/proposals/:id  (owner/staff) — drafts only; sent proposals are immutable so what the client signs can't change
exports.updateProposal = async (req, res) => {
  const existing = await loadProposal(req, req.params.id);
  if (existing.status !== 'draft') throw new HttpError(409, 'Only draft proposals can be edited');

  const f = validateCommon(req.body, { partial: true });
  let itemsJson = null;
  let total = null;
  if (req.body.lineItems !== undefined) {
    const { items, totalCents } = parseLineItems(req.body.lineItems);
    itemsJson = JSON.stringify(items);
    total = centsToAmount(totalCents);
  }
  const { rowCount } = await pool.query(
    `UPDATE proposals SET
        title = COALESCE($1, title),
        scope = CASE WHEN $2::boolean THEN $3 ELSE scope END,
        timeline = CASE WHEN $4::boolean THEN $5 ELSE timeline END,
        currency = COALESCE($6, currency),
        deposit_percent = COALESCE($7, deposit_percent),
        line_items = COALESCE($8::jsonb, line_items),
        total_amount = COALESCE($9::numeric, total_amount)
      WHERE id = $10 AND organization_id = $11 AND status = 'draft'`,
    [f.title ?? null, 'scope' in f, f.scope ?? null, 'timeline' in f, f.timeline ?? null, f.currency ?? null,
     f.depositPercent ?? null, itemsJson, total, existing.id, req.tenant.organizationId]
  );
  if (rowCount === 0) throw new HttpError(409, 'Only draft proposals can be edited');
  res.json({ proposal: await loadProposal(req, existing.id) });
};

// POST /api/proposals/:id/send  (owner/staff)
exports.sendProposal = async (req, res) => {
  const p = await loadProposal(req, req.params.id);
  const { rowCount } = await pool.query(
    `UPDATE proposals SET status = 'sent', sent_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'draft'`,
    [p.id, req.tenant.organizationId]
  );
  if (rowCount === 0) throw new HttpError(409, 'Proposal has already been sent');
  // TODO: email the client once a mail provider is wired up.
  res.json({ proposal: await loadProposal(req, p.id) });
};

// POST /api/proposals/:id/decline   (the client it was sent to)
exports.declineProposal = async (req, res) => {
  if (isStaff(req)) throw new HttpError(403, 'Only the client can decline a proposal');
  const p = await loadProposal(req, req.params.id);
  const { rowCount } = await pool.query(
    `UPDATE proposals SET status = 'declined', declined_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status = 'sent'`,
    [p.id, req.tenant.organizationId]
  );
  if (rowCount === 0) throw new HttpError(409, 'This proposal is no longer open');
  res.json({ proposal: await loadProposal(req, p.id) });
};

// POST /api/proposals/:id/sign  { signedName }   (the client it was sent to)
// The "magic moment": in ONE transaction, record the signature (name, IP, timestamp), create the active
// project with a milestone per line item, and issue the deposit invoice. Any failure rolls everything back.
exports.signProposal = async (req, res) => {
  if (isStaff(req)) throw new HttpError(403, 'Only the client can sign a proposal');
  const signedName = typeof req.body.signedName === 'string' ? req.body.signedName.trim() : '';
  if (!signedName || signedName.length > 255) throw new HttpError(400, 'Type your full name to sign');

  const orgId = req.tenant.organizationId;
  await loadProposal(req, req.params.id); // 404 unless it's this client's, non-draft proposal

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Conditional UPDATE is the lock: only one concurrent signer can move sent -> signed.
    const propRes = await client.query(
      `UPDATE proposals
          SET status = 'signed', signed_by_name = $1, signed_ip = $2, signed_at = NOW()
        WHERE id = $3 AND organization_id = $4 AND client_user_id = $5 AND status = 'sent'
        RETURNING *`,
      [signedName, req.ip, req.params.id, orgId, req.user.id]
    );
    if (propRes.rows.length === 0) throw new HttpError(409, 'This proposal is no longer open for signing');
    const proposal = propRes.rows[0];

    const projRes = await client.query(
      `INSERT INTO projects (organization_id, client_user_id, proposal_id, title, description, status)
       VALUES ($1, $2, $3, $4, $5, 'active') RETURNING id`,
      [orgId, proposal.client_user_id, proposal.id, proposal.title, proposal.scope]
    );
    const projectId = projRes.rows[0].id;

    const items = proposal.line_items;
    for (let i = 0; i < items.length; i++) {
      await client.query(
        `INSERT INTO milestones (organization_id, project_id, title, position) VALUES ($1, $2, $3, $4)`,
        [orgId, projectId, items[i].name, i]
      );
    }

    // Deposit invoice = deposit_percent of the total, computed in integer cents.
    const totalCents = Math.round(Number(proposal.total_amount) * 100);
    const depositCents = Math.round((totalCents * proposal.deposit_percent) / 100);
    await lockOrgInvoices(client, orgId);
    const number = await nextInvoiceNumber(client, orgId);
    const invRes = await client.query(
      `INSERT INTO invoices (organization_id, project_id, client_user_id, invoice_number, amount, currency,
                             due_date, description)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE + INTERVAL '7 days', $7) RETURNING id`,
      [orgId, projectId, proposal.client_user_id, number, centsToAmount(depositCents), proposal.currency,
       `${proposal.deposit_percent}% deposit — ${proposal.title}`]
    );

    await client.query('COMMIT');
    res.status(200).json({
      proposal: await loadProposal(req, proposal.id),
      projectId,
      invoiceId: invRes.rows[0].id,
      invoiceNumber: number,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err instanceof HttpError) throw err;
    console.error('Sign proposal transaction failed:', err);
    throw new HttpError(500, 'Failed to process proposal signature');
  } finally {
    client.release();
  }
};
