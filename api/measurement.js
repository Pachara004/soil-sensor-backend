const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Get areas (for Angular compatibility) - MUST be before /:deviceId route
router.get('/areas', authMiddleware, async (req, res) => {
  try {
    const { deviceid } = req.query;

    let query, params;
    if (deviceid) {
      // Get areas for specific device
      query = 'SELECT * FROM areas WHERE userid = $1 AND deviceid = $2 ORDER BY created_at DESC';
      params = [req.user.userid, deviceid];
    } else {
      // Get all areas for user
      query = 'SELECT * FROM areas WHERE userid = $1 ORDER BY created_at DESC';
      params = [req.user.userid];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching areas:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get areas with their measurements - MUST be before /:deviceId route
router.get('/areas/with-measurements', authMiddleware, async (req, res) => {
  try {
    const { deviceid } = req.query;

    let query, params;
    if (deviceid) {
      // Get areas with measurements for specific device
      query = `SELECT 
        a.*,
        json_agg(
          json_build_object(
            'measurementid', m.measurementid,
            'temperature', m.temperature,
            'moisture', m.moisture,
            'ph', m.ph,
            'phosphorus', m.phosphorus,
            'potassium_avg', m.potassium_avg,
            'nitrogen', m.nitrogen,
            'location', m.location,
            'lng', m.lng,
            'lat', m.lat,
            'measurement_date', m.measurement_date,
            'measurement_time', m.measurement_time,
            'created_at', m.created_at
          ) ORDER BY m.created_at
        ) as measurements
      FROM areas a
      LEFT JOIN areas_at aa ON a.areasid = aa.areasid
      LEFT JOIN measurement m ON aa.measurementid = m.measurementid
      WHERE a.userid = $1 AND a.deviceid = $2
      GROUP BY a.areasid
      ORDER BY a.created_at DESC`;
      params = [req.user.userid, deviceid];
    } else {
      // Get all areas with measurements for user
      query = `SELECT 
        a.*,
        json_agg(
          json_build_object(
            'measurementid', m.measurementid,
            'temperature', m.temperature,
            'moisture', m.moisture,
            'ph', m.ph,
            'phosphorus', m.phosphorus,
            'potassium_avg', m.potassium_avg,
            'nitrogen', m.nitrogen,
            'location', m.location,
            'lng', m.lng,
            'lat', m.lat,
            'measurement_date', m.measurement_date,
            'measurement_time', m.measurement_time,
            'created_at', m.created_at
          ) ORDER BY m.created_at
        ) as measurements
      FROM areas a
      LEFT JOIN areas_at aa ON a.areasid = aa.areasid
      LEFT JOIN measurement m ON aa.measurementid = m.measurementid
      WHERE a.userid = $1
      GROUP BY a.areasid
      ORDER BY a.created_at DESC`;
      params = [req.user.userid];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching areas with measurements:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get measurements by device ID - MUST be after specific routes
router.get('/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM measurement WHERE deviceid = $1 ORDER BY measurement_date DESC, measurement_time DESC',
      [deviceId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching measurements:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create new area (when user confirms measurement location)
router.post('/create-area', authMiddleware, async (req, res) => {
  try {
    console.log('🏞️ Create area request body:', req.body);

    const {
      area_name,
      measurements, // Array of measurements for this area
      deviceId
    } = req.body;

    if (!area_name || !measurements || !Array.isArray(measurements) || measurements.length === 0) {
      return res.status(400).json({ message: 'Area name and measurements array are required' });
    }

    // Calculate averages from measurements
    const totalMeasurements = measurements.length;
    const temperature_avg = measurements.reduce((sum, m) => sum + (m.temperature || 0), 0) / totalMeasurements;
    const moisture_avg = measurements.reduce((sum, m) => sum + (m.moisture || 0), 0) / totalMeasurements;
    const ph_avg = measurements.reduce((sum, m) => sum + (m.ph || 0), 0) / totalMeasurements;
    const phosphorus_avg = measurements.reduce((sum, m) => sum + (m.phosphorus || 0), 0) / totalMeasurements;
    const potassium_avg = measurements.reduce((sum, m) => sum + (m.potassium || 0), 0) / totalMeasurements;
    const nitrogen_avg = measurements.reduce((sum, m) => sum + (m.nitrogen || 0), 0) / totalMeasurements;

    // Create area record
    const { rows: areaRows } = await pool.query(
      `INSERT INTO areas (area_name, temperature_avg, moisture_avg, ph_avg, phosphorus_avg, potassium_avg, nitrogen_avg, totalmeasurement, userid, deviceid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [area_name, temperature_avg, moisture_avg, ph_avg, phosphorus_avg, potassium_avg, nitrogen_avg, totalMeasurements, req.user.userid, deviceId]
    );

    const areaId = areaRows[0].areasid;

    // Create individual measurements and link them to the area
    const measurementIds = [];
    const currentDate = new Date();
    const measurementDate = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const measurementTime = currentDate.toTimeString().split(' ')[0]; // HH:MM:SS

    for (const measurement of measurements) {
      // Extract area size from area_name for location
      const extractAreaSize = (areaName) => {
        if (!areaName) return null;
        const numberMatch = areaName.match(/(\d+\.?\d*)/);
        if (numberMatch) {
          return parseFloat(numberMatch[1]);
        }
        return null;
      };

      const areaSize = extractAreaSize(area_name);
      const finalLocation = areaSize !== null ? areaSize.toString() : "0.00";

      const { rows: measurementRows } = await pool.query(
        `INSERT INTO measurement (deviceid, measurement_date, measurement_time, temperature, moisture, ph, phosphorus, potassium_avg, nitrogen, location, lng, lat, is_epoch, is_uptime, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
         RETURNING *`,
        [
          deviceId,
          measurement.measurement_date || measurementDate,
          measurement.measurement_time || measurementTime,
          measurement.temperature,
          measurement.moisture,
          measurement.ph,
          measurement.phosphorus,
          measurement.potassium,
          measurement.nitrogen,
          measurement.location || finalLocation,
          measurement.lng,
          measurement.lat,
          measurement.is_epoch || false,
          measurement.is_uptime || false
        ]
      );

      measurementIds.push(measurementRows[0].measurementid);
    }

    // Create area-measurement relationships
    for (const measurementId of measurementIds) {
      await pool.query(
        'INSERT INTO areas_at (areasid, measurementid) VALUES ($1, $2)',
        [areaId, measurementId]
      );
    }

    res.status(201).json({
      message: 'Area created successfully',
      area: areaRows[0],
      measurements: measurementIds
    });

  } catch (err) {
    console.error('Error creating area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create new measurement (individual measurement)
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Measurement request body:', req.body);

    const {
      deviceid,
      deviceId,
      measurement_date,
      measurement_time,
      date,
      timestamp,
      temperature,
      moisture,
      ph,
      phosphorus,
      potassium,
      nitrogen,
      location,
      lng,
      lat,
      is_epoch,
      is_uptime,
      customLocationName,
      autoLocationName,
      locationNameType,
      measurementPoint
    } = req.body;

    // Handle both deviceid and deviceId fields for compatibility
    const finalDeviceId = deviceid || deviceId;

    // Handle date and time fields
    let finalMeasurementDate, finalMeasurementTime;

    if (date) {
      // Parse ISO date string
      const dateObj = new Date(date);
      finalMeasurementDate = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
      finalMeasurementTime = dateObj.toTimeString().split(' ')[0]; // HH:MM:SS
    } else if (measurement_date && measurement_time) {
      finalMeasurementDate = measurement_date;
      finalMeasurementTime = measurement_time;
    }

    if (!finalDeviceId || !finalMeasurementDate || !finalMeasurementTime) {
      console.log('❌ Missing required fields:', {
        deviceid: finalDeviceId,
        measurement_date: finalMeasurementDate,
        measurement_time: finalMeasurementTime
      });
      return res.status(400).json({ message: 'Device ID, measurement date, and time are required' });
    }

    // Extract area size in square meters from location string
    const extractAreaSize = (locationStr) => {
      if (!locationStr) return null;

      // Try to find any number in the string (including decimals)
      const numberMatch = locationStr.match(/(\d+\.?\d*)/);
      if (numberMatch) {
        return parseFloat(numberMatch[1]);
      }

      return null;
    };

    // Extract area size from location or customLocationName
    const locationText = customLocationName || location;
    const areaSize = extractAreaSize(locationText);

    // Use area size as location value (in square meters)
    const finalLocation = areaSize !== null ? areaSize.toString() : "0.00";

    // Round numeric values to prevent overflow and limit to safe ranges
    const roundValue = (value, decimals = 2, max = 99) => {
      if (value === null || value === undefined) return null;
      const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return Math.min(rounded, max); // Limit to maximum value to prevent overflow
    };

    // Special function for lat/lng with precision 10, scale 8 (max 2 integer digits)
    const roundLatLng = (value, decimals = 6) => {
      if (value === null || value === undefined) return null;
      // For precision 10, scale 8: max value is 99.99999999
      const maxValue = 99.99999999;
      const rounded = Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
      return Math.min(Math.max(rounded, -maxValue), maxValue);
    };

    const { rows } = await pool.query(
      `INSERT INTO measurement (deviceid, measurement_date, measurement_time, temperature, moisture, ph, phosphorus, potassium_avg, nitrogen, location, lng, lat, is_epoch, is_uptime, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`,
      [
        finalDeviceId,
        finalMeasurementDate,
        finalMeasurementTime,
        roundValue(temperature, 2, 100), // Temperature: max 100°C
        roundValue(moisture, 2, 100), // Moisture: max 100%
        roundValue(ph, 2, 14), // pH: max 14
        roundValue(phosphorus, 2, 99), // Phosphorus: max 99
        roundValue(potassium, 2, 99), // Potassium: max 99
        roundValue(nitrogen, 2, 99), // Nitrogen: max 99
        finalLocation || null,
        roundLatLng(lng, 6), // Longitude: precision 10, scale 8
        roundLatLng(lat, 6), // Latitude: precision 10, scale 8
        is_epoch || false,
        is_uptime || false
      ]
    );

    res.status(201).json({ message: 'Measurement saved', measurement: rows[0] });
  } catch (err) {
    console.error('Error saving measurement:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get measurements by area ID
router.get('/area/:areaId', authMiddleware, async (req, res) => {
  try {
    const { areaId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM measurement WHERE areaid = $1 ORDER BY measurement_date DESC, measurement_time DESC',
      [areaId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching measurements by area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update measurement
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      temperature,
      moisture,
      ph,
      phosphorus,
      potassium,
      nitrogen,
      location,
      lng,
      lat
    } = req.body;

    const { rows } = await pool.query(
      `UPDATE measurement 
       SET temperature = COALESCE($1, temperature),
           moisture = COALESCE($2, moisture),
           ph = COALESCE($3, ph),
           phosphorus = COALESCE($4, phosphorus),
           potassium = COALESCE($5, potassium),
           nitrogen = COALESCE($6, nitrogen),
           location = COALESCE($7, location),
           lng = COALESCE($8, lng),
           lat = COALESCE($9, lat)
       WHERE measurementid = $10
       RETURNING *`,
      [temperature, moisture, ph, phosphorus, potassium, nitrogen, location, lng, lat, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Measurement not found' });
    }

    res.json({ message: 'Measurement updated', measurement: rows[0] });
  } catch (err) {
    console.error('Error updating measurement:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete measurement
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM measurement WHERE measurementid = $1 RETURNING *',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Measurement not found' });
    }

    res.json({ message: 'Measurement deleted', measurement: rows[0] });
  } catch (err) {
    console.error('Error deleting measurement:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;