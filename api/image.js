const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const authMiddleware = require('../middleware/auth');

// Get all images (admin only)
router.get('/', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }

        const { rows } = await pool.query(
            `SELECT i.imageid, i.reportid, i.imageUrl, r.title as report_title, r.description as report_description,
              r.status as report_status, r.created_at as report_created_at
       FROM images i
       LEFT JOIN reports r ON i.reportid = r.reportid
       ORDER BY i.imageid DESC`
        );

        res.json({ images: rows });
    } catch (err) {
        console.error('❌ Error fetching images:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get images by report ID
router.get('/report/:reportid', authMiddleware, async (req, res) => {
    try {
        const { reportid } = req.params;

        // Check if user is admin or the report belongs to the user
        if (req.user.role !== 'admin') {
            // Check if the report belongs to the user
            const reportCheck = await pool.query(
                'SELECT userid FROM reports WHERE reportid = $1',
                [reportid]
            );

            if (reportCheck.rows.length === 0) {
                return res.status(404).json({ message: 'Report not found' });
            }

            if (reportCheck.rows[0].userid !== req.user.userid) {
                return res.status(403).json({ message: 'Access denied. You can only view your own report images.' });
            }
        }

        const { rows } = await pool.query(
            'SELECT imageid, reportid, imageUrl FROM images WHERE reportid = $1 ORDER BY imageid ASC',
            [reportid]
        );

        res.json({ images: rows });
    } catch (err) {
        console.error('❌ Error fetching images by report:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get single image by ID
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const { rows } = await pool.query(
            `SELECT i.imageid, i.reportid, i.imageUrl, r.title as report_title, r.userid as report_userid
       FROM images i
       LEFT JOIN reports r ON i.reportid = r.reportid
       WHERE i.imageid = $1`,
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        const image = rows[0];

        // Check if user is admin or the report belongs to the user
        if (req.user.role !== 'admin' && image.report_userid !== req.user.userid) {
            return res.status(403).json({ message: 'Access denied. You can only view your own report images.' });
        }

        res.json({ image: image });
    } catch (err) {
        console.error('❌ Error fetching image:', err);
        res.status(500).json({ message: err.message });
    }
});

// Add new image (both admin and user)
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { reportid, imageUrl } = req.body;

        console.log('📷 Add image request:', { reportid, imageUrl, requester: req.user.userid, role: req.user.role });

        if (!reportid || !imageUrl) {
            return res.status(400).json({ message: 'Report ID and image URL are required' });
        }

        // Validate imageUrl format
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            return res.status(400).json({ message: 'Invalid image URL format' });
        }

        // Check if report exists and user has permission
        const reportCheck = await pool.query(
            'SELECT reportid, userid FROM reports WHERE reportid = $1',
            [reportid]
        );

        if (reportCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Report not found' });
        }

        // Check if user is admin or the report belongs to the user
        if (req.user.role !== 'admin' && reportCheck.rows[0].userid !== req.user.userid) {
            return res.status(403).json({ message: 'Access denied. You can only add images to your own reports.' });
        }

        // Insert new image
        const { rows } = await pool.query(
            'INSERT INTO images (reportid, imageUrl) VALUES ($1, $2) RETURNING imageid, reportid, imageUrl',
            [reportid, imageUrl]
        );

        console.log('✅ Image added successfully:', rows[0]);
        res.status(201).json({ message: 'Image added successfully', image: rows[0] });
    } catch (err) {
        console.error('❌ Error adding image:', err);
        res.status(500).json({ message: err.message });
    }
});

// Update image URL (both admin and user)
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { imageUrl } = req.body;

        console.log('📷 Update image request:', { id, imageUrl, requester: req.user.userid, role: req.user.role });

        if (!imageUrl) {
            return res.status(400).json({ message: 'Image URL is required' });
        }

        // Validate imageUrl format
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
            return res.status(400).json({ message: 'Invalid image URL format' });
        }

        // Get current image data
        const { rows: imageRows } = await pool.query(
            `SELECT i.imageid, i.reportid, r.userid as report_userid
       FROM images i
       LEFT JOIN reports r ON i.reportid = r.reportid
       WHERE i.imageid = $1`,
            [id]
        );

        if (imageRows.length === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        const image = imageRows[0];

        // Check if user is admin or the report belongs to the user
        if (req.user.role !== 'admin' && image.report_userid !== req.user.userid) {
            return res.status(403).json({ message: 'Access denied. You can only update your own report images.' });
        }

        // Update image URL
        const { rows } = await pool.query(
            'UPDATE image SET imageUrl = $1 WHERE imageid = $2 RETURNING imageid, reportid, imageUrl',
            [imageUrl, id]
        );

        console.log('✅ Image updated successfully:', rows[0]);
        res.json({ message: 'Image updated successfully', image: rows[0] });
    } catch (err) {
        console.error('❌ Error updating image:', err);
        res.status(500).json({ message: err.message });
    }
});

// Delete image (both admin and user)
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        console.log('🗑️ Delete image request:', { id, requester: req.user.userid, role: req.user.role });

        // Get current image data
        const { rows: imageRows } = await pool.query(
            `SELECT i.imageid, i.reportid, r.userid as report_userid
       FROM images i
       LEFT JOIN reports r ON i.reportid = r.reportid
       WHERE i.imageid = $1`,
            [id]
        );

        if (imageRows.length === 0) {
            return res.status(404).json({ message: 'Image not found' });
        }

        const image = imageRows[0];

        // Check if user is admin or the report belongs to the user
        if (req.user.role !== 'admin' && image.report_userid !== req.user.userid) {
            return res.status(403).json({ message: 'Access denied. You can only delete your own report images.' });
        }

        // Delete image
        await pool.query('DELETE FROM images WHERE imageid = $1', [id]);

        console.log('✅ Image deleted successfully:', { imageid: id, reportid: image.reportid });
        res.json({ message: 'Image deleted successfully' });
    } catch (err) {
        console.error('❌ Error deleting image:', err);
        res.status(500).json({ message: err.message });
    }
});

// Get image statistics (admin only)
router.get('/stats/overview', authMiddleware, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admin role required.' });
        }

        const { rows } = await pool.query(`
      SELECT 
        COUNT(*) as total_images,
        COUNT(DISTINCT reportid) as reports_with_images,
        COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending_images,
        COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved_images,
        COUNT(CASE WHEN r.status = 'rejected' THEN 1 END) as rejected_images
      FROM images i
      LEFT JOIN reports r ON i.reportid = r.reportid
    `);

        res.json({ stats: rows[0] });
    } catch (err) {
        console.error('❌ Error fetching image stats:', err);
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
