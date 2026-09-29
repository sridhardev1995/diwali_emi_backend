const crypto = require('crypto');
const pool = require('../config/db');

const {
  getNextReceiptNumber,
} = require('../utils/receiptNumber');

// ============================================================
// HELPERS
// ============================================================

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function createPaymentGroupId() {
  return crypto.randomUUID();
}

function getWeekStatus(amountDue, amountPaid) {
  const due = Number(amountDue);
  const paid = Number(amountPaid);

  if (paid <= 0) {
    return 'Unpaid';
  }

  if (paid >= due) {
    return 'Paid';
  }

  return 'Partial';
}

// ============================================================
// ENROLLMENT
// ============================================================

async function enroll({ customerId, schemeId, chits }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (
      !Number.isInteger(Number(chits)) ||
      Number(chits) <= 0
    ) {
      throw new Error(
        'Chits must be a positive whole number'
      );
    }

    const [schemeRows] =
      await connection.query(
        `
        SELECT *
        FROM diwali_schemes
        WHERE id = ?
        LIMIT 1
        `,
        [schemeId]
      );

    const scheme = schemeRows[0];

    if (!scheme) {
      throw new Error('Scheme not found');
    }

    if (scheme.status !== 'Active') {
      throw new Error(
        'Cannot enroll into an inactive scheme'
      );
    }

    const [result] =
      await connection.query(
        `
        INSERT INTO diwali_enrollments
        (
          customer_id,
          scheme_id,
          original_chits,
          current_chits,
          status
        )
        VALUES (?, ?, ?, ?, 'Active')
        `,
        [
          customerId,
          schemeId,
          chits,
          chits
        ]
      );

    const enrollmentId =
      result.insertId;

    const durationWeeks =
      Number(scheme.duration_weeks);

    const chitValue =
      Number(scheme.chit_value);

    const weeklyRows = [];

    for (
      let week = 1;
      week <= durationWeeks;
      week++
    ) {
      weeklyRows.push([
        enrollmentId,
        week,
        addDays(
          scheme.start_date,
          (week - 1) * 7
        ),
        chits,
        Math.round(
          chitValue *
          chits *
          100
        ) / 100,
        0,
        null,
        null,
        'Unpaid'
      ]);
    }

    await connection.query(
      `
      INSERT INTO diwali_enrollment_weeks
      (
        enrollment_id,
        week_number,
        due_date,
        chits,
        amount_due,
        amount_paid,
        payment_date,
        payment_mode,
        status
      )
      VALUES ?
      `,
      [weeklyRows]
    );

    await connection.commit();

    return {
      enrollmentId,
      weeklyAmount:
        chitValue * chits,

      totalPayable:
        chitValue *
        chits *
        durationWeeks,

      maturityReturn:
        (
          chitValue *
          durationWeeks +
          Number(
            scheme.bonus_per_chit
          )
        ) * chits
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// LIST
// ============================================================

async function findAll({
  page = 1,
  limit = 20,
  customerId = '',
  schemeId = '',
  status = ''
}) {
  const offset =
    (page - 1) * limit;

  const params = [];

  let where =
    'WHERE 1=1';

  if (customerId) {
    where +=
      ' AND e.customer_id = ?';

    params.push(customerId);
  }

  if (schemeId) {
    where +=
      ' AND e.scheme_id = ?';

    params.push(schemeId);
  }

  if (status) {
    where +=
      ' AND e.status = ?';

    params.push(status);
  }

  const [rows] =
    await pool.query(
      `
      SELECT
        e.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        s.scheme_name,
        s.chit_value,
        s.bonus_per_chit,
        s.duration_weeks,

        COALESCE(
          (
            SELECT SUM(w.amount_due)
            FROM diwali_enrollment_weeks w
            WHERE w.enrollment_id = e.id
          ),
          0
        ) AS total_due,

        COALESCE(
          (
            SELECT SUM(w.amount_paid)
            FROM diwali_enrollment_weeks w
            WHERE w.enrollment_id = e.id
          ),
          0
        ) AS total_paid

      FROM diwali_enrollments e

      JOIN customers c
        ON c.id = e.customer_id

      JOIN diwali_schemes s
        ON s.id = e.scheme_id

      ${where}

      ORDER BY e.id DESC

      LIMIT ? OFFSET ?
      `,
      [
        ...params,
        Number(limit),
        Number(offset)
      ]
    );

  const [countRows] =
    await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM diwali_enrollments e
      ${where}
      `,
      params
    );

  return {
    rows,
    total:
      countRows[0].total
  };
}

// ============================================================
// SINGLE ENROLLMENT
// ============================================================

async function findById(id) {
  const [rows] =
    await pool.query(
      `
      SELECT
        e.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.address AS customer_address,
        s.scheme_name,
        s.chit_value,
        s.bonus_per_chit,
        s.duration_weeks,
        s.start_date

      FROM diwali_enrollments e

      JOIN customers c
        ON c.id = e.customer_id

      JOIN diwali_schemes s
        ON s.id = e.scheme_id

      WHERE e.id = ?

      LIMIT 1
      `,
      [id]
    );

  return rows[0] || null;
}

// ============================================================
// WEEK LIST
// ============================================================

async function getWeeks(
  enrollmentId
) {
  const [rows] =
    await pool.query(
      `
      SELECT *
      FROM diwali_enrollment_weeks
      WHERE enrollment_id = ?
      ORDER BY week_number ASC
      `,
      [enrollmentId]
    );

  return rows;
}

// ============================================================
// SINGLE WEEK
// ============================================================

async function getWeek(
  enrollmentId,
  weekNumber
) {
  const [rows] =
    await pool.query(
      `
      SELECT *
      FROM diwali_enrollment_weeks
      WHERE enrollment_id = ?
        AND week_number = ?
      LIMIT 1
      `,
      [
        enrollmentId,
        weekNumber
      ]
    );

  return rows[0] || null;
}

// ============================================================
// RECALCULATE WEEK
// FROM ACTIVE TRANSACTIONS
// ============================================================

async function recalculateWeek(
  connection,
  enrollmentId,
  weekNumber
) {
  const [weekRows] =
    await connection.query(
      `
      SELECT *
      FROM diwali_enrollment_weeks
      WHERE enrollment_id = ?
        AND week_number = ?
      FOR UPDATE
      `,
      [
        enrollmentId,
        weekNumber
      ]
    );

  const week =
    weekRows[0];

  if (!week) {
    throw new Error(
      `Week ${weekNumber} not found for enrollment ${enrollmentId}`
    );
  }

  const [paymentRows] =
    await connection.query(
      `
      SELECT
        COALESCE(
          SUM(amount),
          0
        ) AS total_paid,

        MAX(payment_date)
          AS latest_payment_date

      FROM diwali_payment_transactions

      WHERE enrollment_id = ?
        AND week_number = ?
        AND status = 'Active'
      `,
      [
        enrollmentId,
        weekNumber
      ]
    );

  const totalPaid =
    Number(
      paymentRows[0].total_paid || 0
    );

  const status =
    getWeekStatus(
      Number(week.amount_due),
      totalPaid
    );

  const latestPaymentDate =
    totalPaid > 0
      ? paymentRows[0]
          .latest_payment_date
      : null;

  const [modeRows] =
    await connection.query(
      `
      SELECT payment_mode
      FROM diwali_payment_transactions
      WHERE enrollment_id = ?
        AND week_number = ?
        AND status = 'Active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [
        enrollmentId,
        weekNumber
      ]
    );

  const latestPaymentMode =
    modeRows[0]?.payment_mode ||
    null;

  await connection.query(
    `
    UPDATE diwali_enrollment_weeks
    SET
      amount_paid = ?,
      payment_date = ?,
      payment_mode = ?,
      status = ?

    WHERE enrollment_id = ?
      AND week_number = ?
    `,
    [
      totalPaid,
      latestPaymentDate,
      latestPaymentMode,
      status,
      enrollmentId,
      weekNumber
    ]
  );

  return {
    ...week,

    amount_paid:
      totalPaid,

    payment_date:
      latestPaymentDate,

    payment_mode:
      latestPaymentMode,

    status
  };
}

