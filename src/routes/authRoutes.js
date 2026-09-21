const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/change-password', verifyToken, authController.changePassword);
router.get('/profile', verifyToken, authController.profile);

module.exports = router;
