// ============================================================
// EMI INSTALLMENT CONTROLLER
// ============================================================

const emiInstallmentModel =
  require('../models/emiInstallmentModel.js');

const enrollmentModel =
  require('../models/emiEnrollmentModel.js');

const emiPaymentModel =
  require('../models/emiPaymentModel.js');


// ============================================================
// HELPER
// ============================================================

function today() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


// ============================================================
// GET /api/enrollments/:enrollmentId/emis
//
// Returns:
// - Enrollment details
// - Full weekly EMI schedule
// - Total EMIs
// - Paid EMIs
// - Total collected
// - Balance
// - Overdue EMIs
// - Payment summary
// ============================================================

async function listForEnrollment(req, res) {
  try {
    const { enrollmentId } =
      req.params;

    // ----------------------------------------------------------
    // 1. FIND ENROLLMENT
    // ----------------------------------------------------------

    const enrollment =
      await enrollmentModel.findById(
        enrollmentId
      );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message:
          'Enrollment not found',
      });
    }

    // ----------------------------------------------------------
    // 2. GET WEEKLY EMI SCHEDULE
    // ----------------------------------------------------------

    const schedule =
      await emiInstallmentModel.findByEnrollment(
        enrollmentId
      );

    // ----------------------------------------------------------
    // 3. GET EMI SUMMARY
    // ----------------------------------------------------------

    const summary =
      await emiInstallmentModel.getSummary(
        enrollmentId
      );

    // ----------------------------------------------------------
    // 4. GET PAYMENT SUMMARY
    // ----------------------------------------------------------

    const paymentSummary =
      await emiPaymentModel
        .getEnrollmentPaymentSummary(
          enrollmentId
        );

    // ----------------------------------------------------------
    // 5. RESPONSE
    // ----------------------------------------------------------

    return res.json({
      success: true,

      data: {
        enrollment,

        schedule,

        summary: {
          totalEmis:
            Number(
              summary.total_emis || 0
            ),

          paidEmis:
            Number(
              summary.paid_emis || 0
            ),

          totalCollected:
            Number(
              summary.total_collected ||
              0
            ),

          balance:
            Number(
              summary.balance || 0
            ),

          overdueEmis:
            Number(
              summary.overdue_emis || 0
            ),
        },

        paymentSummary: {
          totalCollected:
            Number(
              paymentSummary.totalCollected ||
              0
            ),

          cashTotal:
            Number(
              paymentSummary.cashTotal ||
              0
            ),

          upiTotal:
            Number(
              paymentSummary.upiTotal ||
              0
            ),
        },
      },
    });

  } catch (err) {
    console.error(
      'List EMI schedule error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching EMI schedule',
    });
  }
}


// ============================================================
// PATCH /api/emis/:id/collect
//
// SINGLE PAYMENT
//
// {
//   "status": "Paid",
//   "amount": 1000,
//   "paymentMode": "Cash",
//   "paidDate": "2026-09-23"
// }
//
// PARTIAL
//
// {
//   "status": "Partial",
//   "amount": 400,
//   "paymentMode": "UPI",
//   "paidDate": "2026-09-23"
// }
//
// SPLIT
//
// {
//   "status": "Paid",
//   "payments": [
//     {
//       "amount": 400,
//       "paymentMode": "Cash"
//     },
//     {
//       "amount": 600,
//       "paymentMode": "UPI"
//     }
//   ],
//   "paidDate": "2026-09-23"
// }
//
// UNPAID
//
// {
//   "status": "Unpaid"
// }
// ============================================================


// ============================================================
// GET /api/enrollments/collections/today-due
//
// Returns EMI installments due TODAY
// ============================================================

async function todayDue(req, res) {
  try {
    const rows =
      await emiInstallmentModel.findTodayDue();

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error(
      'Today EMI due error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching today EMI due',
    });
  }
}


// ============================================================
// GET /api/enrollments/collections/overdue
//
// Returns EMI installments which are overdue
// ============================================================

