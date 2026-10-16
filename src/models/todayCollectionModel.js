const pool = require('../config/db');

// ============================================================
// HELPERS
// ============================================================

function toNumber(value) {
  const number = Number(value || 0);

  return Number.isFinite(number)
    ? number
    : 0;
}


// ============================================================
// FORMAT PAYMENT MODE
// ============================================================
//
// Example:
// Cash
// UPI
// Cash + UPI
//
// ============================================================

function combinePaymentModes(rows) {
  const modes = [];

  for (const row of rows) {
    const mode = String(
      row.payment_mode || ''
    ).trim();

    if (
      mode &&
      !modes.some(
        (item) =>
          item.toLowerCase() ===
          mode.toLowerCase()
      )
    ) {
      modes.push(mode);
    }
  }

  return modes.join(' + ');
}


// ============================================================
// CREATE GROUP KEY
// ============================================================
//
// EMI:
// Same receipt + same installment
// => one collection row
//
// Diwali:
// Same payment group + same week
// => one collection row
//
// ============================================================

function getGroupKey(
  type,
  row
) {
  if (type === 'EMI') {
    return [
      row.receipt_number || '',
      row.installment_id || '',
    ].join('|');
  }

  return [
    row.payment_group_id || '',
    row.week_number || '',
  ].join('|');
}


// ============================================================
// GROUP TODAY PAYMENTS
// ============================================================

function groupPayments(
  rows,
  type
) {
  const groups = new Map();

  for (const row of rows) {
    const key = getGroupKey(
      type,
      row
    );

    if (!groups.has(key)) {
      groups.set(key, {
        ...row,

        amount: 0,

        payment_modes: [],

        transaction_ids: [],

        created_at:
          row.created_at,

        latest_created_at:
          row.created_at,

        latest_id:
          Number(row.id || 0),
      });
    }

    const group =
      groups.get(key);

    group.amount += toNumber(
      row.amount
    );

    group.transaction_ids.push(
      Number(row.id || 0)
    );

    const mode = String(
      row.payment_mode || ''
    ).trim();

    if (
      mode &&
      !group.payment_modes.some(
        (item) =>
          item.toLowerCase() ===
          mode.toLowerCase()
      )
    ) {
      group.payment_modes.push(
        mode
      );
    }

    // Keep latest transaction time
    if (
      new Date(row.created_at).getTime() >
      new Date(
        group.latest_created_at
      ).getTime()
    ) {
      group.latest_created_at =
        row.created_at;

      group.latest_id =
        Number(row.id || 0);
    }
  }

  return Array.from(
    groups.values()
  ).map((group) => ({
    ...group,

    amount:
      Number(
        group.amount.toFixed(2)
      ),

    payment_mode:
      group.payment_modes.join(
        ' + '
      ),

    created_at:
      group.latest_created_at,

    payment_time:
      formatPaymentTime(
        group.latest_created_at
      ),
  }));
}


// ============================================================
// PAYMENT TIME
// ============================================================

function formatPaymentTime(
  dateValue
) {
  if (!dateValue) {
    return '-';
  }

  const date =
    new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  let hours =
    date.getHours();

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, '0');

  const suffix =
    hours >= 12
      ? 'PM'
      : 'AM';

  hours =
    hours % 12 || 12;

  return `${String(hours).padStart(
    2,
    '0'
  )}:${minutes} ${suffix}`;
}


// ============================================================
// CALCULATE REMAINING BALANCE
// ============================================================
//
// Current DB balance = balance AFTER all today's payments.
//
// For each historical row:
//
// remaining after this payment
// = current final balance
// + payments made AFTER this payment
//
// Example:
//
// Total = 10,000
//
// Week 1 = 1,000
// Week 2 = 1,000
//
// Final balance = 8,000
//
// Week 2 => 8,000
// Week 1 => 9,000
//
// ============================================================

function calculateHistoricalBalances(
  groups,
  finalBalance
) {
  // Latest payment first
  groups.sort((a, b) => {
    const dateA =
      new Date(
        a.created_at
      ).getTime();

    const dateB =
      new Date(
        b.created_at
      ).getTime();

    if (dateB !== dateA) {
      return dateB - dateA;
    }

    return (
      Number(b.latest_id || 0) -
      Number(a.latest_id || 0)
    );
  });

  let balance =
    toNumber(finalBalance);

  for (let index = 0;
       index < groups.length;
       index++) {
    const group =
      groups[index];

    // Latest payment:
    // final balance itself.
    //
    // Older payment:
    // add later payment amount
    // before showing balance.
    group.remaining_balance =
      Number(
        balance.toFixed(2)
      );

    balance +=
      toNumber(
        group.amount
      );
  }

  return groups;
}


