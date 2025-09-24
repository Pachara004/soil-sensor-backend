const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  user_name: { type: String, unique: true },
  user_email: { type: String, unique: true },
  password: String,
  name: String,
  user_phone: String,
  role: { type: String, default: 'user' },
  devices: [String],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);