const cors = require('cors');

module.exports = cors({
  origin: [
    'http://localhost:4200',
    'https://soil-sensor-backend.onrender.com',
    'https://soil-sensor-frontend-chi.vercel.app/',
    'https://soil-sensor-dashboard.netlify.app/',
  ],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
});


