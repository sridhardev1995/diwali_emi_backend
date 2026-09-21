const diwaliEnrollmentModel = require('../models/diwaliEnrollmentModel');
const customerModel = require('../models/customerModel');
const diwaliSchemeModel = require('../models/diwaliSchemeModel');

// ============================================================
// CREATE ENROLLMENT
// ============================================================

async function create(req, res) {
  try {
    const {
      customerId,
      schemeId,
      chits
    } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'customerId is required'
      });
    }

    if (!schemeId) {
      return res.status(400).json({
        success: false,
        message: 'schemeId is required'
      });
    }

    if (
      !Number.isInteger(Number(chits)) ||
      Number(chits) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: 'chits must be a positive whole number'
      });
    }

    const customer =
      await customerModel.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const scheme =
      await diwaliSchemeModel.findById(schemeId);

    if (!scheme) {
      return res.status(404).json({
        success: false,
        message: 'Scheme not found'
      });
    }

    if (scheme.status !== 'Active') {
      return res.status(400).json({
        success: false,
        message: 'Cannot enroll into an inactive scheme'
      });
    }

    const result =
      await diwaliEnrollmentModel.enroll({
        customerId: Number(customerId),
        schemeId: Number(schemeId),
        chits: Number(chits)
      });

    const enrollment =
      await diwaliEnrollmentModel.findById(
        result.enrollmentId
      );

    return res.status(201).json({
      success: true,
      message: 'Customer enrolled successfully',
      data: {
        enrollment,
        weeklyAmount: result.weeklyAmount,
        totalPayable: result.totalPayable,
        maturityReturn: result.maturityReturn
      }
    });
  } catch (err) {
    console.error(
      'Create Diwali enrollment error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        err.message ||
        'Server error while creating enrollment'
    });
  }
}

// ============================================================
// LIST
// ============================================================

async function list(req, res) {
  try {
    const page = Math.max(
      parseInt(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        parseInt(req.query.limit) || 20,
        1
      ),
      100
    );

    const {
      customerId = '',
      schemeId = '',
      status = ''
    } = req.query;

    const {
      rows,
      total
    } = await diwaliEnrollmentModel.findAll({
      page,
      limit,
      customerId,
      schemeId,
      status
    });

    return res.json({
      success: true,
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(
      'List Diwali enrollments error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching enrollments'
    });
  }
}

// ============================================================
// GET ONE
// ============================================================

async function getOne(req, res) {
  try {
    const enrollment =
      await diwaliEnrollmentModel.findById(
        req.params.id
      );

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: 'Enrollment not found'
      });
    }

    const weeks =
      await diwaliEnrollmentModel.getWeeks(
        req.params.id
      );

    const totalDue = weeks.reduce(
      (sum, week) =>
        sum + Number(week.amount_due),
      0
    );

    const totalPaid = weeks.reduce(
      (sum, week) =>
        sum + Number(week.amount_paid),
      0
    );

    const maturityReturn =
      (
        Number(enrollment.chit_value) *
          Number(enrollment.duration_weeks) +
        Number(enrollment.bonus_per_chit)
      ) *
      Number(enrollment.original_chits);

    return res.json({
      success: true,
      data: {
        enrollment,
        weeks,
        summary: {
          totalDue,
          totalPaid,
          balance: totalDue - totalPaid,
          maturityReturn
        }
      }
    });
  } catch (err) {
    console.error(
      'Get Diwali enrollment error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching enrollment'
    });
  }
}

// ============================================================
// PAY WEEK
// ============================================================

async function payWeek(req, res) {
  try {
    const {
      id,
      weekNumber
    } = req.params;

    const {
      amountPaid,
      paymentDate,
      paymentMode,
      payments
    } = req.body;

    if (
      !Array.isArray(payments) &&
      (
        amountPaid === undefined ||
        amountPaid === null
      )
    ) {
      return res.status(400).json({
        success: false,
        message: 'Payment amount is required'
      });
    }

    const result =
      await diwaliEnrollmentModel.payWeek(
        id,
        Number(weekNumber),
        {
          amountPaid,
          paymentDate,
          paymentMode,
          payments
        }
      );

    return res.json({
      success: true,
      message: 'Payment recorded successfully',
      data: result
    });
  } catch (err) {
    console.error(
      'Pay Diwali week error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to record payment'
    });
  }
}

// ============================================================
// MODIFY CHITS
// ============================================================

