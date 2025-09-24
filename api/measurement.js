const express = require('express');
const router = express.Router();
const Measurement = require('../models/Measurement');
const Area = require('../models/Area');
const authMiddleware = require('../middleware/auth');

router.get('/:deviceId', authMiddleware, async (req, res) => {
  const measurements = await Measurement.find({ deviceId: req.params.deviceId });
  res.json(measurements);
});

router.post('/', authMiddleware, async (req, res) => {
  const measurement = new Measurement(req.body);
  await measurement.save();
  if (req.body.areaId) {
    const measurements = await Measurement.find({ areaId: req.body.areaId });
    const count = measurements.length;
    const averages = measurements.reduce((acc, m) => {
      Object.keys(acc).forEach(key => acc[key] += m[key] || 0);
      return acc;
    }, { temperature: 0, moisture: 0, nitrogen: 0, phosphorus: 0, potassium: 0, ph: 0 });
    Object.keys(averages).forEach(key => averages[key] /= count);
    await Area.updateOne({ id: req.body.areaId }, { totalMeasurements: count, averages });
  }
  res.status(201).json({ message: 'Measurement saved' });
});

module.exports = router;