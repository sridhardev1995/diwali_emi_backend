const express = require('express');

const router = express.Router();

const todayCollectionController =
  require('../controllers/todayCollectionController');

// ============================================================
// GET TODAY COLLECTIONS
// ============================================================
//
// GET /api/collections/today
//
// Returns:
// - Diwali today's payments
// - EMI today's payments
//
// ============================================================

router.get(
  '/today',
  todayCollectionController.getTodayCollections
);


// ============================================================
// GET TODAY COLLECTION SUMMARY
// ============================================================
//
// GET /api/collections/today-summary
//
// Returns:
// - Total collection
// - Cash
// - UPI
// - Transaction count
//
// ============================================================

router.get(
  '/today-summary',
  todayCollectionController.getTodayCollectionSummary
);


module.exports = router;