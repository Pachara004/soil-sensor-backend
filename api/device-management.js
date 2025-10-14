const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const admin = require('firebase-admin');
const { authMiddleware } = require('../middleware/auth');

// เพิ่มอุปกรณ์ใหม่พร้อม sync ไปยัง Firebase (สำหรับทดสอบ - ไม่ต้อง auth)
router.post('/add-device-test', async (req, res) => {
  try {
    const {
      deviceName,
      deviceType = true, // boolean: true for soil-sensor
      userId = 1 // Default user for testing
    } = req.body;

    console.log('📱 Adding new device (TEST MODE):', {
      deviceName,
      deviceType,
      userId
    });

    // Validate required fields
    if (!deviceName) {
      return res.status(400).json({ 
        message: 'Device name is required' 
      });
    }

    // 1. เพิ่มอุปกรณ์ใน PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO device (
        device_name, 
        device_type, 
        userid, 
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *`,
      [
        deviceName,
        deviceType,
        userId
      ]
    );

    const newDevice = rows[0];
    console.log('✅ Device added to PostgreSQL:', newDevice);

    // 2. ส่งข้อมูลไปยัง Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // ส่งข้อมูล device ไปยัง Firebase
        const deviceRef = db.ref(`/devices/${deviceName}`);
        await deviceRef.set({
          deviceId: deviceName,
          deviceid: newDevice.deviceid,        // ✅ รวม deviceid จาก PostgreSQL
          deviceName: deviceName,
          userId: userId,
          userEmail: 'test@example.com',
          userName: 'Test User',
          deviceType: deviceType ? 'soil-sensor' : 'other',
          lastSeen: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // ส่งข้อมูล user-device mapping ไปยัง Firebase
        const userDeviceRef = db.ref(`/user_devices/${userId}/${deviceName}`);
        await userDeviceRef.set({
          deviceId: deviceName,
          deviceid: newDevice.deviceid,        // ✅ รวม deviceid จาก PostgreSQL
          deviceName: deviceName,
          deviceType: deviceType ? 'soil-sensor' : 'other',
          assignedAt: new Date().toISOString(),
          lastSeen: null
        });

        console.log(`✅ Device ${deviceName} sent to Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error sending device to Firebase:', firebaseError);
        // ไม่ return error เพราะ PostgreSQL insert สำเร็จแล้ว
      }
    } else {
      console.log('⚠️ Firebase not initialized, skipping Firebase sync');
    }

    console.log('✅ Device addition completed successfully');

    res.status(201).json({
      message: 'Device added successfully (TEST MODE)',
      device: {
        ...newDevice,
        area_id: newDevice.deviceid  // Add area_id field for frontend compatibility
      },
      firebasePaths: {
        device: `/devices/${deviceName}`,
        userDevice: `/user_devices/${userId}/${deviceName}`
      }
    });

  } catch (error) {
    console.error('❌ Error adding device:', error);
    res.status(500).json({ 
      message: 'Failed to add device',
      error: error.message 
    });
  }
});