async function overdue(req, res) {
  try {
    const rows =
      await emiInstallmentModel.findOverdue();

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error(
      'Overdue EMI error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching overdue EMI',
    });
  }
}
async function collect(req, res) {
  try {
    const { id } =
      req.params;

    const {
      status,
      amount = 0,
      paymentMode,
      paidDate,
      payments,
    } = req.body;

    // ==========================================================
    // 1. VALIDATE STATUS
    // ==========================================================

    if (
      ![
        'Paid',
        'Partial',
        'Unpaid',
      ].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Status must be Paid, Partial or Unpaid',
      });
    }

    // ==========================================================
    // 2. FIND INSTALLMENT
    // ==========================================================

    const installment =
      await emiInstallmentModel.findById(
        id
      );

    if (!installment) {
      return res.status(404).json({
        success: false,
        message:
          'EMI installment not found',
      });
    }

    // ==========================================================
    // 3. FIND ENROLLMENT
    // ==========================================================

    const enrollment =
      await enrollmentModel.findById(
        installment.enrollment_id
      );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message:
          'Enrollment not found',
      });
    }

    // ==========================================================
    // 4. BLOCK CLOSED / CANCELLED ENROLLMENT
    // ==========================================================

    if (
      enrollment.status === 'Closed' ||
      enrollment.status === 'Cancelled'
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Cannot collect EMI for a ${enrollment.status.toLowerCase()} enrollment`,
      });
    }

    // ==========================================================
    // 5. CURRENT EMI VALUES
    // ==========================================================

    const installmentAmount =
      Number(
        installment.amount || 0
      );

    const existingPaid =
      Number(
        installment.paid_amount || 0
      );

    const currentBalance =
      Math.max(
        installmentAmount -
          existingPaid,
        0
      );

    // ==========================================================
    // 6. ALREADY FULLY PAID
    // ==========================================================

    if (currentBalance <= 0) {
      return res.status(400).json({
        success: false,
        message:
          'This EMI is already fully paid',
      });
    }

    // ==========================================================
    // 7. UNPAID
    //
    // Unpaid means no new payment transaction.
    // Existing active payments are NOT deleted.
    // ==========================================================

    if (status === 'Unpaid') {
      return res.status(400).json({
        success: false,
        message:
          'Use payment reversal to remove an existing payment',
      });
    }

    // ==========================================================
    // 8. RESOLVE PAYMENT DATE
    // ==========================================================

    const resolvedDate =
      paidDate || today();

    // ==========================================================
    // 9. SPLIT PAYMENT
    //
    // Example:
    //
    // Cash ₹400
    // UPI  ₹600
    //
    // Total = ₹1000
    //
    // IMPORTANT:
    // createPayments() is called ONLY ONCE.
    //
    // Therefore:
    //
    // Cash -> SMC-26-27-000001
    // UPI  -> SMC-26-27-000001
    //
    // Same receipt number.
    // ==========================================================

    if (Array.isArray(payments)) {
      if (payments.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            'At least one payment is required',
        });
      }

      // --------------------------------------------------------
      // NORMALIZE PAYMENTS
      // --------------------------------------------------------

      const normalizedPayments =
        payments.map((item) => ({
          amount:
            Number(item.amount),

          paymentMode:
            item.paymentMode,
        }));

      // --------------------------------------------------------
      // VALIDATE EACH PAYMENT
      // --------------------------------------------------------

      for (
        const payment
        of normalizedPayments
      ) {
        if (
          ![
            'Cash',
            'UPI',
          ].includes(
            payment.paymentMode
          )
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Payment mode must be Cash or UPI',
          });
        }

        if (
          !Number.isFinite(
            payment.amount
          ) ||
          payment.amount <= 0
        ) {
          return res.status(400).json({
            success: false,
            message:
              'Payment amount must be greater than zero',
          });
        }
      }

      // --------------------------------------------------------
      // TOTAL SPLIT AMOUNT
      // --------------------------------------------------------

      const totalPayment =
        normalizedPayments.reduce(
          (sum, item) =>
            sum + item.amount,
          0
        );

      const roundedTotalPayment =
        Math.round(
          totalPayment * 100
        ) / 100;

      // --------------------------------------------------------
      // PREVENT OVERPAYMENT
      // --------------------------------------------------------

      if (
        roundedTotalPayment >
        currentBalance + 0.001
      ) {
        return res.status(400).json({
          success: false,
          message:
            `Payment cannot exceed remaining balance of ₹${currentBalance.toFixed(2)}`,
        });
      }

      // --------------------------------------------------------
      // PAID STATUS MUST MATCH FULL BALANCE
      // --------------------------------------------------------

      if (
        status === 'Paid' &&
        Math.abs(
          roundedTotalPayment -
            currentBalance
        ) > 0.001
      ) {
        return res.status(400).json({
          success: false,
          message:
            `To mark Paid, collect the full remaining balance of ₹${currentBalance.toFixed(2)}`,
        });
      }

      // --------------------------------------------------------
      // PARTIAL CANNOT PAY FULL BALANCE
      // --------------------------------------------------------

      if (
        status === 'Partial' &&
        Math.abs(
          roundedTotalPayment -
            currentBalance
        ) <= 0.001
      ) {
        return res.status(400).json({
          success: false,
          message:
            'Use Paid status when collecting the full remaining balance',
        });
      }

      // --------------------------------------------------------
      // CREATE ALL SPLIT PAYMENTS IN ONE MODEL CALL
      //
      // This is VERY IMPORTANT for receipt number.
      //
      // Model will generate ONE receipt number and
      // assign it to all payment rows.
      // --------------------------------------------------------

      const result =
        await emiPaymentModel.createPayments({
          enrollmentId:
            Number(
              installment.enrollment_id
            ),

          installmentId:
            Number(id),

          payments:
            normalizedPayments,

          paymentDate:
            resolvedDate,
        });

      // --------------------------------------------------------
      // GET FRESH INSTALLMENT
      // --------------------------------------------------------

      const latest =
        await emiInstallmentModel.findById(
          id
        );

      // --------------------------------------------------------
      // PAYMENT SUMMARY
      // --------------------------------------------------------

      const paymentSummary =
        await emiPaymentModel.getPaymentSummary(
          id
        );

      // --------------------------------------------------------
      // RESPONSE
      // --------------------------------------------------------

      return res.json({
        success: true,

        message:
          `EMI marked as ${latest.status}`,

        data: {
          installment:
            latest,

          payments:
            result.payments,

          receiptNumber:
            result.receiptNumber,

          totalAmount:
            result.totalAmount,

          paidAmount:
            result.paidAmount,

          balance:
            result.balance,

          status:
            result.status,

          paymentSummary,
        },
      });
    }

    // ==========================================================
    // 10. SINGLE PAYMENT
    // ==========================================================

    const paymentAmount =
      Number(amount);

    // ----------------------------------------------------------
    // PAYMENT MODE REQUIRED
    // ----------------------------------------------------------

    if (
      ![
        'Cash',
        'UPI',
      ].includes(paymentMode)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Payment mode must be Cash or UPI',
      });
    }

    // ----------------------------------------------------------
    // VALIDATE AMOUNT
    // ----------------------------------------------------------

    if (
      !Number.isFinite(
        paymentAmount
      ) ||
      paymentAmount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'A valid paid amount is required for Paid/Partial',
      });
    }

    // ==========================================================
    // 11. PREVENT OVERPAYMENT
    // ==========================================================

    if (
      paymentAmount >
      currentBalance + 0.001
    ) {
      return res.status(400).json({
        success: false,
        message:
          `Payment cannot exceed remaining balance of ₹${currentBalance.toFixed(2)}`,
      });
    }

    // ==========================================================
    // 12. PAID MUST PAY FULL REMAINING BALANCE
    // ==========================================================

    if (
      status === 'Paid' &&
      Math.abs(
        paymentAmount -
          currentBalance
      ) > 0.001
    ) {
      return res.status(400).json({
        success: false,
        message:
          `To mark Paid, collect the full remaining balance of ₹${currentBalance.toFixed(2)}`,
      });
    }

    // ==========================================================
    // 13. PARTIAL CANNOT PAY FULL BALANCE
    // ==========================================================

    if (
      status === 'Partial' &&
      Math.abs(
        paymentAmount -
          currentBalance
      ) <= 0.001
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Use Paid status when collecting the full remaining balance',
      });
    }

    // ==========================================================
    // 14. CREATE PAYMENT TRANSACTION
    // ==========================================================

    const result =
      await emiPaymentModel.createPayment({
        enrollmentId:
          Number(
            installment.enrollment_id
          ),

        installmentId:
          Number(id),

        amount:
          paymentAmount,

        paymentMode:
          paymentMode,

        paymentDate:
          resolvedDate,
      });

    // ==========================================================
    // 15. GET FRESH DB RECORD
    // ==========================================================

    const latest =
      await emiInstallmentModel.findById(
        id
      );

    // ==========================================================
    // 16. PAYMENT SUMMARY
    // ==========================================================

    const paymentSummary =
      await emiPaymentModel.getPaymentSummary(
        id
      );

    // ==========================================================
    // 17. RESPONSE
    // ==========================================================

    return res.json({
      success: true,

      message:
        `EMI marked as ${latest.status}`,

      data: {
        installment:
          latest,

        payment:
          result,

        receiptNumber:
          result.receiptNumber,

        paymentSummary,
      },
    });

  } catch (err) {
    console.error(
      'Collect EMI error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to record EMI collection',
    });
  }
}


// ============================================================
// GET /api/emis/:id/payments
//
// Payment history for one EMI
// ============================================================

async function paymentHistory(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    // ----------------------------------------------------------
    // FIND INSTALLMENT
    // ----------------------------------------------------------

    const installment =
      await emiInstallmentModel.findById(
        id
      );

    if (!installment) {
      return res.status(404).json({
        success: false,
        message:
          'EMI installment not found',
      });
    }

    // ----------------------------------------------------------
    // GET HISTORY
    // ----------------------------------------------------------

    const history =
      await emiPaymentModel.getPaymentHistory(
        id
      );

    // ----------------------------------------------------------
    // GET SUMMARY
    // ----------------------------------------------------------

    const summary =
      await emiPaymentModel.getPaymentSummary(
        id
      );

    return res.json({
      success: true,

      data: {
        installment,

        history,

        summary: {
          totalPaid:
            Number(
              summary.totalPaid || 0
            ),

          cashTotal:
            Number(
              summary.cashTotal || 0
            ),

          upiTotal:
            Number(
              summary.upiTotal || 0
            ),
        },
      },
    });

  } catch (err) {
    console.error(
      'Payment history error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching payment history',
    });
  }
}


// ============================================================
// POST /api/emis/:id/reverse-payment
//
// Body:
//
// {
//   "reason": "Wrong payment entry"
// }
//
// NOTE:
// Here :id = PAYMENT TRANSACTION ID
// NOT installment ID.
// ============================================================

async function reversePayment(
  req,
  res
) {
  try {
    const { id } =
      req.params;

    const paymentId =
      Number(id);

    if (
      !Number.isInteger(
        paymentId
      ) ||
      paymentId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Valid payment transaction id is required',
      });
    }

    // ----------------------------------------------------------
    // ADMIN ID
    // ----------------------------------------------------------
    //
    // If verifyToken middleware is enabled,
    // req.admin.id will be available.
    //
    // Otherwise null is allowed because
    // reversed_by is nullable.
    // ----------------------------------------------------------

    const reversedBy =
      req.admin?.id || null;

    const reason =
      req.body?.reason ||
      'Payment reversed by admin';

    // ----------------------------------------------------------
    // REVERSE
    // ----------------------------------------------------------

    const result =
      await emiPaymentModel.reversePayment({
        paymentId,

        reversedBy,

        reason,
      });

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    return res.json({
      success: true,

      message:
        'Payment reversed successfully',

      data: {
        ...result,

        receiptNumber:
          result.receiptNumber ||
          null,
      },
    });

  } catch (err) {
    console.error(
      'Reverse EMI payment error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to reverse EMI payment',
    });
  }
}


// ============================================================
// EXPORT
// ============================================================

module.exports = {
  listForEnrollment,

  // EMI Collections
  todayDue,
  overdue,

  // Existing payment APIs
  collect,
  paymentHistory,
  reversePayment,
};