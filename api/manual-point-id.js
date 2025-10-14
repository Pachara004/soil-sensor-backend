const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Manual Point ID System - Complete Implementation

// 1. Create measurement points for an area with custom point IDs
router.post('/create-points/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { 
      pointIds,           // ["A1", "A2", "B1", "B2"] - Custom point IDs
      totalPoints,        // 25 - Generate sequential points
      pointPattern,       // "A", "B", "C" - Pattern for point IDs
      gridSize            // {rows: 5, cols: 5} - Grid pattern
    } = req.body;

    console.log('📍 Creating measurement points for area:', areaId);
    console.log('📋 Point configuration:', { pointIds, totalPoints, pointPattern, gridSize });

    let pointsToCreate = [];

    if (pointIds && Array.isArray(pointIds)) {
      // Use provided custom point IDs
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
    } else if (gridSize && gridSize.rows && gridSize.cols) {
      // Generate grid-based point IDs
      const { rows, cols } = gridSize;
      for (let row = 1; row <= rows; row++) {
        for (let col = 1; col <= cols; col++) {
          const pointId = `${String.fromCharCode(64 + row)}${col}`; // A1, A2, B1, B2...
          pointsToCreate.push({
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
          });
        }
      }
    } else if (pointPattern && totalPoints) {
      // Generate pattern-based point IDs
      for (let i = 1; i <= totalPoints; i++) {
        const pointId = `${pointPattern}${i.toString().padStart(3, '0')}`; // A001, A002...
        pointsToCreate.push({
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
        });
      }
    } else if (totalPoints) {
      // Generate sequential point IDs
      for (let i = 1; i <= totalPoints; i++) {
        const pointId = `P${i.toString().padStart(3, '0')}`; // P001, P002...
        pointsToCreate.push({
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
        });
      }
    } else {
      return res.status(400).json({ 
        message: 'Please provide pointIds array, totalPoints number, pointPattern, or gridSize' 
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
      measurementIds: createdIds,
      configuration: {
        pointIds: pointIds,
        totalPoints: totalPoints,
        pointPattern: pointPattern,
        gridSize: gridSize
      }
    });

  } catch (err) {
    console.error('❌ Error creating measurement points:', err);
    res.status(500).json({ message: err.message });
  }
});

// 2. Get all measurement points for an area
router.get('/points/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { status = 'all' } = req.query; // 'all', 'measured', 'unmeasured'
    
    console.log('📍 Getting measurement points for area:', areaId, 'Status:', status);
    
    let query = `
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
    `;
    
    const params = [areaId];
    
    if (status === 'measured') {
      query += ` AND measurement_date IS NOT NULL`;
    } else if (status === 'unmeasured') {
      query += ` AND measurement_date IS NULL`;
    }
    
    query += ` ORDER BY point_id ASC`;
    
    const { rows } = await pool.query(query, params);
    
    console.log(`📍 Found ${rows.length} measurement points for area ${areaId}`);
    
    const points = rows.map(row => ({
      measurementId: row.measurementid,
      pointId: row.point_id,
      status: row.measurement_date ? 'measured' : 'unmeasured',
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
    }));
    
    res.json({
      areaId: areaId,
      status: status,
      points: points,
      count: points.length,
      measuredCount: points.filter(p => p.status === 'measured').length,
      unmeasuredCount: points.filter(p => p.status === 'unmeasured').length
    });
    
  } catch (err) {
    console.error('❌ Error getting measurement points:', err);
    res.status(500).json({ message: err.message });
  }
});

// 3. Get measurement progress for an area
router.get('/progress/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📊 Getting measurement progress for area:', areaId);
    
    // Get total planned points and measured points
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL THEN 1 END) as measured_points,
        COUNT(CASE WHEN measurement_date IS NULL THEN 1 END) as unmeasured_points,
        MAX(measurement_date) as last_measurement_date,
        MIN(measurement_date) as first_measurement_date
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
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
        unmeasuredPoints: parseInt(progress.unmeasured_points),
        completionPercentage: completionPercentage,
        firstMeasurementDate: progress.first_measurement_date,
        lastMeasurementDate: progress.last_measurement_date,
        isComplete: progress.unmeasured_points == 0
      }
    });
    
  } catch (err) {
    console.error('❌ Error getting measurement progress:', err);
    res.status(500).json({ message: err.message });
  }
});

// 4. Get next measurement point
router.get('/next-point/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { strategy = 'sequential' } = req.query; // 'sequential', 'random', 'priority'
    
    console.log('🎯 Getting next measurement point for area:', areaId, 'Strategy:', strategy);
    
    let query = `
      SELECT 
        measurementid,
        point_id,
        areasid
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND measurement_date IS NULL
    `;
    
    if (strategy === 'sequential') {
      query += ` ORDER BY point_id ASC`;
    } else if (strategy === 'random') {
      query += ` ORDER BY RANDOM()`;
    } else if (strategy === 'priority') {
      // Could add priority field later
      query += ` ORDER BY point_id ASC`;
    }
    
    query += ` LIMIT 1`;
    
    const { rows } = await pool.query(query, [areaId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'No more measurement points available',
        areaId: areaId,
        isComplete: true
      });
    }
    
    const nextPoint = rows[0];
    console.log(`🎯 Next measurement point: ${nextPoint.point_id} for area ${areaId}`);
    
    res.json({
      areaId: areaId,
      nextPoint: {
        measurementId: nextPoint.measurementid,
        pointId: nextPoint.point_id,
        areasid: nextPoint.areasid
      },
      strategy: strategy,
      isComplete: false
    });
    
  } catch (err) {
    console.error('❌ Error getting next measurement point:', err);
    res.status(500).json({ message: err.message });
  }
});

