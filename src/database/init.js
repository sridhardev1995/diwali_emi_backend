const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  });

  await connection.query(`
    CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci
  `);

  await connection.query(`USE ${process.env.DB_NAME}`);

  // ============================================================
  // ADMIN
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      username      VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      status        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      last_login_at DATETIME NULL,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // CUSTOMERS
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      name            VARCHAR(150) NOT NULL,
      phone           VARCHAR(15) NOT NULL UNIQUE,
      address         VARCHAR(500) NULL,
      aadhar_number   VARCHAR(12) NULL,
      pan_number      VARCHAR(10) NULL,
      ref_name        VARCHAR(150) NULL,
      ref_phone       VARCHAR(15) NULL,
      payment_number  VARCHAR(50) NULL,
      photo_url       VARCHAR(500) NULL,
      status          ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_customers_name (name),
      INDEX idx_customers_status (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // DIWALI SCHEME MASTER
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS diwali_schemes (
      id              INT AUTO_INCREMENT PRIMARY KEY,
      scheme_name     VARCHAR(150) NOT NULL,
      chit_value      DECIMAL(10,2) NOT NULL,
      duration_weeks  INT NOT NULL DEFAULT 52,
      bonus_per_chit  DECIMAL(10,2) NOT NULL,
      start_date      DATE NOT NULL,
      status          ENUM('Active','Closed') NOT NULL DEFAULT 'Active',
      created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // DIWALI ENROLLMENT
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS diwali_enrollments (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      customer_id    INT NOT NULL,
      scheme_id      INT NOT NULL,
      original_chits INT NOT NULL,
      current_chits  INT NOT NULL,
      status         ENUM('Active','Completed','Cancelled')
                     NOT NULL DEFAULT 'Active',
      created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (customer_id)
        REFERENCES customers(id),

      FOREIGN KEY (scheme_id)
        REFERENCES diwali_schemes(id),

      INDEX idx_diwali_enroll_customer (customer_id),
      INDEX idx_diwali_enroll_scheme (scheme_id),
      INDEX idx_diwali_enroll_status (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // DIWALI WEEKLY SCHEDULE
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS diwali_enrollment_weeks (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id INT NOT NULL,
      week_number   INT NOT NULL,
      due_date      DATE NOT NULL,
      chits         INT NOT NULL,
      amount_due    DECIMAL(10,2) NOT NULL,
      amount_paid   DECIMAL(10,2) NOT NULL DEFAULT 0,
      payment_date  DATE NULL,
      payment_mode  VARCHAR(30) NULL,
      status        ENUM('Unpaid','Partial','Paid')
                    NOT NULL DEFAULT 'Unpaid',
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (enrollment_id)
        REFERENCES diwali_enrollments(id)
        ON DELETE CASCADE,

      UNIQUE KEY uq_enrollment_week
        (enrollment_id, week_number),

      INDEX idx_diwali_week_due_date (due_date)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // DIWALI PAYMENT TRANSACTIONS
  //
  // IMPORTANT:
  // Payments are never deleted.
  // Reverted payments remain in history with status = Reversed.
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS diwali_payment_transactions (
      id               INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id    INT NOT NULL,
      week_number      INT NOT NULL,
      amount           DECIMAL(10,2) NOT NULL,

      payment_mode     ENUM(
                         'Cash',
                         'UPI',
                         'Bank Transfer',
                         'Cheque',
                         'Other'
                       ) NOT NULL DEFAULT 'Cash',

      payment_date     DATE NOT NULL,

      receipt_number   VARCHAR(30) NULL,

      payment_group_id VARCHAR(100) NULL,

      status           ENUM('Active','Reversed')
                       NOT NULL DEFAULT 'Active',

      reversed_at      DATETIME NULL,
      reversed_by      INT NULL,
      reversal_reason  VARCHAR(500) NULL,

      created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (enrollment_id)
        REFERENCES diwali_enrollments(id)
        ON DELETE CASCADE,

      FOREIGN KEY (reversed_by)
        REFERENCES admins(id)
        ON DELETE SET NULL,

      INDEX idx_payment_date (payment_date),
      INDEX idx_payment_enrollment (enrollment_id),
      INDEX idx_payment_group (payment_group_id),
      INDEX idx_payment_status (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EXISTING DATABASE MIGRATION - DIWALI PAYMENTS
  //
  // Existing data will NOT be deleted.
  // ============================================================

  const [paymentColumns] = await connection.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'diwali_payment_transactions'
  `, [process.env.DB_NAME]);

  const existingPaymentColumns =
    new Set(
      paymentColumns.map(
        row => row.COLUMN_NAME
      )
    );

  // ------------------------------------------------------------
  // payment_group_id
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('payment_group_id')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN payment_group_id VARCHAR(100) NULL
      AFTER payment_date
    `);
  }

  // ------------------------------------------------------------
  // receipt_number
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('receipt_number')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN receipt_number VARCHAR(30) NULL
      AFTER payment_date
    `);
  }

  // ------------------------------------------------------------
  // status
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('status')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN status ENUM('Active','Reversed')
      NOT NULL DEFAULT 'Active'
      AFTER payment_group_id
    `);
  }

  // ------------------------------------------------------------
  // reversed_at
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('reversed_at')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN reversed_at DATETIME NULL
      AFTER status
    `);
  }

  // ------------------------------------------------------------
  // reversed_by
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('reversed_by')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN reversed_by INT NULL
      AFTER reversed_at
    `);
  }

  // ------------------------------------------------------------
  // reversal_reason
  // ------------------------------------------------------------

  if (!existingPaymentColumns.has('reversal_reason')) {
    await connection.query(`
      ALTER TABLE diwali_payment_transactions
      ADD COLUMN reversal_reason VARCHAR(500) NULL
      AFTER reversed_by
    `);
  }

  // ============================================================
  // DIWALI ADJUSTMENT LOG
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS diwali_adjustment_logs (
      id                  INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id       INT NOT NULL,
      source_weeks        VARCHAR(255) NOT NULL,
      source_excess_total DECIMAL(10,2) NOT NULL,
      target_week         INT NOT NULL,
      applied_amount      DECIMAL(10,2) NOT NULL,
      note                VARCHAR(500) NULL,
      created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (enrollment_id)
        REFERENCES diwali_enrollments(id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EMI SCHEME MASTER
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS emi_schemes (
      id                        INT AUTO_INCREMENT PRIMARY KEY,
      name                      VARCHAR(150) NOT NULL,
      description               TEXT NULL,
      default_weeks             INT NOT NULL DEFAULT 10,
      default_commission_type   ENUM('percent','fixed')
                                NOT NULL DEFAULT 'percent',
      default_commission_value  DECIMAL(10,2) NOT NULL DEFAULT 15,
      status                    ENUM('Active','Inactive')
                                NOT NULL DEFAULT 'Active',
      created_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at                DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_emi_schemes_status (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EMI ENROLLMENT
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id                 INT AUTO_INCREMENT PRIMARY KEY,
      customer_id        INT NOT NULL,
      scheme_id          INT NOT NULL,
      requested_amount   DECIMAL(12,2) NOT NULL,
      commission_type    ENUM('percent','fixed') NOT NULL,
      commission_value   DECIMAL(10,2) NOT NULL,
      commission_amount  DECIMAL(12,2) NOT NULL,
      disbursed_amount   DECIMAL(12,2) NOT NULL,
      weeks              INT NOT NULL,
      start_date         DATE NOT NULL,
      status             ENUM('Active','Closed','Cancelled')
                         NOT NULL DEFAULT 'Active',
      created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                         ON UPDATE CURRENT_TIMESTAMP,

      FOREIGN KEY (customer_id)
        REFERENCES customers(id),

      FOREIGN KEY (scheme_id)
        REFERENCES emi_schemes(id),

      INDEX idx_enrollments_customer (customer_id),
      INDEX idx_enrollments_scheme (scheme_id),
      INDEX idx_enrollments_status (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EMI INSTALLMENTS
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS emi_installments (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      enrollment_id  INT NOT NULL,
      week_no        INT NOT NULL,
      due_date       DATE NOT NULL,
      amount         DECIMAL(12,2) NOT NULL,
      paid_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_date      DATE DEFAULT NULL,
      status         ENUM('Pending','Paid','Partial','Unpaid')
                     NOT NULL DEFAULT 'Pending',
      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT fk_emi_enrollment
        FOREIGN KEY (enrollment_id)
        REFERENCES enrollments(id),

      UNIQUE KEY uniq_enrollment_week
        (enrollment_id, week_no),

      INDEX idx_emi_installments_due_date (due_date)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EMI PAYMENT TRANSACTIONS
  //
  // Stores every individual EMI payment.
  //
  // Supports:
  // - Cash
  // - UPI
  // - Split payment
  // - Payment history
  // - Future payment reversal
  // - Receipt number
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS emi_payment_transactions (
      id               INT AUTO_INCREMENT PRIMARY KEY,

      enrollment_id    INT NOT NULL,

      installment_id   INT NOT NULL,

      amount           DECIMAL(12,2) NOT NULL,

      payment_mode     ENUM('Cash','UPI') NOT NULL,

      payment_date     DATE NOT NULL,

      receipt_number   VARCHAR(30) NULL,

      status           ENUM('Active','Reversed')
                       NOT NULL DEFAULT 'Active',

      reversed_at      DATETIME NULL,

      reversed_by      INT NULL,

      reversal_reason  VARCHAR(500) NULL,

      created_at       TIMESTAMP NOT NULL
                       DEFAULT CURRENT_TIMESTAMP,

      updated_at       TIMESTAMP NOT NULL
                       DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP,

      CONSTRAINT fk_emi_payment_enrollment
        FOREIGN KEY (enrollment_id)
        REFERENCES enrollments(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_emi_payment_installment
        FOREIGN KEY (installment_id)
        REFERENCES emi_installments(id)
        ON DELETE CASCADE,

      CONSTRAINT fk_emi_payment_reversed_by
        FOREIGN KEY (reversed_by)
        REFERENCES admins(id)
        ON DELETE SET NULL,

      INDEX idx_emi_payment_enrollment
        (enrollment_id),

      INDEX idx_emi_payment_installment
        (installment_id),

      INDEX idx_emi_payment_date
        (payment_date),

      INDEX idx_emi_payment_mode
        (payment_mode),

      INDEX idx_emi_payment_status
        (status)
    ) ENGINE=InnoDB
  `);

  // ============================================================
  // EXISTING DATABASE MIGRATION - EMI PAYMENTS
  //
  // Existing data will NOT be deleted.
  // ============================================================

  const [emiPaymentColumns] = await connection.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME = 'emi_payment_transactions'
  `, [process.env.DB_NAME]);

  const existingEmiPaymentColumns =
    new Set(
      emiPaymentColumns.map(
        row => row.COLUMN_NAME
      )
    );

  if (
    !existingEmiPaymentColumns.has(
      'receipt_number'
    )
  ) {
    await connection.query(`
      ALTER TABLE emi_payment_transactions
      ADD COLUMN receipt_number VARCHAR(30) NULL
      AFTER payment_date
    `);
  }

  // ============================================================
  // SHARED RECEIPT SEQUENCE
  //
  // One sequence is shared by:
  // - Diwali payments
  // - EMI payments
  //
  // Example:
  //
  // SMC-26-27-000001
  // SMC-26-27-000002
  // SMC-26-27-000003
  //
  // New financial year:
  //
  // SMC-27-28-000001
  // ============================================================

  await connection.query(`
    CREATE TABLE IF NOT EXISTS receipt_sequences (
      financial_year VARCHAR(9) NOT NULL,
      next_number    INT NOT NULL DEFAULT 1,

      created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

      updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                     ON UPDATE CURRENT_TIMESTAMP,

      PRIMARY KEY (financial_year)
    ) ENGINE=InnoDB
  `);

  console.log(
    'Database initialized successfully (all tables checked/created)'
  );

  await connection.end();
}

module.exports = initializeDatabase;