// ============================================================
// TODAY COLLECTION
// ============================================================

async function getTodayCollections() {
  // ==========================================================
  // DIWALI RAW COLLECTIONS
  // ==========================================================

  const [diwaliRows] =
    await pool.query(`
      SELECT
        t.id,
        t.enrollment_id,
        t.week_number,

        t.amount,
        t.payment_mode,
        t.payment_date,
        t.receipt_number,
        t.payment_group_id,
        t.created_at,

        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,

        e.current_chits,

        DATE_FORMAT(
          t.created_at,
          '%h:%i %p'
        ) AS payment_time

      FROM diwali_payment_transactions t

      INNER JOIN diwali_enrollments e
        ON e.id = t.enrollment_id

      INNER JOIN customers c
        ON c.id = e.customer_id

      WHERE t.payment_date = CURDATE()
        AND t.status = 'Active'

      ORDER BY
        t.created_at DESC,
        t.id DESC
    `);


  // ==========================================================
  // DIWALI FINAL BALANCE
  // ==========================================================

  const [
    diwaliBalanceRows
  ] = await pool.query(`
    SELECT
      e.id AS enrollment_id,

      COALESCE(
        SUM(
          GREATEST(
            w.amount_due -
            w.amount_paid,
            0
          )
        ),
        0
      ) AS remaining_balance

    FROM diwali_enrollments e

    INNER JOIN diwali_enrollment_weeks w
      ON w.enrollment_id = e.id

    WHERE e.id IN (
      SELECT DISTINCT
        enrollment_id
      FROM diwali_payment_transactions
      WHERE payment_date = CURDATE()
        AND status = 'Active'
    )

    AND w.status <> 'Paid'

    GROUP BY
      e.id
  `);


  const diwaliBalanceMap =
    new Map();

  for (
    const row of diwaliBalanceRows
  ) {
    diwaliBalanceMap.set(
      Number(row.enrollment_id),
      toNumber(
        row.remaining_balance
      )
    );
  }


  // ==========================================================
  // GROUP DIWALI PAYMENTS
  // ==========================================================

  const diwaliGrouped =
    groupPayments(
      diwaliRows,
      'Diwali'
    );


  // ==========================================================
  // CALCULATE DIWALI HISTORICAL BALANCE
  // ==========================================================

  const diwaliByEnrollment =
    new Map();

  for (
    const row of diwaliGrouped
  ) {
    const enrollmentId =
      Number(
        row.enrollment_id
      );

    if (
      !diwaliByEnrollment.has(
        enrollmentId
      )
    ) {
      diwaliByEnrollment.set(
        enrollmentId,
        []
      );
    }

    diwaliByEnrollment
      .get(enrollmentId)
      .push(row);
  }


  const finalDiwaliRows = [];

  for (
    const [
      enrollmentId,
      groups
    ] of diwaliByEnrollment
  ) {
    const finalBalance =
      diwaliBalanceMap.get(
        enrollmentId
      ) || 0;

    const calculated =
      calculateHistoricalBalances(
        groups,
        finalBalance
      );

    finalDiwaliRows.push(
      ...calculated
    );
  }


  // ==========================================================
  // EMI RAW COLLECTIONS
  // ==========================================================

  const [emiRows] =
    await pool.query(`
      SELECT
        p.id,
        p.enrollment_id,
        p.installment_id,

        p.amount,
        p.payment_mode,
        p.payment_date,
        p.receipt_number,
        p.created_at,

        i.week_no,
        i.amount AS installment_amount,
        i.paid_amount AS installment_paid_amount,

        c.id AS customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,

        e.scheme_id,

        s.name AS scheme_name,

        DATE_FORMAT(
          p.created_at,
          '%h:%i %p'
        ) AS payment_time

      FROM emi_payment_transactions p

      INNER JOIN emi_installments i
        ON i.id = p.installment_id

      INNER JOIN enrollments e
        ON e.id = p.enrollment_id

      INNER JOIN customers c
        ON c.id = e.customer_id

      LEFT JOIN emi_schemes s
        ON s.id = e.scheme_id

      WHERE p.payment_date = CURDATE()
        AND p.status = 'Active'

      ORDER BY
        p.created_at DESC,
        p.id DESC
    `);


  // ==========================================================
  // EMI FINAL BALANCE
  // ==========================================================

  const [
    emiBalanceRows
  ] = await pool.query(`
    SELECT
      e.id AS enrollment_id,

      COALESCE(
        SUM(
          GREATEST(
            i.amount -
            i.paid_amount,
            0
          )
        ),
        0
      ) AS remaining_balance

    FROM enrollments e

    INNER JOIN emi_installments i
      ON i.enrollment_id = e.id

    WHERE e.id IN (
      SELECT DISTINCT
        enrollment_id
      FROM emi_payment_transactions
      WHERE payment_date = CURDATE()
        AND status = 'Active'
    )

    GROUP BY
      e.id
  `);


  const emiBalanceMap =
    new Map();

  for (
    const row of emiBalanceRows
  ) {
    emiBalanceMap.set(
      Number(row.enrollment_id),
      toNumber(
        row.remaining_balance
      )
    );
  }


  // ==========================================================
  // GROUP EMI PAYMENTS
  // ==========================================================

  const emiGrouped =
    groupPayments(
      emiRows,
      'EMI'
    );


  // ==========================================================
  // CALCULATE EMI HISTORICAL BALANCE
  // ==========================================================

  const emiByEnrollment =
    new Map();

  for (
    const row of emiGrouped
  ) {
    const enrollmentId =
      Number(
        row.enrollment_id
      );

    if (
      !emiByEnrollment.has(
        enrollmentId
      )
    ) {
      emiByEnrollment.set(
        enrollmentId,
        []
      );
    }

    emiByEnrollment
      .get(enrollmentId)
      .push(row);
  }


  const finalEmiRows = [];

  for (
    const [
      enrollmentId,
      groups
    ] of emiByEnrollment
  ) {
    const finalBalance =
      emiBalanceMap.get(
        enrollmentId
      ) || 0;

    const calculated =
      calculateHistoricalBalances(
        groups,
        finalBalance
      );

    finalEmiRows.push(
      ...calculated
    );
  }


  // ==========================================================
  // FINAL SORT
  // ==========================================================

  finalDiwaliRows.sort(
    (a, b) => {
      const dateA =
        new Date(
          a.created_at
        ).getTime();

      const dateB =
        new Date(
          b.created_at
        ).getTime();

      return dateB - dateA;
    }
  );

  finalEmiRows.sort(
    (a, b) => {
      const dateA =
        new Date(
          a.created_at
        ).getTime();

      const dateB =
        new Date(
          b.created_at
        ).getTime();

      return dateB - dateA;
    }
  );


  return {
    diwali:
      finalDiwaliRows,

    emi:
      finalEmiRows,
  };
}


