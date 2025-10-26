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
      console.error('Failed to decode Firebase private key:', e.message);
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
      console.log('✅ Firebase Admin initialized successfully');
    } else {
      console.warn('⚠️ Firebase private key not found');
    }
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err.message);
  }
} else {
  console.warn('⚠️ Firebase environment variables not configured');
}

/* --------------------
 * Express + Socket.IO
 * -------------------- */
const app = express();
const server = http.createServer(app);

// Initialize WebSocket service
const realtimeService = new RealtimeMeasurementService(server);

// ================== CORS Configuration ==================
// กำหนด allowed origins - รองรับทั้ง production และ development
const allowedOrigins = [
  // Development
  'http://localhost:4200',
  'http://localhost:3000',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:3000',
  
  // Production - Vercel (Frontend)
  'https://soil-sensor-frontend-chi.vercel.app',
  'https://soil-sensor-frontend.vercel.app',
  
  // Production - Render (Backend)
  'https://soil-sensor-backend.onrender.com',
  
  // Environment variables
  process.env.FRONTEND_URL,
  process.env.CORS_ORIGIN,
  process.env.ALLOWED_ORIGIN
].filter(Boolean); // กรอง undefined/null ออก

console.log('🌐 Allowed Origins:', allowedOrigins);

// Socket.IO with CORS
const io = socketIo(server, {
  cors: {
    origin: allowedOrigins.length > 0 ? allowedOrigins : '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  },
  transports: ['websocket', 'polling']
});

// CORS options with detailed logging
const corsOptions = {
  origin: function (origin, callback) {
    console.log('🔍 CORS Origin Check:', origin || 'NO ORIGIN');
    
    // อนุญาต requests ที่ไม่มี origin (เช่น mobile apps, Postman, ESP32)
    if (!origin) {
      console.log('✅ Allowing request without origin (mobile/postman/esp32)');
      return callback(null, true);
    }
    
    // ตรวจสอบว่า origin อยู่ใน whitelist หรือไม่
    if (allowedOrigins.includes(origin)) {
      console.log('✅ Origin allowed:', origin);
      return callback(null, true);
    }
    
    // Development mode - อนุญาตทุก localhost
    if (process.env.NODE_ENV !== 'production' && origin.includes('localhost')) {
      console.log('✅ Development: Allowing localhost:', origin);
      return callback(null, true);
    }
    
    // Block
    console.warn('❌ CORS blocked origin:', origin);
    console.warn('📋 Allowed origins:', allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-API-Key',
    'x-api-key',
    'Accept',
    'Origin',
    'Access-Control-Allow-Origin'
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'Authorization'],
  maxAge: 600,  // Cache preflight request เป็นเวลา 10 นาที
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'NO ORIGIN'}`);
  next();
});

// Connect PostgreSQL
connectDB().catch((err) => {
  console.error('❌ Failed to connect PostgreSQL:', err && err.message);
});

/* --------------------
 * Nodemailer (Email)
 * -------------------- */
let transporter = null;
let emailReady = false;

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // App Password 16 ตัว
    },
  });

  // ตรวจสอบการเชื่อมต่อ SMTP
  transporter
    .verify()
    .then(() => {
      emailReady = true;
      console.log('✅ Email service ready');
    })
    .catch((err) => {
      emailReady = false;
      console.error('❌ Nodemailer verify failed:', err.message);
    });
} else {
  console.warn('⚠️ Email credentials not configured');
}

/* --------------------
 * Health Check
 * -------------------- */
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    firebase: db ? 'connected' : 'disconnected',
    email: emailReady ? 'ready' : 'not_ready',
    environment: process.env.NODE_ENV || 'development',
    allowedOrigins: allowedOrigins,
    timestamp: new Date().toISOString(),
  });
});

// Root endpoint for basic connectivity test
app.get('/', (req, res) => {
  res.json({
    message: 'Soil Sensor Backend API',
    status: 'OK',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

/* --------------------
 * Socket.IO handlers
 * -------------------- */
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('join-device', (deviceId) => {
    if (!deviceId) {
      socket.emit('error', { message: 'Device ID is required' });
      return;
    }

    socket.join(deviceId);
    console.log(`📱 Device ${deviceId} joined room`);

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

      console.log(`💾 Saving measurement for device: ${deviceId}`);

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
      console.error('❌ Error saving measurement:', err);
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
    if (socket.liveRef && socket.onLiveUpdate) {
      socket.liveRef.off('value', socket.onLiveUpdate);
    }
  });
});

/* --------------------
 * API Routes
 * -------------------- */

// Auth routes (JWT + PostgreSQL)
app.use('/api/auth', require('./api/auth'));

// Device routes (PostgreSQL) - some endpoints don't need auth
app.use('/api/devices', require('./api/device'));

// Profile endpoint (standalone)
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { pool } = require('./config/db');
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
      [req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('❌ Error fetching user profile:', err);
    res.status(500).json({ message: err.message });
  }
});

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

// Reports routes (PostgreSQL)
app.use('/api/reports', require('./api/reports'));
app.use('/api/user', require('./api/user-reports'));

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
  console.error('❌ Unhandled error:', err);
  console.error('❌ Request URL:', req.url);
  console.error('❌ Request Method:', req.method);
  console.error('❌ Request Body:', req.body);
  
  return res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : 'Something went wrong',
  });
});

/* --------------------
 * 404 Handler
 * -------------------- */
app.use((req, res) => {
  console.warn('⚠️ Route not found:', req.method, req.path);
  res.status(404).json({ 
    message: 'Route not found',
    path: req.path,
    method: req.method
  });
});

/* --------------------
 * Start Server
 * -------------------- */
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, (err) => {
  if (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
  
  console.log('\n🚀 ================================');
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔥 Firebase: ${db ? 'Connected' : 'Disconnected'}`);
  console.log(`📧 Email: ${emailReady ? 'Ready' : 'Not Ready'}`);
  console.log(`🌍 CORS Origins: ${allowedOrigins.length} configured`);
  console.log('🚀 ================================\n');
});

/* --------------------
 * Server Error Handlers
 * -------------------- */
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
  }
});

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('❌ Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, closing server gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Export realtimeService for API endpoints
module.exports = { realtimeService };