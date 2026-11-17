const pool = require('../config/db');
const storage = require('../config/storage');
const { loadProject } = require('./projectController');
const { isUuid, HttpError } = require('../utils/helpers');

const isStaff = (req) => req.tenant.role !== 'client';

// POST /api/projects/:id/deliverables/upload-url  { fileName, contentType, sizeBytes }  (owner/staff)
// Returns a short-lived presigned PUT URL; the browser uploads directly to S3/R2.
exports.createUploadUrl = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { fileName, contentType, sizeBytes } = req.body;
  if (typeof fileName !== 'string' || !fileName.trim()) throw new HttpError(400, 'fileName is required');
  if (typeof contentType !== 'string' || !contentType) throw new HttpError(400, 'contentType is required');
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > storage.MAX_UPLOAD_BYTES)
    throw new HttpError(400, `sizeBytes must be between 1 and ${storage.MAX_UPLOAD_BYTES}`);
  if (!storage.isConfigured()) throw new HttpError(501, 'File storage is not configured');

  const key = storage.buildKey(req.tenant.organizationId, project.id, fileName);
  const uploadUrl = await storage.presignUpload(key, contentType);
  res.json({ uploadUrl, fileKey: key });
};

// POST /api/projects/:id/deliverables  { title, fileKey, fileSizeBytes?, milestoneId? }  (owner/staff)
// Registers an uploaded file for client approval.
exports.createDeliverable = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const orgId = req.tenant.organizationId;
  const { title, fileKey, fileSizeBytes, milestoneId } = req.body;

  if (typeof title !== 'string' || !title.trim() || title.length > 255) throw new HttpError(400, 'Title is required');
  // The key must live under this org/project prefix, so a staff member can't attach another tenant's file.
  if (typeof fileKey !== 'string' || !fileKey.startsWith(`${orgId}/${project.id}/`) || fileKey.includes('..'))
    throw new HttpError(400, 'Invalid fileKey');
  if (fileSizeBytes !== undefined && (!Number.isInteger(fileSizeBytes) || fileSizeBytes < 0))
    throw new HttpError(400, 'Invalid fileSizeBytes');
  if (milestoneId !== undefined && milestoneId !== null && !isUuid(milestoneId))
    throw new HttpError(400, 'Invalid milestoneId');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (milestoneId) {
      const m = await client.query(
        `UPDATE milestones SET status = 'awaiting_approval'
          WHERE id = $1 AND project_id = $2 AND organization_id = $3 AND status <> 'approved'
          RETURNING id`,
        [milestoneId, project.id, orgId]
      );
      if (m.rows.length === 0) throw new HttpError(400, 'Milestone not found or already approved');
    }
    const { rows } = await client.query(
      `INSERT INTO deliverables (organization_id, project_id, milestone_id, title, file_url, file_size_bytes, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [orgId, project.id, milestoneId || null, title.trim(), fileKey, fileSizeBytes ?? null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ deliverable: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// GET /api/projects/:id/deliverables
exports.listDeliverables = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { rows } = await pool.query(
    `SELECT id, milestone_id AS "milestoneId", title, file_size_bytes AS "fileSizeBytes", status,
            client_feedback AS "clientFeedback", approved_at AS "approvedAt", created_at AS "createdAt"
       FROM deliverables WHERE project_id = $1 AND organization_id = $2 ORDER BY created_at DESC`,
    [project.id, req.tenant.organizationId]
  );
  res.json({ deliverables: rows });
};

// Loads a deliverable and verifies the caller may see its project.
async function loadDeliverable(req, id) {
  if (!isUuid(id)) throw new HttpError(404, 'Deliverable not found');
  const { rows } = await pool.query(
    'SELECT * FROM deliverables WHERE id = $1 AND organization_id = $2',
    [id, req.tenant.organizationId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Deliverable not found');
  await loadProject(req, rows[0].project_id); // enforces client ownership
  return rows[0];
}

// GET /api/deliverables/:id/download  — short-lived presigned GET URL
exports.downloadDeliverable = async (req, res) => {
  const d = await loadDeliverable(req, req.params.id);
  if (!storage.isConfigured()) throw new HttpError(501, 'File storage is not configured');
  res.json({ url: await storage.presignDownload(d.file_url) });
};

// POST /api/deliverables/:id/approve   (client who owns the project)
// Atomically approves the deliverable and locks its milestone.
exports.approveDeliverable = async (req, res) => {
  if (isStaff(req)) throw new HttpError(403, 'Only the client can approve deliverables');
  const d = await loadDeliverable(req, req.params.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE deliverables SET status = 'approved', approved_at = NOW(), client_feedback = NULL
        WHERE id = $1 AND organization_id = $2 AND status = 'pending_approval' RETURNING *`,
      [d.id, req.tenant.organizationId]
    );
    if (rows.length === 0) throw new HttpError(409, 'This deliverable is no longer awaiting approval');
    if (d.milestone_id) {
      await client.query(
        `UPDATE milestones SET status = 'approved', approved_at = NOW() WHERE id = $1 AND organization_id = $2`,
        [d.milestone_id, req.tenant.organizationId]
      );
    }
    await client.query('COMMIT');
    res.json({ deliverable: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

// POST /api/deliverables/:id/request-changes  { feedback }   (client who owns the project)
exports.requestChanges = async (req, res) => {
  if (isStaff(req)) throw new HttpError(403, 'Only the client can request changes');
  const { feedback } = req.body;
  if (typeof feedback !== 'string' || !feedback.trim() || feedback.length > 5000)
    throw new HttpError(400, 'Feedback is required (max 5000 characters)');
  const d = await loadDeliverable(req, req.params.id);

  const { rows } = await pool.query(
    `UPDATE deliverables SET status = 'changes_requested', client_feedback = $1
      WHERE id = $2 AND organization_id = $3 AND status = 'pending_approval' RETURNING *`,
    [feedback.trim(), d.id, req.tenant.organizationId]
  );
  if (rows.length === 0) throw new HttpError(409, 'This deliverable is no longer awaiting approval');
  res.json({ deliverable: rows[0] });
};
