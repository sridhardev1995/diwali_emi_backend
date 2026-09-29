const pool = require('../config/db');

// ============================================================
// DASHBOARD SUMMARY
// GET /api/dashboard/summary
// ============================================================

async function summary(req, res) {
  try {
    // ========================================================
    // 1. TOTAL CUSTOMERS
    // ========================================================

    const [customerRows] = await pool.query(`
      SELECT
        COUNT(*) AS total
      FROM customers
      WHERE status = 'Active'
    `);

    // ========================================================
    // 2. DIWALI SUMMARY
    //
    // Active enrollments only.
    //
    // total_chits:
    //     SUM(current_chits)
    //
    // total_amount:
    //     SUM(amount_due)
    //
    // received_amount:
    //     SUM(amount_paid)
    //
    // pending_amount:
    //     total_amount - received_amount
    //
    // amount_due / amount_paid are taken from the
    // generated weekly schedule.
    // ========================================================

    const [diwaliRows] = await pool.query(`
      SELECT
        COALESCE(
          (
            SELECT SUM(e.current_chits)
            FROM diwali_enrollments e
            WHERE e.status = 'Active'
          ),
          0
        ) AS total_chits,

        COALESCE(
          (
            SELECT SUM(w.amount_due)
            FROM diwali_enrollment_weeks w
            INNER JOIN diwali_enrollments e
              ON e.id = w.enrollment_id
            WHERE e.status = 'Active'
          ),
          0
        ) AS total_amount,

        COALESCE(
          (
            SELECT SUM(w.amount_paid)
            FROM diwali_enrollment_weeks w
            INNER JOIN diwali_enrollments e
              ON e.id = w.enrollment_id
            WHERE e.status = 'Active'
          ),
          0
        ) AS received_amount
    `);

    const diwali = diwaliRows[0] || {};

    const diwaliTotalAmount =
      Number(diwali.total_amount || 0);

    const diwaliReceivedAmount =
      Number(diwali.received_amount || 0);

    const diwaliPendingAmount = Math.max(
      diwaliTotalAmount - diwaliReceivedAmount,
      0
    );

    // ========================================================
    // 3. EMI SUMMARY
    //
    // disbursed_amount:
    //     SUM(enrollments.disbursed_amount)
    //     -> actual loan principal given to customers.
    //     Kept as a separate informational field; it is
    //     NOT used as the dashboard "total" anymore because
    //     it does not reconcile with the payment schedule
    //     (installments can include interest / tenure
    //     adjustments not reflected in disbursed_amount).
    //
    // scheduled_amount (-> exposed as "total_amount"):
    //     SUM(emi_installments.amount)
    //     -> the actual amount scheduled to be collected.
    //     This is the correct base for "total" so that:
    //         total_amount = collected_amount + pending_collection
    //
    // collected_amount:
    //     SUM of active emi_payment_transactions.
    //
    // pending_collection:
    //     scheduled_amount - collected_amount
    // ========================================================

    const [emiRows] = await pool.query(`
      SELECT

        COALESCE(
          (
            SELECT SUM(e.disbursed_amount)
            FROM enrollments e
            WHERE e.status IN ('Active', 'Closed')
          ),
          0
        ) AS disbursed_amount,

        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM emi_payment_transactions p
            INNER JOIN enrollments e
              ON e.id = p.enrollment_id
            WHERE p.status = 'Active'
              AND e.status IN ('Active', 'Closed')
          ),
          0
        ) AS collected_amount,

        COALESCE(
          (
            SELECT SUM(i.amount)
            FROM emi_installments i
            INNER JOIN enrollments e
              ON e.id = i.enrollment_id
            WHERE e.status IN ('Active', 'Closed')
          ),
          0
        ) AS scheduled_amount
    `);

    const emi = emiRows[0] || {};

    const emiDisbursedAmount =
      Number(emi.disbursed_amount || 0);

    const emiCollectedAmount =
      Number(emi.collected_amount || 0);

    const emiScheduledAmount =
      Number(emi.scheduled_amount || 0);

    // "total_amount" exposed to the client is now the
    // scheduled amount, so it stays consistent with
    // collected + pending.
    const emiTotalAmount = emiScheduledAmount;

    const emiPendingCollection = Math.max(
      emiScheduledAmount - emiCollectedAmount,
      0
    );

    // ========================================================
    // 4. TODAY DIWALI COLLECTION
    // ========================================================

    const [todayDiwaliRows] = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM diwali_payment_transactions
      WHERE payment_date = CURDATE()
        AND status = 'Active'
    `);

    const todayDiwaliCollection =
      Number(todayDiwaliRows[0]?.total || 0);

    // ========================================================
    // 5. TODAY EMI COLLECTION
    // ========================================================

    const [todayEmiRows] = await pool.query(`
      SELECT
        COALESCE(SUM(amount), 0) AS total
      FROM emi_payment_transactions
      WHERE payment_date = CURDATE()
        AND status = 'Active'
    `);

    const todayEmiCollection =
      Number(todayEmiRows[0]?.total || 0);

    const todayTotalCollection =
      todayDiwaliCollection +
      todayEmiCollection;

    // ========================================================
    // 6. TODAY DIWALI DUE
    //
    // Due today and not fully paid.
    // ========================================================

    const [todayDiwaliDueRows] = await pool.query(`
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              amount_due - amount_paid,
              0
            )
          ),
          0
        ) AS total
      FROM diwali_enrollment_weeks w
      INNER JOIN diwali_enrollments e
        ON e.id = w.enrollment_id
      WHERE w.due_date = CURDATE()
        AND w.status <> 'Paid'
        AND e.status = 'Active'
    `);

    const todayDiwaliDue =
      Number(todayDiwaliDueRows[0]?.total || 0);

    // ========================================================
    // 7. TODAY EMI DUE
    // ========================================================

    const [todayEmiDueRows] = await pool.query(`
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              amount - paid_amount,
              0
            )
          ),
          0
        ) AS total
      FROM emi_installments i
      INNER JOIN enrollments e
        ON e.id = i.enrollment_id
      WHERE i.due_date = CURDATE()
        AND i.status <> 'Paid'
        AND e.status = 'Active'
    `);

    const todayEmiDue =
      Number(todayEmiDueRows[0]?.total || 0);

    const todayDue =
      todayDiwaliDue +
      todayEmiDue;

    // ========================================================
    // 8. OVERDUE AMOUNT
    //
    // Diwali + EMI
    // ========================================================

    const [diwaliOverdueRows] = await pool.query(`
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              w.amount_due - w.amount_paid,
              0
            )
          ),
          0
        ) AS total
      FROM diwali_enrollment_weeks w
      INNER JOIN diwali_enrollments e
        ON e.id = w.enrollment_id
      WHERE w.due_date < CURDATE()
        AND w.status <> 'Paid'
        AND e.status = 'Active'
    `);

    const diwaliOverdue =
      Number(diwaliOverdueRows[0]?.total || 0);

    const [emiOverdueRows] = await pool.query(`
      SELECT
        COALESCE(
          SUM(
            GREATEST(
              i.amount - i.paid_amount,
              0
            )
          ),
          0
        ) AS total
      FROM emi_installments i
      INNER JOIN enrollments e
        ON e.id = i.enrollment_id
      WHERE i.due_date < CURDATE()
        AND i.status <> 'Paid'
        AND e.status = 'Active'
    `);

    const emiOverdue =
      Number(emiOverdueRows[0]?.total || 0);

    const overdueAmount =
      diwaliOverdue +
      emiOverdue;

    // ========================================================
    // 9. PENDING CUSTOMERS
    //
    // Customers having at least one overdue
    // Diwali / EMI installment.
    // ========================================================

    const [pendingCustomerRows] = await pool.query(`
      SELECT COUNT(*) AS total
      FROM (
        SELECT DISTINCT e.customer_id
        FROM diwali_enrollment_weeks w
        INNER JOIN diwali_enrollments e
          ON e.id = w.enrollment_id
        WHERE w.due_date < CURDATE()
          AND w.status <> 'Paid'
          AND e.status = 'Active'

        UNION

        SELECT DISTINCT e.customer_id
        FROM emi_installments i
        INNER JOIN enrollments e
          ON e.id = i.enrollment_id
        WHERE i.due_date < CURDATE()
          AND i.status <> 'Paid'
          AND e.status = 'Active'
      ) AS pending_customers
    `);

    const pendingCustomers =
      Number(pendingCustomerRows[0]?.total || 0);

    // ========================================================
    // FINAL RESPONSE
    // ========================================================

    return res.json({
      success: true,
      data: {
        customers: {
          total: Number(
            customerRows[0]?.total || 0
          ),
        },

        diwali: {
          total_chits: Number(
            diwali.total_chits || 0
          ),

          total_amount:
            Math.round(
              diwaliTotalAmount * 100
            ) / 100,

          received_amount:
            Math.round(
              diwaliReceivedAmount * 100
            ) / 100,

          pending_amount:
            Math.round(
              diwaliPendingAmount * 100
            ) / 100,
        },

        emi: {
          // Now = collected_amount + pending_collection
          total_amount:
            Math.round(
              emiTotalAmount * 100
            ) / 100,

          // Informational only: actual loan principal
          // disbursed to customers. Not used for the
          // progress bar / pending calculation.
          disbursed_amount:
            Math.round(
              emiDisbursedAmount * 100
            ) / 100,

          collected_amount:
            Math.round(
              emiCollectedAmount * 100
            ) / 100,

          pending_collection:
            Math.round(
              emiPendingCollection * 100
            ) / 100,
        },

        today: {
          diwali_collection:
            Math.round(
              todayDiwaliCollection * 100
            ) / 100,

          emi_collection:
            Math.round(
              todayEmiCollection * 100
            ) / 100,

          total_collection:
            Math.round(
              todayTotalCollection * 100
            ) / 100,
        },

        due: {
          today_due:
            Math.round(
              todayDue * 100
            ) / 100,

          overdue_amount:
            Math.round(
              overdueAmount * 100
            ) / 100,

          pending_customers:
            pendingCustomers,
        },
      },
    });
  } catch (err) {
    console.error(
      'Dashboard summary error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        err.message ||
        'Server error while fetching dashboard summary',
    });
  }
}

module.exports = {
  summary,
};