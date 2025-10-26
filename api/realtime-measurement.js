const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const admin = require('firebase-admin');
// Avoid requiring server here to prevent circular dependency with server.js
// If we need to send commands to devices, write directly to Firebase /commands/{deviceId}

// ดึงข้อมูล measurement แบบ real-time จาก Firebase
router.get('/live-measurements/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    // Removed verbose logging to improve performance
    
    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    
    // ดึงข้อมูล live measurement จาก Firebase
    const liveRef = db.ref(`/live/${deviceId}`);
    const liveSnapshot = await liveRef.once('value');
    const liveData = liveSnapshot.val();
    
    // ดึงข้อมูล measurement ล่าสุดจาก Firebase
    const measurementRef = db.ref(`/measurements/${deviceId}`);
    const measurementSnapshot = await measurementRef.once('value');
    const measurementData = measurementSnapshot.val();
    
    // ดึงข้อมูล areasid จาก PostgreSQL
    const { rows: areas } = await pool.query(
      'SELECT areasid, area_name FROM areas ORDER BY areasid DESC'
    );
    
    res.json({
      message: 'Live measurements retrieved successfully',
      deviceId: deviceId,
      liveData: liveData,
      latestMeasurement: measurementData,
      availableAreas: areas,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting live measurements:', error);
    res.status(500).json({ 
      message: 'Failed to get live measurements',
      error: error.message 
    });
  }
});

// ดึงข้อมูล measurement ทั้งหมดจาก Firebase สำหรับ device
router.get('/measurements/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    // Removed verbose logging to improve performance
    
    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    const measurementsRef = db.ref(`/measurements/${deviceId}`);
    const snapshot = await measurementsRef.once('value');
    const measurements = snapshot.val();
    
    res.json({
      message: 'Measurements retrieved successfully',
      deviceId: deviceId,
      measurements: measurements,
      count: measurements ? Object.keys(measurements).length : 0,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting measurements:', error);
    res.status(500).json({ 
      message: 'Failed to get measurements',
      error: error.message 
    });
  }
});

// ส่งคำสั่งไปยัง ESP32 เพื่อไปจุดถัดไป
router.post('/next-measurement/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { areasid, lat, lng } = req.body;
    
    console.log(`🎯 Sending next measurement command to device: ${deviceId}`);
    console.log(`📍 Next location: areasid=${areasid}, lat=${lat}, lng=${lng}`);
    
    // Write command directly to Firebase so the realtime service (server) can pick it up
    const db = admin.database();
    await db.ref(`/commands/${deviceId}`).set({
      action: 'next_measurement',
      areasid: areasid,
      lat: lat,
      lng: lng,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    console.log(`✅ Next measurement command queued in Firebase for device: ${deviceId}`);
    
    res.json({
      message: 'Next measurement command sent successfully',
      deviceId: deviceId,
      command: {
        action: 'next_measurement',
        areasid: areasid,
        lat: lat,
        lng: lng,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Error sending next measurement command:', error);
    res.status(500).json({ 
      message: 'Failed to send next measurement command',
      error: error.message 
    });
  }
});

// ดึงสถานะการวัดปัจจุบัน
router.get('/measurement-status/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    // Removed verbose logging to improve performance
    
    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    
    // ดึงสถานะจาก Firebase
    const statusRef = db.ref(`/devices/${deviceId}/status`);
    const statusSnapshot = await statusRef.once('value');
    const deviceStatus = statusSnapshot.val();
    
    // ดึงข้อมูล live measurement
    const liveRef = db.ref(`/live/${deviceId}`);
    const liveSnapshot = await liveRef.once('value');
    const liveData = liveSnapshot.val();
    
    res.json({
      message: 'Measurement status retrieved successfully',
      deviceId: deviceId,
      deviceStatus: deviceStatus,
      liveData: liveData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error getting measurement status:', error);
    res.status(500).json({ 
      message: 'Failed to get measurement status',
      error: error.message 
    });
  }
});

module.exports = router;
