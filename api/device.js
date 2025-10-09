const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');

// Get device info with user details
router.get('/info/:deviceName', async (req, res) => {
  try {
    const { deviceName } = req.params;
    
    console.log('🔍 Getting device info for:', deviceName);
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
      FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.device_name = $1
    `, [deviceName]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const device = rows[0];
    console.log('📊 Device found:', {
      device_name: device.device_name,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role
    });
    
    res.json({
      device_name: device.device_name,
      device_status: device.device_status,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role,
      firebase_uid: device.firebase_uid,
      created_at: device.created_at,
      updated_at: device.updated_at
    });
    
  } catch (err) {
    console.error('Error getting device info:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get device info by device ID
router.get('/info-by-id/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    console.log('🔍 Getting device info for ID:', deviceId);
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
      FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.deviceid = $1
    `, [deviceId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    const device = rows[0];
    console.log('📊 Device found:', {
      device_name: device.device_name,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role
    });
    
    res.json({
      device_name: device.device_name,
      device_status: device.device_status,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role,
      firebase_uid: device.firebase_uid,
      created_at: device.created_at,
      updated_at: device.updated_at
    });
    
  } catch (err) {
    console.error('Error getting device info by ID:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;