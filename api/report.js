const express = require('express');
const router = express.Router();
const Report = require('../models/Report');
const authMiddleware = require('../middleware/auth');

router.post('/', authMiddleware, async (req, res) => {
  const report = new Report({ ...req.body, username: req.user.username });
  await report.save();
  res.status(201).json({ message: 'Report sent' });
});

module.exports = router;