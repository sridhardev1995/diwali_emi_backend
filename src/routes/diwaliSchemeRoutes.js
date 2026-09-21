const express = require('express');
const router = express.Router();
const controller = require('../controllers/diwaliSchemeController');
const verifyToken = require('../middleware/auth');

router.use(verifyToken);

router.get('/', controller.list);
router.get('/:id', controller.getOne);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.patch('/:id/status', controller.changeStatus);

module.exports = router;