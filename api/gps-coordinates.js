const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// GPS Coordinates Management for Manual Point ID System

// 1. Update GPS coordinates for a specific point
router.put('/update-coordinates/:areaId/:pointId', async (req, res) => {
  try {
    const { areaId, pointId } = req.params;
    const { lat, lng, source = 'manual' } = req.body; // source: 'gps', 'manual', 'estimated'
    
    console.log('📍 Updating GPS coordinates for point:', { areaId, pointId, lat, lng, source });
    
    // Validate coordinates
    if (!lat || !lng) {
      return res.status(400).json({ 
        message: 'Latitude and longitude are required' 
      });
    }
    
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    
    if (isNaN(latNum) || isNaN(lngNum)) {
      return res.status(400).json({ 
        message: 'Invalid latitude or longitude format' 
      });
    }
    
    if (latNum < -90 || latNum > 90) {
      return res.status(400).json({ 
        message: 'Latitude must be between -90 and 90' 
      });
    }
    
    if (lngNum < -180 || lngNum > 180) {
      return res.status(400).json({ 
        message: 'Longitude must be between -180 and 180' 
      });
    }
    
    // Update coordinates
    const { rows } = await pool.query(`
      UPDATE measurement 
      SET 
        lat = $3,
        lng = $4,
        created_at = NOW()
      WHERE areasid = $1 
        AND point_id = $2
      RETURNING *
    `, [areaId, pointId, latNum.toFixed(8), lngNum.toFixed(8)]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        message: 'Point not found',
        areaId: areaId,
        pointId: pointId
      });
    }
    
    console.log(`✅ GPS coordinates updated for point ${pointId}`);
    
    res.json({
      message: 'GPS coordinates updated successfully',
      areaId: areaId,
      pointId: pointId,
      coordinates: {
        lat: latNum.toFixed(8),
        lng: lngNum.toFixed(8)
      },
      source: source,
      updatedAt: rows[0].created_at
    });
    
  } catch (err) {
    console.error('❌ Error updating GPS coordinates:', err);
    res.status(500).json({ message: err.message });
  }
});

// 2. Get GPS coordinates for all points in an area
router.get('/coordinates/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { includeNulls = false } = req.query;
    
    console.log('📍 Getting GPS coordinates for area:', areaId);
    
    let query = `
      SELECT 
        measurementid,
        point_id,
        lat,
        lng,
        measurement_date,
        measurement_time,
        temperature,
        moisture,
        ph,
        created_at
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
    `;
    
    const params = [areaId];
    
    if (!includeNulls) {
      query += ` AND lat IS NOT NULL AND lng IS NOT NULL`;
    }
    
    query += ` ORDER BY point_id ASC`;
    
    const { rows } = await pool.query(query, params);
    
    const coordinates = rows.map(row => ({
      measurementId: row.measurementid,
      pointId: row.point_id,
      coordinates: {
        lat: row.lat ? parseFloat(row.lat) : null,
        lng: row.lng ? parseFloat(row.lng) : null
      },
      hasCoordinates: row.lat !== null && row.lng !== null,
      measurement: {
        date: row.measurement_date,
        time: row.measurement_time,
        temperature: row.temperature,
        moisture: row.moisture,
        ph: row.ph
      },
      createdAt: row.created_at
    }));
    
    const stats = {
      totalPoints: coordinates.length,
      pointsWithCoordinates: coordinates.filter(c => c.hasCoordinates).length,
      pointsWithoutCoordinates: coordinates.filter(c => !c.hasCoordinates).length
    };
    
    console.log(`📍 Found ${stats.totalPoints} points, ${stats.pointsWithCoordinates} with coordinates`);
    
    res.json({
      areaId: areaId,
      coordinates: coordinates,
      statistics: stats
    });
    
  } catch (err) {
    console.error('❌ Error getting GPS coordinates:', err);
    res.status(500).json({ message: err.message });
  }
});

// 3. Bulk update GPS coordinates for multiple points
router.put('/bulk-update/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { coordinates } = req.body; // Array of {pointId, lat, lng}
    
    console.log('📍 Bulk updating GPS coordinates for area:', areaId);
    console.log('📋 Coordinates to update:', coordinates.length);
    
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return res.status(400).json({ 
        message: 'Coordinates array is required' 
      });
    }
    
    const updatePromises = coordinates.map(async (coord) => {
      const { pointId, lat, lng } = coord;
      
      if (!pointId || !lat || !lng) {
        throw new Error(`Invalid coordinates for point ${pointId}`);
      }
      
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      
      if (isNaN(latNum) || isNaN(lngNum)) {
        throw new Error(`Invalid number format for point ${pointId}`);
      }
      
      const { rows } = await pool.query(`
        UPDATE measurement 
        SET 
          lat = $3,
          lng = $4,
          created_at = NOW()
        WHERE areasid = $1 
          AND point_id = $2
        RETURNING measurementid, point_id
      `, [areaId, pointId, latNum.toFixed(8), lngNum.toFixed(8)]);
      
      if (rows.length === 0) {
        throw new Error(`Point ${pointId} not found`);
      }
      
      return {
        pointId: pointId,
        measurementId: rows[0].measurementid,
        coordinates: {
          lat: latNum.toFixed(8),
          lng: lngNum.toFixed(8)
        }
      };
    });
    
    const results = await Promise.all(updatePromises);
    
    console.log(`✅ Bulk updated ${results.length} GPS coordinates`);
    
    res.json({
      message: 'GPS coordinates updated successfully',
      areaId: areaId,
      updatedPoints: results,
      count: results.length
    });
    
  } catch (err) {
    console.error('❌ Error bulk updating GPS coordinates:', err);
    res.status(500).json({ message: err.message });
  }
});

