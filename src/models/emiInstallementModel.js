const pool = require('../config/db');

// Full weekly schedule for one enrollment, with overdue auto-flagged
// (past due_date, still not fully paid).
async function findByEnrollment(enrollmentId) {
  const [rows] = await pool.query(
    `SELECT *,
            CASE
              WHEN status IN ('Pending', 'Unpaid', 'Partial') AND due_date < CURDATE()
                THEN 1 ELSE 0
            END AS is_overdue
     FROM emi_installments
     WHERE enrollment_id = ?
     ORDER BY week_no ASC`,
    [enrollmentId]
  );
  return rows;
}

async function findById(id) {
  const [rows] = await pool.query('SELECT * FROM emi_installments WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// Running totals for one enrollment: collected, balance, overdue count.
async function getSummary(enrollmentId) {
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total_emis,
       SUM(CASE WHEN status = 'Paid' THEN 1 ELSE 0 END) AS paid_emis,
       COALESCE(SUM(paid_amount), 0) AS total_collected,
       COALESCE(SUM(amount), 0) - COALESCE(SUM(paid_amount), 0) AS balance,
       SUM(CASE WHEN status IN ('Pending', 'Unpaid', 'Partial') AND due_date < CURDATE() THEN 1 ELSE 0 END) AS overdue_emis
     FROM emi_installments
     WHERE enrollment_id = ?`,
    [enrollmentId]
  );
  return rows[0];
}

// Records a weekly collection entry. status: 'Paid' | 'Partial' | 'Unpaid'.
// amount/date are only meaningful for Paid/Partial.
async function recordPayment(id, { status, amount = 0, paidDate = null }) {
  await pool.query(
    `UPDATE emi_installments
     SET status = ?, paid_amount = ?, paid_date = ?
     WHERE id = ?`,
    [status, amount, paidDate, id]
  );
}

module.exports = { findByEnrollment, findById, getSummary, recordPayment };