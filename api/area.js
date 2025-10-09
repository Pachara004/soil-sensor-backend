const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Get areas for current user
router.get('/', authMiddleware, async (req, res) => {
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

// Get areas by username (for admin or specific user lookup)
router.get('/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    // First get userid from username
    const { rows: userRows } = await pool.query(
      'SELECT userid FROM users WHERE user_name = $1',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM areas WHERE userid = $1 ORDER BY created_at DESC',
      [userRows[0].userid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching areas by username:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create new area
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg } = req.body;
    if (!area_name) {
      return res.status(400).json({ message: 'Area name is required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO areas (area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, totalmeasurement, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [area_name, ph_avg || null, temperature_avg || null, moisture_avg || null, nitrogen_avg || null, phosphorus_avg || null, potassium_avg || null, 0, req.user.userid]
    );

    res.status(201).json({ message: 'Area created successfully', area: rows[0] });
  } catch (err) {
    console.error('Error creating area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update area
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg } = req.body;

    const { rows } = await pool.query(
      `UPDATE areas 
       SET area_name = COALESCE($1, area_name),
           ph_avg = COALESCE($2, ph_avg),
           temperature_avg = COALESCE($3, temperature_avg),
           moisture_avg = COALESCE($4, moisture_avg),
           nitrogen_avg = COALESCE($5, nitrogen_avg),
           phosphorus_avg = COALESCE($6, phosphorus_avg),
           potassium_avg = COALESCE($7, potassium_avg),
           updated_at = NOW()
       WHERE areasid = $8 AND userid = $9
       RETURNING *`,
      [area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, id, req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Area not found or not owned by user' });
    }

    res.json({ message: 'Area updated', area: rows[0] });
  } catch (err) {
    console.error('Error updating area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Delete area
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      'DELETE FROM areas WHERE areasid = $1 AND userid = $2 RETURNING *',
      [id, req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Area not found or not owned by user' });
    }

    res.json({ message: 'Area deleted', area: rows[0] });
  } catch (err) {
    console.error('Error deleting area:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;