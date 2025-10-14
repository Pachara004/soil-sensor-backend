const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

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
      longitude,
      // Additional fields from ESP32 payload
      measurement_date,
      measurement_time,
      deviceid,
      areasid,
      lat,
      lon,
      lng,
      // Point-based tracking (no GPS)
      point_id,
      point_number,
      grid_x,
      grid_y
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
      ts_uptime,
      areasid,
      point_id
    });

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
      ts_uptime,
      areasid,
      point_id,
      point_number,
      grid_x,
      grid_y
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
    if (measurement_date && measurement_time) {
      // Use provided date and time from ESP32
      measurementDate = measurement_date;
      measurementTime = measurement_time;
    } else if (ts_epoch) {
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
      // Handle both string and number values
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      if (isNaN(numValue)) return null;
      const rounded = Math.round(numValue * Math.pow(10, decimals)) / Math.pow(10, decimals);
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
        areasid,
        point_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
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
        roundLatLng(longitude || lng, 8), // Longitude: high precision
        roundLatLng(latitude || lat, 8), // Latitude: high precision
        areasid || null, // Areas ID from ESP32
        point_id || null // Point ID for tracking without GPS
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
      potassium: potassium,
      areasid: areasid
    });

    // Update area averages if areasid is provided
    if (areasid) {
      try {
        await updateAreaAverages(areasid);
        console.log('✅ Area averages updated for area:', areasid);
      } catch (avgError) {
        console.error('❌ Error updating area averages:', avgError);
        // Don't fail the request if average update fails
      }
    }

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

// Save current live data to PostgreSQL (called from frontend)
router.post('/save-current-live', async (req, res) => {
  try {
    const {
      deviceid,
      areaid,
      point_id,
      lat,
      lng,
      temperature,
      moisture,
      nitrogen,
      phosphorus,
      potassium,
      ph,
      measurement_date,
      created_at
    } = req.body;

    console.log('💾 Saving current live data to PostgreSQL:', {
      deviceid,
      areaid,
      point_id,
      lat,
      lng,
      temperature,
      moisture,
      nitrogen,
      phosphorus,
      potassium,
      ph,
      measurement_date
    });

    // Validate required fields
    const requiredFields = ['deviceid', 'areaid', 'point_id', 'lat', 'lng', 'temperature', 'moisture', 'nitrogen', 'phosphorus', 'potassium', 'ph'];
    const missingFields = requiredFields.filter(field => req.body[field] === undefined || req.body[field] === null || req.body[field] === '');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missing: missingFields,
        required: requiredFields
      });
    }

    // Insert into PostgreSQL measurement table with new fields
    const query = `
      INSERT INTO measurement (
        deviceid, areasid, point_id, lat, lng,
        temperature, moisture, nitrogen, phosphorus, potassium, ph,
        measurement_date, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      deviceid,
      areaid,
      point_id,
      lat,
      lng,
      temperature,
      moisture,
      nitrogen,
      phosphorus,
      potassium,
      ph,
      measurement_date,
      created_at
    ];

    const result = await pool.query(query, values);
    const savedMeasurement = result.rows[0];

    console.log('✅ Live data saved to PostgreSQL:', {
      measurementId: savedMeasurement.measurementid,
      deviceId: deviceid,
      areaId: areaid,
      pointId: point_id,
      coordinates: `${lat}, ${lng}`,
      temperature,
      moisture,
      ph,
      nitrogen,
      phosphorus,
      potassium
    });

    // Update area averages after saving measurement
    try {
      await updateAreaAverages(areaid);
      console.log('✅ Area averages updated for area:', areaid);
    } catch (avgError) {
      console.error('❌ Error updating area averages:', avgError);
      // Don't fail the request if average update fails
    }

    res.status(201).json({
      success: true,
      message: 'Live data saved successfully',
      measurement: savedMeasurement
    });

  } catch (error) {
    console.error('❌ Error saving live data:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Function to update area averages based on measurements
async function updateAreaAverages(areaId) {
  try {
    console.log('📊 Calculating averages for area:', areaId);
    
    // Get all measurements for this area
    const { rows: measurements } = await pool.query(`
      SELECT 
        temperature,
        moisture,
        ph,
        nitrogen,
        phosphorus,
        potassium
      FROM measurement 
      WHERE areasid = $1 
        AND temperature IS NOT NULL 
        AND moisture IS NOT NULL 
        AND ph IS NOT NULL
        AND nitrogen IS NOT NULL
        AND phosphorus IS NOT NULL
        AND potassium IS NOT NULL
    `, [areaId]);

    if (measurements.length === 0) {
      console.log('⚠️ No valid measurements found for area:', areaId);
      return;
    }

    // Calculate averages
    const totals = measurements.reduce((acc, measurement) => {
      acc.temperature += parseFloat(measurement.temperature) || 0;
      acc.moisture += parseFloat(measurement.moisture) || 0;
      acc.ph += parseFloat(measurement.ph) || 0;
      acc.nitrogen += parseFloat(measurement.nitrogen) || 0;
      acc.phosphorus += parseFloat(measurement.phosphorus) || 0;
      acc.potassium += parseFloat(measurement.potassium) || 0;
      return acc;
    }, {
      temperature: 0,
      moisture: 0,
      ph: 0,
      nitrogen: 0,
      phosphorus: 0,
      potassium: 0
    });

    const averages = {
      temperature_avg: Math.round((totals.temperature / measurements.length) * 100) / 100,
      moisture_avg: Math.round((totals.moisture / measurements.length) * 100) / 100,
      ph_avg: Math.round((totals.ph / measurements.length) * 100) / 100,
      nitrogen_avg: Math.round((totals.nitrogen / measurements.length) * 100) / 100,
      phosphorus_avg: Math.round((totals.phosphorus / measurements.length) * 100) / 100,
      potassium_avg: Math.round((totals.potassium / measurements.length) * 100) / 100,
      totalmeasurement: measurements.length
    };

    console.log('📊 Calculated averages for area', areaId, ':', averages);

    // Update the area table with calculated averages
    const updateQuery = `
      UPDATE areas 
      SET 
        temperature_avg = $1,
        moisture_avg = $2,
        ph_avg = $3,
        nitrogen_avg = $4,
        phosphorus_avg = $5,
        potassium_avg = $6,
        totalmeasurement = $7,
        textupdated = NOW()
      WHERE areasid = $8
    `;

    await pool.query(updateQuery, [
      averages.temperature_avg,
      averages.moisture_avg,
      averages.ph_avg,
      averages.nitrogen_avg,
      averages.phosphorus_avg,
      averages.potassium_avg,
      averages.totalmeasurement,
      areaId
    ]);

    console.log('✅ Area averages updated successfully for area:', areaId);

  } catch (error) {
    console.error('❌ Error updating area averages:', error);
    throw error;
  }
}

module.exports = router;
