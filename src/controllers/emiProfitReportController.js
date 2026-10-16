const pool = require('../config/db');

const ALLOWED_STATUSES = ['Active', 'Closed', 'Cancelled'];

function isValidDate(value) {
  if (!value) return true;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function toNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

// GET /api/reports/emi-profit
async function getEmiProfitReport(req, res) {
  try {
    const {
      startDate = '',
      endDate = '',
      status = '',
      customerId = '',
      schemeId = '',
    } = req.query;

    // --------------------------------------------------
    // VALIDATION
    // --------------------------------------------------

    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      return res.status(400).json({
        success: false,
        message: 'Dates must use YYYY-MM-DD format',
      });
    }

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate cannot be after endDate',
      });
    }

    if (status && !ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid enrollment status',
      });
    }

    if (
      customerId &&
      (!Number.isInteger(Number(customerId)) || Number(customerId) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid customerId',
      });
    }

    if (
      schemeId &&
      (!Number.isInteger(Number(schemeId)) || Number(schemeId) <= 0)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid schemeId',
      });
    }

    // --------------------------------------------------
    // FILTERS
    // Date filtering is based on enrollment start_date.
    // --------------------------------------------------

    const conditions = [];
    const params = [];

    if (startDate) {
      conditions.push('e.start_date >= ?');
      params.push(startDate);
    }

    if (endDate) {
      conditions.push('e.start_date <= ?');
      params.push(endDate);
    }

    if (status) {
      conditions.push('e.status = ?');
      params.push(status);
    }

    if (customerId) {
      conditions.push('e.customer_id = ?');
      params.push(Number(customerId));
    }

    if (schemeId) {
      conditions.push('e.scheme_id = ?');
      params.push(Number(schemeId));
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // --------------------------------------------------
    // CUSTOMER-WISE REPORT
    //
    // emi_payable = schedule total
    // collected = Active payment transactions only
    // commission = saved commission_amount
    //
    // Subqueries prevent payment/installment joins from
    // multiplying amounts.
    // --------------------------------------------------

    const [rows] = await pool.query(
      `
      SELECT
        e.id AS enrollment_id,
        e.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,

        e.scheme_id,
        s.name AS scheme_name,

        e.requested_amount,
        e.commission_type,
        e.commission_value,
        e.commission_amount,
        e.disbursed_amount,

        e.weeks,
        e.start_date,
        e.status AS enrollment_status,

        COALESCE(
          (
            SELECT SUM(i.amount)
            FROM emi_installments i
            WHERE i.enrollment_id = e.id
          ),
          0
        ) AS total_emi_payable,

        COALESCE(
          (
            SELECT SUM(p.amount)
            FROM emi_payment_transactions p
            WHERE p.enrollment_id = e.id
              AND p.status = 'Active'
          ),
          0
        ) AS total_collected,

        COALESCE(
          (
            SELECT SUM(i.paid_amount)
            FROM emi_installments i
            WHERE i.enrollment_id = e.id
          ),
          0
        ) AS installment_paid_amount

      FROM enrollments e

      INNER JOIN customers c
        ON c.id = e.customer_id

      INNER JOIN emi_schemes s
        ON s.id = e.scheme_id

      ${whereClause}

      ORDER BY e.start_date DESC, e.id DESC
      `,
      params
    );

    // --------------------------------------------------
    // FORMAT ROWS
    // --------------------------------------------------

    const data = rows.map((row) => {
      const requestedAmount = money(row.requested_amount);
      const commissionAmount = money(row.commission_amount);
      const disbursedAmount = money(row.disbursed_amount);
      const totalEmiPayable = money(row.total_emi_payable);
      const totalCollected = money(row.total_collected);

      return {
        enrollmentId: Number(row.enrollment_id),
        customerId: Number(row.customer_id),
        customerName: row.customer_name,
        customerPhone: row.customer_phone,

        schemeId: Number(row.scheme_id),
        schemeName: row.scheme_name,

        requestedAmount,
        commissionType: row.commission_type,
        commissionValue: money(row.commission_value),

        // Expected commission according to saved enrollment data.
        commissionAmount,

        disbursedAmount,
        weeks: Number(row.weeks),
        startDate: row.start_date,
        status: row.enrollment_status,

        totalEmiPayable,
        totalCollected,

        pendingCollection: money(
          Math.max(totalEmiPayable - totalCollected, 0)
        ),

        // This is not the same as net business profit.
        expectedCommission: commissionAmount,
      };
    });

    // --------------------------------------------------
    // SUMMARY
    // --------------------------------------------------

    const summary = data.reduce(
      (totals, row) => {
        totals.enrollmentCount += 1;

        totals.totalRequestedAmount += row.requestedAmount;
        totals.totalCommission += row.commissionAmount;
        totals.totalDisbursed += row.disbursedAmount;
        totals.totalEmiPayable += row.totalEmiPayable;
        totals.totalCollected += row.totalCollected;
        totals.totalPending += row.pendingCollection;

        return totals;
      },
      {
        enrollmentCount: 0,
        totalRequestedAmount: 0,
        totalCommission: 0,
        totalDisbursed: 0,
        totalEmiPayable: 0,
        totalCollected: 0,
        totalPending: 0,
      }
    );

    for (const key of [
      'totalRequestedAmount',
      'totalCommission',
      'totalDisbursed',
      'totalEmiPayable',
      'totalCollected',
      'totalPending',
    ]) {
      summary[key] = money(summary[key]);
    }

    return res.json({
      success: true,
      message: 'EMI profit report fetched successfully',
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || null,
        customerId: customerId ? Number(customerId) : null,
        schemeId: schemeId ? Number(schemeId) : null,
      },
      summary,
      data,
    });
  } catch (error) {
    console.error('EMI profit report error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to fetch EMI profit report',
    });
  }
}

module.exports = {
  getEmiProfitReport,
};