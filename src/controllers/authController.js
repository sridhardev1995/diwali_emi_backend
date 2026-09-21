const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const adminModel = require('../models/adminModel');

const SALT_ROUNDS = 10;

// POST /api/auth/login
async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const admin = await adminModel.findByUsername(username);
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (admin.status !== 'Active') {
      return res.status(403).json({ success: false, message: 'This admin account is inactive' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    await adminModel.updateLastLogin(admin.id);

    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
}

// POST /api/auth/change-password  (requires valid token)
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const admin = await adminModel.findByUsername(req.admin.username);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await adminModel.updatePassword(adminId, newHash);

    return res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, message: 'Server error while changing password' });
  }
}

// GET /api/auth/profile (requires valid token)
async function profile(req, res) {
  try {
    const admin = await adminModel.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    return res.json({ success: true, admin });
  } catch (err) {
    console.error('Profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

module.exports = { login, changePassword, profile };
