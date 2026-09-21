const pool = require('../config/db');

async function findAll({ page = 1, limit = 20, search = '', status = '' }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (search) {
    where += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT * FROM emi_schemes ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM emi_schemes ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM emi_schemes WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function create(data) {
  const { name, description, defaultWeeks, defaultCommissionType, defaultCommissionValue } = data;
  const [result] = await pool.query(
    `INSERT INTO emi_schemes
       (name, description, default_weeks, default_commission_type, default_commission_value, status)
     VALUES (?, ?, ?, ?, ?, 'Active')`,
    [name, description || null, defaultWeeks, defaultCommissionType, defaultCommissionValue]
  );
  return result.insertId;
}

async function update(id, data) {
  const { name, description, defaultWeeks, defaultCommissionType, defaultCommissionValue } = data;
  await pool.query(
    `UPDATE emi_schemes
     SET name = ?, description = ?, default_weeks = ?, default_commission_type = ?, default_commission_value = ?
     WHERE id = ?`,
    [name, description || null, defaultWeeks, defaultCommissionType, defaultCommissionValue, id]
  );
}

async function updateStatus(id, status) {
  await pool.query('UPDATE emi_schemes SET status = ? WHERE id = ?', [status, id]);
}

async function remove(id) {
  await pool.query('DELETE FROM emi_schemes WHERE id = ?', [id]);
}

module.exports = { findAll, findById, create, update, updateStatus, remove };