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

    if (!username || !password) {
      throw new Error(
        'SEED_ADMIN_USERNAME or SEED_ADMIN_PASSWORD missing in .env'
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [existing] = await connection.query(
      `SELECT id
       FROM admins
       WHERE username = ?
       LIMIT 1`,
      [username]
    );

    if (existing.length > 0) {
      await connection.query(
        `UPDATE admins
         SET password_hash = ?,
             status = 'Active'
         WHERE username = ?`,
        [passwordHash, username]
      );

      console.log('');
      console.log('======================================');
      console.log('ADMIN UPDATED SUCCESSFULLY');
      console.log('======================================');
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('======================================');
      console.log('');
    } else {
      const [result] = await connection.query(
        `INSERT INTO admins
          (username, password_hash, status)
         VALUES (?, ?, 'Active')`,
        [username, password]
      );

      console.log('');
      console.log('======================================');
      console.log('ADMIN CREATED SUCCESSFULLY');
      console.log('======================================');
      console.log('Admin ID:', result.insertId);
      console.log('Username:', username);
      console.log('Password:', password);
      console.log('======================================');
      console.log('');
    }
  } catch (error) {
    console.error('');
    console.error('❌ ADMIN SEED ERROR');
    console.error(error);
    console.error('');
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

seedAdmin();