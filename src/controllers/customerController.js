const customerModel = require('../models/customerModel');

const PHONE_REGEX = /^[0-9]{10}$/;
const AADHAR_REGEX = /^[0-9]{12}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function validateCustomerInput(body, { isUpdate = false } = {}) {
  const { name, phone, aadharNumber, panNumber, refPhone } = body;

  if (!name || !name.trim()) {
    return 'Customer name is required';
  }
  if (!phone || !PHONE_REGEX.test(phone)) {
    return 'A valid 10-digit phone number is required';
  }
  if (aadharNumber && !AADHAR_REGEX.test(aadharNumber)) {
    return 'Aadhar number must be exactly 12 digits';
  }
  if (panNumber && !PAN_REGEX.test(panNumber.toUpperCase())) {
    return 'PAN number must be in the format ABCDE1234F';
  }
  if (refPhone && !PHONE_REGEX.test(refPhone)) {
    return 'Reference phone number must be a valid 10-digit number';
  }
  return null;
}

// GET /api/customers?page=1&limit=20&search=sridhar&status=Active
async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const { rows, total } = await customerModel.findAll({ page, limit, search, status });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('List customers error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching customers' });
  }
}

// GET /api/customers/:id
async function getOne(req, res) {
  try {
    const customer = await customerModel.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    return res.json({ success: true, data: customer });
  } catch (err) {
    console.error('Get customer error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching customer' });
  }
}

// POST /api/customers
async function create(req, res) {
  try {
    const error = validateCustomerInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { name, phone, address, aadharNumber, panNumber, refName, refPhone, paymentNumber, photoUrl } = req.body;

    const existing = await customerModel.findByPhone(phone);
    if (existing) {
      return res.status(409).json({ success: false, message: 'A customer with this phone number already exists' });
    }

    const id = await customerModel.create({
      name: name.trim(),
      phone,
      address,
      aadharNumber,
      panNumber: panNumber ? panNumber.toUpperCase() : null,
      refName,
      refPhone,
      paymentNumber,
      photoUrl
    });

    const customer = await customerModel.findById(id);
    return res.status(201).json({ success: true, message: 'Customer created', data: customer });
  } catch (err) {
    console.error('Create customer error:', err);
    return res.status(500).json({ success: false, message: 'Server error while creating customer' });
  }
}

// PUT /api/customers/:id
async function update(req, res) {
  try {
    const { id } = req.params;

    const existing = await customerModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const error = validateCustomerInput(req.body, { isUpdate: true });
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { name, phone, address, aadharNumber, panNumber, refName, refPhone, paymentNumber, photoUrl } = req.body;

    const phoneOwner = await customerModel.findByPhone(phone);
    if (phoneOwner && phoneOwner.id !== Number(id)) {
      return res.status(409).json({ success: false, message: 'This phone number is already used by another customer' });
    }

    await customerModel.update(id, {
      name: name.trim(),
      phone,
      address,
      aadharNumber,
      panNumber: panNumber ? panNumber.toUpperCase() : null,
      refName,
      refPhone,
      paymentNumber,
      photoUrl
    });

    const updated = await customerModel.findById(id);
    return res.json({ success: true, message: 'Customer updated', data: updated });
  } catch (err) {
    console.error('Update customer error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating customer' });
  }
}

// PATCH /api/customers/:id/status   { status: "Active" | "Inactive" }
async function changeStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
    }

    const existing = await customerModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await customerModel.updateStatus(id, status);
    return res.json({ success: true, message: `Customer marked as ${status}` });
  } catch (err) {
    console.error('Change status error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
}

// DELETE /api/customers/:id
async function remove(req, res) {
  try {
    const { id } = req.params;
    const existing = await customerModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    await customerModel.remove(id);
    return res.json({ success: true, message: 'Customer deleted' });
  } catch (err) {
    console.error('Delete customer error:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not delete customer. They may have existing scheme enrollments - consider marking Inactive instead.'
    });
  }
}

module.exports = { list, getOne, create, update, changeStatus, remove };