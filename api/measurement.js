const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const admin = require('firebase-admin');

// Function to send area data to Firebase
async function sendAreaToFirebase(areaData) {
  try {
    if (!admin.apps.length) {
      console.log('⚠️ Firebase Admin not initialized, skipping Firebase sync');
      return;
    }

    const db = admin.database();
    const areasRef = db.ref('/areas');
    
    // Send area data to Firebase
    await areasRef.child(areaData.areasid.toString()).set({
      areasid: areaData.areasid,
      area_name: areaData.area_name,
      ph_avg: areaData.ph_avg,
      temperature_avg: areaData.temperature_avg,
      moisture_avg: areaData.moisture_avg,
      nitrogen_avg: areaData.nitrogen_avg,
      phosphorus_avg: areaData.phosphorus_avg,
      potassium_avg: areaData.potassium_avg,
      totalmeasurement: areaData.totalmeasurement,
      userid: areaData.userid,
      created_at: areaData.created_at,
      updated_at: areaData.updated_at
    });

    console.log(`✅ Area ${areaData.areasid} sent to Firebase`);
  } catch (error) {
    console.error('❌ Error sending area to Firebase:', error);
  }
}

// Create new measurement from Firebase data (no auth required)
router.post('/from-firebase', async (req, res) => {
  try {
    const {
      deviceId,
      deviceName,
      finished,
      moisture,
      nitrogen,
      ph,
      phosphorus,
      potassium,
      temperature,
      ts_epoch,
      ts_uptime,
      latitude,
      longitude
    } = req.body;

    console.log('🔥 Received Firebase measurement data:', {
      deviceId,
      deviceName,
      finished,
      moisture,
      nitrogen,
      ph,
      phosphorus,
      potassium,
      temperature,
      ts_epoch,
      ts_uptime
    });

    // Validate required fields
    if (!deviceId || !deviceName || !finished) {
      return res.status(400).json({ 
        message: 'Device ID, device name, and finished status are required' 
      });
    }

    // Only process if measurement is finished
    if (!finished) {
      return res.status(200).json({ 
        message: 'Measurement not finished yet, skipping save' 
      });
    }

    // Find device in PostgreSQL by device_name
    let finalDeviceId;
    try {
      console.log('🔍 Looking up device by name:', deviceName);
      const { rows: deviceRows } = await pool.query(
        'SELECT deviceid FROM device WHERE device_name = $1 LIMIT 1',
        [deviceName]
      );
      
      if (deviceRows.length === 0) {
        console.log(`❌ Device ${deviceName} not found in PostgreSQL`);
        return res.status(404).json({ 
          message: `Device not found: ${deviceName}` 
        });
      }
      
      finalDeviceId = deviceRows[0].deviceid;
      console.log('✅ Device ID resolved to:', finalDeviceId);
    } catch (err) {
      console.error('❌ Error finding device:', err);
      return res.status(500).json({ message: 'Error finding device' });
    }

    // Convert timestamp to date and time
    let measurementDate, measurementTime;
    if (ts_epoch) {
      const dateObj = new Date(ts_epoch * 1000); // Convert Unix timestamp to Date
      measurementDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
      measurementTime = dateObj.toTimeString().split(' ')[0]; // HH:MM:SS
    } else {
      // Use current date/time if no timestamp provided
      const currentDate = new Date();
      measurementDate = currentDate.toISOString().split('T')[0];
      measurementTime = currentDate.toTimeString().split(' ')[0];
    }

    // Round numeric values to match database schema
    const roundValue = (value, decimals = 2, max = 9999) => {
      if (value === null || value === undefined) return null;
      const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return Math.min(rounded, max);
    };

    const roundLatLng = (value, decimals = 8) => {
      if (value === null || value === undefined) return null;
      const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return rounded.toFixed(decimals);
    };

    // Insert measurement into PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO measurement (
        deviceid, 
        measurement_date, 
        measurement_time, 
        temperature, 
        moisture, 
        ph, 
        phosphorus, 
        potassium, 
        nitrogen, 
        lng, 
        lat, 
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      RETURNING *`,
      [
        finalDeviceId,
        measurementDate,
        measurementTime,
        roundValue(temperature, 2, 100), // Temperature: max 100°C
        roundValue(moisture, 2, 100), // Moisture: max 100%
        roundValue(ph, 2, 14), // pH: max 14
        roundValue(phosphorus, 2, 9999), // Phosphorus: max 9999 (matching schema)
        roundValue(potassium, 2, 9999), // Potassium: max 9999 (matching schema)
        roundValue(nitrogen, 2, 9999), // Nitrogen: max 9999 (matching schema)
        roundLatLng(longitude, 8), // Longitude: high precision
        roundLatLng(latitude, 8), // Latitude: high precision
      ]
    );

    console.log('✅ Firebase measurement saved to PostgreSQL:', {
      measurementId: rows[0].measurementid,
      deviceId: finalDeviceId,
      deviceName: deviceName,
      temperature: temperature,
      ph: ph,
      moisture: moisture,
      nitrogen: nitrogen,
      phosphorus: phosphorus,
      potassium: potassium
    });

    res.status(201).json({
      message: 'Firebase measurement saved successfully',
      measurement: rows[0],
      firebaseData: {
        deviceId,
        deviceName,
        finished,
        ts_epoch,
        ts_uptime
      }
    });

  } catch (err) {
    console.error('❌ Error saving Firebase measurement:', err);
    res.status(500).json({ 
      message: 'Failed to save Firebase measurement',
      error: err.message 
    });
  }
});

// Create area endpoint for measurement component
router.post('/create-area', authMiddleware, async (req, res) => {
  try {
    const { area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg } = req.body;
    
    if (!area_name) {
      return res.status(400).json({ message: 'Area name is required' });
    }

    console.log('🌍 Creating new area:', { area_name, userid: req.user.userid });

    const { rows } = await pool.query(
      `INSERT INTO areas (area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, totalmeasurement, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [area_name, ph_avg || null, temperature_avg || null, moisture_avg || null, nitrogen_avg || null, phosphorus_avg || null, potassium_avg || null, 0, req.user.userid]
    );

    console.log('✅ Area created successfully:', rows[0]);

    // Send area data to Firebase
    await sendAreaToFirebase(rows[0]);

    res.status(201).json({ 
      message: 'Area created successfully', 
      area: rows[0] 
    });

  } catch (err) {
    console.error('❌ Error creating area:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