// เพิ่มอุปกรณ์ใหม่พร้อม sync ไปยัง Firebase
router.post('/add-device', authMiddleware, async (req, res) => {
  try {
    const {
      deviceName,
      deviceType = true // boolean: true for soil-sensor
    } = req.body;

    console.log('📱 Adding new device:', {
      deviceName,
      deviceType,
      userId: req.user.userid
    });

    // Validate required fields
    if (!deviceName) {
      return res.status(400).json({ 
        message: 'Device name is required' 
      });
    }

    // 1. เพิ่มอุปกรณ์ใน PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO device (
        device_name, 
        device_type, 
        userid, 
        created_at, 
        updated_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING *`,
      [
        deviceName,
        deviceType,
        req.user.userid
      ]
    );

    const newDevice = rows[0];
    console.log('✅ Device added to PostgreSQL:', newDevice);

    // 2. ส่งข้อมูลไปยัง Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // ส่งข้อมูล device ไปยัง Firebase
        const deviceRef = db.ref(`/devices/${deviceName}`);
        await deviceRef.set({
          deviceId: deviceName,
          deviceid: newDevice.deviceid,        // ✅ รวม deviceid จาก PostgreSQL
          deviceName: deviceName,
          userId: req.user.userid,
          userEmail: req.user.email,
          userName: req.user.user_name || req.user.username,
          deviceType: deviceType ? 'soil-sensor' : 'other',
          lastSeen: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // ส่งข้อมูล user-device mapping ไปยัง Firebase
        const userDeviceRef = db.ref(`/user_devices/${req.user.userid}/${deviceName}`);
        await userDeviceRef.set({
          deviceId: deviceName,
          deviceid: newDevice.deviceid,        // ✅ รวม deviceid จาก PostgreSQL
          deviceName: deviceName,
          deviceType: deviceType ? 'soil-sensor' : 'other',
          assignedAt: new Date().toISOString(),
          lastSeen: null
        });

        console.log(`✅ Device ${deviceName} sent to Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error sending device to Firebase:', firebaseError);
        // ไม่ return error เพราะ PostgreSQL insert สำเร็จแล้ว
      }
    } else {
      console.log('⚠️ Firebase not initialized, skipping Firebase sync');
    }

    console.log('✅ Device addition completed successfully');

    res.status(201).json({
      message: 'Device added successfully',
      device: {
        ...newDevice,
        area_id: newDevice.deviceid  // Add area_id field for frontend compatibility
      },
      firebasePaths: {
        device: `/devices/${deviceName}`,
        userDevice: `/user_devices/${req.user.userid}/${deviceName}`
      }
    });

  } catch (error) {
    console.error('❌ Error adding device:', error);
    res.status(500).json({ 
      message: 'Failed to add device',
      error: error.message 
    });
  }
});

