const router = require('express').Router();
const ctrl = require('../controllers/datasetController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const audit = require('../middleware/audit');

router.post(
  '/upload',
  verifyToken,
  requireRole('admin', 'analyst'),
  upload.single('file'),
  handleUploadError,
  audit('dataset.upload'),
  ctrl.upload
);

router.post('/sync-local', ctrl.syncLocal);

router.get('/',     verifyToken, ctrl.list);
router.get('/:id',  verifyToken, ctrl.getById);
router.delete('/:id', verifyToken, requireRole('admin', 'analyst'), audit('dataset.delete'), ctrl.deleteById);

module.exports = router;
