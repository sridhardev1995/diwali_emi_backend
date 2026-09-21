// One-time script to create the first Admin with a hashed password.
// Run:  node seedAdmin.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./src/config/db');
const adminModel = require('./src/models/adminModel');

const SALT_ROUNDS = 10;

async function seed() {
  const username = process.env.SEED_ADMIN_USERNAME;
  const plainPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!username || !plainPassword) {
    console.error('SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD not set in .env');
    process.exit(1);
  }

  const existing = await adminModel.findByUsername(username);
  if (existing) {
    console.log(`Admin "${username}" already exists. Nothing to do.`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(plainPassword, SALT_ROUNDS);
  const id = await adminModel.create({ username, passwordHash });

  console.log(`Admin created successfully. id=${id}, username=${username}`);
  console.log('Login with this username/password, then change the password via /api/auth/change-password.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});