const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Get measurements by device ID
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

// Get areas (for Angular compatibility)
router.get('/areas', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM areas WHERE userid = $1 ORDER BY created_at DESC',
      [req.user.userid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching areas:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create new measurement
router.post('/', authMiddleware, async (req, res) => {
  try {
    console.log('📊 Measurement request body:', req.body);

    const {
      deviceid,
      measurement_date,
      measurement_time,
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
      is_uptime
    } = req.body;

    if (!deviceid || !measurement_date || !measurement_time) {
      console.log('❌ Missing required fields:', { deviceid, measurement_date, measurement_time });
      return res.status(400).json({ message: 'Device ID, measurement date, and time are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO measurement (deviceid, measurement_date, measurement_time, temperature, moisture, ph, phosphorus, potassium, nitrogen, location, lng, lat, is_epoch, is_uptime, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
       RETURNING *`,
      [deviceid, measurement_date, measurement_time, temperature || null, moisture || null, ph || null, phosphorus || null, potassium || null, nitrogen || null, location || null, lng || null, lat || null, is_epoch || false, is_uptime || false]
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