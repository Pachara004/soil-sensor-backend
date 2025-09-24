const express = require('express');
const router = express.Router();
const Area = require('../models/Area');
const authMiddleware = require('../middleware/auth');

router.get('/:username', authMiddleware, async (req, res) => {
  const areas = await Area.find({ username: req.params.username });
  res.json(areas);
});

router.post('/', authMiddleware, async (req, res) => {
  const area = new Area({ ...req.body, username: req.user.username });
  await area.save();
  res.status(201).json(area);
});

module.exports = router;