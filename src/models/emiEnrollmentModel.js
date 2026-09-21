const pool = require('../config/db');

// Adds `days` days to a date and returns YYYY-MM-DD
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Splits requestedAmount into `weeks` equal weekly installments (paise-safe).
// Any rounding remainder is absorbed into the last installment so the
// total always equals requestedAmount exactly.
function buildInstallmentAmounts(requestedAmount, weeks) {
  const base = Math.floor((requestedAmount / weeks) * 100) / 100;
  const amounts = new Array(weeks).fill(base);
  const runningTotal = base * (weeks - 1);
  amounts[weeks - 1] = Math.round((requestedAmount - runningTotal) * 100) / 100;
  return amounts;
}

async function findAll({ page = 1, limit = 20, customerId = '', schemeId = '', status = '' }) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = 'WHERE 1=1';

  if (customerId) {
    where += ' AND e.customer_id = ?';
    params.push(customerId);
  }
  if (schemeId) {
    where += ' AND e.scheme_id = ?';
    params.push(schemeId);
  }
  if (status) {
    where += ' AND e.status = ?';
    params.push(status);
  }

  const [rows] = await pool.query(
    `SELECT e.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS scheme_name
     FROM enrollments e
     JOIN customers c ON c.id = e.customer_id
     JOIN emi_schemes s ON s.id = e.scheme_id
     ${where}
     ORDER BY e.id DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), Number(offset)]
  );

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total FROM enrollments e ${where}`,
    params
  );

  return { rows, total: countRows[0].total };
}

async function findById(id) {
  const [rows] = await pool.query(
    `SELECT e.*, c.name AS customer_name, c.phone AS customer_phone, s.name AS scheme_name
     FROM enrollments e
     JOIN customers c ON c.id = e.customer_id
     JOIN emi_schemes s ON s.id = e.scheme_id
     WHERE e.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

// Creates the enrollment + its full EMI schedule in a single transaction.
async function createWithSchedule({
  customerId,
  schemeId,
  requestedAmount,
  commissionType,
  commissionValue,
  weeks,
  startDate
}) {
  const commissionAmount =
    commissionType === 'percent'
      ? Math.round(requestedAmount * (commissionValue / 100) * 100) / 100
      : Math.round(commissionValue * 100) / 100;

  const disbursedAmount = Math.round((requestedAmount - commissionAmount) * 100) / 100;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [enrollResult] = await connection.query(
      `INSERT INTO enrollments
         (customer_id, scheme_id, requested_amount, commission_type, commission_value,
          commission_amount, disbursed_amount, weeks, start_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [
        customerId, schemeId, requestedAmount, commissionType, commissionValue,
        commissionAmount, disbursedAmount, weeks, startDate
      ]
    );
    const enrollmentId = enrollResult.insertId;

    const amounts = buildInstallmentAmounts(requestedAmount, weeks);
    const installmentRows = amounts.map((amount, index) => [
      enrollmentId,
      index + 1,
      addDays(startDate, 7 * (index + 1)),
      amount,
      0,
      null,
      'Pending'
    ]);

    await connection.query(
      `INSERT INTO emi_installments
         (enrollment_id, week_no, due_date, amount, paid_amount, paid_date, status)
       VALUES ?`,
      [installmentRows]
    );

    await connection.commit();
    return { enrollmentId, commissionAmount, disbursedAmount };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function updateStatus(id, status) {
  await pool.query('UPDATE enrollments SET status = ? WHERE id = ?', [status, id]);
}

module.exports = { findAll, findById, createWithSchedule, updateStatus };