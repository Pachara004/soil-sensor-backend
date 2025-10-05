const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Create new report
router.post('/', authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

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

    // Create report
    const { rows } = await client.query(
      `INSERT INTO reports (title, description, type, priority, status, userid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [reportTitle, reportDescription, type || 'general', priority || 'medium', status || 'open', req.user.userid]
    );

    const report = rows[0];

    // Create images if provided
    let createdImages = [];
    if (images && Array.isArray(images) && images.length > 0) {

      for (const imageUrl of images) {
        // Validate image URL format
        if (!imageUrl || (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://'))) {
          console.warn('⚠️ Invalid image URL format:', imageUrl);
          continue;
        }

        const { rows: imageRows } = await client.query(
          'INSERT INTO images (reportid, imageUrl) VALUES ($1, $2) RETURNING imageid, reportid, imageUrl',
          [report.reportid, imageUrl]
        );

        createdImages.push(imageRows[0]);
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Report sent successfully',
      report: report,
      images: createdImages
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error creating report:', err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
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

    // Get images for each report
    const reportsWithImages = await Promise.all(
      rows.map(async (report) => {
        const { rows: imageRows } = await pool.query(
          'SELECT imageid, imageUrl FROM images WHERE reportid = $1 ORDER BY imageid ASC',
          [report.reportid]
        );
        return { ...report, images: imageRows };
      })
    );

    res.json({ reports: reportsWithImages });
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

    // Get images for each report
    const reportsWithImages = await Promise.all(
      rows.map(async (report) => {
        const { rows: imageRows } = await pool.query(
          'SELECT imageid, imageUrl FROM images WHERE reportid = $1 ORDER BY imageid ASC',
          [report.reportid]
        );
        return { ...report, images: imageRows };
      })
    );

    res.json({ reports: reportsWithImages });
  } catch (err) {
    console.error('Error fetching user reports:', err);
    res.status(500).json({ message: err.message });
  }
});

// Get single report with images
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    // Validate id parameter
    if (!id || id === 'undefined' || isNaN(parseInt(id))) {
      return res.status(400).json({ message: 'Invalid report ID' });
    }

    const reportId = parseInt(id);

    // Get report data
    const { rows: reportRows } = await pool.query(
      `SELECT r.*, u.user_name, u.user_email 
       FROM reports r 
       JOIN users u ON r.userid = u.userid 
       WHERE r.reportid = $1`,
      [reportId]
    );

    if (reportRows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const report = reportRows[0];

    // Check if user is admin or the report belongs to the user
    if (req.user.role !== 'admin' && report.userid !== req.user.userid) {
      return res.status(403).json({ message: 'Access denied. You can only view your own reports.' });
    }

    // Get images for the report
    const { rows: imageRows } = await pool.query(
      'SELECT imageid, imageUrl FROM images WHERE reportid = $1 ORDER BY imageid ASC',
      [reportId]
    );

    res.json({
      report: { ...report, images: imageRows }
    });
  } catch (err) {
    console.error('Error fetching report:', err);
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

    // Validate id parameter
    if (!id || id === 'undefined' || isNaN(parseInt(id))) {
      return res.status(400).json({ message: 'Invalid report ID' });
    }

    const reportId = parseInt(id);

    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }


    const { rows } = await pool.query(
      'UPDATE reports SET status = $1, updated_at = NOW() WHERE reportid = $2 RETURNING *',
      [status, reportId]
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

// Delete report (admin only)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Admin role required.' });
    }

    const { id } = req.params;

    // Validate id parameter
    if (!id || id === 'undefined' || isNaN(parseInt(id))) {
      return res.status(400).json({ message: 'Invalid report ID' });
    }

    const reportId = parseInt(id);


    // Check if report exists
    const { rows: reportRows } = await pool.query(
      'SELECT reportid, title, userid FROM reports WHERE reportid = $1',
      [reportId]
    );

    if (reportRows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    const report = reportRows[0];

    // Delete report (images will be deleted automatically due to CASCADE DELETE)
    await pool.query('DELETE FROM reports WHERE reportid = $1', [reportId]);


    res.json({
      message: 'Report deleted successfully',
      deletedReport: {
        reportid: report.reportid,
        title: report.title,
        userid: report.userid
      }
    });
  } catch (err) {
    console.error('❌ Error deleting report:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;