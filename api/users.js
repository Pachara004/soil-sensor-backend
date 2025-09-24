const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

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
      'SELECT userid, user_name, user_fullname, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users ORDER BY created_at DESC'
    );

    res.json({ users: rows });
  } catch (err) {
    console.error('Error fetching all users:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get user by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only view their own profile unless they're admin
    if (req.user.role !== 'admin' && req.user.userid !== parseInt(id)) {
      return res.status(403).json({ message: 'Access denied. You can only view your own profile.' });
    }

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_fullname, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
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
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_name, user_phone } = req.body;

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

    const { rows } = await pool.query(
      `UPDATE users 
       SET user_name = COALESCE($1, user_name),
           user_phone = COALESCE($2, user_phone),
           updated_at = NOW()
       WHERE userid = $3
       RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
      [user_name, user_phone, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User updated successfully', user: rows[0] });
  } catch (err) {
    console.error('Error updating user:', err);
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

// Alias endpoints for Angular compatibility
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_fullname, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
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
      'SELECT userid, user_name, user_fullname, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
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

module.exports = router;