// ============================================================
// TODAY COLLECTION SUMMARY
// ============================================================

async function getTodayCollectionSummary() {
  const [rows] =
    await pool.query(`
      SELECT
        payment_type,
        payment_mode,
        COUNT(*) AS transaction_count,

        COALESCE(
          SUM(amount),
          0
        ) AS total_amount

      FROM (

        SELECT
          'Diwali' AS payment_type,
          payment_mode,
          amount

        FROM diwali_payment_transactions

        WHERE payment_date = CURDATE()
          AND status = 'Active'


        UNION ALL


        SELECT
          'EMI' AS payment_type,
          payment_mode,
          amount

        FROM emi_payment_transactions

        WHERE payment_date = CURDATE()
          AND status = 'Active'

      ) AS all_payments

      GROUP BY
        payment_type,
        payment_mode

      ORDER BY
        payment_type,
        payment_mode
    `);


  let totalAmount = 0;
  let cashAmount = 0;
  let upiAmount = 0;
  let transactionCount = 0;


  for (
    const row of rows
  ) {
    const amount =
      Number(
        row.total_amount || 0
      );

    const count =
      Number(
        row.transaction_count || 0
      );

    totalAmount +=
      amount;

    transactionCount +=
      count;


    if (
      String(
        row.payment_mode || ''
      ).toLowerCase() ===
      'cash'
    ) {
      cashAmount +=
        amount;
    }


    if (
      String(
        row.payment_mode || ''
      ).toLowerCase() ===
      'upi'
    ) {
      upiAmount +=
        amount;
    }
  }


  return {
    byPaymentType:
      rows,

    totalAmount,

    cashAmount,

    upiAmount,

    transactionCount,
  };
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  getTodayCollections,
  getTodayCollectionSummary,
};