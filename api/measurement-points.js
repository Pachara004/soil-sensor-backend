const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Get measurement points for an area
router.get('/points/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📍 Getting measurement points for area:', areaId);
    
    // Get all measurement points for this area
    const { rows } = await pool.query(`
      SELECT 
        measurementid,
        point_id,
        areasid,
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
      WHERE areasid = $1 
        AND point_id IS NOT NULL
      ORDER BY point_id ASC
    `, [areaId]);
    
    console.log(`📍 Found ${rows.length} measurement points for area ${areaId}`);
    
    res.json({
      areaId: areaId,
      points: rows.map(row => ({
        measurementId: row.measurementid,
        pointId: row.point_id,
        date: row.measurement_date,
        time: row.measurement_time,
        values: {
          temperature: row.temperature,
          moisture: row.moisture,
          ph: row.ph,
          phosphorus: row.phosphorus,
          potassium: row.potassium,
          nitrogen: row.nitrogen
        },
        measuredAt: row.created_at
      })),
      count: rows.length
    });
    
  } catch (err) {
    console.error('❌ Error getting measurement points:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get measurement progress for an area
router.get('/progress/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📊 Getting measurement progress for area:', areaId);
    
    // Get total planned points and measured points
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN point_id IS NOT NULL THEN 1 END) as measured_points,
        MAX(measurement_date) as last_measurement_date
      FROM measurement 
      WHERE areasid = $1
    `, [areaId]);
    
    const progress = rows[0];
    const completionPercentage = progress.total_points > 0 
      ? Math.round((progress.measured_points / progress.total_points) * 100)
      : 0;
    
    console.log(`📊 Progress for area ${areaId}: ${progress.measured_points}/${progress.total_points} (${completionPercentage}%)`);
    
    res.json({
      areaId: areaId,
      progress: {
        totalPoints: parseInt(progress.total_points),
        measuredPoints: parseInt(progress.measured_points),
        remainingPoints: parseInt(progress.total_points) - parseInt(progress.measured_points),
        completionPercentage: completionPercentage,
        lastMeasurementDate: progress.last_measurement_date
      }
    });
    
  } catch (err) {
    console.error('❌ Error getting measurement progress:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get next measurement point
router.get('/next-point/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('🎯 Getting next measurement point for area:', areaId);
    
    // Get the next unmeasured point
    const { rows } = await pool.query(`
      SELECT 
        point_id,
        areasid
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND measurement_date IS NULL
      ORDER BY point_id ASC
      LIMIT 1
    `, [areaId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'No more measurement points available',
        areaId: areaId
      });
    }
    
    const nextPoint = rows[0];
    console.log(`🎯 Next measurement point: ${nextPoint.point_id} for area ${areaId}`);
    
    res.json({
      areaId: areaId,
      nextPoint: {
        pointId: nextPoint.point_id,
        areasid: nextPoint.areasid
      }
    });
    
  } catch (err) {
    console.error('❌ Error getting next measurement point:', err);
    res.status(500).json({ message: err.message });
  }
});

// Create measurement points for an area
router.post('/create-points/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { pointIds, totalPoints } = req.body; // pointIds: ["A1", "A2", "A3"] or totalPoints: 25
    
    console.log('📍 Creating measurement points for area:', areaId);
    
    let pointsToCreate = [];
    
    if (pointIds && Array.isArray(pointIds)) {
      // Use provided point IDs
      pointsToCreate = pointIds.map(pointId => ({
        point_id: pointId,
        areasid: parseInt(areaId),
        measurement_date: null,
        measurement_time: null,
        temperature: null,
        moisture: null,
        ph: null,
        phosphorus: null,
        potassium: null,
        nitrogen: null,
        created_at: new Date()
      }));
    } else if (totalPoints && totalPoints > 0) {
      // Generate sequential point IDs
      for (let i = 1; i <= totalPoints; i++) {
        pointsToCreate.push({
          point_id: `P${i.toString().padStart(3, '0')}`, // P001, P002, P003...
          areasid: parseInt(areaId),
          measurement_date: null,
          measurement_time: null,
          temperature: null,
          moisture: null,
          ph: null,
          phosphorus: null,
          potassium: null,
          nitrogen: null,
          created_at: new Date()
        });
      }
    } else {
      return res.status(400).json({ 
        message: 'Either pointIds array or totalPoints number is required' 
      });
    }
    
    // Insert measurement points
    const insertPromises = pointsToCreate.map(point => 
      pool.query(`
        INSERT INTO measurement (
          point_id, areasid, measurement_date, measurement_time,
          temperature, moisture, ph, phosphorus, potassium, nitrogen, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING measurementid
      `, [
        point.point_id, point.areasid, point.measurement_date, point.measurement_time,
        point.temperature, point.moisture, point.ph, point.phosphorus, 
        point.potassium, point.nitrogen, point.created_at
      ])
    );
    
    const results = await Promise.all(insertPromises);
    const createdIds = results.map(result => result.rows[0].measurementid);
    
    console.log(`✅ Created ${pointsToCreate.length} measurement points for area ${areaId}`);
    
    res.status(201).json({
      message: 'Measurement points created successfully',
      areaId: areaId,
      createdPoints: pointsToCreate.length,
      pointIds: pointsToCreate.map(p => p.point_id),
      measurementIds: createdIds
    });
    
  } catch (err) {
    console.error('❌ Error creating measurement points:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

