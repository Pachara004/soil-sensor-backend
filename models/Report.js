const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  subject: String,
  message: String,
  timestamp: { type: Date, default: Date.now },
  uid: String,
  username: String
});

module.exports = mongoose.model('Report', reportSchema);