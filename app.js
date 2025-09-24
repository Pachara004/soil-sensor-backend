const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// Connect to database
connectDB();

// Routes
app.use('/api/auth', require('./api/auth'));
app.use('/api/devices', require('./api/device'));
app.use('/api/measurements', require('./api/measurement'));
app.use('/api/areas', require('./api/area'));
app.use('/api/reports', require('./api/report'));
app.use('/api/admin', require('./api/admin')); // เพิ่ม admin routes
app.use('/api/users', require('./api/users')); // เพิ่ม user routes

// Socket.io setup
require('./socket/live')(io);

// Run server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));