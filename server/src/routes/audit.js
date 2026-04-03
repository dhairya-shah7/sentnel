const router = require('express').Router();
const ctrl = require('../controllers/auditController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/logs', verifyToken, requireRole('admin'), ctrl.getLogs);
router.get('/logs/export', verifyToken, requireRole('admin'), ctrl.exportLogs);

module.exports = router;