async function modifyChits(req, res) {
  try {
    const {
      id
    } = req.params;

    const {
      fromWeekNumber,
      newChits
    } = req.body;

    if (
      !Number.isInteger(Number(fromWeekNumber)) ||
      Number(fromWeekNumber) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'fromWeekNumber must be a positive whole number'
      });
    }

    if (
      !Number.isInteger(Number(newChits)) ||
      Number(newChits) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'newChits must be a positive whole number'
      });
    }

    const result =
      await diwaliEnrollmentModel.modifyChits(
        Number(id),
        Number(fromWeekNumber),
        Number(newChits)
      );

    return res.json({
      success: true,
      message: 'Chits modified successfully',
      data: result
    });
  } catch (err) {
    console.error(
      'Modify Diwali chits error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to modify chits'
    });
  }
}

// ============================================================
// ADJUSTMENT LOGS
// ============================================================

async function getAdjustmentLogs(req, res) {
  try {
    const logs =
      await diwaliEnrollmentModel.getAdjustmentLogs(
        req.params.id
      );

    return res.json({
      success: true,
      data: logs
    });
  } catch (err) {
    console.error(
      'Get adjustment logs error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching adjustment logs'
    });
  }
}

// ============================================================
// TODAY DUE
// ============================================================

async function todayDue(req, res) {
  try {
    const rows =
      await diwaliEnrollmentModel.todayDue();

    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error(
      'Today due error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching today due'
    });
  }
}

// ============================================================
// OVERDUE
// ============================================================

async function overdue(req, res) {
  try {
    const rows =
      await diwaliEnrollmentModel.overdue();

    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error(
      'Overdue error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching overdue'
    });
  }
}

// ============================================================
// TODAY COLLECTION SUMMARY
// ============================================================

async function todayCollectionSummary(req, res) {
  try {
    const rows =
      await diwaliEnrollmentModel
        .todayCollectionSummary();

    const totalAmount = rows.reduce(
      (sum, row) =>
        sum + Number(row.total_amount),
      0
    );

    return res.json({
      success: true,
      data: {
        byPaymentMode: rows,
        totalAmount
      }
    });
  } catch (err) {
    console.error(
      'Today collection summary error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching collection summary'
    });
  }
}

// ============================================================
// BULK PAYMENT
// ============================================================

async function bulkPay(req, res) {
  try {
    const {
      id
    } = req.params;

    const {
      totalAmount,
      paymentDate,
      paymentMode
    } = req.body;

    if (
      totalAmount === undefined ||
      isNaN(totalAmount) ||
      Number(totalAmount) <= 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          'A valid totalAmount is required'
      });
    }

    const result =
      await diwaliEnrollmentModel.bulkPay(
        Number(id),
        {
          totalAmount: Number(totalAmount),
          paymentDate,
          paymentMode
        }
      );

    return res.json({
      success: true,
      message:
        'Bulk payment recorded successfully',
      data: result
    });
  } catch (err) {
    console.error(
      'Bulk Diwali payment error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to record bulk payment'
    });
  }
}

// ============================================================
// PAYMENT HISTORY
// ============================================================

async function paymentHistory(req, res) {
  try {
    const rows =
      await diwaliEnrollmentModel
        .getPaymentTransactions(
          req.params.id
        );

    return res.json({
      success: true,
      data: rows
    });
  } catch (err) {
    console.error(
      'Payment history error:',
      err
    );

    return res.status(500).json({
      success: false,
      message:
        'Server error while fetching payment history'
    });
  }
}

// ============================================================
// SINGLE PAYMENT REVERT
// ============================================================

async function revertPayment(req, res) {
  try {
    const {
      transactionId
    } = req.params;

    const {
      reason
    } = req.body;

    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const result =
      await diwaliEnrollmentModel.revertPayment(
        Number(transactionId),
        Number(adminId),
        reason
      );

    return res.json({
      success: true,
      message:
        'Payment reverted successfully',
      data: result
    });
  } catch (err) {
    console.error(
      'Revert payment error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to revert payment'
    });
  }
}

// ============================================================
// BULK PAYMENT REVERT
// ============================================================

async function revertBulkPayment(req, res) {
  try {
    const {
      paymentGroupId
    } = req.params;

    const {
      reason
    } = req.body;

    const adminId = req.admin?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    if (!paymentGroupId) {
      return res.status(400).json({
        success: false,
        message: 'paymentGroupId is required'
      });
    }

    const result =
      await diwaliEnrollmentModel
        .revertBulkPayment(
          paymentGroupId,
          Number(adminId),
          reason
        );

    return res.json({
      success: true,
      message:
        'Bulk payment reverted successfully',
      data: result
    });
  } catch (err) {
    console.error(
      'Revert bulk payment error:',
      err
    );

    return res.status(400).json({
      success: false,
      message:
        err.message ||
        'Unable to revert bulk payment'
    });
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  create,
  list,
  getOne,
  payWeek,
  modifyChits,
  getAdjustmentLogs,
  todayDue,
  overdue,
  todayCollectionSummary,
  bulkPay,
  paymentHistory,
  revertPayment,
  revertBulkPayment
};