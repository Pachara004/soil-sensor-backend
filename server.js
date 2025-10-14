'use strict';

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs'); // (สำรอง ถ้าอนาคตจะใช้)
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const cors = require('cors');
const admin = require('firebase-admin');
const dotenv = require('dotenv');
const { connectDB } = require('./config/db');
const { authMiddleware } = require('./middleware/auth');
const RealtimeMeasurementService = require('./services/realtime-measurement-service');

dotenv.config();

/* --------------------------------
 * Firebase Admin Initialization
 * -------------------------------- */
const hasFirebaseEnv =
  process.env.FIREBASE_PROJECT_ID &&
  (process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64) &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_DATABASE_URL;

let db = null;

if (hasFirebaseEnv) {
  let privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  // รองรับ Base64
  if (!privateKeyRaw && process.env.FIREBASE_PRIVATE_KEY_BASE64) {
    try {
      privateKeyRaw = Buffer.from(
        process.env.FIREBASE_PRIVATE_KEY_BASE64,
        'base64'
      ).toString('utf8');
    } catch (e) {
    }
  }

  try {
    if (privateKeyRaw) {
      const formattedPrivateKey = privateKeyRaw.replace(/\\n/g, '\n');

      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          privateKey: formattedPrivateKey,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });

      db = admin.database();
    } else {
    }
  } catch (err) {
    console.error('Firebase initialization failed:', err.message);
  }
} else {
}

/* --------------------
 * Express + Socket.IO
 * -------------------- */
const app = express();
const server = http.createServer(app);

// Initialize WebSocket service
const realtimeService = new RealtimeMeasurementService(server);

// ================== CORS Configuration ==================
// กำหนด allowed origins
const allowedOrigins = [
  'http://localhost:4200',           // Angular dev server
  'http://localhost:3000',           // Backend dev server
  'http://127.0.0.1:4200',
  'http://127.0.0.1:3000',
  'https://soil-sensor-frontend.vercel.app',  // Production frontend (ถ้ามี)
  'https://soil-sensor-backend.onrender.com', // Production backend
  process.env.FRONTEND_URL,          // จาก .env
  process.env.CORS_ORIGIN            // จาก .env
].filter(Boolean); // กรอง undefined/null ออก

// Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// CORS options
const corsOptions = {
  origin: function (origin, callback) {
    // อนุญาต requests ที่ไม่มี origin (เช่น mobile apps, Postman, ESP32)
    if (!origin) {
      return callback(null, true);
    }
    
    // ตรวจสอบว่า origin อยู่ใน whitelist หรือไม่
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      console.warn('⚠️  CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,                    // อนุญาต cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'x-api-key',
    'Accept',
    'Origin'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600  // Cache preflight request เป็นเวลา 10 นาที
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Connect PostgreSQL
connectDB().catch((err) => {
  console.error('Failed to connect PostgreSQL:', err && err.message);
});

/* --------------------
 * Nodemailer (Email)
 * -------------------- */
let transporter = null;
let emailReady = false;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    // ใช้ service: 'gmail' หรือตั้ง host/port เองก็ได้ แต่ไม่ต้องใส่ทั้งคู่
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER, // ต้องเป็น Gmail
      pass: process.env.EMAIL_PASS, // ต้องเป็น App Password 16 ตัว
    },
    // ตัวเลือก: หากไม่ใช้ service ให้คอมเมนต์ข้างบนแล้วใช้ด้านล่างแทน
    // host: 'smtp.gmail.com',
    // port: 465,
    // secure: true,
  });

  // ตรวจสอบการเชื่อมต่อ SMTP
  transporter
    .verify()
    .then(() => {
      emailReady = true;
    })
    .catch((err) => {
      emailReady = false;
      console.error('Nodemailer verify failed:', err.message);
    });
} else {
}

/* --------------------
 * Helper: Auth Guard (Firebase ID token)
 * -------------------- */

