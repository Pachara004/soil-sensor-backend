const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Middleware เพื่อ check ถ้าเป็น admin
const adminMiddleware = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin only' });
  }
  next();
};

router.get('/devices', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT d.*, u.user_name, u.user_email FROM device d LEFT JOIN users u ON d.userid = u.userid ORDER BY d.created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ message: err.message });
  }
});

router.post('/devices', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { device_name, device_id, userid } = req.body;
    
    if (!device_name || !userid) {
      return res.status(400).json({ message: 'Device name and user ID are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO device (device_name, device_id, device_type, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [device_name, device_id || null, false, userid]
    );

    res.status(201).json({ message: 'Device added successfully', device: rows[0] });
  } catch (err) {
    console.error('Error adding device:', err);
    res.status(500).json({ message: err.message });
  }
});

router.delete('/devices/:deviceId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const { rows } = await pool.query(
      'DELETE FROM device WHERE deviceid = $1 RETURNING *',
      [deviceId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    res.json({ message: 'Device deleted successfully', device: rows[0] });
  } catch (err) {
    console.error('Error deleting device:', err);
    res.status(500).json({ message: err.message });
  }
});

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: err.message });
  }
});

router.put('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { user_name, user_phone, role } = req.body;

    const { rows } = await pool.query(
      `UPDATE users 
       SET user_name = COALESCE($1, user_name),
           user_phone = COALESCE($2, user_phone),
           role = COALESCE($3, role),
           updated_at = NOW()
       WHERE userid = $4
       RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
      [user_name, user_phone, role, userId]
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

router.delete('/users/:userId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (req.user.userid === parseInt(userId)) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    // Delete associated devices first
    await pool.query('DELETE FROM device WHERE userid = $1', [userId]);
    
    // Delete user
    const { rows } = await pool.query(
      'DELETE FROM users WHERE userid = $1 RETURNING userid, user_name, user_email',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ message: 'User and associated devices deleted successfully', user: rows[0] });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;