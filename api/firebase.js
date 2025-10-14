/**
 * Firebase API Endpoints
 * 
 * ให้บริการ REST API สำหรับเข้าถึง Firebase Realtime Database
 * - GET /api/firebase/devices - ดึงข้อมูล devices ทั้งหมด
 * - GET /api/firebase/devices/:deviceId - ดึงข้อมูล device เฉพาะ
 * - GET /api/firebase/live/:deviceId - ดึงข้อมูล live data
 * - GET /api/firebase/users/:userid/devices - ดึง devices ของ user
 */

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Get Firebase database reference
let db = null;
try {
  db = admin.database();
} catch (error) {
  console.error('❌ Firebase not initialized in firebase.js');
}

/**
 * GET /api/firebase/devices
 * ดึงข้อมูล devices ทั้งหมดจาก Firebase
 */
router.get('/devices', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    console.log('🔍 Getting all devices from Firebase...');
    const snapshot = await db.ref('devices').once('value');
    const devices = snapshot.val() || {};
    
    console.log(`📊 Found ${Object.keys(devices).length} devices in Firebase`);
    res.json(devices);
  } catch (error) {
    console.error('❌ Error getting devices from Firebase:', error);
    res.status(500).json({ 
      message: 'Failed to get devices',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/devices/:deviceId
 * ดึงข้อมูล device เฉพาะจาก Firebase
 */
router.get('/devices/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    console.log(`🔍 Getting device ${deviceId} from Firebase...`);
    
    const snapshot = await db.ref(`devices/${deviceId}`).once('value');
    const device = snapshot.val();
    
    if (!device) {
      console.log(`❌ Device ${deviceId} not found in Firebase`);
      return res.status(404).json({ message: 'Device not found' });
    }
    
    console.log(`✅ Device ${deviceId} found in Firebase`);
    res.json(device);
  } catch (error) {
    console.error(`❌ Error getting device ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to get device',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/live/:deviceId
 * ดึงข้อมูล live data จาก Firebase
 */
router.get('/live/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    console.log(`🔍 Getting live data for ${deviceId} from Firebase...`);
    
    const snapshot = await db.ref(`live/${deviceId}`).once('value');
    const liveData = snapshot.val();
    
    if (!liveData) {
      console.log(`❌ No live data for ${deviceId}`);
      return res.status(404).json({ message: 'No live data available' });
    }
    
    console.log(`✅ Live data for ${deviceId} found`);
    res.json(liveData);
  } catch (error) {
    console.error(`❌ Error getting live data for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to get live data',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/users/:userid/devices
 * ดึง devices ของ user จาก Firebase
 */
router.get('/users/:userid/devices', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { userid } = req.params;
    console.log(`🔍 Getting devices for user ${userid} from Firebase...`);
    
    // ดึง device IDs ของ user
    const userSnapshot = await db.ref(`users/${userid}/devices`).once('value');
    const deviceIds = userSnapshot.val() || {};
    
    if (Object.keys(deviceIds).length === 0) {
      console.log(`❌ No devices found for user ${userid}`);
      return res.json({});
    }
    
    // ดึงข้อมูล device แต่ละตัว
    const devices = {};
    for (const deviceId of Object.keys(deviceIds)) {
      const deviceSnapshot = await db.ref(`devices/${deviceId}`).once('value');
      const deviceData = deviceSnapshot.val();
      if (deviceData) {
        devices[deviceId] = deviceData;
      }
    }
    
    console.log(`✅ Found ${Object.keys(devices).length} devices for user ${userid}`);
    res.json(devices);
  } catch (error) {
    console.error(`❌ Error getting devices for user ${req.params.userid}:`, error);
    res.status(500).json({ 
      message: 'Failed to get user devices',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/stats
 * ดึงสถิติการใช้งาน Firebase
 */
router.get('/stats', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    console.log('📊 Getting Firebase stats...');
    
    const [devicesSnapshot, liveSnapshot, usersSnapshot] = await Promise.all([
      db.ref('devices').once('value'),
      db.ref('live').once('value'),
      db.ref('users').once('value')
    ]);
    
    const devices = devicesSnapshot.val() || {};
    const live = liveSnapshot.val() || {};
    const users = usersSnapshot.val() || {};
    
    const stats = {
      totalDevices: Object.keys(devices).length,
      onlineDevices: Object.values(devices).filter(d => d.status === 'online').length,
      offlineDevices: Object.values(devices).filter(d => d.status === 'offline').length,
      liveDataEntries: Object.keys(live).length,
      totalUsers: Object.keys(users).length,
      dataSize: {
        devices: JSON.stringify(devices).length,
        live: JSON.stringify(live).length,
        users: JSON.stringify(users).length,
        total: JSON.stringify(devices).length + JSON.stringify(live).length + JSON.stringify(users).length
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ Firebase stats:', stats);
    res.json(stats);
  } catch (error) {
    console.error('❌ Error getting Firebase stats:', error);
    res.status(500).json({ 
      message: 'Failed to get stats',
      error: error.message 
    });
  }
});

/**
 * POST /api/firebase/sync-user-devices
 * Sync user-device mapping จาก PostgreSQL ไป Firebase
 */
router.post('/sync-user-devices', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    console.log('🔄 Syncing user-device mapping to Firebase...');
    
    const { pool } = require('../config/db');
    
    // ดึงข้อมูล device-user mapping จาก PostgreSQL
    const result = await pool.query(`
      SELECT d.device_name, d.userid, u.user_name
      FROM device d
      LEFT JOIN users u ON d.userid = u.userid
      WHERE d.userid IS NOT NULL
    `);
    
    // สร้าง index ใน Firebase
    const userDevices = {};
    for (const row of result.rows) {
      const userid = row.userid.toString();
      if (!userDevices[userid]) {
        userDevices[userid] = {
          user_name: row.user_name, // ✅ เปลี่ยนเป็น user_name
          devices: {}
        };
      }
      userDevices[userid].devices[row.device_name] = true;
    }
    
    // อัพเดท Firebase
    const updates = {};
    for (const [userid, data] of Object.entries(userDevices)) {
      updates[`users/${userid}`] = data;
    }
    
    await db.ref().update(updates);
    
    console.log(`✅ Synced ${Object.keys(userDevices).length} users to Firebase`);
    res.json({ 
      message: 'Sync completed',
      usersUpdated: Object.keys(userDevices).length 
    });
  } catch (error) {
    console.error('❌ Error syncing user devices:', error);
    res.status(500).json({ 
      message: 'Failed to sync',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/measurements/:deviceId
 * ดึงข้อมูล measurements จาก Firebase
 */
router.get('/measurements/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    console.log(`🔍 Getting measurements for ${deviceId} from Firebase...`);
    
    const snapshot = await db.ref(`measurements/${deviceId}`)
      .orderByChild('timestamp')
      .limitToLast(parseInt(limit))
      .once('value');
    
    const measurements = snapshot.val() || {};
    
    // Convert to array and reverse (newest first)
    const measurementsArray = Object.values(measurements).reverse();
    
    console.log(`✅ Found ${measurementsArray.length} measurements for ${deviceId}`);
    res.json(measurementsArray);
  } catch (error) {
    console.error(`❌ Error getting measurements for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to get measurements',
      error: error.message 
    });
  }
});

/**
 * POST /api/firebase/devices/:deviceId/status
 * อัพเดทสถานะ device ใน Firebase
 */
router.post('/devices/:deviceId/status', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    const { status, sensor_status, sensor_online, last_temperature, last_moisture, last_ph } = req.body;
    
    console.log(`🔄 Updating device status for ${deviceId} in Firebase...`);
    
    const updates = {
      [`devices/${deviceId}/status`]: status,
      [`devices/${deviceId}/sensor_status`]: sensor_status,
      [`devices/${deviceId}/sensor_online`]: sensor_online,
      [`devices/${deviceId}/last_temperature`]: last_temperature,
      [`devices/${deviceId}/last_moisture`]: last_moisture,
      [`devices/${deviceId}/last_ph`]: last_ph,
      [`devices/${deviceId}/updated_at`]: Date.now()
    };
    
    await db.ref().update(updates);
    
    console.log(`✅ Device status updated for ${deviceId}`);
    res.json({ message: 'Device status updated successfully' });
  } catch (error) {
    console.error(`❌ Error updating device status for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to update device status',
      error: error.message 
    });
  }
});

/**
 * POST /api/firebase/live/:deviceId
 * ส่งข้อมูล live ไป Firebase
 */
router.post('/live/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    const liveData = req.body;
    
    console.log(`📡 Sending live data for ${deviceId} to Firebase...`);
    
    // Add timestamp if not provided
    if (!liveData.timestamp) {
      liveData.timestamp = Date.now();
    }
    
    await db.ref(`live/${deviceId}`).set(liveData);
    
    console.log(`✅ Live data sent for ${deviceId}`);
    res.json({ message: 'Live data sent successfully' });
  } catch (error) {
    console.error(`❌ Error sending live data for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to send live data',
      error: error.message 
    });
  }
});

/**
 * POST /api/firebase/measurements/:deviceId
 * ส่งข้อมูล measurement ไป Firebase (สำหรับ ESP32)
 */
router.post('/measurements/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    const measurementData = req.body;
    
    console.log(`📊 ESP32 sending measurement for ${deviceId} to Firebase...`);
    console.log('📊 Measurement data:', JSON.stringify(measurementData, null, 2));
    
    // Check if device exists in PostgreSQL
    const { Pool } = require('pg');
    const connectionString = 'postgresql://neondb_owner:npg_moC9gDneHaZ3@ep-wild-water-a1qolg9l-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
    
    const pool = new Pool({
      connectionString: connectionString,
      ssl: { rejectUnauthorized: false }
    });

    try {
      const client = await pool.connect();
      
      // Check if device exists by device_name
      const { rows: deviceRows } = await client.query(
        'SELECT deviceid, device_name FROM device WHERE device_name = $1 LIMIT 1',
        [deviceId]
      );
      
      client.release();
      await pool.end();
      
      if (deviceRows.length === 0) {
        console.log(`❌ Device ${deviceId} not found in PostgreSQL`);
        return res.status(404).json({ 
          message: `Device not found: ${deviceId}`,
          error: 'Device does not exist in database'
        });
      }
      
      const deviceInfo = deviceRows[0];
      console.log(`✅ Device found: ${deviceInfo.device_name} (ID: ${deviceInfo.deviceid})`);
      
      // Update measurement data with correct deviceid
      measurementData.deviceid = deviceInfo.deviceid;
      
    } catch (dbError) {
      console.error('❌ Error checking device in PostgreSQL:', dbError);
      await pool.end();
      return res.status(500).json({ 
        message: 'Error validating device',
        error: dbError.message 
      });
    }
    
    // Add timestamp if not provided
    if (!measurementData.timestamp) {
      measurementData.timestamp = Date.now();
    }
    
    // Add created_at timestamp for sync service
    if (!measurementData.created_at) {
      measurementData.created_at = Math.floor(Date.now() / 1000).toString();
    }
    
    // Send to Firebase measurements (not nested under deviceId)
    await db.ref(`measurements/${deviceId}`).set(measurementData);
    
    console.log(`✅ Measurement sent to Firebase for ${deviceId}`);
    res.json({ 
      message: 'Measurement sent to Firebase successfully',
      deviceId: deviceId,
      deviceid: measurementData.deviceid,
      timestamp: measurementData.timestamp
    });
  } catch (error) {
    console.error(`❌ Error sending measurement for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to send measurement to Firebase',
      error: error.message 
    });
  }
});

/**
 * DELETE /api/firebase/devices/:deviceId
 * ลบ device จาก Firebase
 */
router.delete('/devices/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    
    console.log(`🗑️ Deleting device ${deviceId} from Firebase...`);
    
    // Delete device and related data
    const updates = {
      [`devices/${deviceId}`]: null,
      [`live/${deviceId}`]: null,
      [`measurements/${deviceId}`]: null
    };
    
    await db.ref().update(updates);
    
    console.log(`✅ Device ${deviceId} deleted from Firebase`);
    res.json({ message: 'Device deleted successfully' });
  } catch (error) {
    console.error(`❌ Error deleting device ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to delete device',
      error: error.message 
    });
  }
});

/**
 * GET /api/firebase/device-owner/:deviceId
 * ดึงข้อมูลเจ้าของ device จาก Firebase
 */
router.get('/device-owner/:deviceId', async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ 
        message: 'Firebase not initialized',
        error: 'Service unavailable' 
      });
    }

    const { deviceId } = req.params;
    
    console.log(`🔍 Getting device owner for ${deviceId} from Firebase...`);
    
    // Search through users to find device owner
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val() || {};
    
    for (const [userid, userData] of Object.entries(users)) {
      if (userData.devices && userData.devices[deviceId]) {
        console.log(`✅ Found owner for ${deviceId}: ${userData.user_name}`);
        return res.json({
          userid: parseInt(userid),
          user_name: userData.user_name,
          deviceId: deviceId
        });
      }
    }
    
    console.log(`❌ No owner found for ${deviceId}`);
    res.status(404).json({ message: 'Device owner not found' });
  } catch (error) {
    console.error(`❌ Error getting device owner for ${req.params.deviceId}:`, error);
    res.status(500).json({ 
      message: 'Failed to get device owner',
      error: error.message 
    });
  }
});

module.exports = router;

