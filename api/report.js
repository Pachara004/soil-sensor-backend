const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Create new report
router.post('/', authMiddleware, async (req, res) => {
  try {
    // Support both Angular format and standard format
    const {
      title, description, type, priority, status,  // Standard format
      subject, message, timestamp, images, userId   // Angular format
    } = req.body;

    // Map Angular format to standard format
    const reportTitle = title || subject;
    const reportDescription = description || message;

    if (!reportTitle || !reportDescription) {
      return res.status(400).json({ message: 'Title/subject and description/message are required' });
    }

    const { rows } = await pool.query(
      `INSERT INTO reports (title, description, type, priority, status, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [reportTitle, reportDescription, type || 'general', priority || 'medium', status || 'open', req.user.userid]
    );

    res.status(201).json({
      message: 'Report sent successfully',
      report: rows[0]
    });
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get all reports (admin only)
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { rows } = await pool.query(
      `SELECT r.*, u.user_name, u.user_email 
       FROM reports r 
       JOIN users u ON r.userid = u.userid 
       ORDER BY r.created_at DESC`
    );

    res.json({ reports: rows });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get user's own reports
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM reports WHERE userid = $1 ORDER BY created_at DESC',
      [req.user.userid]
    );

    res.json({ reports: rows });
  } catch (err) {
    console.error('Error fetching user reports:', err);
    res.status(500).json({ message: err.message });
  }
});

// Update report status (admin only)
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }

    const { rows } = await pool.query(
      'UPDATE reports SET status = $1, updated_at = NOW() WHERE reportid = $2 RETURNING *',
      [status, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.json({ message: 'Report status updated', report: rows[0] });
  } catch (err) {
    console.error('Error updating report status:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;