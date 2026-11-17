const pool = require('../config/db');
const { isUuid, HttpError } = require('../utils/helpers');

const PROJECT_STATUSES = ['active', 'in_review', 'completed', 'archived'];
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isStaff = (req) => req.tenant.role !== 'client';

/**
 * Loads a project scoped to the caller's tenant. Clients only see projects assigned to them;
 * anything else is reported as 404 so existence isn't leaked.
 */
async function loadProject(req, projectId) {
  if (!isUuid(projectId)) throw new HttpError(404, 'Project not found');
  const { rows } = await pool.query(
    `SELECT * FROM projects WHERE id = $1 AND organization_id = $2`,
    [projectId, req.tenant.organizationId]
  );
  const p = rows[0];
  if (!p || (!isStaff(req) && p.client_user_id !== req.user.id)) throw new HttpError(404, 'Project not found');
  return p;
}

// POST /api/projects  { clientUserId, title, description?, dueDate? }  (owner/staff)
exports.createProject = async (req, res) => {
  const { clientUserId, title, description, dueDate } = req.body;
  if (!isUuid(clientUserId)) throw new HttpError(400, 'clientUserId is required');
  if (typeof title !== 'string' || !title.trim() || title.length > 255) throw new HttpError(400, 'Title is required');
  if (dueDate !== undefined && dueDate !== null && !isDate(dueDate)) throw new HttpError(400, 'dueDate must be YYYY-MM-DD');

  const orgId = req.tenant.organizationId;
  const c = await pool.query(
    `SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND role = 'client'`,
    [orgId, clientUserId]
  );
  if (c.rows.length === 0) throw new HttpError(400, 'That user is not a client of this workspace');

  // TODO(phase 4): enforce starter plan limit (max 2 projects) via requirePlan.
  const { rows } = await pool.query(
    `INSERT INTO projects (organization_id, client_user_id, title, description, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [orgId, clientUserId, title.trim(), description || null, dueDate || null]
  );
  res.status(201).json({ project: rows[0] });
};

// GET /api/projects  — staff: all in org; client: only their own
exports.listProjects = async (req, res) => {
  const params = [req.tenant.organizationId];
  let where = 'p.organization_id = $1';
  if (!isStaff(req)) {
    params.push(req.user.id);
    where += ' AND p.client_user_id = $2';
  }
  const { rows } = await pool.query(
    `SELECT p.id, p.title, p.status, p.due_date AS "dueDate", p.client_user_id AS "clientUserId",
            u.full_name AS "clientName",
            (SELECT COUNT(*)::int FROM milestones m WHERE m.project_id = p.id) AS "milestoneCount",
            (SELECT COUNT(*)::int FROM milestones m WHERE m.project_id = p.id AND m.status = 'approved') AS "approvedCount",
            (SELECT COUNT(*)::int FROM deliverables d WHERE d.project_id = p.id AND d.status = 'pending_approval') AS "pendingApprovals"
       FROM projects p JOIN users u ON u.id = p.client_user_id
      WHERE ${where}
      ORDER BY p.created_at DESC`,
    params
  );
  res.json({ projects: rows });
};

// GET /api/projects/:id  — project with milestones
exports.getProject = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const ms = await pool.query(
    `SELECT id, title, description, position, status, due_date AS "dueDate", approved_at AS "approvedAt"
       FROM milestones WHERE project_id = $1 AND organization_id = $2 ORDER BY position, created_at`,
    [project.id, req.tenant.organizationId]
  );
  res.json({ project, milestones: ms.rows });
};

// PATCH /api/projects/:id  { title?, description?, status?, dueDate? }  (owner/staff)
exports.updateProject = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { title, description, status, dueDate } = req.body;
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 255))
    throw new HttpError(400, 'Invalid title');
  if (status !== undefined && !PROJECT_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  if (dueDate !== undefined && dueDate !== null && !isDate(dueDate)) throw new HttpError(400, 'dueDate must be YYYY-MM-DD');

  const { rows } = await pool.query(
    `UPDATE projects SET
        title = COALESCE($1, title),
        description = CASE WHEN $2::boolean THEN $3 ELSE description END,
        status = COALESCE($4, status),
        due_date = CASE WHEN $5::boolean THEN $6::date ELSE due_date END
      WHERE id = $7 AND organization_id = $8 RETURNING *`,
    [title?.trim() ?? null, description !== undefined, description ?? null, status ?? null,
     dueDate !== undefined, dueDate ?? null, project.id, req.tenant.organizationId]
  );
  res.json({ project: rows[0] });
};

// POST /api/projects/:id/milestones  { title, description?, dueDate? }  (owner/staff)
exports.createMilestone = async (req, res) => {
  const project = await loadProject(req, req.params.id);
  const { title, description, dueDate } = req.body;
  if (typeof title !== 'string' || !title.trim() || title.length > 255) throw new HttpError(400, 'Title is required');
  if (dueDate !== undefined && dueDate !== null && !isDate(dueDate)) throw new HttpError(400, 'dueDate must be YYYY-MM-DD');

  const { rows } = await pool.query(
    `INSERT INTO milestones (organization_id, project_id, title, description, due_date, position)
     VALUES ($1, $2, $3, $4, $5,
             COALESCE((SELECT MAX(position) + 1 FROM milestones WHERE project_id = $2), 0))
     RETURNING *`,
    [req.tenant.organizationId, project.id, title.trim(), description || null, dueDate || null]
  );
  res.status(201).json({ milestone: rows[0] });
};

// PATCH /api/milestones/:id  { title?, description?, dueDate?, position? }  (owner/staff)
// Approved milestones are locked.
exports.updateMilestone = async (req, res) => {
  if (!isUuid(req.params.id)) throw new HttpError(404, 'Milestone not found');
  const { title, description, dueDate, position } = req.body;
  if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 255))
    throw new HttpError(400, 'Invalid title');
  if (dueDate !== undefined && dueDate !== null && !isDate(dueDate)) throw new HttpError(400, 'dueDate must be YYYY-MM-DD');
  if (position !== undefined && !Number.isInteger(position)) throw new HttpError(400, 'position must be an integer');

  const { rows } = await pool.query(
    `UPDATE milestones SET
        title = COALESCE($1, title),
        description = CASE WHEN $2::boolean THEN $3 ELSE description END,
        due_date = CASE WHEN $4::boolean THEN $5::date ELSE due_date END,
        position = COALESCE($6, position)
      WHERE id = $7 AND organization_id = $8 AND status <> 'approved'
      RETURNING *`,
    [title?.trim() ?? null, description !== undefined, description ?? null,
     dueDate !== undefined, dueDate ?? null, position ?? null, req.params.id, req.tenant.organizationId]
  );
  if (rows.length === 0) throw new HttpError(404, 'Milestone not found or already approved (locked)');
  res.json({ milestone: rows[0] });
};

module.exports.loadProject = loadProject;