// ============================================================
// SINGLE / MULTIPLE WEEK PAYMENT
//
// Receipt behaviour:
//
// Single payment:
//   SMC-26-27-000001
//
// Multiple payment / split payment:
//   All rows use SAME receipt number.
//
// Example:
//
// Cash ₹500
// UPI  ₹500
//
// Both:
//   SMC-26-27-000002
// ============================================================

async function payWeek(
  enrollmentId,
  weekNumber,
  {
    amountPaid,
    paymentDate,
    paymentMode,
    payments
  }
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------------
    // Normalize payment items
    // --------------------------------------------------------

    const paymentItems =
      Array.isArray(payments)
        ? payments
        : [
            {
              amountPaid,
              paymentDate,
              paymentMode
            }
          ];

    if (!paymentItems.length) {
      throw new Error(
        'At least one payment is required'
      );
    }

    // --------------------------------------------------------
    // Create payment group
    // --------------------------------------------------------

    const groupId =
      createPaymentGroupId();

    // --------------------------------------------------------
    // Receipt date
    //
    // For multiple payment items, use the first payment date.
    // --------------------------------------------------------

    const receiptDate =
      paymentItems[0].paymentDate ||
      paymentDate ||
      new Date()
        .toISOString()
        .slice(0, 10);

    // --------------------------------------------------------
    // Generate ONE receipt number
    //
    // IMPORTANT:
    // All payment rows in this call use the same receipt.
    // --------------------------------------------------------

    const receiptNumber =
      await getNextReceiptNumber(
        connection,
        receiptDate
      );

    // --------------------------------------------------------
    // Insert payment transactions
    // --------------------------------------------------------

    for (
      const payment of paymentItems
    ) {
      const amount =
        Number(
          payment.amountPaid
        );

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        throw new Error(
          'Payment amount must be greater than zero'
        );
      }

      const date =
        payment.paymentDate ||
        paymentDate ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const mode =
        payment.paymentMode ||
        paymentMode ||
        'Cash';

      // ------------------------------------------------------
      // Lock week
      // ------------------------------------------------------

      const [weekRows] =
        await connection.query(
          `
          SELECT *
          FROM diwali_enrollment_weeks
          WHERE enrollment_id = ?
            AND week_number = ?
          FOR UPDATE
          `,
          [
            enrollmentId,
            weekNumber
          ]
        );

      const week =
        weekRows[0];

      if (!week) {
        throw new Error(
          'Week not found'
        );
      }

      // ------------------------------------------------------
      // Get current active paid amount
      // ------------------------------------------------------

      const [paidRows] =
        await connection.query(
          `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS paid

          FROM diwali_payment_transactions

          WHERE enrollment_id = ?
            AND week_number = ?
            AND status = 'Active'
          `,
          [
            enrollmentId,
            weekNumber
          ]
        );

      const currentPaid =
        Number(
          paidRows[0].paid || 0
        );

      const outstanding =
        Number(
          week.amount_due
        ) -
        currentPaid;

      // ------------------------------------------------------
      // Prevent overpayment
      // ------------------------------------------------------

      if (
        amount >
        outstanding + 0.001
      ) {
        throw new Error(
          `Payment exceeds outstanding amount. Outstanding: ₹${outstanding.toFixed(2)}`
        );
      }

      // ------------------------------------------------------
      // Insert payment
      // ------------------------------------------------------

      await connection.query(
        `
        INSERT INTO diwali_payment_transactions
        (
          enrollment_id,
          week_number,
          amount,
          payment_mode,
          payment_date,
          receipt_number,
          payment_group_id,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
        `,
        [
          enrollmentId,
          weekNumber,
          amount,
          mode,
          date,
          receiptNumber,
          groupId
        ]
      );
    }

    // --------------------------------------------------------
    // Recalculate week
    // --------------------------------------------------------

    const updatedWeek =
      await recalculateWeek(
        connection,
        enrollmentId,
        weekNumber
      );

    // --------------------------------------------------------
    // Commit
    // --------------------------------------------------------

    await connection.commit();

    // --------------------------------------------------------
    // Return
    // --------------------------------------------------------

    return {
      paymentGroupId:
        groupId,

      receiptNumber,

      week:
        updatedWeek
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// MODIFY CHITS
// ============================================================

async function modifyChits(
  enrollmentId,
  fromWeekNumber,
  newChits
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (
      !Number.isInteger(
        Number(newChits)
      ) ||
      Number(newChits) <= 0
    ) {
      throw new Error(
        'newChits must be a positive whole number'
      );
    }

    const [enrollmentRows] =
      await connection.query(
        `
        SELECT *
        FROM diwali_enrollments
        WHERE id = ?
        FOR UPDATE
        `,
        [enrollmentId]
      );

    const enrollment =
      enrollmentRows[0];

    if (!enrollment) {
      throw new Error(
        'Enrollment not found'
      );
    }

    const [schemeRows] =
      await connection.query(
        `
        SELECT *
        FROM diwali_schemes
        WHERE id = ?
        `,
        [enrollment.scheme_id]
      );

    const scheme =
      schemeRows[0];

    const [weeks] =
      await connection.query(
        `
        SELECT *
        FROM diwali_enrollment_weeks
        WHERE enrollment_id = ?
          AND week_number >= ?
        ORDER BY week_number ASC
        FOR UPDATE
        `,
        [
          enrollmentId,
          fromWeekNumber
        ]
      );

    let totalExcess = 0;

    const sourceWeeks = [];

    // --------------------------------------------------------
    // Calculate excess
    // --------------------------------------------------------

    for (const week of weeks) {
      const oldDue =
        Number(
          week.amount_due
        );

      const newDue =
        Number(
          scheme.chit_value
        ) *
        Number(newChits);

      const paid =
        Number(
          week.amount_paid
        );

      if (paid > newDue) {
        const excess =
          paid - newDue;

        totalExcess +=
          excess;

        sourceWeeks.push(
          week.week_number
        );

        await connection.query(
          `
          UPDATE diwali_enrollment_weeks
          SET
            chits = ?,
            amount_due = ?,
            amount_paid = ?
          WHERE id = ?
          `,
          [
            newChits,
            newDue,
            newDue,
            week.id
          ]
        );

      } else {
        await connection.query(
          `
          UPDATE diwali_enrollment_weeks
          SET
            chits = ?,
            amount_due = ?
          WHERE id = ?
          `,
          [
            newChits,
            newDue,
            week.id
          ]
        );
      }
    }

    // --------------------------------------------------------
    // Apply excess to upcoming weeks
    // --------------------------------------------------------

    if (totalExcess > 0) {
      const [futureWeeks] =
        await connection.query(
          `
          SELECT *
          FROM diwali_enrollment_weeks
          WHERE enrollment_id = ?
            AND week_number > ?
            AND status <> 'Paid'
          ORDER BY week_number ASC
          FOR UPDATE
          `,
          [
            enrollmentId,
            fromWeekNumber
          ]
        );

      let remainingExcess =
        totalExcess;

      for (
        const week of futureWeeks
      ) {
        if (
          remainingExcess <= 0
        ) {
          break;
        }

        const outstanding =
          Number(
            week.amount_due
          ) -
          Number(
            week.amount_paid
          );

        if (
          outstanding <= 0
        ) {
          continue;
        }

        const applied =
          Math.min(
            remainingExcess,
            outstanding
          );

        const newPaid =
          Number(
            week.amount_paid
          ) +
          applied;

        const newStatus =
          getWeekStatus(
            Number(
              week.amount_due
            ),
            newPaid
          );

        await connection.query(
          `
          UPDATE diwali_enrollment_weeks
          SET
            amount_paid = ?,
            status = ?
          WHERE id = ?
          `,
          [
            newPaid,
            newStatus,
            week.id
          ]
        );

        await connection.query(
          `
          INSERT INTO diwali_adjustment_logs
          (
            enrollment_id,
            source_weeks,
            source_excess_total,
            target_week,
            applied_amount,
            note
          )
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            enrollmentId,
            sourceWeeks.join(','),
            totalExcess,
            week.week_number,
            applied,
            'Excess adjusted automatically after chit reduction'
          ]
        );

        remainingExcess -=
          applied;
      }

      totalExcess =
        Math.max(
          0,
          remainingExcess
        );
    }

    // --------------------------------------------------------
    // Update enrollment chits
    // --------------------------------------------------------

    await connection.query(
      `
      UPDATE diwali_enrollments
      SET current_chits = ?
      WHERE id = ?
      `,
      [
        newChits,
        enrollmentId
      ]
    );

    await connection.commit();

    return {
      enrollmentId,
      currentChits:
        newChits,
      remainingExcess:
        totalExcess
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// ADJUSTMENT LOGS
// ============================================================

async function getAdjustmentLogs(
  enrollmentId
) {
  const [rows] =
    await pool.query(
      `
      SELECT *
      FROM diwali_adjustment_logs
      WHERE enrollment_id = ?
      ORDER BY id DESC
      `,
      [enrollmentId]
    );

  return rows;
}

// ============================================================
// TODAY DUE
// ============================================================

async function todayDue() {
  const [rows] =
    await pool.query(
      `
      SELECT
        w.*,
        e.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        e.current_chits

      FROM diwali_enrollment_weeks w

      JOIN diwali_enrollments e
        ON e.id = w.enrollment_id

      JOIN customers c
        ON c.id = e.customer_id

      WHERE w.due_date = CURDATE()
        AND w.status <> 'Paid'
        AND e.status = 'Active'

      ORDER BY c.name ASC
      `
    );

  return rows;
}

// ============================================================
// OVERDUE
// ============================================================

async function overdue() {
  const [rows] =
    await pool.query(
      `
      SELECT
        w.*,
        e.customer_id,
        c.name AS customer_name,
        c.phone AS customer_phone,
        e.current_chits

      FROM diwali_enrollment_weeks w

      JOIN diwali_enrollments e
        ON e.id = w.enrollment_id

      JOIN customers c
        ON c.id = e.customer_id

      WHERE w.due_date < CURDATE()
        AND w.status <> 'Paid'
        AND e.status = 'Active'

      ORDER BY w.due_date ASC
      `
    );

  return rows;
}

// ============================================================
// TODAY COLLECTION SUMMARY
// ============================================================

async function todayCollectionSummary() {
  const [rows] =
    await pool.query(
      `
      SELECT
        t.payment_mode,
        COUNT(*) AS transaction_count,
        COALESCE(
          SUM(t.amount),
          0
        ) AS total_amount

      FROM diwali_payment_transactions t

      WHERE t.payment_date = CURDATE()
        AND t.status = 'Active'

      GROUP BY t.payment_mode

      ORDER BY t.payment_mode
      `
    );

  return rows;
}

// ============================================================
// BULK PAYMENT
//
// Automatically applies amount oldest-first
// to unpaid/partial weeks.
//
// One bulk payment = ONE receipt number.
//
// Example:
//
// Week 1 = ₹1000
// Week 2 = ₹1000
// Week 3 = ₹500
//
// Receipt:
// SMC-26-27-000020
//
// All three transactions use the same receipt number.
// ============================================================

async function bulkPay(
  enrollmentId,
  {
    totalAmount,
    paymentDate,
    paymentMode
  }
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const amount =
      Number(totalAmount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        'Bulk payment amount must be greater than zero'
      );
    }

    const groupId =
      createPaymentGroupId();

    // --------------------------------------------------------
    // Payment date
    // --------------------------------------------------------

    const actualPaymentDate =
      paymentDate ||
      new Date()
        .toISOString()
        .slice(0, 10);

    // --------------------------------------------------------
    // Generate ONE receipt number
    //
    // Every week covered by this bulk payment
    // will use this same receipt number.
    // --------------------------------------------------------

    const receiptNumber =
      await getNextReceiptNumber(
        connection,
        actualPaymentDate
      );

    // --------------------------------------------------------
    // Get unpaid / partial weeks
    // Oldest first = FIFO
    // --------------------------------------------------------

    const [weeks] =
      await connection.query(
        `
        SELECT *
        FROM diwali_enrollment_weeks
        WHERE enrollment_id = ?
          AND status <> 'Paid'
        ORDER BY week_number ASC
        FOR UPDATE
        `,
        [enrollmentId]
      );

    let remaining =
      amount;

    // --------------------------------------------------------
    // Apply payment FIFO
    // --------------------------------------------------------

    for (const week of weeks) {
      if (
        remaining <= 0
      ) {
        break;
      }

      const outstanding =
        Number(
          week.amount_due
        ) -
        Number(
          week.amount_paid
        );

      if (
        outstanding <= 0
      ) {
        continue;
      }

      const applied =
        Math.min(
          remaining,
          outstanding
        );

      await connection.query(
        `
        INSERT INTO diwali_payment_transactions
        (
          enrollment_id,
          week_number,
          amount,
          payment_mode,
          payment_date,
          receipt_number,
          payment_group_id,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
        `,
        [
          enrollmentId,
          week.week_number,
          applied,
          paymentMode || 'Cash',
          actualPaymentDate,
          receiptNumber,
          groupId
        ]
      );

      await recalculateWeek(
        connection,
        enrollmentId,
        week.week_number
      );

      remaining -=
        applied;
    }

    // --------------------------------------------------------
    // Prevent overpayment
    // --------------------------------------------------------

    if (
      remaining > 0
    ) {
      throw new Error(
        `Payment exceeds total outstanding amount by ₹${remaining.toFixed(2)}`
      );
    }

    await connection.commit();

    return {
      paymentGroupId:
        groupId,

      receiptNumber,

      totalAmount:
        amount,

      appliedAmount:
        amount
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// PAYMENT HISTORY
// ============================================================

async function getPaymentTransactions(
  enrollmentId
) {
  const [rows] =
    await pool.query(
      `
      SELECT
        t.*,
        a.username AS reversed_by_username

      FROM diwali_payment_transactions t

      LEFT JOIN admins a
        ON a.id = t.reversed_by

      WHERE t.enrollment_id = ?

      ORDER BY t.id DESC
      `,
      [enrollmentId]
    );

  return rows;
}

// ============================================================
// SINGLE PAYMENT REVERT
//
// Receipt number is preserved.
// It will NEVER be reused.
// ============================================================

async function revertPayment(
  transactionId,
  adminId,
  reason
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [transactionRows] =
      await connection.query(
        `
        SELECT *
        FROM diwali_payment_transactions
        WHERE id = ?
        FOR UPDATE
        `,
        [transactionId]
      );

    const transaction =
      transactionRows[0];

    if (!transaction) {
      throw new Error(
        'Payment transaction not found'
      );
    }

    if (
      transaction.status ===
      'Reversed'
    ) {
      throw new Error(
        'Payment transaction is already reversed'
      );
    }

    await connection.query(
      `
      UPDATE diwali_payment_transactions
      SET
        status = 'Reversed',
        reversed_at = NOW(),
        reversed_by = ?,
        reversal_reason = ?
      WHERE id = ?
      `,
      [
        adminId,
        reason || null,
        transactionId
      ]
    );

    await recalculateWeek(
      connection,
      transaction.enrollment_id,
      transaction.week_number
    );

    await connection.commit();

    return {
      transactionId,

      enrollmentId:
        transaction.enrollment_id,

      weekNumber:
        transaction.week_number,

      reversedAmount:
        Number(
          transaction.amount
        ),

      receiptNumber:
        transaction.receipt_number ||
        null
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// BULK PAYMENT REVERT
//
// Reverts every Active transaction belonging
// to the same payment_group_id.
//
// Receipt number is preserved.
// ============================================================

async function revertBulkPayment(
  paymentGroupId,
  adminId,
  reason
) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [transactions] =
      await connection.query(
        `
        SELECT *
        FROM diwali_payment_transactions

        WHERE payment_group_id = ?
          AND status = 'Active'

        FOR UPDATE
        `,
        [paymentGroupId]
      );

    if (
      !transactions.length
    ) {
      throw new Error(
        'No active payment transactions found for this payment group'
      );
    }

    await connection.query(
      `
      UPDATE diwali_payment_transactions
      SET
        status = 'Reversed',
        reversed_at = NOW(),
        reversed_by = ?,
        reversal_reason = ?

      WHERE payment_group_id = ?
        AND status = 'Active'
      `,
      [
        adminId,
        reason || null,
        paymentGroupId
      ]
    );

    const affectedWeeks =
      new Set();

    for (
      const transaction
      of transactions
    ) {
      affectedWeeks.add(
        `${transaction.enrollment_id}:${transaction.week_number}`
      );
    }

    for (
      const key of affectedWeeks
    ) {
      const [
        enrollmentId,
        weekNumber
      ] =
        key.split(':');

      await recalculateWeek(
        connection,
        enrollmentId,
        weekNumber
      );
    }

    const totalReversed =
      transactions.reduce(
        (sum, item) =>
          sum +
          Number(item.amount),
        0
      );

    // All transactions in a payment group
    // should have the same receipt number.
    const receiptNumber =
      transactions[0]
        ?.receipt_number || null;

    await connection.commit();

    return {
      paymentGroupId,

      transactionCount:
        transactions.length,

      totalReversed,

      receiptNumber
    };

  } catch (err) {
    await connection.rollback();
    throw err;

  } finally {
    connection.release();
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  enroll,
  findAll,
  findById,
  getWeeks,
  getWeek,
  payWeek,
  modifyChits,
  getAdjustmentLogs,
  todayDue,
  overdue,
  todayCollectionSummary,
  bulkPay,
  getPaymentTransactions,
  revertPayment,
  revertBulkPayment
};