// 4. Get GPS statistics for an area
router.get('/stats/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    
    console.log('📊 Getting GPS statistics for area:', areaId);
    
    const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_points,
        COUNT(CASE WHEN lat IS NOT NULL AND lng IS NOT NULL THEN 1 END) as points_with_coordinates,
        COUNT(CASE WHEN lat IS NULL OR lng IS NULL THEN 1 END) as points_without_coordinates,
        MIN(CASE WHEN lat IS NOT NULL THEN lat::numeric END) as min_lat,
        MAX(CASE WHEN lat IS NOT NULL THEN lat::numeric END) as max_lat,
        MIN(CASE WHEN lng IS NOT NULL THEN lng::numeric END) as min_lng,
        MAX(CASE WHEN lng IS NOT NULL THEN lng::numeric END) as max_lng,
        AVG(CASE WHEN lat IS NOT NULL THEN lat::numeric END) as avg_lat,
        AVG(CASE WHEN lng IS NOT NULL THEN lng::numeric END) as avg_lng
      FROM measurement 
      WHERE areasid = $1 AND point_id IS NOT NULL
    `, [areaId]);
    
    const stats = rows[0];
    
    const gpsStats = {
      totalPoints: parseInt(stats.total_points),
      pointsWithCoordinates: parseInt(stats.points_with_coordinates),
      pointsWithoutCoordinates: parseInt(stats.points_without_coordinates),
      coveragePercentage: stats.total_points > 0 
        ? Math.round((stats.points_with_coordinates / stats.total_points) * 100)
        : 0,
      bounds: {
        minLat: stats.min_lat ? parseFloat(stats.min_lat) : null,
        maxLat: stats.max_lat ? parseFloat(stats.max_lat) : null,
        minLng: stats.min_lng ? parseFloat(stats.min_lng) : null,
        maxLng: stats.max_lng ? parseFloat(stats.max_lng) : null
      },
      center: {
        lat: stats.avg_lat ? parseFloat(stats.avg_lat) : null,
        lng: stats.avg_lng ? parseFloat(stats.avg_lng) : null
      }
    };
    
    console.log(`📊 GPS coverage: ${gpsStats.coveragePercentage}% (${gpsStats.pointsWithCoordinates}/${gpsStats.totalPoints})`);
    
    res.json({
      areaId: areaId,
      gpsStatistics: gpsStats
    });
    
  } catch (err) {
    console.error('❌ Error getting GPS statistics:', err);
    res.status(500).json({ message: err.message });
  }
});

// 5. Estimate missing coordinates based on grid pattern
router.post('/estimate-missing/:areaId', async (req, res) => {
  try {
    const { areaId } = req.params;
    const { 
      gridRows, 
      gridCols, 
      startLat, 
      startLng, 
      latSpacing = 0.0001, 
      lngSpacing = 0.0001 
    } = req.body;
    
    console.log('🧮 Estimating missing GPS coordinates for area:', areaId);
    
    if (!gridRows || !gridCols || !startLat || !startLng) {
      return res.status(400).json({ 
        message: 'Grid dimensions and starting coordinates are required' 
      });
    }
    
    // Get points without coordinates
    const { rows: pointsWithoutCoords } = await pool.query(`
      SELECT measurementid, point_id
      FROM measurement 
      WHERE areasid = $1 
        AND point_id IS NOT NULL
        AND (lat IS NULL OR lng IS NULL)
      ORDER BY point_id ASC
    `, [areaId]);
    
    if (pointsWithoutCoords.length === 0) {
      return res.status(200).json({ 
        message: 'No points need coordinate estimation',
        areaId: areaId
      });
    }
    
    // Estimate coordinates based on point ID pattern
    const estimatedPoints = [];
    
    for (const point of pointsWithoutCoords) {
      const pointId = point.point_id;
      
      // Parse point ID to get grid position
      let row = 0, col = 0;
      
      if (pointId.match(/^[A-Z]\d+$/)) {
        // Pattern: A1, A2, B1, B2, etc.
        const letter = pointId.charAt(0);
        const number = parseInt(pointId.substring(1));
        row = letter.charCodeAt(0) - 65; // A=0, B=1, C=2...
        col = number - 1; // 1=0, 2=1, 3=2...
      } else if (pointId.match(/^P\d+$/)) {
        // Pattern: P001, P002, P003, etc.
        const number = parseInt(pointId.substring(1));
        row = Math.floor((number - 1) / gridCols);
        col = (number - 1) % gridCols;
      }
      
      // Calculate estimated coordinates
      const estimatedLat = parseFloat(startLat) + (row * latSpacing);
      const estimatedLng = parseFloat(startLng) + (col * lngSpacing);
      
      estimatedPoints.push({
        pointId: pointId,
        measurementId: point.measurementid,
        estimatedCoordinates: {
          lat: estimatedLat.toFixed(8),
          lng: estimatedLng.toFixed(8)
        },
        gridPosition: { row, col }
      });
    }
    
    console.log(`🧮 Estimated coordinates for ${estimatedPoints.length} points`);
    
    res.json({
      message: 'GPS coordinates estimated successfully',
      areaId: areaId,
      estimatedPoints: estimatedPoints,
      gridConfiguration: {
        rows: gridRows,
        cols: gridCols,
        startLat: startLat,
        startLng: startLng,
        latSpacing: latSpacing,
        lngSpacing: lngSpacing
      },
      count: estimatedPoints.length
    });
    
  } catch (err) {
    console.error('❌ Error estimating GPS coordinates:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

