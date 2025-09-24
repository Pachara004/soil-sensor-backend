const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String,
  deviceId: String,
  username: String,
  polygonBounds: [[Number]],
  createdDate: String,
  createdTimestamp: { type: Date, default: Date.now },
  totalMeasurements: Number,
  averages: Object
});

module.exports = mongoose.model('Area', areaSchema);