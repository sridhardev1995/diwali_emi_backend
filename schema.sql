-- Run this once to create the database and the first table.
-- More tables (customers, diwali_schemes, emi_schemes, collections, etc.)
-- will be added in the next steps.

CREATE DATABASE IF NOT EXISTS diwali_emi_backend
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE diwali_emi_backend;

CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  status        ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                 ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 3.1 Customer Master
CREATE TABLE IF NOT EXISTS customers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  phone           VARCHAR(15)  NOT NULL UNIQUE,
  address         VARCHAR(500) NULL,
  aadhar_number   VARCHAR(12)  NULL,
  pan_number      VARCHAR(10)  NULL,
  ref_name        VARCHAR(150) NULL,
  ref_phone       VARCHAR(15)  NULL,
  payment_number  VARCHAR(50)  NULL,   -- UPI ID / mobile number payments are sent to
  photo_url       VARCHAR(500) NULL,   -- optional photo / ID proof scan
  status          ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_customers_name (name),
  INDEX idx_customers_status (status)
) ENGINE=InnoDB;

CREATE TABLE diwali_payment_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enrollment_id INT NOT NULL,
  week_number INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_mode ENUM('Cash','UPI','Bank Transfer','Cheque','Other') NOT NULL DEFAULT 'Cash',
  payment_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enrollment_id) REFERENCES diwali_enrollments(id),
  INDEX idx_payment_date (payment_date),
  INDEX idx_enrollment (enrollment_id)
)  ENGINE=InnoDB;


CREATE TABLE IF NOT EXISTS emi_schemes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  default_weeks INT NOT NULL DEFAULT 10,
  default_commission_type ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
  default_commission_value DECIMAL(10,2) NOT NULL DEFAULT 15.00,
  status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);  ENGINE=InnoDB;
 
CREATE TABLE IF NOT EXISTS enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  scheme_id INT NOT NULL,
  requested_amount DECIMAL(12,2) NOT NULL,
  commission_type ENUM('percent', 'fixed') NOT NULL,
  commission_value DECIMAL(10,2) NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  disbursed_amount DECIMAL(12,2) NOT NULL,
  weeks INT NOT NULL,
  start_date DATE NOT NULL,
  status ENUM('Active', 'Closed', 'Cancelled') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_enroll_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_enroll_scheme FOREIGN KEY (scheme_id) REFERENCES emi_schemes(id)
)  ENGINE=InnoDB;
 
CREATE TABLE IF NOT EXISTS emi_installments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  enrollment_id INT NOT NULL,
  week_no INT NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_date DATE DEFAULT NULL,
  status ENUM('Pending', 'Paid', 'Partial', 'Unpaid') NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_emi_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollments(id),
  UNIQUE KEY uniq_enrollment_week (enrollment_id, week_no)
)  ENGINE=InnoDB;
