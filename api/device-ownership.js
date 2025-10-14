const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const admin = require('firebase-admin');

// ESP32 ส่งข้อมูล device ownership ไปยัง Firebase
router.post('/device-ownership', async (req, res) => {
  try {
    const {
      deviceId,
      deviceName,
      userId,
      userEmail,
      userName,
      deviceType = 'soil-sensor',
      firmwareVersion,
      hardwareVersion,
      status = 'active'
    } = req.body;

    console.log('📱 Received device ownership data:', {
      deviceId,
      deviceName,
      userId,
      userEmail,
      userName,
      deviceType,
      firmwareVersion,
      hardwareVersion,
      status
    });

    // Validate required fields
    if (!deviceId || !deviceName || !userId) {
      return res.status(400).json({ 
        message: 'Device ID, device name, and user ID are required' 
      });
    }

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    
    // 1. ส่งข้อมูล device ownership ไปยัง Firebase
    const deviceRef = db.ref(`/devices/${deviceId}`);
    await deviceRef.set({
      deviceId: deviceId,
      deviceName: deviceName,
      userId: userId,
      userEmail: userEmail,
      userName: userName,
      deviceType: deviceType,
      firmwareVersion: firmwareVersion,
      hardwareVersion: hardwareVersion,
      status: status,
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // 2. ส่งข้อมูล user-device mapping ไปยัง Firebase
    const userDeviceRef = db.ref(`/user_devices/${userId}/${deviceId}`);
    await userDeviceRef.set({
      deviceId: deviceId,
      deviceName: deviceName,
      deviceType: deviceType,
      status: status,
      assignedAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    });

    // 3. อัพเดทข้อมูลใน PostgreSQL (ถ้ามี)
    try {
      // Check if device exists in PostgreSQL
      const { rows: existingDevices } = await pool.query(
        'SELECT * FROM device WHERE device_name = $1',
        [deviceName]
      );

      if (existingDevices.length > 0) {
        // Update existing device
        await pool.query(
          'UPDATE device SET userid = $1, updated_at = NOW() WHERE device_name = $2',
          [userId, deviceName]
        );
        console.log(`✅ Updated device ownership in PostgreSQL: ${deviceName} -> User ${userId}`);
      } else {
        // Create new device record
        await pool.query(
          'INSERT INTO device (device_name, userid, device_type, status, created_at, updated_at) VALUES ($1, $2, $3, $4, NOW(), NOW())',
          [deviceName, userId, deviceType, status]
        );
        console.log(`✅ Created new device in PostgreSQL: ${deviceName} -> User ${userId}`);
      }
    } catch (dbError) {
      console.log('⚠️ PostgreSQL update failed, but Firebase sync succeeded:', dbError.message);
    }

    console.log(`✅ Device ownership synced successfully: ${deviceId} -> User ${userId}`);

    res.status(201).json({
      message: 'Device ownership synced successfully',
      device: {
        deviceId: deviceId,
        deviceName: deviceName,
        userId: userId,
        userEmail: userEmail,
        userName: userName,
        deviceType: deviceType,
        status: status,
        lastSeen: new Date().toISOString()
      },
      firebasePaths: {
        device: `/devices/${deviceId}`,
        userDevice: `/user_devices/${userId}/${deviceId}`
      }
    });

  } catch (error) {
    console.error('❌ Error syncing device ownership:', error);
    res.status(500).json({ 
      message: 'Failed to sync device ownership',
      error: error.message 
    });
  }
});

// ดึงข้อมูล device ownership จาก Firebase
router.get('/device-ownership/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    console.log(`📱 Getting device ownership for: ${deviceId}`);

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    const deviceRef = db.ref(`/devices/${deviceId}`);
    const snapshot = await deviceRef.once('value');
    const deviceData = snapshot.val();

    if (!deviceData) {
      return res.status(404).json({ 
        message: `Device ${deviceId} not found` 
      });
    }

    console.log(`✅ Device ownership retrieved: ${deviceId}`);

    res.json({
      message: 'Device ownership retrieved successfully',
      device: deviceData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting device ownership:', error);
    res.status(500).json({ 
      message: 'Failed to get device ownership',
      error: error.message 
    });
  }
});

// ดึงข้อมูล devices ทั้งหมดของ user จาก Firebase
router.get('/user-devices/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`👤 Getting devices for user: ${userId}`);

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    const userDevicesRef = db.ref(`/user_devices/${userId}`);
    const snapshot = await userDevicesRef.once('value');
    const userDevices = snapshot.val();

    console.log(`✅ User devices retrieved: ${userId}`);

    res.json({
      message: 'User devices retrieved successfully',
      userId: userId,
      devices: userDevices || {},
      count: userDevices ? Object.keys(userDevices).length : 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error getting user devices:', error);
    res.status(500).json({ 
      message: 'Failed to get user devices',
      error: error.message 
    });
  }
});

// อัพเดท device status (heartbeat)
router.post('/device-heartbeat/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status = 'online', batteryLevel, signalStrength, location } = req.body;

    console.log(`💓 Device heartbeat: ${deviceId}`);

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    const deviceRef = db.ref(`/devices/${deviceId}`);
    
    // Update device status
    await deviceRef.update({
      status: status,
      lastSeen: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      batteryLevel: batteryLevel,
      signalStrength: signalStrength,
      location: location
    });

    console.log(`✅ Device heartbeat updated: ${deviceId}`);

    res.json({
      message: 'Device heartbeat updated successfully',
      deviceId: deviceId,
      status: status,
      lastSeen: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error updating device heartbeat:', error);
    res.status(500).json({ 
      message: 'Failed to update device heartbeat',
      error: error.message 
    });
  }
});

module.exports = router;

