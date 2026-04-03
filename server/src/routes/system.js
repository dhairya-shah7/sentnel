const router = require('express').Router();
const ctrl = require('../controllers/systemController');
const { verifyToken } = require('../middleware/auth');

router.get('/deployment', verifyToken, ctrl.getDeploymentInfo);

module.exports = router;