// อัพเดทข้อมูลอุปกรณ์พร้อม sync Firebase
router.put('/update-device/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const {
      deviceName,
      deviceType,
      deviceDescription,
      firmwareVersion,
      hardwareVersion,
      status
    } = req.body;

    console.log('📱 Updating device:', {
      deviceId,
      deviceName,
      deviceType,
      deviceDescription,
      firmwareVersion,
      hardwareVersion,
      status,
      userId: req.user.userid
    });

    // 1. อัพเดทข้อมูลใน PostgreSQL
    const { rows } = await pool.query(
      `UPDATE device SET 
        device_name = COALESCE($2, device_name),
        device_type = COALESCE($3, device_type),
        device_description = COALESCE($4, device_description),
        firmware_version = COALESCE($5, firmware_version),
        hardware_version = COALESCE($6, hardware_version),
        status = COALESCE($7, status),
        updated_at = NOW()
      WHERE deviceid = $1 AND userid = $8
      RETURNING *`,
      [
        deviceId,
        deviceName,
        deviceType,
        deviceDescription,
        firmwareVersion,
        hardwareVersion,
        status,
        req.user.userid
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Device not found or access denied' 
      });
    }

    const updatedDevice = rows[0];
    console.log('✅ Device updated in PostgreSQL:', updatedDevice);

    // 2. อัพเดทข้อมูลใน Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // อัพเดทข้อมูล device ใน Firebase
        const deviceRef = db.ref(`/devices/${updatedDevice.device_name}`);
        await deviceRef.update({
          deviceName: updatedDevice.device_name,
          deviceType: updatedDevice.device_type,
          deviceDescription: updatedDevice.device_description,
          firmwareVersion: updatedDevice.firmware_version,
          hardwareVersion: updatedDevice.hardware_version,
          status: updatedDevice.status,
          updatedAt: new Date().toISOString()
        });

        // อัพเดทข้อมูล user-device mapping ใน Firebase
        const userDeviceRef = db.ref(`/user_devices/${req.user.userid}/${updatedDevice.device_name}`);
        await userDeviceRef.update({
          deviceName: updatedDevice.device_name,
          deviceType: updatedDevice.device_type,
          status: updatedDevice.status
        });

        console.log(`✅ Device ${updatedDevice.device_name} updated in Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error updating device in Firebase:', firebaseError);
        // ไม่ return error เพราะ PostgreSQL update สำเร็จแล้ว
      }
    } else {
      console.log('⚠️ Firebase not initialized, skipping Firebase sync');
    }

    console.log('✅ Device update completed successfully');

    res.json({
      message: 'Device updated successfully',
      device: {
        ...updatedDevice,
        area_id: updatedDevice.deviceid  // Add area_id field for frontend compatibility
      },
      firebasePaths: {
        device: `/devices/${updatedDevice.device_name}`,
        userDevice: `/user_devices/${req.user.userid}/${updatedDevice.device_name}`
      }
    });

  } catch (error) {
    console.error('❌ Error updating device:', error);
    res.status(500).json({ 
      message: 'Failed to update device',
      error: error.message 
    });
  }
});

// ลบอุปกรณ์พร้อม sync Firebase
router.delete('/delete-device/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;

    console.log('📱 Deleting device:', {
      deviceId,
      userId: req.user.userid
    });

    // 1. ดึงข้อมูล device ก่อนลบ
    const { rows: deviceRows } = await pool.query(
      'SELECT * FROM device WHERE deviceid = $1 AND userid = $2',
      [deviceId, req.user.userid]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({ 
        message: 'Device not found or access denied' 
      });
    }

    const deviceToDelete = deviceRows[0];

    // 2. ลบข้อมูลใน PostgreSQL
    const { rowCount } = await pool.query(
      'DELETE FROM device WHERE deviceid = $1 AND userid = $2',
      [deviceId, req.user.userid]
    );

    console.log(`✅ Device deleted from PostgreSQL: ${rowCount} row(s)`);

    // 3. ลบข้อมูลใน Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // ลบข้อมูล device จาก Firebase
        const deviceRef = db.ref(`/devices/${deviceToDelete.device_name}`);
        await deviceRef.remove();

        // ลบข้อมูล user-device mapping จาก Firebase
        const userDeviceRef = db.ref(`/user_devices/${req.user.userid}/${deviceToDelete.device_name}`);
        await userDeviceRef.remove();

        console.log(`✅ Device ${deviceToDelete.device_name} deleted from Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error deleting device from Firebase:', firebaseError);
        // ไม่ return error เพราะ PostgreSQL delete สำเร็จแล้ว
      }
    } else {
      console.log('⚠️ Firebase not initialized, skipping Firebase sync');
    }

    console.log('✅ Device deletion completed successfully');

    res.json({
      message: 'Device deleted successfully',
      deletedDevice: {
        deviceId: deviceToDelete.deviceid,
        deviceName: deviceToDelete.device_name,
        deviceType: deviceToDelete.device_type
      },
      firebasePaths: {
        device: `/devices/${deviceToDelete.device_name}`,
        userDevice: `/user_devices/${req.user.userid}/${deviceToDelete.device_name}`
      }
    });

  } catch (error) {
    console.error('❌ Error deleting device:', error);
    res.status(500).json({ 
      message: 'Failed to delete device',
      error: error.message 
    });
  }
});

