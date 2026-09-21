const express = require('express');

const router = express.Router();

const verifyToken = require('../middleware/auth');

const enrollmentController =
  require('../controllers/diwaliEnrollmentController');

// ============================================================
// ALL DIWALI ENROLLMENT APIs REQUIRE ADMIN LOGIN
// ============================================================

router.use(verifyToken);

// ============================================================
// COLLECTION DASHBOARD
//
// IMPORTANT:
// These routes must come BEFORE /:id
// ============================================================

router.get(
  '/collections/today-due',
  enrollmentController.todayDue
);

router.get(
  '/collections/overdue',
  enrollmentController.overdue
);

router.get(
  '/collections/today-summary',
  enrollmentController.todayCollectionSummary
);

// ============================================================
// ENROLLMENTS
// ============================================================

router.post(
  '/',
  enrollmentController.create
);

router.get(
  '/',
  enrollmentController.list
);

router.get(
  '/:id',
  enrollmentController.getOne
);

// ============================================================
// WEEK PAYMENT
// ============================================================

router.post(
  '/:id/weeks/:weekNumber/pay',
  enrollmentController.payWeek
);

// ============================================================
// BULK PAYMENT
// ============================================================

router.post(
  '/:id/bulk-pay',
  enrollmentController.bulkPay
);

// ============================================================
// PAYMENT HISTORY
// ============================================================

router.get(
  '/:id/payment-history',
  enrollmentController.paymentHistory
);

// ============================================================
// SINGLE PAYMENT REVERT
//
// Example:
// POST /api/diwali-enrollments/payments/125/revert
// ============================================================

router.post(
  '/payments/:transactionId/revert',
  enrollmentController.revertPayment
);

// ============================================================
// BULK PAYMENT REVERT
//
// Example:
// POST /api/diwali-enrollments/payment-groups/UUID/revert
// ============================================================

router.post(
  '/payment-groups/:paymentGroupId/revert',
  enrollmentController.revertBulkPayment
);

// ============================================================
// MODIFY CHITS
// ============================================================

router.patch(
  '/:id/modify-chits',
  enrollmentController.modifyChits
);

// ============================================================
// ADJUSTMENT LOGS
// ============================================================

router.get(
  '/:id/adjustment-logs',
  enrollmentController.getAdjustmentLogs
);

module.exports = router;