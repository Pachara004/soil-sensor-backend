// เพิ่มส่วนนี้ใน api/user.js หลังจาก require statements
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Get all users (admin only) or current user profile
router.get('/', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role === 'admin') {
      // Admin can see all users
      const { rows } = await pool.query(
        'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users ORDER BY created_at DESC'
      );
      return res.json({ users: rows });
    } else {
      // Regular user can only see their own profile
      const { rows } = await pool.query(
        'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
        [req.user.userid]
      );

      if (rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.json({ user: rows[0] });
    }
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get all users (admin only)
router.get('/all', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users ORDER BY created_at DESC'
    );

    res.json({ users: rows });
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get only regular users (role = 'user') - admin only
router.get('/regular', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE role = $1 ORDER BY created_at DESC',
      ['user']
    );

    res.json({ users: rows });
  } catch (err) {
    console.error('Error fetching regular users:', err);
    res.status(500).json({ message: err.message });
  }
});

// Alias endpoints for Angular compatibility - ต้องอยู่ก่อน /:id
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
      [req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
      [req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({ user: rows[0] });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get user by ID - ไว้หลัง specific routes แล้ว
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only view their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.userid !== parseInt(id)) {
      return res.status(403).json({ message: 'Access denied. You can only view your own profile.' });
    }

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get user by username
router.get('/username/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

    // Users can only view their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.user_name !== username) {
      return res.status(403).json({ message: 'Access denied. You can only view your own profile.' });
    }

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE user_name = $1',
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Error fetching user by username:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update user profile
// Update user profile (both admin and user)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_name, user_phone, user_email } = req.body;


    // Users can only update their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.userid !== parseInt(id)) {
      return res.status(403).json({ message: 'Access denied. You can only update your own profile.' });
    }

    // Check if username is unique (excluding current user)
    if (user_name) {
      const { rows: existingUser } = await pool.query(
        'SELECT userid FROM users WHERE user_name = $1 AND userid != $2',
        [user_name, id]
      );

      if (existingUser.length > 0) {
        return res.status(409).json({ message: 'Username already taken' });
      }
    }

    // Check if email is unique (excluding current user) - only if email is being updated
    if (user_email) {
      const { rows: existingEmail } = await pool.query(
        'SELECT userid FROM users WHERE user_email = $1 AND userid != $2',
        [user_email, id]
      );

      if (existingEmail.length > 0) {
        return res.status(409).json({ message: 'Email already taken' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE users 
       SET user_name = COALESCE($1, user_name),
           user_phone = COALESCE($2, user_phone),
           user_email = COALESCE($3, user_email),
           updated_at = NOW()
       WHERE userid = $4
       RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
      [user_name, user_phone, user_email, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user: rows[0] });
  } catch (err) {
    console.error('❌ Error updating user:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update user role (admin only)
router.put('/:id/role', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    // Only admin can change roles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "user" or "admin"' });
    }

    const { rows } = await pool.query(
      `UPDATE users 
       SET role = $1, updated_at = NOW()
       WHERE userid = $2
       RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
      [role, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User role updated successfully', user: rows[0] });
  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete user (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Only admin can delete users
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    // Prevent admin from deleting themselves
    if (req.user.userid === parseInt(id)) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const { rows } = await pool.query(
      'DELETE FROM users WHERE userid = $1 RETURNING userid, user_name, user_email',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User deleted successfully', user: rows[0] });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get user statistics (admin only)
router.get('/stats/overview', authMiddleware, async (req, res) => {
  try {
    // Only admin can view statistics
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_count,
        COUNT(CASE WHEN role = 'user' THEN 1 END) as user_count,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_30_days
      FROM users
    `);

    res.json({ stats: rows[0] });
  } catch (err) {
    console.error('Error fetching user statistics:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/user/reports - ดึง reports ของ user ปัจจุบัน
router.get('/reports', authMiddleware, async (req, res) => {
  try {
    console.log('📨 Fetching reports for user:', req.user.userid);
    
    const { rows } = await pool.query(
      `SELECT 
        reportid as id, 
        userid as user_id, 
        title, 
        description as message, 
        status, 
        created_at, 
        updated_at as read_at, 
        priority, 
        type
       FROM reports 
       WHERE userid = $1 
       ORDER BY created_at DESC`,
      [req.user.userid]
    );
    
    console.log(`✅ Found ${rows.length} reports for user ${req.user.userid}`);
    
    res.json({ reports: rows, total: rows.length });
    
  } catch (err) {
    console.error('❌ Error fetching user reports:', err);
    res.status(500).json({ 
      message: 'Failed to fetch reports', 
      error: err.message 
    });
  }
});

// GET /api/user/devices - ดึง devices ที่ผูกกับผู้ใช้ปัจจุบัน
router.get('/devices', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userid;
    console.log('📨 Fetching devices for user:', userId);

    const { rows } = await pool.query(
      `SELECT deviceid, device_name, userid, device_type, status, created_at, updated_at
       FROM device
       WHERE userid = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json({ devices: rows });
  } catch (err) {
    console.error('❌ Error fetching user devices:', err);
    res.status(500).json({ message: 'Failed to fetch devices', error: err.message });
  }
});
// Change password (both admin and user)
router.put('/:id/password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;


    // Users can only change their own password unless they're admin
    if (req.user.role !== 'admin' && req.user.userid !== parseInt(id)) {
      return res.status(403).json({ message: 'Access denied. You can only change your own password.' });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters long' });
    }

    // Get current user data
    const { rows: userRows } = await pool.query(
      'SELECT userid, user_password FROM users WHERE userid = $1',
      [id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userRows[0];

    // Verify current password (only for non-admin users changing their own password)
    if (req.user.role !== 'admin' || req.user.userid === parseInt(id)) {
      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(currentPassword, user.user_password);

      if (!isValidPassword) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }
    }

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password in database
    const { rows } = await pool.query(
      'UPDATE users SET user_password = $1, updated_at = NOW() WHERE userid = $2 RETURNING userid, user_name, user_email',
      [hashedNewPassword, id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('❌ Error changing password:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
