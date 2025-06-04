// 📁 soil-sensor-backend/app.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const deviceRoutes = require('./routes/device');
const measurementRoutes = require('./routes/measurement');
const reportRoutes = require('./routes/report');

app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/device', deviceRoutes);
app.use('/api/measurement', measurementRoutes);
app.use('/api/report', reportRoutes);

app.get('/', (req, res) => res.send('Soil Sensor Backend API'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
