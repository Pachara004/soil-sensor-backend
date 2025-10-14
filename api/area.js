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
      created_at: areaData.created_at
    });

    console.log(`✅ Area ${areaData.areasid} sent to Firebase`);
  } catch (error) {
    console.error('❌ Error sending area to Firebase:', error);
  }
}

// Function to sync all existing areas to Firebase
async function syncAllAreasToFirebase() {
  try {
    if (!admin.apps.length) {
      console.log('⚠️ Firebase Admin not initialized, skipping Firebase sync');
      return;
    }

    console.log('🔄 Syncing all areas to Firebase...');
    
    const { rows } = await pool.query('SELECT * FROM areas ORDER BY areasid');
    
    if (rows.length === 0) {
      console.log('📊 No areas found to sync');
      return;
    }

    console.log(`📊 Found ${rows.length} areas to sync`);
    
    for (const area of rows) {
      await sendAreaToFirebase(area);
    }
    
    console.log('✅ All areas synced to Firebase');
  } catch (error) {
    console.error('❌ Error syncing areas to Firebase:', error);
  }
}

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
    console.log('🌍 Creating new area - Request body:', req.body);
    console.log('🌍 User info:', req.user);
    
    const { area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, description } = req.body;
    
    if (!area_name) {
      console.log('❌ Area name is required');
      return res.status(400).json({ message: 'Area name is required' });
    }

    console.log('🌍 Area data to insert:', {
      area_name,
      ph_avg,
      temperature_avg,
      moisture_avg,
      nitrogen_avg,
      phosphorus_avg,
      potassium_avg,
      description,
      userid: req.user.userid
    });

    const { rows } = await pool.query(
      `INSERT INTO areas (area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, totalmeasurement, userid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [area_name, ph_avg || null, temperature_avg || null, moisture_avg || null, nitrogen_avg || null, phosphorus_avg || null, potassium_avg || null, 0, req.user.userid]
    );

    console.log('✅ Area created in PostgreSQL:', rows[0]);

    // Send area data to Firebase
    await sendAreaToFirebase(rows[0]);

    console.log('✅ Area creation completed successfully');
    
    // Format response for frontend compatibility
    const responseData = {
      message: 'Area created successfully',
      area: {
        ...rows[0],
        area_id: rows[0].areasid  // Add area_id field for frontend compatibility
      }
    };
    
    res.status(201).json(responseData);
  } catch (err) {
    console.error('❌ Error creating area:', err);
    console.error('❌ Error stack:', err.stack);
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
           potassium_avg = COALESCE($7, potassium_avg)
       WHERE areasid = $8 AND userid = $9
       RETURNING *`,
      [area_name, ph_avg, temperature_avg, moisture_avg, nitrogen_avg, phosphorus_avg, potassium_avg, id, req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Area not found or not owned by user' });
    }

    // Send updated area data to Firebase
    await sendAreaToFirebase(rows[0]);

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

    // Delete area from Firebase
    try {
      if (admin.apps.length) {
        const db = admin.database();
        const areasRef = db.ref('/areas');
        await areasRef.child(id).remove();
        console.log(`✅ Area ${id} deleted from Firebase`);
      }
    } catch (error) {
      console.error('❌ Error deleting area from Firebase:', error);
    }

    res.json({ message: 'Area deleted', area: rows[0] });
  } catch (err) {
    console.error('Error deleting area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Sync all areas to Firebase (admin endpoint)
router.post('/sync-to-firebase', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.user_name !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    await syncAllAreasToFirebase();
    res.json({ message: 'All areas synced to Firebase successfully' });
  } catch (err) {
    console.error('Error syncing areas to Firebase:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get measurements for a specific area
router.get('/:id/measurements', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { deviceid } = req.query;
    
    console.log(`🔍 Getting measurements for area ${id}, device: ${deviceid}`);
    
    let query = `
      SELECT 
        m.measurementid,
        m.deviceid,
        m.areasid,
        m.point_id,
        m.lat,
        m.lng,
        m.temperature,
        m.moisture,
        m.nitrogen,
        m.phosphorus,
        m.potassium,
        m.ph,
        m.measurement_date,
        m.measurement_time,
        m.created_at,
        d.device_name
      FROM measurement m
      LEFT JOIN device d ON m.deviceid = d.deviceid
      WHERE m.areasid = $1
    `;
    
    const params = [id];
    
    // Add device filter if provided
    if (deviceid) {
      query += ` AND m.deviceid = $2`;
      params.push(deviceid);
    }
    
    query += ` ORDER BY m.measurementid DESC`;
    
    const { rows } = await pool.query(query, params);
    
    console.log(`📊 Found ${rows.length} measurements for area ${id}`);
    
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching measurements for area:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get all measurements with area information
router.get('/measurements/all', authMiddleware, async (req, res) => {
  try {
    const { deviceid } = req.query;
    
    console.log(`🔍 Getting all measurements, device: ${deviceid}`);
    
    let query = `
      SELECT 
        m.measurementid,
        m.deviceid,
        m.areasid,
        m.point_id,
        m.lat,
        m.lng,
        m.temperature,
        m.moisture,
        m.nitrogen,
        m.phosphorus,
        m.potassium,
        m.ph,
        m.measurement_date,
        m.measurement_time,
        m.created_at,
        d.device_name,
        a.area_name
      FROM measurement m
      LEFT JOIN device d ON m.deviceid = d.deviceid
      LEFT JOIN areas a ON m.areasid = a.areasid
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // Add device filter if provided
    if (deviceid) {
      query += ` AND m.deviceid = $${paramIndex}`;
      params.push(deviceid);
      paramIndex++;
    }
    
    query += ` ORDER BY m.measurementid DESC`;
    
    const { rows } = await pool.query(query, params);
    
    console.log(`📊 Found ${rows.length} total measurements`);
    
    res.json(rows);
  } catch (err) {
    console.error('❌ Error fetching all measurements:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;