const mongoose = require('mongoose');

const measurementSchema = new mongoose.Schema({
  deviceId: String,
  temperature: Number,
  moisture: Number,
  nitrogen: Number,
  phosphorus: Number,
  potassium: Number,
  ph: Number,
  location: String,
  lat: Number,
  lng: Number,
  date: String,
  timestamp: { type: Date, default: Date.now },
  areaId: String,
  measurementPoint: Number
});

module.exports = mongoose.model('Measurement', measurementSchema);