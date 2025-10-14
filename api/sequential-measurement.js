const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Sequential Measurement System - For automated measurement flow

// 1. Start measurement session for an area
router.post('/start-session/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { 
      deviceId, 
      sessionName,
      measurementInterval = 30, // seconds between measurements
      autoAdvance = true
    } = req.body;
    
    console.log('🚀 Starting measurement session for area:', areaId);
    
    // Check if area has measurement points
    const { rows: pointsCheck } = await pool.query(`
      SELECT COUNT(*) as total_points,
             COUNT(CASE WHEN measurement_date IS NOT NULL THEN 1 END) as measured_points
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    if (pointsCheck[0].total_points == 0) {
      return res.status(400).json({ 
        message: 'No measurement points found for this area. Please create points first.',
        areaId: areaId
      });
    }
    
    // Get first unmeasured point
    const { rows: nextPoint } = await pool.query(`
      SELECT measurementid, point_id, areasid
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND measurement_date IS NULL
      ORDER BY point_id ASC
      LIMIT 1
    `, [areaId]);
    
    if (nextPoint.length === 0) {
      return res.status(400).json({ 
        message: 'All points have been measured for this area',
        areaId: areaId,
        isComplete: true
      });
    }
    
    // Create session record (if you have a sessions table)
    const sessionId = `session_${Date.now()}`;
    
    console.log(`🚀 Measurement session started: ${sessionId}`);
    console.log(`🎯 First point to measure: ${nextPoint[0].point_id}`);
    
    res.status(201).json({
      message: 'Measurement session started successfully',
      sessionId: sessionId,
      areaId: areaId,
      deviceId: deviceId,
      sessionName: sessionName,
      firstPoint: {
        measurementId: nextPoint[0].measurementid,
        pointId: nextPoint[0].point_id,
        areasid: nextPoint[0].areasid
      },
      configuration: {
        measurementInterval: measurementInterval,
        autoAdvance: autoAdvance
      },
      progress: {
        totalPoints: parseInt(pointsCheck[0].total_points),
        measuredPoints: parseInt(pointsCheck[0].measured_points),
        remainingPoints: parseInt(pointsCheck[0].total_points) - parseInt(pointsCheck[0].measured_points)
      }
    });
    
  } catch (err) {
    console.error('❌ Error starting measurement session:', err);
    res.status(500).json({ message: err.message });
  }
});

// 2. Get current measurement point for a session
router.get('/current-point/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { deviceId } = req.query;
    
    console.log('🎯 Getting current measurement point for area:', areaId);
    
    // Get next unmeasured point
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
        nitrogen
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
        areaId: areaId,
        isComplete: true
      });
    }
    
    const currentPoint = rows[0];
    
    // Get progress info
    const { rows: progress } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL THEN 1 END) as measured_points
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    const progressInfo = progress[0];
    const completionPercentage = progressInfo.total_points > 0 
      ? Math.round((progressInfo.measured_points / progressInfo.total_points) * 100)
      : 0;
    
    console.log(`🎯 Current point: ${currentPoint.point_id} (${completionPercentage}% complete)`);
    
    res.json({
      areaId: areaId,
      currentPoint: {
        measurementId: currentPoint.measurementid,
        pointId: currentPoint.point_id,
        areasid: currentPoint.areasid,
        status: 'pending'
      },
      progress: {
        totalPoints: parseInt(progressInfo.total_points),
        measuredPoints: parseInt(progressInfo.measured_points),
        remainingPoints: parseInt(progressInfo.total_points) - parseInt(progressInfo.measured_points),
        completionPercentage: completionPercentage,
        currentPointNumber: parseInt(progressInfo.measured_points) + 1
      },
      isComplete: false
    });
    
  } catch (err) {
    console.error('❌ Error getting current measurement point:', err);
    res.status(500).json({ message: err.message });
  }
});

// 3. Complete current measurement and advance to next
router.post('/complete-measurement/:areaId/:pointId', async (req, res) => {
  try {
    const { areaId, pointId } = req.params;
    const { 
      temperature,
      moisture,
      ph,
      phosphorus,
      potassium,
      nitrogen,
      measurementDate,
      measurementTime,
      autoAdvance = true
    } = req.body;
    
    console.log('✅ Completing measurement for point:', pointId);
    
    // Update current point
    const { rows: updatedPoint } = await pool.query(`
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
    
    if (updatedPoint.length === 0) {
      return res.status(404).json({ 
        message: 'Point not found or already measured',
        areaId: areaId,
        pointId: pointId
      });
    }
    
    let nextPoint = null;
    
    if (autoAdvance) {
      // Get next point
      const { rows: nextPointRows } = await pool.query(`
        SELECT measurementid, point_id, areasid
        FROM measurement 
        WHERE areasid = $1 
          AND point_id IS NOT NULL
          AND measurement_date IS NULL
        ORDER BY point_id ASC
        LIMIT 1
      `, [areaId]);
      
      if (nextPointRows.length > 0) {
        nextPoint = {
          measurementId: nextPointRows[0].measurementid,
          pointId: nextPointRows[0].point_id,
          areasid: nextPointRows[0].areasid
        };
      }
    }
    
    // Get updated progress
    const { rows: progress } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL THEN 1 END) as measured_points
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    const progressInfo = progress[0];
    const completionPercentage = progressInfo.total_points > 0 
      ? Math.round((progressInfo.measured_points / progressInfo.total_points) * 100)
      : 0;
    
    const isComplete = nextPoint === null;
    
    console.log(`✅ Measurement completed for point ${pointId}. Progress: ${completionPercentage}%`);
    if (nextPoint) {
      console.log(`🎯 Next point: ${nextPoint.pointId}`);
    } else {
      console.log(`🎉 All measurements completed!`);
    }
    
    res.json({
      message: 'Measurement completed successfully',
      completedPoint: {
        measurementId: updatedPoint[0].measurementid,
        pointId: updatedPoint[0].point_id,
        areasid: updatedPoint[0].areasid,
        values: {
          temperature: updatedPoint[0].temperature,
          moisture: updatedPoint[0].moisture,
          ph: updatedPoint[0].ph,
          phosphorus: updatedPoint[0].phosphorus,
          potassium: updatedPoint[0].potassium,
          nitrogen: updatedPoint[0].nitrogen
        },
        measuredAt: updatedPoint[0].updated_at
      },
      nextPoint: nextPoint,
      progress: {
        totalPoints: parseInt(progressInfo.total_points),
        measuredPoints: parseInt(progressInfo.measured_points),
        remainingPoints: parseInt(progressInfo.total_points) - parseInt(progressInfo.measured_points),
        completionPercentage: completionPercentage
      },
      isComplete: isComplete,
      autoAdvance: autoAdvance
    });
    
  } catch (err) {
    console.error('❌ Error completing measurement:', err);
    res.status(500).json({ message: err.message });
  }
});

