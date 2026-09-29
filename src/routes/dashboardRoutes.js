const express = require('express');

const router = express.Router();

const dashboardController =
  require('../controllers/dashboardController');

router.get(
  '/summary',
  dashboardController.summary
);

module.exports = router;