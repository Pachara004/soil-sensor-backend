const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// No-auth middleware for public endpoints
const noAuthMiddleware = (req, res, next) => {
  next();
};

// Helper function to determine device_type based on device name
const getDeviceType = (deviceName) => {
  if (!deviceName) return true; // Default to true if no name
  return !deviceName.toLowerCase().includes('test');
};

// Update device status (online/offline)
router.patch('/:deviceName/status', async (req, res) => {
  try {
    const { deviceName } = req.params;
    const { status } = req.body; // 'online' or 'offline'
    
    // Update device status in database
    const { rows } = await pool.query(
      `UPDATE device 
       SET updated_at = NOW()
       WHERE device_name = $1
       RETURNING deviceid, device_name, userid`,
      [deviceName]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    // For now, we'll just update the timestamp to indicate activity
    // In a real implementation, you might want to add a status column
    res.json({ 
      message: 'Device status updated', 
      device: rows[0],
      status: status 
    });
  } catch (err) {
    console.error('Error updating device status:', err);
    res.status(500).json({ message: err.message });
  }
});

// Heartbeat endpoint for ESP32 devices (no auth required)
router.post('/:deviceName/heartbeat', noAuthMiddleware, async (req, res) => {
  try {
    const { deviceName } = req.params;
    const { temperature, moisture, ph, phosphorus, potassium, nitrogen } = req.body;
    
    console.log(`💓 Heartbeat from ${deviceName}:`, {
      temperature, moisture, ph, phosphorus, potassium, nitrogen
    });
    
    // Update device timestamp to show it's online
    const now = new Date(); // Use JavaScript Date object for current time
    const { rows } = await pool.query(
      `UPDATE device 
       SET updated_at = $1
       WHERE device_name = $2
       RETURNING deviceid, device_name, userid`,
      [now, deviceName]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.json({ 
      message: 'Heartbeat received', 
      device: rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error processing heartbeat:', err);
    res.status(500).json({ message: err.message });
  }
});

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

    // Add device_type and online status to each device
    const devicesWithType = rows.map(device => {
      // Check if device is online (updated within last 2 minutes)
      // Use a simple approach: if updated_at is recent, consider it online
      const now = Date.now();
      const updatedAt = new Date(device.updated_at).getTime();
      const timeDiff = (now - updatedAt) / 1000; // seconds
      const isOnline = timeDiff < 120; // 2 minutes

      return {
        ...device,
        device_type: getDeviceType(device.device_name),
        status: isOnline ? 'online' : 'offline',
        last_seen: device.updated_at
      };
    });

    res.json(devicesWithType);
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

    // Add device_type to each device based on device_name
    const devicesWithType = rows.map(device => ({
      ...device,
      device_type: getDeviceType(device.device_name)
    }));

    res.json(devicesWithType);
  } catch (err) {
    console.error('Error fetching devices by username:', err);
    res.status(500).json({ message: err.message });
  }
});

// Add new device
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { device_name, device_id, deviceId, status, description } = req.body;

    // Handle both device_id and deviceId fields for compatibility
    const finalDeviceId = device_id || deviceId;

    if (!device_name) {
      return res.status(400).json({ message: 'Device name is required' });
    }

    // Determine device_type based on device_name
    const device_type = getDeviceType(device_name);

    // Check if device already exists
    if (finalDeviceId) {
      const { rows: existingDevice } = await pool.query(
        'SELECT * FROM device WHERE device_id = $1',
        [finalDeviceId]
      );

      if (existingDevice.length > 0) {
        return res.status(400).json({ message: 'Device with this ID already exists' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO device (device_name, device_id, device_type, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [device_name, finalDeviceId || null, device_type, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [rows[0].deviceid]
    );

    // Add device_type to response
    const deviceResponse = {
      ...deviceWithUser[0],
      device_type: getDeviceType(deviceWithUser[0].device_name)
    };

    res.status(201).json({ message: 'Device added successfully', device: deviceResponse });
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

    // Determine device_type based on device name
    const deviceName = `Device ${deviceId}`;
    const device_type = getDeviceType(deviceName);

    // Update or insert device
    const { rows } = await pool.query(
      `INSERT INTO device (deviceid, device_name, device_id, device_type, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (deviceid) 
       DO UPDATE SET userid = $5, device_type = $4, updated_at = NOW()
       RETURNING *`,
      [deviceId, deviceName, deviceId, device_type, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [deviceId]
    );

    // Add device_type to response
    const deviceResponse = {
      ...deviceWithUser[0],
      device_type: getDeviceType(deviceWithUser[0].device_name)
    };

    res.json({ message: 'Device claimed', device: deviceResponse });
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

    // Determine device_type based on device_name
    const device_type = getDeviceType(device_name);

    const { rows } = await pool.query(
      `UPDATE device 
       SET device_name = $1, device_type = $2, updated_at = NOW()
       WHERE deviceid = $3 AND userid = $4
       RETURNING *`,
      [device_name, device_type, id, req.user.userid]
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

    // Add device_type to response
    const deviceResponse = {
      ...deviceWithUser[0],
      device_type: getDeviceType(deviceWithUser[0].device_name)
    };

    res.json({ message: 'Device updated', device: deviceResponse });
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
    const { device_name, device_id, deviceId, status, description } = req.body;

    // Handle both device_id and deviceId fields for compatibility
    const finalDeviceId = device_id || deviceId;

    if (!device_name) {
      return res.status(400).json({ message: 'Device name is required' });
    }

    // Determine device_type based on device_name
    const device_type = getDeviceType(device_name);

    // Check if device already exists
    if (finalDeviceId) {
      const { rows: existingDevice } = await pool.query(
        'SELECT * FROM device WHERE device_id = $1',
        [finalDeviceId]
      );

      if (existingDevice.length > 0) {
        return res.status(400).json({ message: 'Device with this ID already exists' });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO device (device_name, device_id, device_type, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [device_name, finalDeviceId || null, device_type, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [rows[0].deviceid]
    );

    // Add device_type to response
    const deviceResponse = {
      ...deviceWithUser[0],
      device_type: getDeviceType(deviceWithUser[0].device_name)
    };

    res.status(201).json({ message: 'Device added successfully', device: deviceResponse });
  } catch (err) {
    console.error('Error adding device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get device info by device name (for ESP32 to get owner info)
router.get('/info/:deviceName', noAuthMiddleware, async (req, res) => {
  try {
    const { deviceName } = req.params;

    const { rows } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.device_name = $1`,
      [deviceName]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    const device = rows[0];
    
    // Add device_type and online status
    const now = Date.now();
    const updatedAt = new Date(device.updated_at).getTime();
    const timeDiff = (now - updatedAt) / 1000; // seconds
    const isOnline = timeDiff < 120; // 2 minutes
    
    console.log(`🔍 Device status calculation for ${deviceName}:`, {
      now: new Date(now).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
      timeDiffSeconds: timeDiff,
      isOnline: isOnline
    });

    const deviceResponse = {
      ...device,
      device_type: getDeviceType(device.device_name),
      status: isOnline ? 'online' : 'offline',
      last_seen: device.updated_at
    };

    res.json(deviceResponse);
  } catch (err) {
    console.error('Error fetching device info:', err);
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

    // Determine device_type based on device name
    const deviceName = `Device ${deviceId}`;
    const device_type = getDeviceType(deviceName);

    // Update or insert device
    const { rows } = await pool.query(
      `INSERT INTO device (deviceid, device_name, device_id, device_type, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (deviceid) 
       DO UPDATE SET userid = $5, device_type = $4, updated_at = NOW()
       RETURNING *`,
      [deviceId, deviceName, deviceId, device_type, req.user.userid]
    );

    // Get device with user info
    const { rows: deviceWithUser } = await pool.query(
      `SELECT d.*, u.user_name, u.user_email 
       FROM device d 
       JOIN users u ON d.userid = u.userid 
       WHERE d.deviceid = $1`,
      [deviceId]
    );

    // Add device_type to response
    const deviceResponse = {
      ...deviceWithUser[0],
      device_type: getDeviceType(deviceWithUser[0].device_name)
    };

    res.json({ message: 'Device claimed', device: deviceResponse });
  } catch (err) {
    console.error('Error claiming device:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;