// 4. Skip current measurement point
router.post('/skip-point/:areaId/:pointId', async (req, res) => {
  try {
    const { areaId, pointId } = req.params;
    const { reason = 'Skipped by user' } = req.body;
    
    console.log('⏭️ Skipping measurement point:', pointId, 'Reason:', reason);
    
    // Mark point as skipped (you could add a skipped field)
    const { rows } = await pool.query(`
      UPDATE measurement 
      SET 
        measurement_date = CURRENT_DATE,
        measurement_time = CURRENT_TIME,
        temperature = -1, -- Special value to indicate skipped
        moisture = -1,
        ph = -1,
        phosphorus = -1,
        potassium = -1,
        nitrogen = -1,
        created_at = NOW()
      WHERE areasid = $1 
        AND point_id = $2
        AND measurement_date IS NULL
      RETURNING *
    `, [areaId, pointId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Point not found or already measured',
        areaId: areaId,
        pointId: pointId
      });
    }
    
    // Get next point
    const { rows: nextPointRows } = await pool.query(`
      SELECT measurementid, point_id, areasid
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND measurement_date IS NULL
      ORDER BY point_id ASC
      LIMIT 1
    `, [areaId]);
    
    let nextPoint = null;
    if (nextPointRows.length > 0) {
      nextPoint = {
        measurementId: nextPointRows[0].measurementid,
        pointId: nextPointRows[0].point_id,
        areasid: nextPointRows[0].areasid
      };
    }
    
    console.log(`⏭️ Point ${pointId} skipped. Next point: ${nextPoint ? nextPoint.pointId : 'None'}`);
    
    res.json({
      message: 'Point skipped successfully',
      skippedPoint: {
        measurementId: rows[0].measurementid,
        pointId: rows[0].point_id,
        areasid: rows[0].areasid,
        reason: reason,
        skippedAt: rows[0].updated_at
      },
      nextPoint: nextPoint,
      isComplete: nextPoint === null
    });
    
  } catch (err) {
    console.error('❌ Error skipping measurement point:', err);
    res.status(500).json({ message: err.message });
  }
});

// 5. Get measurement session status
router.get('/session-status/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📊 Getting measurement session status for area:', areaId);
    
    // Get comprehensive status
    const { rows: status } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL AND temperature > 0 THEN 1 END) as measured_points,
        COUNT(CASE WHEN measurement_date IS NOT NULL AND temperature = -1 THEN 1 END) as skipped_points,
        COUNT(CASE WHEN measurement_date IS NULL THEN 1 END) as pending_points,
        MIN(measurement_date) as first_measurement_date,
        MAX(measurement_date) as last_measurement_date,
        AVG(CASE WHEN temperature > 0 THEN temperature END) as avg_temperature,
        AVG(CASE WHEN moisture > 0 THEN moisture END) as avg_moisture,
        AVG(CASE WHEN ph > 0 THEN ph END) as avg_ph
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    const stats = status[0];
    const completionPercentage = stats.total_points > 0 
      ? Math.round((stats.measured_points / stats.total_points) * 100)
      : 0;
    
    // Get next point
    const { rows: nextPoint } = await pool.query(`
      SELECT measurementid, point_id, areasid
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND measurement_date IS NULL
      ORDER BY point_id ASC
      LIMIT 1
    `, [areaId]);
    
    res.json({
      areaId: areaId,
      sessionStatus: {
        totalPoints: parseInt(stats.total_points),
        measuredPoints: parseInt(stats.measured_points),
        skippedPoints: parseInt(stats.skipped_points),
        pendingPoints: parseInt(stats.pending_points),
        completionPercentage: completionPercentage,
        isComplete: stats.pending_points == 0,
        firstMeasurementDate: stats.first_measurement_date,
        lastMeasurementDate: stats.last_measurement_date
      },
      averages: {
        temperature: stats.avg_temperature ? parseFloat(stats.avg_temperature) : null,
        moisture: stats.avg_moisture ? parseFloat(stats.avg_moisture) : null,
        ph: stats.avg_ph ? parseFloat(stats.avg_ph) : null
      },
      nextPoint: nextPoint.length > 0 ? {
        measurementId: nextPoint[0].measurementid,
        pointId: nextPoint[0].point_id,
        areasid: nextPoint[0].areasid
      } : null
    });
    
  } catch (err) {
    console.error('❌ Error getting session status:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
