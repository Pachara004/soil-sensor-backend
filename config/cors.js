const cors = require('cors');

module.exports = cors({
  origin: [
    'http://localhost:4200',
    'https://soil-sensor-backend.onrender.com'
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
});


