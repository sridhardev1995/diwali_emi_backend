const express = require('express');

const router = express.Router();

const controller =
  require('../controllers/emiPaymentReportController');

// ============================================================
// EMI PAYMENT REPORT
// ============================================================

router.get(
  '/emi-payments',
  controller.getPaymentReport
);

module.exports = router;