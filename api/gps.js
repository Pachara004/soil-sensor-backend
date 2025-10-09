const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Get GPS coordinates for a device
router.get('/device/:deviceName', async (req, res) => {
  try {
    const { deviceName } = req.params;
    
    console.log('🛰️ Getting GPS coordinates for device:', deviceName);
    
    // Get latest measurement with GPS coordinates
    const { rows } = await pool.query(`
      SELECT 
        lng,
        lat,
        measurement_date,
        measurement_time,
        temperature,
        moisture,
        ph,
        phosphorus,
        potassium,
        nitrogen,
        created_at
      FROM measurement 
      WHERE deviceid = $1 
        AND lng IS NOT NULL 
        AND lat IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT 1
    `, [deviceName]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'No GPS coordinates found for this device',
        deviceName: deviceName
      });
    }
    
    const measurement = rows[0];
    console.log('🛰️ GPS coordinates found:', {
      lng: measurement.lng,
      lat: measurement.lat,
      date: measurement.measurement_date,
      time: measurement.measurement_time
    });
    
    res.json({
      deviceName: deviceName,
      coordinates: {
        lng: parseFloat(measurement.lng),
        lat: parseFloat(measurement.lat)
      },
      measurement: {
        date: measurement.measurement_date,
        time: measurement.measurement_time,
        temperature: measurement.temperature,
        moisture: measurement.moisture,
        ph: measurement.ph,
        phosphorus: measurement.phosphorus,
        potassium: measurement.potassium,
        nitrogen: measurement.nitrogen
      },
      lastUpdated: measurement.created_at
    });
    
  } catch (err) {
    console.error('Error getting GPS coordinates:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get all GPS coordinates for a device (history)
router.get('/device/:deviceName/history', async (req, res) => {
  try {
    const { deviceName } = req.params;
    const { limit = 50 } = req.query;
    
    console.log('🛰️ Getting GPS history for device:', deviceName);
    
    const { rows } = await pool.query(`
      SELECT 
        lng,
        lat,
        measurement_date,
        measurement_time,
        temperature,
        moisture,
        ph,
        created_at
      FROM measurement 
      WHERE deviceid = $1 
        AND lng IS NOT NULL 
        AND lat IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT $2
    `, [deviceName, parseInt(limit)]);
    
    const coordinates = rows.map(row => ({
      coordinates: {
        lng: parseFloat(row.lng),
        lat: parseFloat(row.lat)
      },
      measurement: {
        date: row.measurement_date,
        time: row.measurement_time,
        temperature: row.temperature,
        moisture: row.moisture,
        ph: row.ph
      },
      timestamp: row.created_at
    }));
    
    res.json({
      deviceName: deviceName,
      coordinates: coordinates,
      count: coordinates.length
    });
    
  } catch (err) {
    console.error('Error getting GPS history:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get all devices with GPS coordinates
router.get('/devices', async (req, res) => {
  try {
    console.log('🛰️ Getting all devices with GPS coordinates');
    
    const { rows } = await pool.query(`
      SELECT DISTINCT
        m.deviceid,
        d.device_name,
        m.lng,
        m.lat,
        m.measurement_date,
        m.measurement_time,
        m.temperature,
        m.moisture,
        m.ph,
        m.created_at
      FROM measurement m
      JOIN device d ON m.deviceid = d.device_name
      WHERE m.lng IS NOT NULL 
        AND m.lat IS NOT NULL
      ORDER BY m.created_at DESC
    `);
    
    const devices = rows.map(row => ({
      deviceName: row.device_name,
      coordinates: {
        lng: parseFloat(row.lng),
        lat: parseFloat(row.lat)
      },
      measurement: {
        date: row.measurement_date,
        time: row.measurement_time,
        temperature: row.temperature,
        moisture: row.moisture,
        ph: row.ph
      },
      lastUpdated: row.created_at
    }));
    
    res.json({
      devices: devices,
      count: devices.length
    });
    
  } catch (err) {
    console.error('Error getting devices with GPS:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
