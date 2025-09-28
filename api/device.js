const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Get devices for current user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.userid = $1 
       ORDER BY d.created_at DESC`,
      [req.user.userid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get devices by username (for admin or specific user lookup)
router.get('/by-username/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;

    const { rows } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE u.user_name = $1 
       ORDER BY d.created_at DESC`,
      [username]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found or no devices found' });
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching devices by username:', err);
    res.status(500).json({ message: err.message });
  }
});

// Add new device
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { device_name, device_id } = req.body;
    if (!device_name) {
      return res.status(400).json({ message: 'Device name is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO device (device_name, device_id, userid, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [device_name, device_id || null, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [rows[0].deviceid]
    );

    res.status(201).json({ message: 'Device added successfully', device: deviceWithUser[0] });
  } catch (err) {
    console.error('Error adding device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Claim device (if needed for existing functionality)
router.post('/claim-device', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    // Check if device exists and is not claimed by another user
    const { rows: existingDevice } = await pool.query(
      'SELECT * FROM device WHERE deviceid = $1',
      [deviceId]
    );

    if (existingDevice.length > 0 && existingDevice[0].userid && existingDevice[0].userid !== req.user.userid) {
      return res.status(400).json({ message: 'Device bound to another user' });
    }

    // Update or insert device
    const { rows } = await pool.query(
      `INSERT INTO device (deviceid, device_name, device_id, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (deviceid) 
       DO UPDATE SET userid = $4, updated_at = NOW()
       RETURNING *`,
      [deviceId, `Device ${deviceId}`, deviceId, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [deviceId]
    );

    res.json({ message: 'Device claimed', device: deviceWithUser[0] });
  } catch (err) {
    console.error('Error claiming device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update device
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { device_name } = req.body;

    const { rows } = await pool.query(
      `UPDATE device 
       SET device_name = $1, updated_at = NOW()
       WHERE deviceid = $2 AND userid = $3
       RETURNING *`,
      [device_name, id, req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found or not owned by user' });
    }

    // Get updated device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [id]
    );

    res.json({ message: 'Device updated', device: deviceWithUser[0] });
  } catch (err) {
    console.error('Error updating device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete device
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM device WHERE deviceid = $1 AND userid = $2 RETURNING *',
      [id, req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found or not owned by user' });
    }

    res.json({ message: 'Device deleted', device: rows[0] });
  } catch (err) {
    console.error('Error deleting device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Add device endpoint for Angular compatibility
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { device_name, device_id } = req.body;
    if (!device_name) {
      return res.status(400).json({ message: 'Device name is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO device (device_name, device_id, userid, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       RETURNING *`,
      [device_name, device_id || null, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [rows[0].deviceid]
    );

    res.status(201).json({ message: 'Device added successfully', device: deviceWithUser[0] });
  } catch (err) {
    console.error('Error adding device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Alias endpoint for Angular compatibility
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    if (!deviceId) {
      return res.status(400).json({ message: 'Device ID is required' });
    }

    // Check if device exists and is not claimed by another user
    const { rows: existingDevice } = await pool.query(
      'SELECT * FROM device WHERE deviceid = $1',
      [deviceId]
    );

    if (existingDevice.length > 0 && existingDevice[0].userid && existingDevice[0].userid !== req.user.userid) {
      return res.status(400).json({ message: 'Device bound to another user' });
    }

    // Update or insert device
    const { rows } = await pool.query(
      `INSERT INTO device (deviceid, device_name, device_id, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (deviceid) 
       DO UPDATE SET userid = $4, updated_at = NOW()
       RETURNING *`,
      [deviceId, `Device ${deviceId}`, deviceId, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [deviceId]
    );

    res.json({ message: 'Device claimed', device: deviceWithUser[0] });
  } catch (err) {
    console.error('Error claiming device:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;