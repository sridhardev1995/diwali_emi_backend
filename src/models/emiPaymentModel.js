const pool = require('../config/db');

const {
  getNextReceiptNumber,
} = require('../utils/receiptNumber');


// ============================================================
// VALIDATE PAYMENT MODE
// ============================================================

function validatePaymentMode(paymentMode) {
  if (!['Cash', 'UPI'].includes(paymentMode)) {
    throw new Error(
      'Payment mode must be Cash or UPI'
    );
  }
}


// ============================================================
// VALIDATE PAYMENT AMOUNT
// ============================================================

function validatePaymentAmount(amount) {
  const paymentAmount = Number(amount);

  if (
    !Number.isFinite(paymentAmount) ||
    paymentAmount <= 0
  ) {
    throw new Error(
      'Payment amount must be greater than zero'
    );
  }

  return paymentAmount;
}


// ============================================================
// GET INSTALLMENT + ENROLLMENT
// ============================================================

async function getInstallmentForUpdate(
  connection,
  enrollmentId,
  installmentId
) {
  const [installmentRows] =
    await connection.query(
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
      [installmentId]
    );

  if (installmentRows.length === 0) {
    throw new Error(
      'EMI installment not found'
    );
  }

  const installment =
    installmentRows[0];

  if (
    Number(installment.enrollment_id) !==
    Number(enrollmentId)
  ) {
    throw new Error(
      'Installment does not belong to this enrollment'
    );
  }

  const [enrollmentRows] =
    await connection.query(
      `
        SELECT
          id,
          status
        FROM enrollments
        WHERE id = ?
        LIMIT 1
      `,
      [enrollmentId]
    );

  if (enrollmentRows.length === 0) {
    throw new Error(
      'Enrollment not found'
    );
  }

  const enrollment =
    enrollmentRows[0];

  if (
    enrollment.status === 'Closed' ||
    enrollment.status === 'Cancelled'
  ) {
    throw new Error(
      `Cannot collect payment for a ${enrollment.status.toLowerCase()} enrollment`
    );
  }

  return {
    installment,
    enrollment,
  };
}


// ============================================================
// CREATE SINGLE PAYMENT
//
// Supports:
// - Cash
// - UPI
//
// Receipt:
// SMC-26-27-000001
// ============================================================