// ดึงรายการอุปกรณ์ของ user พร้อมข้อมูลจาก Firebase
router.get('/my-devices', authMiddleware, async (req, res) => {
  try {
    console.log('📱 Getting user devices:', {
      userId: req.user.userid
    });

    // 1. ดึงข้อมูลจาก PostgreSQL
    const { rows } = await pool.query(
      'SELECT * FROM device WHERE userid = $1 ORDER BY created_at DESC',
      [req.user.userid]
    );

    console.log(`✅ Found ${rows.length} devices in PostgreSQL`);

    // 2. ดึงข้อมูลจาก Firebase (ถ้ามี)
    let firebaseDevices = {};
    if (admin.apps.length) {
      try {
        const db = admin.database();
        const userDevicesRef = db.ref(`/user_devices/${req.user.userid}`);
        const snapshot = await userDevicesRef.once('value');
        firebaseDevices = snapshot.val() || {};
        console.log(`✅ Found ${Object.keys(firebaseDevices).length} devices in Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error getting devices from Firebase:', firebaseError);
      }
    }

    // 3. รวมข้อมูลจากทั้งสองแหล่ง
    const devicesWithFirebaseData = rows.map(device => ({
      ...device,
      area_id: device.deviceid,  // Add area_id field for frontend compatibility
      firebaseData: firebaseDevices[device.device_name] || null,
      lastSeen: firebaseDevices[device.device_name]?.lastSeen || null,
      isOnline: firebaseDevices[device.device_name]?.status === 'online'
    }));

    res.json({
      message: 'User devices retrieved successfully',
      count: devicesWithFirebaseData.length,
      devices: devicesWithFirebaseData,
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

// Admin endpoints สำหรับจัดการ devices ทั้งหมด
// อัพเดทอุปกรณ์ใดๆ (admin only)
router.put('/admin/update-device/:deviceId', authMiddleware, async (req, res) => {
  try {
    // ตรวจสอบว่าเป็น admin หรือไม่
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Access denied. Admin role required.' 
      });
    }

    const { deviceId } = req.params;
    const {
      deviceName,
      deviceType,
      deviceDescription,
      firmwareVersion,
      hardwareVersion,
      status,
      userId
    } = req.body;

    console.log('🔧 Admin updating device:', {
      deviceId,
      deviceName,
      deviceType,
      deviceDescription,
      firmwareVersion,
      hardwareVersion,
      status,
      userId
    });

    // 1. อัพเดทข้อมูลใน PostgreSQL
    const { rows } = await pool.query(
      `UPDATE device SET 
        device_name = COALESCE($2, device_name),
        device_type = COALESCE($3, device_type),
        device_description = COALESCE($4, device_description),
        firmware_version = COALESCE($5, firmware_version),
        hardware_version = COALESCE($6, hardware_version),
        status = COALESCE($7, status),
        userid = COALESCE($8, userid),
        updated_at = NOW()
      WHERE deviceid = $1
      RETURNING *`,
      [
        deviceId,
        deviceName,
        deviceType,
        deviceDescription,
        firmwareVersion,
        hardwareVersion,
        status,
        userId
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Device not found' 
      });
    }

    const updatedDevice = rows[0];
    console.log('✅ Device updated in PostgreSQL:', updatedDevice);

    // 2. อัพเดทข้อมูลใน Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // อัพเดทข้อมูล device ใน Firebase
        const deviceRef = db.ref(`/devices/${updatedDevice.device_name}`);
        await deviceRef.update({
          deviceName: updatedDevice.device_name,
          deviceType: updatedDevice.device_type,
          deviceDescription: updatedDevice.device_description,
          firmwareVersion: updatedDevice.firmware_version,
          hardwareVersion: updatedDevice.hardware_version,
          status: updatedDevice.status,
          userId: updatedDevice.userid,
          updatedAt: new Date().toISOString()
        });

        // อัพเดทข้อมูล user-device mapping ใน Firebase
        const userDeviceRef = db.ref(`/user_devices/${updatedDevice.userid}/${updatedDevice.device_name}`);
        await userDeviceRef.update({
          deviceName: updatedDevice.device_name,
          deviceType: updatedDevice.device_type,
          status: updatedDevice.status
        });

        console.log(`✅ Device ${updatedDevice.device_name} updated in Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error updating device in Firebase:', firebaseError);
      }
    }

    res.json({
      message: 'Device updated successfully by admin',
      device: updatedDevice,
      firebasePaths: {
        device: `/devices/${updatedDevice.device_name}`,
        userDevice: `/user_devices/${updatedDevice.userid}/${updatedDevice.device_name}`
      }
    });

  } catch (error) {
    console.error('❌ Error updating device by admin:', error);
    res.status(500).json({ 
      message: 'Failed to update device', 
      error: error.message 
    });
  }
});

// ลบอุปกรณ์ใดๆ (admin only)
router.delete('/admin/delete-device/:deviceId', authMiddleware, async (req, res) => {
  try {
    // ตรวจสอบว่าเป็น admin หรือไม่
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Access denied. Admin role required.' 
      });
    }

    const { deviceId } = req.params;

    console.log('🔧 Admin deleting device:', { deviceId });

    // 1. ดึงข้อมูล device ก่อนลบ
    const { rows: deviceRows } = await pool.query(
      'SELECT * FROM device WHERE deviceid = $1',
      [deviceId]
    );

    if (deviceRows.length === 0) {
      return res.status(404).json({ 
        message: 'Device not found' 
      });
    }

    const deviceToDelete = deviceRows[0];

    // 2. ลบข้อมูลใน PostgreSQL
    const { rowCount } = await pool.query(
      'DELETE FROM device WHERE deviceid = $1',
      [deviceId]
    );

    console.log(`✅ Device deleted from PostgreSQL: ${rowCount} row(s)`);

    // 3. ลบข้อมูลใน Firebase
    if (admin.apps.length) {
      try {
        const db = admin.database();
        
        // ลบข้อมูล device จาก Firebase
        const deviceRef = db.ref(`/devices/${deviceToDelete.device_name}`);
        await deviceRef.remove();

        // ลบข้อมูล user-device mapping จาก Firebase
        const userDeviceRef = db.ref(`/user_devices/${deviceToDelete.userid}/${deviceToDelete.device_name}`);
        await userDeviceRef.remove();

        console.log(`✅ Device ${deviceToDelete.device_name} deleted from Firebase`);
      } catch (firebaseError) {
        console.error('❌ Error deleting device from Firebase:', firebaseError);
      }
    }

    res.json({
      message: 'Device deleted successfully by admin',
      deletedDevice: {
        deviceId: deviceToDelete.deviceid,
        deviceName: deviceToDelete.device_name,
        deviceType: deviceToDelete.device_type,
        userId: deviceToDelete.userid
      },
      firebasePaths: {
        device: `/devices/${deviceToDelete.device_name}`,
        userDevice: `/user_devices/${deviceToDelete.userid}/${deviceToDelete.device_name}`
      }
    });

  } catch (error) {
    console.error('❌ Error deleting device by admin:', error);
    res.status(500).json({ 
      message: 'Failed to delete device', 
      error: error.message 
    });
  }
});

