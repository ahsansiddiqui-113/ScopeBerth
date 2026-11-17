const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler: h } = require('../utils/helpers');
const authenticate = require('../middleware/authenticate');
const tenantContext = require('../middleware/tenantContext');
const { requireRole } = tenantContext;
const auth = require('../controllers/authController');
const org = require('../controllers/orgController');
const clients = require('../controllers/clientController');
const projects = require('../controllers/projectController');
const deliv = require('../controllers/deliverableController');
const proposals = require('../controllers/proposalController');
const invoices = require('../controllers/invoiceController');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

router.get('/health', (req, res) => res.json({ ok: true }));

// Auth (public)
router.post('/auth/signup', authLimiter, h(auth.signup));
router.post('/auth/login', authLimiter, h(auth.login));
router.post('/auth/magic-link', authLimiter, h(auth.requestMagicLink));
router.post('/auth/magic-link/verify', authLimiter, h(auth.verifyMagicLink));
router.get('/public/orgs/:slug', h(org.getPublicBranding));
router.get('/auth/me', authenticate, h(auth.me));

// Organizations
router.post('/orgs', authenticate, h(org.createOrg));
router.get('/orgs', authenticate, h(org.listMyOrgs));
router.get('/orgs/current', authenticate, tenantContext, h(org.getCurrentOrg));
router.patch('/orgs/current', authenticate, tenantContext, requireRole('owner'), h(org.updateCurrentOrg));

// Everything below is tenant-scoped: authenticated + member of x-organization-id.
const tenant = [authenticate, tenantContext];
const staff = requireRole('owner', 'staff');

// Clients (CRM + invites)
router.post('/clients', ...tenant, staff, h(clients.inviteClient));
router.get('/clients', ...tenant, staff, h(clients.listClients));
router.post('/clients/:userId/resend-invite', ...tenant, staff, h(clients.resendInvite));

// Projects & milestones (clients see only their own projects; enforced in loadProject/listProjects)
router.post('/projects', ...tenant, staff, h(projects.createProject));
router.get('/projects', ...tenant, h(projects.listProjects));
router.get('/projects/:id', ...tenant, h(projects.getProject));
router.patch('/projects/:id', ...tenant, staff, h(projects.updateProject));
router.post('/projects/:id/milestones', ...tenant, staff, h(projects.createMilestone));
router.patch('/milestones/:id', ...tenant, staff, h(projects.updateMilestone));

// Deliverables
router.post('/projects/:id/deliverables/upload-url', ...tenant, staff, h(deliv.createUploadUrl));
router.post('/projects/:id/deliverables', ...tenant, staff, h(deliv.createDeliverable));
router.get('/projects/:id/deliverables', ...tenant, h(deliv.listDeliverables));
router.get('/deliverables/:id/download', ...tenant, h(deliv.downloadDeliverable));
router.post('/deliverables/:id/approve', ...tenant, h(deliv.approveDeliverable));
router.post('/deliverables/:id/request-changes', ...tenant, h(deliv.requestChanges));

// Proposals (clients only ever see non-draft proposals addressed to them)
router.post('/proposals', ...tenant, staff, h(proposals.createProposal));
router.get('/proposals', ...tenant, h(proposals.listProposals));
router.get('/proposals/:id', ...tenant, h(proposals.getProposal));
router.patch('/proposals/:id', ...tenant, staff, h(proposals.updateProposal));
router.post('/proposals/:id/send', ...tenant, staff, h(proposals.sendProposal));
router.post('/proposals/:id/sign', ...tenant, h(proposals.signProposal));
router.post('/proposals/:id/decline', ...tenant, h(proposals.declineProposal));

// Invoices
router.get('/invoices', ...tenant, h(invoices.listInvoices));
router.get('/invoices/:id', ...tenant, h(invoices.getInvoice));
router.post('/invoices', ...tenant, staff, h(invoices.createInvoice));
router.post('/invoices/:id/mark-paid', ...tenant, staff, h(invoices.markPaid));

module.exports = router;
