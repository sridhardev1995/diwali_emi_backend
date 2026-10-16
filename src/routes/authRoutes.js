const express = require('express');
const router = express.Router();

const authController =
  require('../controllers/authController');

const verifyToken =
  require('../middleware/auth');

// ============================================================
// LOGIN
// ============================================================

router.post(
  '/login',
  authController.login
);

// ============================================================
// CHANGE PASSWORD
// Current password required
// JWT required
// ============================================================

router.post(
  '/change-password',
  verifyToken,
  authController.changePassword
);

// ============================================================
// RESET PASSWORD
// Recovery PIN required
// JWT NOT required
// Used when admin forgot current password
// ============================================================

router.post(
  '/reset-password',
  authController.resetPassword
);

// ============================================================
// PROFILE
// JWT required
// ============================================================

router.get(
  '/profile',
  verifyToken,
  authController.profile
);

module.exports = router;