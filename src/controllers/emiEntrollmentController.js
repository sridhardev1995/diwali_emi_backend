const emiSchemeModel = require('../models/emiSchemeModel.js');
const customerModel = require('../models/customerModel.js');
const enrollmentModel = require('../models/emiEnrollmentModel.js');

function today() {
  return new Date().toISOString().slice(0, 10);
}

function validateEnrollInput(body) {
  const { customerId, schemeId, requestedAmount, commissionType, commissionValue, weeks } = body;

  if (!customerId) {
    return 'customerId is required';
  }
  if (!schemeId) {
    return 'schemeId is required';
  }
  if (!requestedAmount || isNaN(requestedAmount) || Number(requestedAmount) <= 0) {
    return 'A valid requested amount is required';
  }
  if (commissionType && !['percent', 'fixed'].includes(commissionType)) {
    return "commissionType must be 'percent' or 'fixed'";
  }
  if (commissionValue !== undefined && (isNaN(commissionValue) || Number(commissionValue) < 0)) {
    return 'commissionValue must be a non-negative number';
  }
  if (commissionType === 'fixed' && Number(commissionValue) > Number(requestedAmount)) {
    return 'Fixed commission cannot exceed the requested amount';
  }
  if (weeks !== undefined && (!Number.isInteger(Number(weeks)) || Number(weeks) <= 0)) {
    return 'weeks must be a positive whole number';
  }
  return null;
}

// GET /api/enrollments?page=1&limit=20&customerId=&schemeId=&status=
async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const { customerId = '', schemeId = '', status = '' } = req.query;

    const { rows, total } = await enrollmentModel.findAll({ page, limit, customerId, schemeId, status });

    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List enrollments error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching enrollments' });
  }
}

// GET /api/enrollments/:id
async function getOne(req, res) {
  try {
    const enrollment = await enrollmentModel.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }
    return res.json({ success: true, data: enrollment });
  } catch (err) {
    console.error('Get enrollment error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching enrollment' });
  }
}

// POST /api/enrollments
// Body: { customerId, schemeId, requestedAmount, commissionType?, commissionValue?, weeks?, startDate? }
// commissionType/commissionValue/weeks are optional - fall back to the scheme's defaults,
// letting admin override commission (fixed ₹ or %) and duration per enrollment.
async function create(req, res) {
  try {
    const error = validateEnrollInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { customerId, schemeId, requestedAmount, commissionType, commissionValue, weeks, startDate } = req.body;

    const customer = await customerModel.findById(customerId);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const scheme = await emiSchemeModel.findById(schemeId);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    if (scheme.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Cannot enroll into an inactive scheme' });
    }

    const resolvedCommissionType = commissionType || scheme.default_commission_type;
    const resolvedCommissionValue =
      commissionValue !== undefined ? Number(commissionValue) : Number(scheme.default_commission_value);
    const resolvedWeeks = weeks !== undefined ? Number(weeks) : scheme.default_weeks;
    const resolvedStartDate = startDate || today();

    const { enrollmentId, commissionAmount, disbursedAmount } = await enrollmentModel.createWithSchedule({
      customerId: Number(customerId),
      schemeId: Number(schemeId),
      requestedAmount: Number(requestedAmount),
      commissionType: resolvedCommissionType,
      commissionValue: resolvedCommissionValue,
      weeks: resolvedWeeks,
      startDate: resolvedStartDate
    });

    const enrollment = await enrollmentModel.findById(enrollmentId);
    return res.status(201).json({
      success: true,
      message: `Customer enrolled. Commission: ₹${commissionAmount}, Disbursed: ₹${disbursedAmount}`,
      data: enrollment
    });
  } catch (err) {
    console.error('Create enrollment error:', err);
    return res.status(500).json({ success: false, message: 'Server error while creating enrollment' });
  }
}

// PATCH /api/enrollments/:id/status   { status: "Active" | "Closed" | "Cancelled" }
async function changeStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Closed', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active, Closed or Cancelled' });
    }

    const existing = await enrollmentModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    await enrollmentModel.updateStatus(id, status);
    return res.json({ success: true, message: `Enrollment marked as ${status}` });
  } catch (err) {
    console.error('Change enrollment status error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
}

module.exports = { list, getOne, create, changeStatus };