const pool = require('../config/db');


// ============================================================
// FIND EMI INSTALLMENTS FOR ONE ENROLLMENT
// ============================================================

async function findByEnrollment(enrollmentId) {
  const [rows] = await pool.query(
    `
    SELECT *,

      CASE
        WHEN status IN ('Pending', 'Unpaid', 'Partial')
             AND due_date < CURDATE()
        THEN 1
        ELSE 0
      END AS is_overdue

    FROM emi_installments

    WHERE enrollment_id = ?

    ORDER BY week_no ASC
    `,
    [enrollmentId]
  );

  return rows;
}


// ============================================================
// FIND ONE EMI INSTALLMENT
// ============================================================

async function findById(id) {
  const [rows] = await pool.query(
    `
    SELECT *

    FROM emi_installments

    WHERE id = ?

    LIMIT 1
    `,
    [id]
  );

  return rows[0] || null;
}


// ============================================================
// EMI SUMMARY
// ============================================================

async function getSummary(enrollmentId) {
  const [rows] = await pool.query(
    `
    SELECT

      COUNT(*) AS total_emis,

      SUM(
        CASE
          WHEN status = 'Paid' THEN 1
          ELSE 0
        END
      ) AS paid_emis,

      COALESCE(
        SUM(paid_amount),
        0
      ) AS total_collected,

      COALESCE(
        SUM(amount),
        0
      ) -
      COALESCE(
        SUM(paid_amount),
        0
      ) AS balance,

      SUM(
        CASE
          WHEN status IN ('Pending', 'Unpaid', 'Partial')
               AND due_date < CURDATE()
          THEN 1
          ELSE 0
        END
      ) AS overdue_emis

    FROM emi_installments

    WHERE enrollment_id = ?
    `,
    [enrollmentId]
  );

  return rows[0];
}


// ============================================================
// TODAY DUE EMI COLLECTIONS
//
// Returns all active enrollments whose EMI is due today
// and is not fully paid.
//
// Used for:
// Collections -> EMI -> Today Due
// ============================================================

async function findTodayDue() {
  const [rows] = await pool.query(
    `
    SELECT

      i.id,
      i.enrollment_id,
      i.week_no,
      i.due_date,
      i.amount,
      i.paid_amount,
      i.paid_date,
      i.status,

      e.customer_id,
      e.scheme_id,

      c.name AS customer_name,
      c.phone AS customer_phone,

      s.name AS scheme_name,

      0 AS is_overdue,
      0 AS overdue_days

    FROM emi_installments i

    INNER JOIN enrollments e
      ON e.id = i.enrollment_id

    INNER JOIN customers c
      ON c.id = e.customer_id

    LEFT JOIN emi_schemes s
      ON s.id = e.scheme_id

    WHERE

      i.due_date = CURDATE()

      AND i.status IN (
        'Pending',
        'Unpaid',
        'Partial'
      )

      AND e.status = 'Active'

    ORDER BY
      c.name ASC,
      i.week_no ASC
    `
  );

  return rows;
}


// ============================================================
// OVERDUE EMI COLLECTIONS
//
// Returns all active enrollments whose EMI due date
// is before today and is not fully paid.
//
// Used for:
// Collections -> EMI -> Overdue
// ============================================================

async function findOverdue() {
  const [rows] = await pool.query(
    `
    SELECT

      i.id,
      i.enrollment_id,
      i.week_no,
      i.due_date,
      i.amount,
      i.paid_amount,
      i.paid_date,
      i.status,

      e.customer_id,
      e.scheme_id,

      c.name AS customer_name,
      c.phone AS customer_phone,

      s.name AS scheme_name,

      1 AS is_overdue,

      DATEDIFF(
        CURDATE(),
        i.due_date
      ) AS overdue_days

    FROM emi_installments i

    INNER JOIN enrollments e
      ON e.id = i.enrollment_id

    INNER JOIN customers c
      ON c.id = e.customer_id

    LEFT JOIN emi_schemes s
      ON s.id = e.scheme_id

    WHERE

      i.due_date < CURDATE()

      AND i.status IN (
        'Pending',
        'Unpaid',
        'Partial'
      )

      AND e.status = 'Active'

    ORDER BY

      i.due_date ASC,
      c.name ASC,
      i.week_no ASC
    `
  );

  return rows;
}


/**
 * Record a NEW payment amount.
 *
 * Important:
 * amount is the NEW payment amount,
 * not the total paid amount.
 */

async function recordPayment(
  id,
  {
    status,
    amount = 0,
    paidDate = null,
  }
) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
      SELECT
        id,
        enrollment_id,
        amount,
        paid_amount,
        status

      FROM emi_installments

      WHERE id = ?

      FOR UPDATE
      `,
      [id]
    );

    if (rows.length === 0) {
      throw new Error(
        'Installment not found'
      );
    }

    const installment = rows[0];

    const installmentAmount =
      Number(
        installment.amount || 0
      );

    const existingPaid =
      Number(
        installment.paid_amount || 0
      );

    const newPayment =
      Number(
        amount || 0
      );

    const remaining =
      Math.max(
        installmentAmount -
          existingPaid,
        0
      );

    // ----------------------------------------------------------
    // Already fully paid
    // ----------------------------------------------------------

    if (remaining <= 0) {
      throw new Error(
        'This EMI is already fully paid'
      );
    }

    // ----------------------------------------------------------
    // Unpaid
    // ----------------------------------------------------------

    if (status === 'Unpaid') {
      await connection.query(
        `
        UPDATE emi_installments

        SET
          status = 'Unpaid',
          paid_amount = 0,
          paid_date = NULL

        WHERE id = ?
        `,
        [id]
      );

      await connection.commit();

      return {
        id,
        status: 'Unpaid',
        paidAmount: 0,
        balance: installmentAmount,
      };
    }

    // ----------------------------------------------------------
    // Validate payment amount
    // ----------------------------------------------------------

    if (
      !Number.isFinite(newPayment) ||
      newPayment <= 0
    ) {
      throw new Error(
        'Payment amount must be greater than zero'
      );
    }

    // ----------------------------------------------------------
    // Prevent overpayment
    // ----------------------------------------------------------

    if (newPayment > remaining) {
      throw new Error(
        `Payment cannot exceed remaining balance of ₹${remaining.toFixed(2)}`
      );
    }

    const totalPaid =
      Math.round(
        (existingPaid + newPayment) * 100
      ) / 100;

    const newBalance =
      Math.round(
        (installmentAmount - totalPaid) * 100
      ) / 100;

    // ----------------------------------------------------------
    // Calculate status on backend
    // ----------------------------------------------------------

    let finalStatus;

    if (newBalance <= 0) {
      finalStatus = 'Paid';
    } else {
      finalStatus = 'Partial';
    }

    // ----------------------------------------------------------
    // Update
    // ----------------------------------------------------------

    await connection.query(
      `
      UPDATE emi_installments

      SET
        status = ?,
        paid_amount = ?,
        paid_date = ?

      WHERE id = ?
      `,
      [
        finalStatus,
        totalPaid,
        paidDate,
        id,
      ]
    );

    await connection.commit();

    return {
      id,
      status: finalStatus,
      paidAmount: totalPaid,
      balance: newBalance,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  findByEnrollment,
  findById,
  getSummary,

  // Collection APIs
  findTodayDue,
  findOverdue,

  recordPayment,
};