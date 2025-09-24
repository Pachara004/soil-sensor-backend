const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  displayName: String,
  status: { type: String, default: 'offline' },
  user: String,
  meta: Object,
  live: Object
});

module.exports = mongoose.model('Device', deviceSchema);