/* --------------------
 * Health Check
 * -------------------- */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    firebase: db ? 'connected' : 'disconnected',
    email: emailReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  res.json({
    message: 'Soil Sensor Backend API',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

/* --------------------
 * Socket.IO handlers
 * -------------------- */
io.on('connection', (socket) => {

  socket.on('join-device', (deviceId) => {
    if (!deviceId) {
      socket.emit('error', { message: 'Device ID is required' });
      return;
    }

    socket.join(deviceId);

    if (!db) {
      socket.emit('error', { message: 'Firebase not available' });
      return;
    }

    const liveRef = db.ref(`live/${deviceId}`);

    const onLiveUpdate = (snapshot) => {
      const payload = snapshot.val();
      if (payload) {
        socket.emit('live-update', payload);
      }
    };

    liveRef.on('value', onLiveUpdate);

    // เก็บ ref ไว้ cleanup ตอน disconnect
    socket.liveRef = liveRef;
    socket.onLiveUpdate = onLiveUpdate;
  });

  socket.on('save-measurement', async (data) => {
    try {
      const { deviceId, payload, areaId } = data || {};
      if (!deviceId || !payload) {
        socket.emit('error', { message: 'Device ID and payload are required' });
        return;
      }


      // โปรเจ็กต์นี้ปิด MongoDB อยู่ — ทำเฉพาะเคลียร์ live ใน Firebase
      if (db) {
        await db.ref(`live/${deviceId}`).remove();
      }

      socket.emit('measurement-saved', {
        message: 'Measurement processed (MongoDB disabled)',
        deviceId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Error saving measurement:', err);
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    if (socket.liveRef && socket.onLiveUpdate) {
      socket.liveRef.off('value', socket.onLiveUpdate);
    }
  });
});

/* --------------------
 * Example APIs
 * -------------------- */

// Auth routes (JWT + PostgreSQL)
app.use('/api/auth', require('./api/auth'));

// Device routes (PostgreSQL) - some endpoints don't need auth
app.use('/api/devices', require('./api/device'));

// User routes (PostgreSQL)
app.use('/api/users', authMiddleware, require('./api/users'));

// User alias routes for Angular compatibility
app.use('/api/user', authMiddleware, require('./api/users'));

// GPS routes (PostgreSQL)
app.use('/api/gps', require('./api/gps'));

// Measurement routes (PostgreSQL)
app.use('/api/measurements', authMiddleware, require('./api/measurement'));
// Firebase measurement endpoint (no auth required)
app.use('/api/measurement-points', require('./api/measurement-points'));
app.use('/api/manual-points', require('./api/manual-point-id'));
app.use('/api/sequential', require('./api/sequential-measurement'));
app.use('/api/gps-coordinates', require('./api/gps-coordinates'));
// Areasid sync routes
app.use('/api/areasid', require('./api/areasid-sync'));
// Real-time measurement routes
app.use('/api/realtime', require('./api/realtime-measurement'));
// Device ownership routes
app.use('/api/device', require('./api/device-ownership'));
// Device management routes (with Firebase sync)
app.use('/api/devices', require('./api/device-management'));

// Area routes (PostgreSQL)
app.use('/api/areas', authMiddleware, require('./api/area'));

// Report routes (PostgreSQL)
app.use('/api/reports', authMiddleware, require('./api/report'));

// Image routes (PostgreSQL)
app.use('/api/images', authMiddleware, require('./api/image'));

// Admin routes (PostgreSQL)
app.use('/api/admin', require('./api/admin'));

// Firebase routes (Firebase Realtime Database)
app.use('/api/firebase', require('./api/firebase'));

// Firebase measurement sync routes
app.use('/api/firebase-measurements', require('./api/firebase-measurement'));


/* --------------------
 * Global Error Handler
 * -------------------- */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  return res.status(500).json({
    message: 'Internal server error',
    error:
      process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

/* --------------------
 * 404
 * -------------------- */
// แทนที่บล็อก 404 เดิม
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});


/* --------------------
 * Start Server
 * -------------------- */
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`🌐 Accessible from: http://172.16.0.241:${PORT}`);
  console.log(`🌐 Also accessible from: http://10.197.169.7:${PORT}`);
  console.log(`📡 ESP32 can connect from: http://172.16.0.241:${PORT}`);
  console.log(`🔧 Make sure Windows Firewall allows port ${PORT}`);
});

/* --------------------
 * Server Errors & Shutdown
 * -------------------- */
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
  }
});

// Global error handler
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('❌ Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handler for Express
app.use((error, req, res, next) => {
  console.error('❌ Express Error:', error);
  console.error('❌ Request URL:', req.url);
  console.error('❌ Request Method:', req.method);
  console.error('❌ Request Body:', req.body);
  
  res.status(500).json({
    message: 'Internal server error',
    error: error.message
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

// Export realtimeService for API endpoints
module.exports = { realtimeService };
