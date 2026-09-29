function getFinancialYear(dateInput = new Date()) {
  const date = new Date(dateInput);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid payment date');
  }

  const month = date.getMonth() + 1;
  const year = date.getFullYear();

  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;

  return `${startYear}-${String(endYear).slice(-2)}`;
}

async function getNextReceiptNumber(connection, paymentDate = new Date()) {
  const financialYear = getFinancialYear(paymentDate);

  // Create financial-year sequence row if it does not exist.
  await connection.query(
    `
      INSERT INTO receipt_sequences
      (
        financial_year,
        next_number
      )
      VALUES (?, 1)
      ON DUPLICATE KEY UPDATE
        financial_year = financial_year
    `,
    [financialYear]
  );

  // Lock this financial-year sequence.
  const [rows] = await connection.query(
    `
      SELECT
        financial_year,
        next_number
      FROM receipt_sequences
      WHERE financial_year = ?
      FOR UPDATE
    `,
    [financialYear]
  );

  if (rows.length === 0) {
    throw new Error(
      'Unable to initialize receipt sequence'
    );
  }

  const sequence = Number(
    rows[0].next_number
  );

  if (
    !Number.isInteger(sequence) ||
    sequence <= 0
  ) {
    throw new Error(
      'Invalid receipt sequence'
    );
  }

  // Increment sequence.
  await connection.query(
    `
      UPDATE receipt_sequences
      SET next_number = ?
      WHERE financial_year = ?
    `,
    [
      sequence + 1,
      financialYear
    ]
  );

  const formattedNumber =
    String(sequence).padStart(6, '0');

  return `SMC-${financialYear}-${formattedNumber}`;
}

module.exports = {
  getFinancialYear,
  getNextReceiptNumber,
};