// Sync อุปกรณ์ทั้งหมดไปยัง Firebase (สำหรับ admin)
router.post('/sync-all-devices', authMiddleware, async (req, res) => {
  try {
    // ตรวจสอบว่าเป็น admin หรือไม่
    if (req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Access denied. Admin role required.' 
      });
    }

    console.log('🔄 Syncing all devices to Firebase...');

    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    // ดึงข้อมูลอุปกรณ์ทั้งหมดจาก PostgreSQL
    const { rows } = await pool.query(
      'SELECT d.*, u.email, u.user_name, u.username FROM device d JOIN users u ON d.userid = u.userid ORDER BY d.created_at DESC'
    );

    console.log(`📊 Found ${rows.length} devices to sync`);

    const db = admin.database();
    let syncedCount = 0;

    // Sync แต่ละอุปกรณ์ไปยัง Firebase
    for (const device of rows) {
      try {
        // ส่งข้อมูล device ไปยัง Firebase
        const deviceRef = db.ref(`/devices/${device.device_name}`);
        await deviceRef.set({
          deviceId: device.device_name,
          deviceName: device.device_name,
          userId: device.userid,
          userEmail: device.email,
          userName: device.user_name || device.username,
          deviceType: device.device_type,
          deviceDescription: device.device_description,
          firmwareVersion: device.firmware_version,
          hardwareVersion: device.hardware_version,
          status: device.status,
          lastSeen: null,
          createdAt: device.created_at.toISOString(),
          updatedAt: device.updated_at.toISOString()
        });

        // ส่งข้อมูล user-device mapping ไปยัง Firebase
        const userDeviceRef = db.ref(`/user_devices/${device.userid}/${device.device_name}`);
        await userDeviceRef.set({
          deviceId: device.device_name,
          deviceName: device.device_name,
          deviceType: device.device_type,
          status: device.status,
          assignedAt: device.created_at.toISOString(),
          lastSeen: null
        });

        syncedCount++;
        console.log(`✅ Synced device: ${device.device_name}`);
      } catch (error) {
        console.error(`❌ Error syncing device ${device.device_name}:`, error);
      }
    }

    console.log(`🎉 Device sync completed! Synced ${syncedCount} devices`);

    res.json({
      message: 'All devices synced to Firebase successfully',
      syncedCount: syncedCount,
      totalDevices: rows.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error syncing all devices:', error);
    res.status(500).json({ 
      message: 'Failed to sync all devices',
      error: error.message 
    });
  }
});

module.exports = router;

