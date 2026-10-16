const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

require('dotenv').config();

async function seedAdmin() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });

    const username = process.env.SEED_ADMIN_USERNAME;
    const password = process.env.SEED_ADMIN_PASSWORD;
    const recoveryPin = process.env.SEED_ADMIN_RECOVERY_PIN;

    // ============================================================
    // VALIDATION
    // ============================================================

    if (!username || !password) {
      throw new Error(
        'SEED_ADMIN_USERNAME or SEED_ADMIN_PASSWORD missing in .env'
      );
    }

    if (!recoveryPin) {
      throw new Error(
        'SEED_ADMIN_RECOVERY_PIN missing in .env'
      );
    }

    // ============================================================
    // HASH PASSWORD
    // ============================================================

    const passwordHash = await bcrypt.hash(password, 10);

    // ============================================================
    // HASH RECOVERY PIN
    // ============================================================

    const recoveryPinHash =
        await bcrypt.hash(recoveryPin, 10);

    // ============================================================
    // CHECK ADMIN
    // ============================================================

    const [existing] = await connection.query(
      `SELECT id
       FROM admins
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    // ============================================================
    // EXISTING ADMIN → UPDATE
    // ============================================================

    if (existing.length > 0) {
      const adminId = existing[0].id;

      await connection.query(
        `UPDATE admins
         SET password_hash = ?,
             recovery_pin_hash = ?,
             status = 'Active'
         WHERE id = ?`,
        [
          passwordHash,
          recoveryPinHash,
          adminId,
        ]
      );

      console.log('');
      console.log('======================================');
      console.log('ADMIN UPDATED SUCCESSFULLY');
      console.log('======================================');
      console.log('Admin ID:', adminId);
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('Recovery PIN:', recoveryPin);
      console.log('Status: Active');
      console.log('======================================');
      console.log('');
    }

    // ============================================================
    // ADMIN DOES NOT EXIST → CREATE
    // ============================================================

    else {
      const [result] = await connection.query(
        `INSERT INTO admins
          (
            username,
            password_hash,
            recovery_pin_hash,
            status
          )
         VALUES (?, ?, ?, 'Active')`,
        [
          username,
          passwordHash,
          recoveryPinHash,
        ]
      );

      console.log('');
      console.log('======================================');
      console.log('ADMIN CREATED SUCCESSFULLY');
      console.log('======================================');
      console.log('Admin ID:', result.insertId);
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('Recovery PIN:', recoveryPin);
      console.log('Status: Active');
      console.log('======================================');
      console.log('');
    }

    // ============================================================
    // VERIFY
    // ============================================================

    const [verify] = await connection.query(
      `SELECT
         id,
         username,
         status,
         recovery_pin_hash
       FROM admins
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    if (verify.length > 0) {
      console.log('======================================');
      console.log('RECOVERY PIN VERIFICATION');
      console.log('======================================');
      console.log('Username:', verify[0].username);
      console.log('Status:', verify[0].status);
      console.log(
        'Recovery PIN Hash Saved:',
        !!verify[0].recovery_pin_hash
      );
      console.log('======================================');
      console.log('');
    }

  } catch (error) {
    console.error('');
    console.error('❌ ADMIN SEED ERROR');
    console.error('======================================');
    console.error(error);
    console.error('======================================');
    console.error('');

    process.exitCode = 1;

  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seedAdmin();