const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const admin = require('firebase-admin');

// ดึง areasid จาก Firebase และ sync กับ PostgreSQL
router.get('/sync-areasid', async (req, res) => {
  try {
    console.log('🔄 Starting areasid sync from Firebase...');
    
    if (!admin.apps.length) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const db = admin.database();
    const areasRef = db.ref('/areas');
    
    // ดึงข้อมูล areas จาก Firebase
    const snapshot = await areasRef.once('value');
    const firebaseAreas = snapshot.val();
    
    if (!firebaseAreas) {
      console.log('⚠️ No areas found in Firebase');
      return res.json({ message: 'No areas found in Firebase', areas: [] });
    }

    console.log('📊 Firebase areas found:', Object.keys(firebaseAreas).length);
    
    const syncedAreas = [];
    
    // Loop through Firebase areas
    for (const [firebaseKey, areaData] of Object.entries(firebaseAreas)) {
      try {
        // Check if area exists in PostgreSQL
        const { rows: existingAreas } = await pool.query(
          'SELECT * FROM areas WHERE areasid = $1',
          [areaData.areasid]
        );
        
        if (existingAreas.length === 0) {
          // Create new area in PostgreSQL
          const { rows: newArea } = await pool.query(
            `INSERT INTO areas (
              areasid, area_name, ph_avg, temperature_avg, moisture_avg, 
              nitrogen_avg, phosphorus_avg, potassium_avg, totalmeasurement, 
              userid, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
              areaData.areasid,
              areaData.area_name,
              areaData.ph_avg,
              areaData.temperature_avg,
              areaData.moisture_avg,
              areaData.nitrogen_avg,
              areaData.phosphorus_avg,
              areaData.potassium_avg,
              areaData.totalmeasurement || 0,
              areaData.userid,
              areaData.created_at || new Date().toISOString()
            ]
          );
          
          console.log(`✅ Created new area in PostgreSQL: ${areaData.areasid}`);
          syncedAreas.push(newArea[0]);
        } else {
          // Update existing area
          const { rows: updatedArea } = await pool.query(
            `UPDATE areas SET 
              area_name = $2, ph_avg = $3, temperature_avg = $4, 
              moisture_avg = $5, nitrogen_avg = $6, phosphorus_avg = $7, 
              potassium_avg = $8, totalmeasurement = $9, userid = $10
            WHERE areasid = $1
            RETURNING *`,
            [
              areaData.areasid,
              areaData.area_name,
              areaData.ph_avg,
              areaData.temperature_avg,
              areaData.moisture_avg,
              areaData.nitrogen_avg,
              areaData.phosphorus_avg,
              areaData.potassium_avg,
              areaData.totalmeasurement || 0,
              areaData.userid
            ]
          );
          
          console.log(`✅ Updated area in PostgreSQL: ${areaData.areasid}`);
          syncedAreas.push(updatedArea[0]);
        }
      } catch (error) {
        console.error(`❌ Error syncing area ${areaData.areasid}:`, error);
      }
    }
    
    console.log(`🎉 Areasid sync completed! Synced ${syncedAreas.length} areas`);
    
    res.json({
      message: 'Areasid sync completed successfully',
      syncedCount: syncedAreas.length,
      areas: syncedAreas
    });
    
  } catch (error) {
    console.error('❌ Error syncing areasid:', error);
    res.status(500).json({ 
      message: 'Failed to sync areasid',
      error: error.message 
    });
  }
});

// ดึง areasid ทั้งหมดจาก PostgreSQL
router.get('/areasid-list', async (req, res) => {
  try {
    console.log('📋 Getting all areasid from PostgreSQL...');
    
    const { rows } = await pool.query(
      'SELECT areasid, area_name, userid, created_at FROM areas ORDER BY areasid DESC'
    );
    
    console.log(`✅ Found ${rows.length} areas`);
    
    res.json({
      message: 'Areasid list retrieved successfully',
      count: rows.length,
      areas: rows
    });
    
  } catch (error) {
    console.error('❌ Error getting areasid list:', error);
    res.status(500).json({ 
      message: 'Failed to get areasid list',
      error: error.message 
    });
  }
});

module.exports = router;
