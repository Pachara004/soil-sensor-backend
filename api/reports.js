// api/reports.js
const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const admin = require('firebase-admin');
const firebaseAuthToUser = require('../middleware/firebaseAuthToUser');

// Ensure table exists (lightweight runtime guard)
let reportsSchemaReady = false;
async function ensureReportsTable() {
  if (reportsSchemaReady) return;
  // ตรวจสอบว่าตารางมีอยู่แล้ว ไม่ต้องสร้างใหม่
  try {
    await pool.query('SELECT 1 FROM reports LIMIT 1');
    reportsSchemaReady = true;
  } catch (err) {
    console.error('⚠️ Reports table might not exist:', err.message);
  }
}

// GET /api/reports - ดึงรายการ reports สำหรับ admin
router.get('/', firebaseAuthToUser, async (req, res) => {
  try {
    await ensureReportsTable();
    const { status = 'all', limit = 50, offset = 0, mine } = req.query;
    
    let query = `
      SELECT 
        r.reportid as id,
        r.userid as user_id,
        r.title,
        r.description as message,
        r.status,
        r.created_at,
        r.updated_at as read_at,
        r.priority,
        r.type,
        u.user_name,
        u.user_email
      FROM reports r
      LEFT JOIN users u ON r.userid = u.userid
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    // mine=true → คืนเฉพาะของผู้ใช้
    if (mine === 'true') {
      query += ` AND r.userid = $${paramIndex}`;
      params.push(req.user.userid);
      paramIndex++;
    }

    // กรองตาม status
    if (status !== 'all') {
      query += ` AND r.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY r.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const { rows } = await pool.query(query, params);
    
    // นับจำนวนทั้งหมด
    let countQuery = 'SELECT COUNT(*) FROM reports WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;

    if (mine === 'true') {
      countQuery += ` AND userid = $${countParamIndex}`;
      countParams.push(req.user.userid);
      countParamIndex++;
    }
    
    if (status !== 'all') {
      countQuery += ` AND status = $${countParamIndex}`;
      countParams.push(status);
    }
    
    const { rows: countRows } = await pool.query(countQuery, countParams);
    const totalCount = parseInt(countRows[0].count);
    
    res.json({ reports: rows, total: totalCount });
    
  } catch (err) {
    console.error('❌ Error fetching reports:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/unread-count - ดึงจำนวนข้อความที่ยังไม่ได้อ่านจาก PostgreSQL เท่านั้น
router.get('/unread-count', firebaseAuthToUser, async (req, res) => {
  try {
    await ensureReportsTable();
    
    const { rows } = await pool.query(
      `SELECT COUNT(*) as unread_count FROM reports WHERE status = $1 AND userid = $2`,
      ['open', req.user.userid]
    );
    
    const unreadCount = parseInt(rows[0].unread_count);
    
    console.log('📊 PostgreSQL unread reports:', unreadCount);
    
    res.json({ unreadCount });
    
  } catch (err) {
    console.error('❌ Error fetching unread count:', err);
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/reports/:id/read - อัปเดต status ของ report เป็น read
router.put('/:id/read', firebaseAuthToUser, async (req, res) => {
  try {
    await ensureReportsTable();
    const { id } = req.params;
    
    // อัปเดต status และ updated_at
    const updateSql = `UPDATE reports 
                       SET status = $1, updated_at = NOW()
                       WHERE reportid = $2 AND (userid = $3 OR $4 = 'admin')
                       RETURNING reportid as id, userid as user_id, title, 
                                 description as message, status, created_at, 
                                 updated_at as read_at, priority, type`;
    const { rows } = await pool.query(updateSql, ['read', id, req.user.userid, req.user.role || 'user']);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Report not found or unauthorized' });
    }
    
    res.json({
      success: true,
      message: 'Report marked as read',
      report: rows[0]
    });
    
  } catch (err) {
    console.error('❌ Error updating report status:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/user - return current user's reports
router.get('/user', firebaseAuthToUser, async (req, res) => {
  try {
    await ensureReportsTable();
    
    const { rows } = await pool.query(
      `SELECT reportid as id, userid as user_id, title, description as message, 
              status, created_at, updated_at as read_at, priority, type
       FROM reports 
       WHERE userid = $1 
       ORDER BY created_at DESC`,
      [req.user.userid]
    );
    
    res.json({ reports: rows });
  } catch (e) {
    console.error('❌ Error fetching reports/user:', e);
    res.status(500).json({ message: e.message });
  }
});

// POST /api/reports - สร้าง report ใหม่
router.post('/', firebaseAuthToUser, async (req, res) => {
  try {
    await ensureReportsTable();
    const { title, message, type = 'general', priority = 'normal' } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }
    
    const insertSql = `
      INSERT INTO reports (userid, title, description, type, priority, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING reportid as id, userid as user_id, title, description as message, 
                status, created_at, priority, type
    `;
    
    const { rows } = await pool.query(insertSql, [
      req.user.userid,
      title,
      message,
      type,
      priority,
      'open'
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Report created successfully',
      report: rows[0]
    });
    
  } catch (err) {
    console.error('❌ Error creating report:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;