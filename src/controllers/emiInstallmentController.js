const emiInstallmentModel = require('../models/emiInstallementModel.js');
const enrollmentModel = require('../models/emiEnrollmentModel.js');
// GET /api/enrollments/:enrollmentId/emis
// Returns the full weekly schedule + running totals (collected / balance / overdue).
async function listForEnrollment(req, res) {
  try {
    const { enrollmentId } = req.params;

    const enrollment = await enrollmentModel.findById(enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: 'Enrollment not found' });
    }

    const schedule = await emiInstallmentModel.findByEnrollment(enrollmentId);
    const summary = await emiInstallmentModel.getSummary(enrollmentId);

    return res.json({
      success: true,
      data: {
        enrollment,
        schedule,
        summary: {
          totalEmis: summary.total_emis,
          paidEmis: summary.paid_emis,
          totalCollected: Number(summary.total_collected),
          balance: Number(summary.balance),
          overdueEmis: summary.overdue_emis
        }
      }
    });
  } catch (err) {
    console.error('List EMI schedule error:', err);
    return res.status(500).json({ success: false, message: 'Server error while fetching EMI schedule' });
  }
}

// PATCH /api/emis/:id/collect
// Body: { status: "Paid" | "Partial" | "Unpaid", amount?, paidDate? }
async function collect(req, res) {
  try {
    const { id } = req.params;
    const { status, amount = 0, paidDate } = req.body;

    if (!['Paid', 'Partial', 'Unpaid'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be Paid, Partial or Unpaid' });
    }

    const installment = await emiInstallmentModel.findById(id);
    if (!installment) {
      return res.status(404).json({ success: false, message: 'EMI installment not found' });
    }

    if (status !== 'Unpaid' && (isNaN(amount) || Number(amount) <= 0)) {
      return res.status(400).json({ success: false, message: 'A valid paid amount is required for Paid/Partial' });
    }
    if (status === 'Paid' && Number(amount) < Number(installment.amount)) {
      return res.status(400).json({
        success: false,
        message: 'Amount is less than the full EMI amount - mark as Partial instead'
      });
    }

    const resolvedDate = status === 'Unpaid' ? null : paidDate || new Date().toISOString().slice(0, 10);
    const resolvedAmount = status === 'Unpaid' ? 0 : Number(amount);

    await emiInstallmentModel.recordPayment(id, {
      status,
      amount: resolvedAmount,
      paidDate: resolvedDate
    });

    const updated = await emiInstallmentModel.findById(id);
    return res.json({ success: true, message: `EMI marked as ${status}`, data: updated });
  } catch (err) {
    console.error('Collect EMI error:', err);
    return res.status(500).json({ success: false, message: 'Server error while recording EMI collection' });
  }
}

module.exports = { listForEnrollment, collect };