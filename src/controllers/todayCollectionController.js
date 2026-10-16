const todayCollectionModel = require('../models/todayCollectionModel');

// ============================================================
// GET TODAY COLLECTIONS
// ============================================================

async function getTodayCollections(req, res) {
  try {
    const data =
      await todayCollectionModel.getTodayCollections();

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(
      'Today collection error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching today collections',
    });
  }
}


// ============================================================
// GET TODAY COLLECTION SUMMARY
// ============================================================

async function getTodayCollectionSummary(req, res) {
  try {
    const data =
      await todayCollectionModel
        .getTodayCollectionSummary();

    return res.json({
      success: true,
      data,
    });
  } catch (err) {
    console.error(
      'Today collection summary error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching today collection summary',
    });
  }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getTodayCollections,
  getTodayCollectionSummary,
};