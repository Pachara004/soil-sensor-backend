const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Get all devices with user details
router.get('/', async (req, res) => {
  try {
    console.log('🔍 Getting all devices...');
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
       FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      ORDER BY d.created_at DESC
    `);
    
    console.log(`📊 Found ${rows.length} devices`);
    
    const devices = rows.map(device => {
      // ตรวจสอบว่า device online หรือไม่ (updated_at ภายใน 5 นาที = online)
      const now = new Date();
      const updatedAt = new Date(device.updated_at);
      const timeDiff = (now - updatedAt) / 1000 / 60; // นาที
      const isOnline = timeDiff <= 5; // 5 นาที
      
      return {
        deviceid: device.deviceid,
        device_name: device.device_name,
        device_status: isOnline ? 'online' : 'offline',
        sensor_status: device.sensor_status || 'offline',
        sensor_online: device.sensor_online || false,
        last_temperature: device.last_temperature,
        last_moisture: device.last_moisture,
        last_ph: device.last_ph,
        user_name: device.user_name,
        user_email: device.user_email,
        role: device.role,
        firebase_uid: device.firebase_uid,
        created_at: device.created_at,
        updated_at: device.updated_at,
        last_seen: device.updated_at,
        is_online: isOnline
      };
    });
    
    res.json(devices);
    
  } catch (err) {
    console.error('Error getting all devices:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get device info with user details
router.get('/info/:deviceName', async (req, res) => {
  try {
    const { deviceName } = req.params;
    
    console.log('🔍 Getting device info for:', deviceName);
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
       FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.device_name = $1
    `, [deviceName]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const device = rows[0];
    console.log('📊 Device found:', {
      device_name: device.device_name,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role
    });
    
    // ตรวจสอบว่า device online หรือไม่ (updated_at ภายใน 5 นาที = online)
    const now = new Date();
    const updatedAt = new Date(device.updated_at);
    const timeDiff = (now - updatedAt) / 1000 / 60; // นาที
    const isOnline = timeDiff <= 5; // 5 นาที
    
    res.json({
      device_name: device.device_name,
      device_status: isOnline ? 'online' : 'offline',
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role,
      firebase_uid: device.firebase_uid,
      created_at: device.created_at,
      updated_at: device.updated_at,
      last_seen: device.updated_at,
      is_online: isOnline
    });
    
  } catch (err) {
    console.error('Error getting device info:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get device info by device ID
router.get('/info-by-id/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    console.log('🔍 Getting device info for ID:', deviceId);
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
      FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.deviceid = $1
    `, [deviceId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const device = rows[0];
    console.log('📊 Device found:', {
      device_name: device.device_name,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role
    });
    
    res.json({
      device_name: device.device_name,
      device_status: device.device_status,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role,
      firebase_uid: device.firebase_uid,
      created_at: device.created_at,
      updated_at: device.updated_at
    });
    
  } catch (err) {
    console.error('Error getting device info by ID:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create new device
router.post('/', async (req, res) => {
  try {
    console.log('📥 Raw request body:', JSON.stringify(req.body));
    console.log('🔍 Request headers:', req.headers);
    console.log('🔍 User from headers:', req.headers['x-user-id'] || req.headers['user-id'] || 'No user header');
    
    const { deviceId, device_name, status, device_type, description, userid } = req.body;
    
    // ดึง userid จาก body หรือ headers
    let finalUserid = userid || req.headers['x-user-id'] || req.headers['user-id'];
    console.log('🔍 Using userid from body/headers:', finalUserid);
    
    console.log('🔧 Creating new device:', {
      deviceId,
      device_name,
      status,
      device_type,
      description,
      userid: finalUserid,
      useridType: typeof finalUserid,
      useridValue: finalUserid,
      originalUserid: userid
    });
    
    // Validate required fields
    if (!deviceId || !device_name) {
      return res.status(400).json({ 
        message: 'deviceId and device_name are required' 
      });
    }
    
    // Check if device already exists by device_name
    const existingDeviceByName = await pool.query(
      'SELECT deviceid, device_name FROM device WHERE device_name = $1',
      [device_name]
    );
    
    if (existingDeviceByName.rows.length > 0) {
      console.log('❌ Device with name already exists:', existingDeviceByName.rows[0]);
      return res.status(409).json({ 
        message: 'Device with this name already exists',
        existingDevice: existingDeviceByName.rows[0]
      });
    }
    
    // Check if device already exists by deviceId (convert to integer if possible)
    let existingDeviceById = { rows: [] };
    if (!isNaN(deviceId)) {
      existingDeviceById = await pool.query(
        'SELECT deviceid, device_name FROM device WHERE deviceid = $1',
        [parseInt(deviceId)]
      );
    }
    
    if (existingDeviceById.rows.length > 0) {
      console.log('❌ Device with ID already exists:', existingDeviceById.rows[0]);
      return res.status(409).json({ 
        message: 'Device with this ID already exists',
        existingDevice: existingDeviceById.rows[0]
      });
    }
    
    // Generate API key for device authentication
    const apiKey = 'sk_' + Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
    
    // Insert new device (let database auto-generate deviceid)
    const result = await pool.query(`
      INSERT INTO device (
        device_name, device_type, 
        userid, api_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING deviceid, device_name, device_type, 
                userid, api_key, created_at, updated_at
    `, [
      device_name,
      device_type || false,
      finalUserid ? parseInt(finalUserid) : null,
      apiKey
    ]);
    
    const newDevice = result.rows[0];
    console.log('✅ Device created successfully:', {
      deviceid: newDevice.deviceid,
      device_name: newDevice.device_name,
      userid: newDevice.userid,
      api_key: newDevice.api_key.substring(0, 10) + '...'
    });
    
    // Get user information if userid is provided
    let userInfo = null;
    if (newDevice.userid) {
      const userResult = await pool.query(
        'SELECT userid, user_name, user_email, role FROM users WHERE userid = $1',
        [newDevice.userid]
      );
      if (userResult.rows.length > 0) {
        userInfo = userResult.rows[0];
      }
    }

    res.status(201).json({
      message: 'Device created successfully',
      device: {
        deviceid: newDevice.deviceid,
        device_name: newDevice.device_name,
        device_status: 'offline', // Default status
        device_type: newDevice.device_type,
        description: description || null, // Use input description
        userid: newDevice.userid,
        api_key: newDevice.api_key,
        created_at: newDevice.created_at,
        updated_at: newDevice.updated_at,
        user: userInfo // Include user information
      }
    });
    
  } catch (err) {
    console.error('❌ Error creating device:', err);
    console.error('❌ Error details:', {
      message: err.message,
      code: err.code,
      detail: err.detail
    });
    
    // Handle specific database errors
    if (err.code === '23505') { // Unique constraint violation
      return res.status(409).json({ 
        message: 'Device with this name or ID already exists',
        error: 'DUPLICATE_DEVICE'
      });
    }
    
    res.status(500).json({ 
      message: 'Internal server error',
      error: err.message 
    });
  }
});

// Update device
router.put('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { device_name, device_status, device_type, description, userid } = req.body;
    
    console.log('🔧 Updating device:', deviceId);
    
    const result = await pool.query(`
      UPDATE device 
      SET device_name = COALESCE($1, device_name),
          device_status = COALESCE($2, device_status),
          device_type = COALESCE($3, device_type),
          description = COALESCE($4, description),
          userid = COALESCE($5, userid),
          updated_at = NOW()
      WHERE deviceid = $6
      RETURNING deviceid, device_name, device_status, device_type, 
                description, userid, created_at, updated_at
    `, [device_name, device_status, device_type, description, userid, deviceId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const updatedDevice = result.rows[0];
    console.log('✅ Device updated successfully:', {
      deviceid: updatedDevice.deviceid,
      device_name: updatedDevice.device_name
    });
    
    res.json({
      message: 'Device updated successfully',
      device: updatedDevice
    });
    
  } catch (err) {
    console.error('Error updating device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete device
router.delete('/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    console.log('🗑️ Deleting device:', deviceId);
    
    // Delete related measurements first
    await pool.query('DELETE FROM measurement WHERE deviceid = $1', [deviceId]);
    
    // Delete device
    const result = await pool.query(
      'DELETE FROM device WHERE deviceid = $1 RETURNING device_name',
      [deviceId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    console.log('✅ Device deleted successfully:', result.rows[0].device_name);
    
    res.json({
      message: 'Device deleted successfully',
      device_name: result.rows[0].device_name
    });
    
  } catch (err) {
    console.error('Error deleting device:', err);
    res.status(500).json({ message: err.message });
  }
});

// Heartbeat endpoint - รับ sensor status และ measurement data
router.post('/:deviceName/heartbeat', async (req, res) => {
  try {
    const { deviceName } = req.params;
    const { 
      deviceId, 
      ip, 
      rssi, 
      fw, 
      sensorOnline,
      sensorStatus,
      temperature,
      moisture,
      ph
    } = req.body;
    
    console.log('💓 Heartbeat from:', deviceName, {
      sensorStatus,
      sensorOnline,
      temperature,
      moisture,
      ph
    });
    
    // อัปเดต device พร้อม sensor status และ measurement data
    const result = await pool.query(`
      UPDATE device 
      SET 
        updated_at = NOW(),
        sensor_status = $2,
        sensor_online = $3,
        last_temperature = $4,
        last_moisture = $5,
        last_ph = $6
      WHERE device_name = $1
      RETURNING *
    `, [
      deviceName, 
      sensorStatus || 'offline', 
      sensorOnline || false, 
      temperature || null, 
      moisture || null, 
      ph || null
    ]);
    
    if (result.rows.length === 0) {
      console.log('❌ Device not found:', deviceName);
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const device = result.rows[0];
    console.log('✅ Heartbeat updated:', {
      device_name: device.device_name,
      sensor_status: device.sensor_status,
      sensor_online: device.sensor_online,
      last_temperature: device.last_temperature,
      last_moisture: device.last_moisture,
      last_ph: device.last_ph
    });
    
    // ดึงข้อมูล user
    let userName = null;
    if (device.userid) {
      const userResult = await pool.query(
        'SELECT user_name FROM users WHERE userid = $1',
        [device.userid]
      );
      if (userResult.rows.length > 0) {
        userName = userResult.rows[0].user_name;
      }
    }
    
    res.json({
      message: 'Heartbeat received',
      device: {
        device_name: device.device_name,
        sensor_status: device.sensor_status,
        sensor_online: device.sensor_online,
        last_temperature: device.last_temperature,
        last_moisture: device.last_moisture,
        last_ph: device.last_ph,
        updated_at: device.updated_at
      },
      user_name: userName
    });
    
  } catch (err) {
    console.error('❌ Error in heartbeat:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get devices for specific user by Firebase UID
router.get('/user/:firebaseUid', authMiddleware, async (req, res) => {
  try {
    const { firebaseUid } = req.params;
    
    console.log(`🔍 Getting devices for Firebase UID: ${firebaseUid}`);
    
    // First get userid from Firebase UID
    const { rows: userRows } = await pool.query(
      'SELECT userid FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );
    
    if (userRows.length === 0) {
      console.log(`❌ User not found for Firebase UID: ${firebaseUid}`);
      return res.status(404).json({ message: 'User not found' });
    }
    
    const userid = userRows[0].userid;
    console.log(`✅ Found userid: ${userid} for Firebase UID: ${firebaseUid}`);
    
    // Get devices for this user
    const { rows: deviceRows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
       FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.userid = $1
      ORDER BY d.created_at DESC
    `, [userid]);
    
    console.log(`📊 Found ${deviceRows.length} devices for user ${userid}`);
    
    const devices = deviceRows.map(device => {
      // ตรวจสอบว่า device online หรือไม่ (updated_at ภายใน 5 นาที = online)
      const now = new Date();
      const updatedAt = new Date(device.updated_at);
      const timeDiff = (now - updatedAt) / 1000 / 60; // นาที
      const isOnline = timeDiff <= 5; // 5 นาที
      
      return {
        deviceid: device.deviceid,
        device_name: device.device_name,
        device_status: isOnline ? 'online' : 'offline',
        sensor_status: device.sensor_status || 'offline',
        sensor_online: device.sensor_online || false,
        last_temperature: device.last_temperature,
        last_moisture: device.last_moisture,
        last_ph: device.last_ph,
        user_name: device.user_name,
        user_email: device.user_email,
        role: device.role,
        firebase_uid: device.firebase_uid,
        created_at: device.created_at,
        updated_at: device.updated_at,
        last_seen: device.updated_at,
        is_online: isOnline,
        api_key: device.api_key ? device.api_key.substring(0, 10) + '...' : null
      };
    });
    
    res.json(devices);
    
  } catch (err) {
    console.error('❌ Error fetching devices for user:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;