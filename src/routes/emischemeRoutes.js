const express = require('express');

const router = express.Router();

const schemeController =
  require('../controllers/emiSchemeController');

const enrollmentController =
  require('../controllers/emiEntrollmentController');

const installmentController =
  require('../controllers/emiInstallmentController');


// ============================================================
// EMI SCHEMES
// ============================================================

router.get(
  '/schemes',
  schemeController.list
);

router.get(
  '/schemes/:id',
  schemeController.getOne
);

router.post(
  '/schemes',
  schemeController.create
);

router.put(
  '/schemes/:id',
  schemeController.update
);

router.patch(
  '/schemes/:id/status',
  schemeController.changeStatus
);

router.delete(
  '/schemes/:id',
  schemeController.remove
);


// ============================================================
// ENROLLMENTS
// Customer -> EMI Scheme
// ============================================================

router.get(
  '/enrollments',
  enrollmentController.list
);

router.get(
  '/enrollments/:id',
  enrollmentController.getOne
);

router.post(
  '/enrollments',
  enrollmentController.create
);

router.patch(
  '/enrollments/:id/status',
  enrollmentController.changeStatus
);


// ============================================================
// EMI COLLECTIONS
// ============================================================

// ------------------------------------------------------------
// TODAY DUE
//
// GET /api/enrollments/collections/today-due
//
// Returns:
// - Customer
// - Mobile
// - Week
// - Due date
// - EMI amount
// - Paid amount
// - Balance
// - Status
// ------------------------------------------------------------

router.get(
  '/enrollments/collections/today-due',
  installmentController.todayDue
);


// ------------------------------------------------------------
// OVERDUE
//
// GET /api/enrollments/collections/overdue
//
// Returns:
// - Customer
// - Mobile
// - Week
// - Due date
// - EMI amount
// - Paid amount
// - Balance
// - Status
// - Overdue days
// ------------------------------------------------------------

router.get(
  '/enrollments/collections/overdue',
  installmentController.overdue
);


// ============================================================
// WEEKLY EMI COLLECTION
// ============================================================

// Get complete EMI schedule for an enrollment

router.get(
  '/enrollments/:enrollmentId/emis',
  installmentController.listForEnrollment
);


// ============================================================
// COLLECT EMI PAYMENT
// ============================================================

router.patch(
  '/emis/:id/collect',
  installmentController.collect
);


// ============================================================
// EMI PAYMENT HISTORY
// ============================================================

router.get(
  '/emis/:id/payments',
  installmentController.paymentHistory
);


// ============================================================
// REVERSE EMI PAYMENT
// ============================================================

router.post(
  '/emis/:id/reverse-payment',
  installmentController.reversePayment
);


// ============================================================
// EXPORT
// ============================================================

module.exports = router;