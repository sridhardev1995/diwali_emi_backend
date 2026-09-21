const express = require('express');
const router = express.Router();

const schemeController = require('../controllers/emiSchemeController');
const enrollmentController = require('../controllers/emiEntrollmentController');
const installmentController = require('../controllers/emiInstallmentController');

// ---- EMI Schemes ----
router.get('/schemes', schemeController.list);
router.get('/schemes/:id', schemeController.getOne);
router.post('/schemes', schemeController.create);
router.put('/schemes/:id', schemeController.update);
router.patch('/schemes/:id/status', schemeController.changeStatus);
router.delete('/schemes/:id', schemeController.remove);

// ---- Enrollments (customer -> scheme) ----
router.get('/enrollments', enrollmentController.list);
router.get('/enrollments/:id', enrollmentController.getOne);
router.post('/enrollments', enrollmentController.create);
router.patch('/enrollments/:id/status', enrollmentController.changeStatus);

// ---- Weekly EMI collection ----
router.get('/enrollments/:enrollmentId/emis', installmentController.listForEnrollment);
router.patch('/emis/:id/collect', installmentController.collect);

module.exports = router;