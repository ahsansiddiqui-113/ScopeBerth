const pool = require('../config/db');
const { isUuid, HttpError } = require('../utils/helpers');
const { CURRENCIES } = require('../utils/money');

const isStaff = (req) => req.tenant.role !== 'client';
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Next sequential invoice number for an org (INV-0001, INV-0002, ...).
 * MUST be called inside a transaction that holds lockOrgInvoices() — otherwise two concurrent
 * inserts could compute the same number (the UNIQUE constraint would then fail one of them).
 */
async function nextInvoiceNumber(client, orgId) {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM '[0-9]+$')::int), 0) + 1 AS n
       FROM invoices WHERE organization_id = $1`,
    [orgId]
  );
  return `INV-${String(rows[0].n).padStart(4, '0')}`;
}
const lockOrgInvoices = (client, orgId) =>
  client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoices:${orgId}`]);

// Flip unpaid invoices past their due date to 'overdue'. Safe to run repeatedly.
async function sweepOverdue() {
  const { rowCount } = await pool.query(
    `UPDATE invoices SET status = 'overdue' WHERE status = 'unpaid' AND due_date < CURRENT_DATE`
  );
  return rowCount;
}

const COLUMNS = `i.id, i.invoice_number AS "invoiceNumber", i.project_id AS "projectId",
  p.title AS "projectTitle", i.client_user_id AS "clientUserId", u.full_name AS "clientName",
  i.amount, i.currency, i.status, i.due_date AS "dueDate", i.description, i.payment_url AS "paymentUrl",
  i.paid_at AS "paidAt", i.created_at AS "createdAt"`;
const FROM = `FROM invoices i JOIN users u ON u.id = i.client_user_id LEFT JOIN projects p ON p.id = i.project_id`;

// GET /api/invoices?status=  — staff: all in org; client: only their own
exports.listInvoices = async (req, res) => {
  const params = [req.tenant.organizationId];
  let where = 'i.organization_id = $1';
  if (!isStaff(req)) {
    params.push(req.user.id);
    where += ` AND i.client_user_id = $${params.length}`;
  }
  if (req.query.status) {
    if (!['unpaid', 'paid', 'overdue'].includes(req.query.status)) throw new HttpError(400, 'Invalid status');
    params.push(req.query.status);
    where += ` AND i.status = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} ${FROM} WHERE ${where} ORDER BY i.created_at DESC`,
    params
  );
  res.json({ invoices: rows });
};

// GET /api/invoices/:id
exports.getInvoice = async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Invoice not found');
  const params = [req.params.id, req.tenant.organizationId];
  let where = 'i.id = $1 AND i.organization_id = $2';
  if (!isStaff(req)) {
    params.push(req.user.id);
    where += ' AND i.client_user_id = $3';
  }
  const { rows } = await pool.query(`SELECT ${COLUMNS} ${FROM} WHERE ${where}`, params);
  if (rows.length === 0) throw new HttpError(404, 'Invoice not found');
  res.json({ invoice: rows[0] });
};

// POST /api/invoices  { clientUserId, projectId?, amount, currency?, dueDate, description?, paymentUrl? }  (owner/staff)
// For milestone and retainer billing after the initial deposit invoice.
exports.createInvoice = async (req, res) => {
  const { clientUserId, projectId, amount, currency = 'USD', dueDate, description, paymentUrl } = req.body;
  const orgId = req.tenant.organizationId;

  if (!isUuid(clientUserId)) throw new HttpError(400, 'clientUserId is required');
  if (projectId !== undefined && projectId !== null && !isUuid(projectId)) throw new HttpError(400, 'Invalid projectId');
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1e12) throw new HttpError(400, 'amount must be greater than zero');
  if (!CURRENCIES.includes(currency)) throw new HttpError(400, 'Unsupported currency');
  if (!isDate(dueDate)) throw new HttpError(400, 'dueDate must be YYYY-MM-DD');
  if (description !== undefined && (typeof description !== 'string' || description.length > 2000))
    throw new HttpError(400, 'Invalid description');
  if (paymentUrl !== undefined && paymentUrl !== null && !/^https:\/\//.test(paymentUrl))
    throw new HttpError(400, 'paymentUrl must be an https URL');

  const member = await pool.query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'client'`,
    [orgId, clientUserId]
  );
  if (member.rows.length === 0) throw new HttpError(400, 'That user is not a client of this workspace');
  if (projectId) {
    const p = await pool.query(
      'SELECT 1 FROM projects WHERE id = $1 AND organization_id = $2 AND client_user_id = $3',
      [projectId, orgId, clientUserId]
    );
    if (p.rows.length === 0) throw new HttpError(400, "Project not found for that client");
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await lockOrgInvoices(client, orgId);
    const number = await nextInvoiceNumber(client, orgId);
    const { rows } = await client.query(
      `INSERT INTO invoices (organization_id, project_id, client_user_id, invoice_number, amount, currency,
                             due_date, description, payment_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [orgId, projectId || null, clientUserId, number, (cents / 100).toFixed(2), currency, dueDate,
       description || null, paymentUrl || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ invoiceId: rows[0].id, invoiceNumber: number });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/invoices/:id/mark-paid  (owner/staff) — manual reconciliation of an offline/external payment
exports.markPaid = async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Invoice not found');
  const { rows } = await pool.query(
    `UPDATE invoices SET status = 'paid', paid_at = NOW()
      WHERE id = $1 AND organization_id = $2 AND status <> 'paid' RETURNING id, status, paid_at AS "paidAt"`,
    [req.params.id, req.tenant.organizationId]
  );
  if (rows.length === 0) throw new HttpError(409, 'Invoice not found or already paid');
  res.json({ invoice: rows[0] });
};

module.exports.nextInvoiceNumber = nextInvoiceNumber;
module.exports.lockOrgInvoices = lockOrgInvoices;
module.exports.sweepOverdue = sweepOverdue;