// 5. Mark a point as measured
router.put('/mark-measured/:areaId/:pointId', async (req, res) => {
  try {
    const { areaId, pointId } = req.params;
    const { 
      measurementDate, 
      measurementTime,
      temperature,
      moisture,
      ph,
      phosphorus,
      potassium,
      nitrogen
    } = req.body;
    
    console.log('✅ Marking point as measured:', { areaId, pointId });
    
    const { rows } = await pool.query(`
      UPDATE measurement 
      SET 
        measurement_date = COALESCE($3, CURRENT_DATE),
        measurement_time = COALESCE($4, CURRENT_TIME),
        temperature = COALESCE($5, temperature),
        moisture = COALESCE($6, moisture),
        ph = COALESCE($7, ph),
        phosphorus = COALESCE($8, phosphorus),
        potassium = COALESCE($9, potassium),
        nitrogen = COALESCE($10, nitrogen),
        created_at = NOW()
      WHERE areasid = $1 
        AND point_id = $2
        AND measurement_date IS NULL
      RETURNING *
    `, [
      areaId, pointId, measurementDate, measurementTime,
      temperature, moisture, ph, phosphorus, potassium, nitrogen
    ]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Point not found or already measured',
        areaId: areaId,
        pointId: pointId
      });
    }
    
    console.log(`✅ Point ${pointId} marked as measured`);
    
    res.json({
      message: 'Point marked as measured successfully',
      areaId: areaId,
      pointId: pointId,
      measurement: rows[0]
    });
    
  } catch (err) {
    console.error('❌ Error marking point as measured:', err);
    res.status(500).json({ message: err.message });
  }
});

// 6. Reset measurement points (for testing)
router.put('/reset/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('🔄 Resetting measurement points for area:', areaId);
    
    const { rowCount } = await pool.query(`
      UPDATE measurement 
      SET 
        measurement_date = NULL,
        measurement_time = NULL,
        temperature = NULL,
        moisture = NULL,
        ph = NULL,
        phosphorus = NULL,
        potassium = NULL,
        nitrogen = NULL,
        created_at = NOW()
      WHERE areasid = $1 
        AND point_id IS NOT NULL
    `, [areaId]);
    
    console.log(`🔄 Reset ${rowCount} measurement points for area ${areaId}`);
    
    res.json({
      message: 'Measurement points reset successfully',
      areaId: areaId,
      resetCount: rowCount
    });
    
  } catch (err) {
    console.error('❌ Error resetting measurement points:', err);
    res.status(500).json({ message: err.message });
  }
});

// 7. Get measurement statistics
router.get('/stats/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📈 Getting measurement statistics for area:', areaId);
    
    // Get basic stats
    const { rows: basicStats } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL THEN 1 END) as measured_points,
        COUNT(CASE WHEN measurement_date IS NULL THEN 1 END) as unmeasured_points
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    // Get value statistics
    const { rows: valueStats } = await pool.query(`
      SELECT 
        AVG(temperature) as avg_temperature,
        AVG(moisture) as avg_moisture,
        AVG(ph) as avg_ph,
        AVG(phosphorus) as avg_phosphorus,
        AVG(potassium) as avg_potassium,
        AVG(nitrogen) as avg_nitrogen,
        MIN(temperature) as min_temperature,
        MAX(temperature) as max_temperature,
        MIN(moisture) as min_moisture,
        MAX(moisture) as max_moisture,
        MIN(ph) as min_ph,
        MAX(ph) as max_ph
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL 
        AND measurement_date IS NOT NULL
    `, [areaId]);
    
    const basic = basicStats[0];
    const values = valueStats[0];
    
    res.json({
      areaId: areaId,
      basicStats: {
        totalPoints: parseInt(basic.total_points),
        measuredPoints: parseInt(basic.measured_points),
        unmeasuredPoints: parseInt(basic.unmeasured_points),
        completionPercentage: basic.total_points > 0 
          ? Math.round((basic.measured_points / basic.total_points) * 100)
          : 0
      },
      valueStats: {
        averages: {
          temperature: values.avg_temperature ? parseFloat(values.avg_temperature) : null,
          moisture: values.avg_moisture ? parseFloat(values.avg_moisture) : null,
          ph: values.avg_ph ? parseFloat(values.avg_ph) : null,
          phosphorus: values.avg_phosphorus ? parseFloat(values.avg_phosphorus) : null,
          potassium: values.avg_potassium ? parseFloat(values.avg_potassium) : null,
          nitrogen: values.avg_nitrogen ? parseFloat(values.avg_nitrogen) : null
        },
        ranges: {
          temperature: {
            min: values.min_temperature ? parseFloat(values.min_temperature) : null,
            max: values.max_temperature ? parseFloat(values.max_temperature) : null
          },
          moisture: {
            min: values.min_moisture ? parseFloat(values.min_moisture) : null,
            max: values.max_moisture ? parseFloat(values.max_moisture) : null
          },
          ph: {
            min: values.min_ph ? parseFloat(values.min_ph) : null,
            max: values.max_ph ? parseFloat(values.max_ph) : null
          }
        }
      }
    });
    
  } catch (err) {
    console.error('❌ Error getting measurement statistics:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
