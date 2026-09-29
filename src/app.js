require('dotenv').config();

const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const diwaliSchemeRoutes = require('./routes/diwaliSchemeRoutes');
const diwaliEnrollmentRoutes = require('./routes/diwaliEnrollmentRoutes');
const emiRoutes = require('./routes/emischemeRoutes');
const emiPaymentReportRoutes =
  require('./routes/emiPaymentReportRoutes');
const dashboardRoutes =
  require('./routes/dashboardRoutes');
const verifyToken = require('./middleware/auth');

const app = express();


// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

app.use(cors());

app.use(express.json());


// ============================================================
// HEALTH CHECK
// PUBLIC
// ============================================================

app.get('/api/health', (req, res) => {
  return res.json({
    success: true,
    message: 'Diwali & EMI Scheme API is running',
  });
});


// ============================================================
// AUTH
// PUBLIC ENTRY
// ============================================================
//
// Login route must remain public.
// authRoutes.js should protect profile/change-password
// individually if those routes require authentication.
//

app.use(
  '/api/auth',
  authRoutes
);


// ============================================================
// CUSTOMER
// PROTECTED
// ============================================================

app.use(
  '/api/customers',
  verifyToken,
  customerRoutes
);


// ============================================================
// DIWALI SCHEME
// PROTECTED
// ============================================================

app.use(
  '/api/diwali-schemes',
  verifyToken,
  diwaliSchemeRoutes
);


// ============================================================
// DIWALI ENROLLMENT
// PROTECTED
// ============================================================

app.use(
  '/api/diwali-enrollments',
  verifyToken,
  diwaliEnrollmentRoutes
);


// ============================================================
// EMI
// PROTECTED
// ============================================================
//
// /api/schemes
// /api/enrollments
// /api/enrollments/:id/emis
// /api/emis/:id/collect
// /api/emis/:id/payments
// /api/emis/:id/reverse-payment
//

app.use(
  '/api',
  verifyToken,
  emiRoutes
);

// ============================================================
// DASHBOARD
// PROTECTED
// ============================================================

app.use(
  '/api/dashboard',
  verifyToken,
  dashboardRoutes
);


// ============================================================
// REPORTS
// PROTECTED
// ============================================================

app.use(
  '/api/reports',
  verifyToken,
  emiPaymentReportRoutes
);


// ============================================================
// 404
// ============================================================

app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});


module.exports = app;