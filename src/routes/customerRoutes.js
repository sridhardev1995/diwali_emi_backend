const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const verifyToken = require('../middleware/auth');

// All customer routes require a logged-in admin
router.use(verifyToken);

router.get('/', customerController.list);
router.get('/:id', customerController.getOne);
router.post('/', customerController.create);
router.put('/:id', customerController.update);
router.patch('/:id/status', customerController.changeStatus);
router.delete('/:id', customerController.remove);

module.exports = router;