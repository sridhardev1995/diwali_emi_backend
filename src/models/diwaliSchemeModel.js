const pool = require('../config/db');

async function findAll({ page = 1, limit = 20, status = '' }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT * FROM diwali_schemes ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );
  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM diwali_schemes ${where}`,
    params
  );
  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM diwali_schemes WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create({ schemeName, chitValue, durationWeeks, bonusPerChit, startDate }) {
  const [result] = await pool.query(
    `INSERT INTO diwali_schemes (scheme_name, chit_value, duration_weeks, bonus_per_chit, start_date, status)
     VALUES (?, ?, ?, ?, ?, 'Active')`,
    [schemeName, chitValue, durationWeeks || 52, bonusPerChit, startDate]
  );
  return result.insertId;
}

async function update(id, { schemeName, chitValue, durationWeeks, bonusPerChit, startDate }) {
  await pool.query(
    `UPDATE diwali_schemes
     SET scheme_name = ?, chit_value = ?, duration_weeks = ?, bonus_per_chit = ?, start_date = ?
     WHERE id = ?`,
    [schemeName, chitValue, durationWeeks, bonusPerChit, startDate, id]
  );
}

async function updateStatus(id, status) {
  await pool.query('UPDATE diwali_schemes SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { findAll, findById, create, update, updateStatus };