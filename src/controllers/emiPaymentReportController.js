const emiPaymentReportModel = require('../models/emiPaymentReportModel');

// ============================================================
// GET EMI PAYMENT REPORT
// ============================================================

async function getPaymentReport(req, res) {
  try {
    const {
      page = 1,
      limit = 20,
      fromDate = '',
      toDate = '',
      customerId = '',
      schemeId = '',
      paymentMode = '',
      status = '',
    } = req.query;

    // --------------------------------------------------------
    // DATE VALIDATION
    // --------------------------------------------------------

    if (fromDate && toDate) {
      const from = new Date(fromDate);
      const to = new Date(toDate);

      if (
        Number.isNaN(from.getTime()) ||
        Number.isNaN(to.getTime())
      ) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format',
        });
      }

      if (from > to) {
        return res.status(400).json({
          success: false,
          message:
            'From date cannot be greater than To date',
        });
      }
    }

    // --------------------------------------------------------
    // PAYMENT MODE VALIDATION
    // --------------------------------------------------------

    if (
      paymentMode &&
      !['Cash', 'UPI'].includes(paymentMode)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Payment mode must be Cash or UPI',
      });
    }

    // --------------------------------------------------------
    // STATUS VALIDATION
    // --------------------------------------------------------

    if (
      status &&
      !['Active', 'Reversed'].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Status must be Active or Reversed',
      });
    }

    const result =
      await emiPaymentReportModel.getPaymentReport({
        page,
        limit,
        fromDate,
        toDate,
        customerId,
        schemeId,
        paymentMode,
        status,
      });

    return res.status(200).json({
      success: true,
      message: 'EMI payment report fetched successfully',
      data: result.rows,
      summary: result.summary,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error(
      'EMI payment report error:',
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        'Unable to fetch EMI payment report',
    });
  }
}

module.exports = {
  getPaymentReport,
};