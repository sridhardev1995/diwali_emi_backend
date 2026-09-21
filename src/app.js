require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const diwaliSchemeRoutes = require('./routes/diwaliSchemeRoutes');
const diwaliEnrollmentRoutes = require('./routes/diwaliEnrollmentRoutes');
const emiRoutes = require('./routes/emischemeRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Diwali & EMI Scheme API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/diwali-schemes', diwaliSchemeRoutes);
app.use('/api/diwali-enrollments', diwaliEnrollmentRoutes);
app.use('/api', emiRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

module.exports = app;