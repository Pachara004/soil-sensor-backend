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
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
});

// Middlewares
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);
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
const authMiddleware = require('./middleware/auth');

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

// Device routes (PostgreSQL)
app.use('/api/devices', authMiddleware, require('./api/device'));

// User routes (PostgreSQL)
app.use('/api/users', authMiddleware, require('./api/users'));

// User alias routes for Angular compatibility
app.use('/api/user', authMiddleware, require('./api/users'));

// Measurement routes (PostgreSQL)
app.use('/api/measurements', authMiddleware, require('./api/measurement'));

// Area routes (PostgreSQL)
app.use('/api/areas', authMiddleware, require('./api/area'));

// Report routes (PostgreSQL)
app.use('/api/reports', authMiddleware, require('./api/report'));

// Image routes (PostgreSQL)
app.use('/api/images', authMiddleware, require('./api/image'));

// Admin routes (PostgreSQL)
app.use('/api/admin', require('./api/admin'));


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

server.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
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
