const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const firebaseAuthToUser = require('../middleware/firebaseAuthToUser');

// GET /api/user/reports - รายงานของผู้ใช้ที่ล็อกอิน
router.get('/reports', firebaseAuthToUser, async (req, res) => {
  try {
    const { status = 'all', limit = 50, offset = 0 } = req.query;

    // ตรวจสอบชื่อคอลัมน์ user id
    const q = `SELECT column_name FROM information_schema.columns 
               WHERE table_name='reports' AND column_name IN ('user_id','userid')`;
    const { rows: cols } = await pool.query(q);
    const col = cols.map(r => r.column_name).includes('user_id') ? 'user_id' : 'userid';

    let query = `
      SELECT id, ${col} as user_id, title, message, status, created_at, read_at
      FROM reports
      WHERE ${col} = $1
    `;
    const params = [req.user.userid];

    if (status !== 'all') {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT $2 OFFSET $3';
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await pool.query(query, params);
    res.json({ reports: rows });
  } catch (e) {
    console.error('❌ Error fetching user reports:', e);
    res.status(500).json({ message: 'Failed to fetch user reports' });
  }
});

module.exports = router;


