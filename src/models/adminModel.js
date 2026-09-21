const pool = require('../config/db');

async function findByUsername(username) {
  const [rows] = await pool.query(
    'SELECT * FROM admins WHERE username = ? LIMIT 1',
    [username]
  );
  return rows[0] || null;
}

async function findById(id) {
  const [rows] = await pool.query(
    'SELECT id, username, status, last_login_at, created_at FROM admins WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function create({ username, passwordHash }) {
  const [result] = await pool.query(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
    [username, passwordHash]
  );
  return result.insertId;
}

async function updatePassword(id, passwordHash) {
  await pool.query(
    'UPDATE admins SET password_hash = ? WHERE id = ?',
    [passwordHash, id]
  );
}

async function updateLastLogin(id) {
  await pool.query(
    'UPDATE admins SET last_login_at = NOW() WHERE id = ?',
    [id]
  );
}

module.exports = {
  findByUsername,
  findById,
  create,
  updatePassword,
  updateLastLogin
};
