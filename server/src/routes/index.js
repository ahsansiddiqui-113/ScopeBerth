const express = require('express');
const rateLimit = require('express-rate-limit');
const { asyncHandler: h } = require('../utils/helpers');
const authenticate = require('../middleware/authenticate');
const tenantContext = require('../middleware/tenantContext');
const { requireRole } = tenantContext;
const auth = require('../controllers/authController');
const org = require('../controllers/orgController');

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
router.get('/auth/me', authenticate, h(auth.me));

// Organizations
router.post('/orgs', authenticate, h(org.createOrg));
router.get('/orgs', authenticate, h(org.listMyOrgs));
router.get('/orgs/current', authenticate, tenantContext, h(org.getCurrentOrg));
router.patch('/orgs/current', authenticate, tenantContext, requireRole('owner'), h(org.updateCurrentOrg));

module.exports = router;
