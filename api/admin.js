const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Device = require('../models/Device');
const authMiddleware = require('../middleware/auth');

// Middleware เพื่อ check ถ้าเป็น admin
const adminMiddleware = (req, res, next) => {
  if (req.user.type !== 'admin') {
    return res.status(403).json({ message: 'Access denied: Admin only' });
  }
  next();
};

router.get('/devices', authMiddleware, adminMiddleware, async (req, res) => {
  const devices = await Device.find({});
  res.json(devices);
});

router.post('/devices', authMiddleware, adminMiddleware, async (req, res) => {
  const { deviceName, user } = req.body;
  const device = new Device({ id: deviceName, displayName: deviceName, user });
  await device.save();
  await User.updateOne({ username: user }, { $addToSet: { devices: deviceName } });
  res.status(201).json({ message: 'Device added' });
});

router.delete('/devices/:deviceName', authMiddleware, adminMiddleware, async (req, res) => {
  await Device.deleteOne({ id: req.params.deviceName });
  res.json({ message: 'Device deleted' });
});

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
  const users = await User.find({});
  res.json(users);
});

router.put('/users/:username', authMiddleware, adminMiddleware, async (req, res) => {
  await User.updateOne({ username: req.params.username }, req.body);
  res.json({ message: 'User updated' });
});

router.delete('/users/:username', authMiddleware, adminMiddleware, async (req, res) => {
  const username = req.params.username;
  // Delete user
  await User.deleteOne({ username });
  
  // Delete associated devices
  const devices = await Device.find({ user: username });
  const deletePromises = devices.map(device => Device.deleteOne({ id: device.id }));
  await Promise.all(deletePromises);
  
  res.json({ message: 'User and associated devices deleted' });
});

module.exports = router;