const pool = require('../config/db');

// ============================================================
// EMI PAYMENT REPORT
// ============================================================

async function getPaymentReport({
  page = 1,
  limit = 20,
  fromDate = '',
  toDate = '',
  customerId = '',
  schemeId = '',
  paymentMode = '',
  status = '',
}) {
  page = Math.max(Number(page) || 1, 1);
  limit = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const offset = (page - 1) * limit;

  const where = [];
  const params = [];

  // ----------------------------------------------------------
  // DATE FILTER
  // ----------------------------------------------------------

  if (fromDate) {
    where.push('DATE(p.payment_date) >= ?');
    params.push(fromDate);
  }

  if (toDate) {
    where.push('DATE(p.payment_date) <= ?');
    params.push(toDate);
  }

  // ----------------------------------------------------------
  // CUSTOMER FILTER
  // ----------------------------------------------------------

  if (customerId) {
    where.push('e.customer_id = ?');
    params.push(customerId);
  }

  // ----------------------------------------------------------
  // SCHEME FILTER
  // ----------------------------------------------------------

  if (schemeId) {
    where.push('e.scheme_id = ?');
    params.push(schemeId);
  }

  // ----------------------------------------------------------
  // PAYMENT MODE
  // ----------------------------------------------------------

  if (paymentMode) {
    where.push('p.payment_mode = ?');
    params.push(paymentMode);
  }

  // ----------------------------------------------------------
  // STATUS
  // ----------------------------------------------------------

  if (status) {
    where.push('p.status = ?');
    params.push(status);
  }

  const whereSql =
    where.length > 0
      ? `WHERE ${where.join(' AND ')}`
      : '';

  // ==========================================================
  // TOTAL RECORDS
  // ==========================================================

  const [countRows] = await pool.query(
    `
    SELECT COUNT(*) AS total
    FROM emi_payment_transactions p

    INNER JOIN enrollments e
      ON e.id = p.enrollment_id

    INNER JOIN customers c
      ON c.id = e.customer_id

    INNER JOIN emi_schemes s
      ON s.id = e.scheme_id

    ${whereSql}
    `,
    params
  );

  const total = Number(
    countRows[0]?.total || 0
  );

  // ==========================================================
  // PAYMENT LIST
  // ==========================================================

  const [rows] = await pool.query(
    `
    SELECT
      p.id,
      p.enrollment_id,
      p.installment_id,
      p.amount,
      p.payment_mode,
      p.payment_date,
      p.status,
      p.reversed_at,
      p.reversed_by,
      p.reversal_reason,
      p.created_at,

      c.id AS customer_id,
      c.name AS customer_name,
      c.phone AS customer_phone,

      s.id AS scheme_id,
      s.name AS scheme_name,

      i.week_no,
      i.due_date,
      i.amount AS installment_amount,

      a.username AS reversed_by_username

    FROM emi_payment_transactions p

    INNER JOIN enrollments e
      ON e.id = p.enrollment_id

    INNER JOIN customers c
      ON c.id = e.customer_id

    INNER JOIN emi_schemes s
      ON s.id = e.scheme_id

    INNER JOIN emi_installments i
      ON i.id = p.installment_id

    LEFT JOIN admins a
      ON a.id = p.reversed_by

    ${whereSql}

    ORDER BY
      p.payment_date DESC,
      p.id DESC

    LIMIT ? OFFSET ?
    `,
    [
      ...params,
      limit,
      offset,
    ]
  );

  // ==========================================================
  // SUMMARY
  // ==========================================================

  const [summaryRows] = await pool.query(
    `
    SELECT

      COALESCE(
        SUM(
          CASE
            WHEN p.status = 'Active'
            THEN p.amount
            ELSE 0
          END
        ),
        0
      ) AS total_collection,

      COALESCE(
        SUM(
          CASE
            WHEN p.status = 'Active'
              AND p.payment_mode = 'Cash'
            THEN p.amount
            ELSE 0
          END
        ),
        0
      ) AS cash_total,

      COALESCE(
        SUM(
          CASE
            WHEN p.status = 'Active'
              AND p.payment_mode = 'UPI'
            THEN p.amount
            ELSE 0
          END
        ),
        0
      ) AS upi_total,

      COALESCE(
        SUM(
          CASE
            WHEN p.status = 'Reversed'
            THEN p.amount
            ELSE 0
          END
        ),
        0
      ) AS reversed_total,

      COUNT(*) AS transaction_count

    FROM emi_payment_transactions p

    INNER JOIN enrollments e
      ON e.id = p.enrollment_id

    ${whereSql}
    `,
    params
  );

  const summary = summaryRows[0] || {};

  return {
    rows,

    summary: {
      totalCollection:
        Number(summary.total_collection || 0),

      cashTotal:
        Number(summary.cash_total || 0),

      upiTotal:
        Number(summary.upi_total || 0),

      reversedTotal:
        Number(summary.reversed_total || 0),

      transactionCount:
        Number(summary.transaction_count || 0),
    },

    pagination: {
      page,
      limit,
      total,
      totalPages:
        total > 0
          ? Math.ceil(total / limit)
          : 1,
    },
  };
}

module.exports = {
  getPaymentReport,
};