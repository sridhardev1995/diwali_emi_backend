const emiSchemeModel = require('../models/emiSchemeModel.js');

function validateSchemeInput(body) {
  const { name, defaultWeeks, defaultCommissionType, defaultCommissionValue } = body;

  if (!name || !name.trim()) {
    return 'Scheme name is required';
  }
  if (defaultWeeks !== undefined && (!Number.isInteger(Number(defaultWeeks)) || Number(defaultWeeks) <= 0)) {
    return 'Default weeks must be a positive whole number';
  }
  if (defaultCommissionType && !['percent', 'fixed'].includes(defaultCommissionType)) {
    return "Commission type must be 'percent' or 'fixed'";
  }
  if (defaultCommissionValue !== undefined && (isNaN(defaultCommissionValue) || Number(defaultCommissionValue) < 0)) {
    return 'Default commission value must be a non-negative number';
  }
  return null;
}

// GET /api/schemes?page=1&limit=20&search=&status=
async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const search = (req.query.search || '').trim();
    const status = (req.query.status || '').trim();

    const { rows, total } = await emiSchemeModel.findAll({ page, limit, search, status });

    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List schemes error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching schemes' });
  }
}

// GET /api/schemes/:id
async function getOne(req, res) {
  try {
    const scheme = await emiSchemeModel.findById(req.params.id);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    return res.json({ success: true, data: scheme });
  } catch (err) {
    console.error('Get scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching scheme' });
  }
}

// POST /api/schemes
async function create(req, res) {
  try {
    const error = validateSchemeInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const {
      name,
      description,
      defaultWeeks = 10,
      defaultCommissionType = 'percent',
      defaultCommissionValue = 15
    } = req.body;

    const id = await emiSchemeModel.create({
      name: name.trim(),
      description,
      defaultWeeks: Number(defaultWeeks),
      defaultCommissionType,
      defaultCommissionValue: Number(defaultCommissionValue)
    });

    const scheme = await emiSchemeModel.findById(id);
    return res.status(201).json({ success: true, message: 'Scheme created', data: scheme });
  } catch (err) {
    console.error('Create scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while creating scheme' });
  }
}

// PUT /api/schemes/:id
async function update(req, res) {
  try {
    const { id } = req.params;

    const existing = await emiSchemeModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    const error = validateSchemeInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { name, description, defaultWeeks, defaultCommissionType, defaultCommissionValue } = req.body;

    await emiSchemeModel.update(id, {
      name: name.trim(),
      description,
      defaultWeeks: Number(defaultWeeks),
      defaultCommissionType,
      defaultCommissionValue: Number(defaultCommissionValue)
    });

    const updated = await emiSchemeModel.findById(id);
    return res.json({ success: true, message: 'Scheme updated', data: updated });
  } catch (err) {
    console.error('Update scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating scheme' });
  }
}

// PATCH /api/schemes/:id/status   { status: "Active" | "Inactive" }
async function changeStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active or Inactive' });
    }

    const existing = await emiSchemeModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    await emiSchemeModel.updateStatus(id, status);
    return res.json({ success: true, message: `Scheme marked as ${status}` });
  } catch (err) {
    console.error('Change scheme status error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
}

// DELETE /api/schemes/:id
async function remove(req, res) {
  try {
    const { id } = req.params;
    const existing = await emiSchemeModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    await emiSchemeModel.remove(id);
    return res.json({ success: true, message: 'Scheme deleted' });
  } catch (err) {
    console.error('Delete scheme error:', err);
    return res.status(500).json({
      success: false,
      message: 'Could not delete scheme. It may have existing enrollments - consider marking Inactive instead.'
    });
  }
}

module.exports = { list, getOne, create, update, changeStatus, remove };