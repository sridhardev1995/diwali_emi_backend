const diwaliSchemeModel = require('../models/diwaliSchemeModel');

function validateSchemeInput(body) {
  const { schemeName, chitValue, bonusPerChit, startDate } = body;

  if (!schemeName || !schemeName.trim()) {
    return 'Scheme name is required';
  }
  if (chitValue === undefined || isNaN(chitValue) || Number(chitValue) <= 0) {
    return 'Chit value must be a positive number';
  }
  if (bonusPerChit === undefined || isNaN(bonusPerChit) || Number(bonusPerChit) < 0) {
    return 'Bonus per chit must be a non-negative number';
  }
  if (!startDate || isNaN(Date.parse(startDate))) {
    return 'A valid start date (YYYY-MM-DD) is required';
  }
  return null;
}

// GET /api/diwali-schemes?page=1&limit=20&status=Active
async function list(req, res) {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const status = (req.query.status || '').trim();

    const { rows, total } = await diwaliSchemeModel.findAll({ page, limit, status });
    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('List diwali schemes error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching schemes' });
  }
}

// GET /api/diwali-schemes/:id
async function getOne(req, res) {
  try {
    const scheme = await diwaliSchemeModel.findById(req.params.id);
    if (!scheme) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }
    return res.json({ success: true, data: scheme });
  } catch (err) {
    console.error('Get diwali scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching scheme' });
  }
}

// POST /api/diwali-schemes
async function create(req, res) {
  try {
    const error = validateSchemeInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { schemeName, chitValue, durationWeeks, bonusPerChit, startDate } = req.body;

    const id = await diwaliSchemeModel.create({
      schemeName: schemeName.trim(),
      chitValue: Number(chitValue),
      durationWeeks: durationWeeks ? Number(durationWeeks) : 52,
      bonusPerChit: Number(bonusPerChit),
      startDate
    });

    const scheme = await diwaliSchemeModel.findById(id);
    return res.status(201).json({ success: true, message: 'Diwali scheme created', data: scheme });
  } catch (err) {
    console.error('Create diwali scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while creating scheme' });
  }
}

// PUT /api/diwali-schemes/:id
async function update(req, res) {
  try {
    const { id } = req.params;
    const existing = await diwaliSchemeModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    const error = validateSchemeInput(req.body);
    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    const { schemeName, chitValue, durationWeeks, bonusPerChit, startDate } = req.body;

    await diwaliSchemeModel.update(id, {
      schemeName: schemeName.trim(),
      chitValue: Number(chitValue),
      durationWeeks: durationWeeks ? Number(durationWeeks) : existing.duration_weeks,
      bonusPerChit: Number(bonusPerChit),
      startDate
    });

    const updated = await diwaliSchemeModel.findById(id);
    return res.json({ success: true, message: 'Scheme updated', data: updated });
  } catch (err) {
    console.error('Update diwali scheme error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating scheme' });
  }
}

// PATCH /api/diwali-schemes/:id/status   { status: "Active" | "Closed" }
async function changeStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Active', 'Closed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Active or Closed' });
    }

    const existing = await diwaliSchemeModel.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Scheme not found' });
    }

    await diwaliSchemeModel.updateStatus(id, status);
    return res.json({ success: true, message: `Scheme marked as ${status}` });
  } catch (err) {
    console.error('Change scheme status error:', err);
    return res.status(500).json({ success: false, message: 'Server error while updating status' });
  }
}

module.exports = { list, getOne, create, update, changeStatus };