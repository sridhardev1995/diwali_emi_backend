const pool = require('../config/db');

// List with pagination + optional search by name/phone + optional status filter
async function findAll({ page = 1, limit = 20, search = '', status = '' }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (search) {
    where += ' AND (name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    where += ' AND status = ?';
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT id, name, phone, address, aadhar_number, pan_number,
            ref_name, ref_phone, payment_number, photo_url, status, created_at
     FROM customers ${where}
     ORDER BY id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM customers ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM customers WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

async function findByPhone(phone) {
  const [rows] = await pool.query('SELECT * FROM customers WHERE phone = ? LIMIT 1', [phone]);
  return rows[0] || null;
}

async function create(data) {
  const {
    name, phone, address, aadharNumber, panNumber,
    refName, refPhone, paymentNumber, photoUrl
  } = data;

  const [result] = await pool.query(
    `INSERT INTO customers
       (name, phone, address, aadhar_number, pan_number, ref_name, ref_phone, payment_number, photo_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
    [
      name, phone, address || null,
      aadharNumber || null, panNumber || null,
      refName || null, refPhone || null,
      paymentNumber || null, photoUrl || null
    ]
  );
  return result.insertId;
}

async function update(id, data) {
  const {
    name, phone, address, aadharNumber, panNumber,
    refName, refPhone, paymentNumber, photoUrl
  } = data;

  await pool.query(
    `UPDATE customers
     SET name = ?, phone = ?, address = ?, aadhar_number = ?, pan_number = ?,
         ref_name = ?, ref_phone = ?, payment_number = ?, photo_url = ?
     WHERE id = ?`,
    [
      name, phone, address || null,
      aadharNumber || null, panNumber || null,
      refName || null, refPhone || null,
      paymentNumber || null, photoUrl || null,
      id
    ]
  );
}

async function updateStatus(id, status) {
  await pool.query('UPDATE customers SET status = ? WHERE id = ?', [status, id]);
}

async function remove(id) {
  await pool.query('DELETE FROM customers WHERE id = ?', [id]);
}

module.exports = {
  findAll,
  findById,
  findByPhone,
  create,
  update,
  updateStatus,
  remove
};