async function createPayment({
  enrollmentId,
  installmentId,
  amount,
  paymentMode,
  paymentDate,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------------
    // Validate payment mode
    // --------------------------------------------------------

    validatePaymentMode(
      paymentMode
    );

    // --------------------------------------------------------
    // Validate amount
    // --------------------------------------------------------

    const paymentAmount =
      validatePaymentAmount(amount);

    // --------------------------------------------------------
    // Lock installment
    // --------------------------------------------------------

    const {
      installment,
    } =
      await getInstallmentForUpdate(
        connection,
        enrollmentId,
        installmentId
      );

    // --------------------------------------------------------
    // Current values
    // --------------------------------------------------------

    const installmentAmount =
      Number(
        installment.amount || 0
      );

    const currentPaid =
      Number(
        installment.paid_amount || 0
      );

    const currentBalance =
      Math.max(
        installmentAmount -
        currentPaid,
        0
      );

    // --------------------------------------------------------
    // Already paid
    // --------------------------------------------------------

    if (currentBalance <= 0) {
      throw new Error(
        'This EMI is already fully paid'
      );
    }

    // --------------------------------------------------------
    // Prevent overpayment
    // --------------------------------------------------------

    if (
      paymentAmount >
      currentBalance + 0.001
    ) {
      throw new Error(
        `Payment cannot exceed remaining balance of ₹${currentBalance.toFixed(2)}`
      );
    }

    // --------------------------------------------------------
    // Generate receipt number
    //
    // IMPORTANT:
    // Same DB connection is used here.
    //
    // Therefore receipt sequence is protected
    // inside the current transaction.
    // --------------------------------------------------------

    const receiptNumber =
      await getNextReceiptNumber(
        connection,
        paymentDate
      );

    // --------------------------------------------------------
    // Insert payment transaction
    // --------------------------------------------------------

    const [paymentResult] =
      await connection.query(
        `
          INSERT INTO emi_payment_transactions
          (
            enrollment_id,
            installment_id,
            amount,
            payment_mode,
            payment_date,
            receipt_number,
            status
          )
          VALUES (?, ?, ?, ?, ?, ?, 'Active')
        `,
        [
          enrollmentId,
          installmentId,
          paymentAmount,
          paymentMode,
          paymentDate,
          receiptNumber,
        ]
      );

    // --------------------------------------------------------
    // Calculate new values
    // --------------------------------------------------------

    const newPaid =
      Math.round(
        (
          currentPaid +
          paymentAmount
        ) * 100
      ) / 100;

    const newBalance =
      Math.round(
        (
          installmentAmount -
          newPaid
        ) * 100
      ) / 100;

    const newStatus =
      newBalance <= 0
        ? 'Paid'
        : 'Partial';

    // --------------------------------------------------------
    // Update installment
    // --------------------------------------------------------

    await connection.query(
      `
        UPDATE emi_installments
        SET
          paid_amount = ?,
          paid_date = ?,
          status = ?
        WHERE id = ?
      `,
      [
        newPaid,
        paymentDate,
        newStatus,
        installmentId,
      ]
    );

    // --------------------------------------------------------
    // Commit
    // --------------------------------------------------------

    await connection.commit();

    // --------------------------------------------------------
    // Return payment details
    // --------------------------------------------------------

    return {
      paymentId:
        paymentResult.insertId,

      installmentId:
        Number(installmentId),

      enrollmentId:
        Number(enrollmentId),

      amount:
        paymentAmount,

      paymentMode,

      paymentDate,

      receiptNumber,

      paidAmount:
        newPaid,

      balance:
        newBalance,

      status:
        newStatus,
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}


// ============================================================
// CREATE MULTIPLE PAYMENTS
//
// Used for SPLIT PAYMENT.
//
// Example:
//
// Cash = ₹400
// UPI  = ₹600
//
// Both payment rows will use the SAME receipt number.
//
// Example:
//
// Cash -> SMC-26-27-000010
// UPI  -> SMC-26-27-000010
// ============================================================

async function createPayments({
  enrollmentId,
  installmentId,
  payments,
  paymentDate,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------------
    // Validate payments array
    // --------------------------------------------------------

    if (
      !Array.isArray(payments) ||
      payments.length === 0
    ) {
      throw new Error(
        'At least one payment is required'
      );
    }

    // --------------------------------------------------------
    // Normalize payments
    // --------------------------------------------------------

    const normalizedPayments =
      payments.map((payment) => ({
        amount:
          validatePaymentAmount(
            payment.amount
          ),

        paymentMode:
          payment.paymentMode,
      }));

    // --------------------------------------------------------
    // Validate payment modes
    // --------------------------------------------------------

    for (
      const payment of normalizedPayments
    ) {
      validatePaymentMode(
        payment.paymentMode
      );
    }

    // --------------------------------------------------------
    // Lock installment + enrollment
    // --------------------------------------------------------

    const {
      installment,
    } =
      await getInstallmentForUpdate(
        connection,
        enrollmentId,
        installmentId
      );

    // --------------------------------------------------------
    // Current values
    // --------------------------------------------------------

    const installmentAmount =
      Number(
        installment.amount || 0
      );

    const currentPaid =
      Number(
        installment.paid_amount || 0
      );

    const currentBalance =
      Math.max(
        installmentAmount -
        currentPaid,
        0
      );

    // --------------------------------------------------------
    // Already fully paid
    // --------------------------------------------------------

    if (currentBalance <= 0) {
      throw new Error(
        'This EMI is already fully paid'
      );
    }

    // --------------------------------------------------------
    // Calculate total split payment
    // --------------------------------------------------------

    const totalPayment =
      normalizedPayments.reduce(
        (sum, payment) =>
          sum + payment.amount,
        0
      );

    const roundedTotal =
      Math.round(
        totalPayment * 100
      ) / 100;

    // --------------------------------------------------------
    // Prevent overpayment
    // --------------------------------------------------------

    if (
      roundedTotal >
      currentBalance + 0.001
    ) {
      throw new Error(
        `Payment cannot exceed remaining balance of ₹${currentBalance.toFixed(2)}`
      );
    }

    // --------------------------------------------------------
    // Generate ONE receipt number
    //
    // IMPORTANT:
    // Split payment gets only ONE receipt.
    // --------------------------------------------------------

    const receiptNumber =
      await getNextReceiptNumber(
        connection,
        paymentDate
      );

    // --------------------------------------------------------
    // Insert all payment transactions
    // --------------------------------------------------------

    const createdPayments = [];

    for (
      const payment of normalizedPayments
    ) {
      const [paymentResult] =
        await connection.query(
          `
            INSERT INTO emi_payment_transactions
            (
              enrollment_id,
              installment_id,
              amount,
              payment_mode,
              payment_date,
              receipt_number,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'Active')
          `,
          [
            enrollmentId,
            installmentId,
            payment.amount,
            payment.paymentMode,
            paymentDate,
            receiptNumber,
          ]
        );

      createdPayments.push({
        paymentId:
          paymentResult.insertId,

        installmentId:
          Number(installmentId),

        enrollmentId:
          Number(enrollmentId),

        amount:
          payment.amount,

        paymentMode:
          payment.paymentMode,

        paymentDate,

        receiptNumber,
      });
    }

    // --------------------------------------------------------
    // Calculate final installment values
    // --------------------------------------------------------

    const newPaid =
      Math.round(
        (
          currentPaid +
          roundedTotal
        ) * 100
      ) / 100;

    const newBalance =
      Math.round(
        (
          installmentAmount -
          newPaid
        ) * 100
      ) / 100;

    const newStatus =
      newBalance <= 0
        ? 'Paid'
        : 'Partial';

    // --------------------------------------------------------
    // Update installment once
    // --------------------------------------------------------

    await connection.query(
      `
        UPDATE emi_installments
        SET
          paid_amount = ?,
          paid_date = ?,
          status = ?
        WHERE id = ?
      `,
      [
        newPaid,
        paymentDate,
        newStatus,
        installmentId,
      ]
    );

    // --------------------------------------------------------
    // Commit
    // --------------------------------------------------------

    await connection.commit();

    // --------------------------------------------------------
    // Return result
    // --------------------------------------------------------

    return {
      payments:
        createdPayments,

      totalAmount:
        roundedTotal,

      receiptNumber,

      installmentId:
        Number(installmentId),

      enrollmentId:
        Number(enrollmentId),

      paidAmount:
        newPaid,

      balance:
        newBalance,

      status:
        newStatus,
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}


// ============================================================
// GET PAYMENT HISTORY
// ============================================================

async function getPaymentHistory(
  installmentId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          p.*,
          a.username AS reversed_by_username
        FROM emi_payment_transactions p
        LEFT JOIN admins a
          ON a.id = p.reversed_by
        WHERE p.installment_id = ?
        ORDER BY
          p.payment_date DESC,
          p.id DESC
      `,
      [installmentId]
    );

  return rows;
}


// ============================================================
// GET ACTIVE PAYMENT TOTAL
// ============================================================

async function getActivePaymentTotal(
  installmentId
) {
  const [rows] =
    await pool.query(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_paid
        FROM emi_payment_transactions
        WHERE installment_id = ?
      `,
      [installmentId]
    );

  return Number(
    rows[0]?.total_paid || 0
  );
}


// ============================================================
// GET PAYMENT SUMMARY
//
// Returns:
// - Total paid
// - Cash total
// - UPI total
// ============================================================

async function getPaymentSummary(
  installmentId
) {
  const [rows] =
    await pool.query(
      `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_paid,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                 AND payment_mode = 'Cash'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS cash_total,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                 AND payment_mode = 'UPI'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS upi_total

        FROM emi_payment_transactions

        WHERE installment_id = ?
      `,
      [installmentId]
    );

  return {
    totalPaid:
      Number(
        rows[0]?.total_paid || 0
      ),

    cashTotal:
      Number(
        rows[0]?.cash_total || 0
      ),

    upiTotal:
      Number(
        rows[0]?.upi_total || 0
      ),
  };
}


// ============================================================
// GET ENROLLMENT PAYMENT SUMMARY
//
// Returns:
// - Total collected
// - Cash total
// - UPI total
// ============================================================

async function getEnrollmentPaymentSummary(
  enrollmentId
) {
  const [rows] =
    await pool.query(
      `
        SELECT

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS total_collected,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                 AND payment_mode = 'Cash'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS cash_total,

          COALESCE(
            SUM(
              CASE
                WHEN status = 'Active'
                 AND payment_mode = 'UPI'
                THEN amount
                ELSE 0
              END
            ),
            0
          ) AS upi_total

        FROM emi_payment_transactions

        WHERE enrollment_id = ?
      `,
      [enrollmentId]
    );

  return {
    totalCollected:
      Number(
        rows[0]?.total_collected || 0
      ),

    cashTotal:
      Number(
        rows[0]?.cash_total || 0
      ),

    upiTotal:
      Number(
        rows[0]?.upi_total || 0
      ),
  };
}


// ============================================================
// REVERSE PAYMENT
//
// paymentId = emi_payment_transactions.id
//
// IMPORTANT:
// Receipt number is NOT changed/reused after reversal.
// ============================================================

async function reversePayment({
  paymentId,
  reversedBy,
  reason,
}) {
  const connection =
    await pool.getConnection();

  try {
    await connection.beginTransaction();

    // --------------------------------------------------------
    // Lock payment transaction
    // --------------------------------------------------------

    const [paymentRows] =
      await connection.query(
        `
          SELECT *
          FROM emi_payment_transactions
          WHERE id = ?
          FOR UPDATE
        `,
        [paymentId]
      );

    if (paymentRows.length === 0) {
      throw new Error(
        'Payment transaction not found'
      );
    }

    const payment =
      paymentRows[0];

    // --------------------------------------------------------
    // Already reversed
    // --------------------------------------------------------

    if (
      payment.status === 'Reversed'
    ) {
      throw new Error(
        'Payment is already reversed'
      );
    }

    // --------------------------------------------------------
    // Lock installment
    // --------------------------------------------------------

    const [installmentRows] =
      await connection.query(
        `
          SELECT *
          FROM emi_installments
          WHERE id = ?
          FOR UPDATE
        `,
        [payment.installment_id]
      );

    if (installmentRows.length === 0) {
      throw new Error(
        'EMI installment not found'
      );
    }

    const installment =
      installmentRows[0];

    // --------------------------------------------------------
    // Current paid amount
    // --------------------------------------------------------

    const oldPaid =
      Number(
        installment.paid_amount || 0
      );

    const reversedAmount =
      Number(
        payment.amount || 0
      );

    // --------------------------------------------------------
    // Calculate new paid amount
    // --------------------------------------------------------

    const newPaid =
      Math.max(
        oldPaid -
        reversedAmount,
        0
      );

    const installmentAmount =
      Number(
        installment.amount || 0
      );

    const newBalance =
      Math.max(
        installmentAmount -
        newPaid,
        0
      );

    // --------------------------------------------------------
    // Calculate new status
    // --------------------------------------------------------

    let newStatus;

    if (newPaid <= 0) {
      newStatus = 'Pending';

    } else if (
      newBalance <= 0
    ) {
      newStatus = 'Paid';

    } else {
      newStatus = 'Partial';
    }

    // --------------------------------------------------------
    // Mark payment as reversed
    // --------------------------------------------------------

    await connection.query(
      `
        UPDATE emi_payment_transactions
        SET
          status = 'Reversed',
          reversed_at = NOW(),
          reversed_by = ?,
          reversal_reason = ?
        WHERE id = ?
      `,
      [
        reversedBy || null,
        reason || null,
        paymentId,
      ]
    );

    // --------------------------------------------------------
    // Update installment
    // --------------------------------------------------------

    await connection.query(
      `
        UPDATE emi_installments
        SET
          paid_amount = ?,
          status = ?,
          paid_date =
            CASE
              WHEN ? = 'Pending'
              THEN NULL
              ELSE paid_date
            END
        WHERE id = ?
      `,
      [
        newPaid,
        newStatus,
        newStatus,
        payment.installment_id,
      ]
    );

    // --------------------------------------------------------
    // Commit
    // --------------------------------------------------------

    await connection.commit();

    // --------------------------------------------------------
    // Return reversal details
    // --------------------------------------------------------

    return {
      paymentId:
        Number(paymentId),

      installmentId:
        Number(
          payment.installment_id
        ),

      reversedAmount,

      receiptNumber:
        payment.receipt_number || null,

      paidAmount:
        newPaid,

      balance:
        newBalance,

      status:
        newStatus,
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
  createPayment,
  createPayments,
  getPaymentHistory,
  getActivePaymentTotal,
  getPaymentSummary,
  getEnrollmentPaymentSummary,
  reversePayment,
};