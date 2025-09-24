const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin'); // สำหรับ verify Google ID token (ตัวเลือก)
const { pool } = require('../config/db');
const { sendEmail } = require('../utils/email');

router.post('/register', async (req, res) => {
  const { email, username, name, phoneNumber, type, firebaseUid, firebase_uid } = req.body;
  try {
    console.log('Register request body:', req.body);

    // รับ firebaseUid จากทั้ง camelCase และ snake_case
    const uid = firebaseUid || firebase_uid;

    // ตรวจสอบว่ามี firebaseUid หรือไม่
    if (!uid) {
      console.log('Missing firebaseUid in request');
      return res.status(400).json({ message: 'Firebase UID is required' });
    }

    // ตรวจสอบว่า firebase_uid ซ้ำหรือไม่
    const existingUser = await pool.query(
      'SELECT userid FROM users WHERE firebase_uid = $1 LIMIT 1',
      [uid]
    );
    if (existingUser.rows[0]) {
      return res.status(409).json({ message: 'User already exists with this Firebase UID' });
    }

    // บันทึกข้อมูลใน PostgreSQL พร้อม firebase_uid
    const result = await pool.query(
      `INSERT INTO users (user_name, user_email, user_phone, role, firebase_uid)
           VALUES ($1, $2, $3, $4, $5) RETURNING userid, user_name, user_email, firebase_uid`,
      [username, email, phoneNumber || null, type || 'user', uid]
    );

    console.log('User created successfully:', result.rows[0]);

    // ส่งอีเมลยืนยัน
    const siteName = process.env.SITE_NAME || 'Soil Sensor';
    const subject = `${siteName} - ยินดีต้อนรับสู่ระบบ`;
    const body = `สวัสดี ${name || username}!\n\nบัญชีของคุณถูกสร้างเรียบร้อยแล้วในระบบ ${siteName}\n\nคุณสามารถเข้าสู่ระบบได้ทันที`;
    await sendEmail(email, subject, body);

    res.status(201).json({
      message: 'Registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_password, user_phone, role FROM users WHERE user_email = $1 LIMIT 1',
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.user_password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    // ใส่ทั้ง username และ user_name เพื่อความเข้ากันได้กับโค้ดเดิม
    const payload = { userid: user.userid, username: user.user_name, user_name: user.user_name, role: user.role || 'user' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({
      token,
      user: {
        userid: user.userid,
        username: user.user_name,
        user_name: user.user_name,
        email: user.user_email,
        name: user.user_name,
        phoneNumber: user.user_phone,
        role: user.role || 'user'
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify Google ID token and login/create user (เลือกใช้ได้ ถ้า config Firebase Admin ครบ)
router.post('/google-login', async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { email, name } = decodedToken;

    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, role FROM users WHERE user_email = $1 LIMIT 1',
      [email]
    );
    let user = rows[0];

    if (!user) {
      const username = (email || '').split('@')[0] || `user_${Date.now()}`;
      const randomPassword = await bcrypt.hash(Math.random().toString(36), 10);
      const insert = await pool.query(
        `INSERT INTO users (user_name, user_email, user_password, role)
         VALUES ($1,$2,$3,$4) RETURNING userid, user_name, user_email, role`,
        [username, name || username, email, randomPassword, 'user']
      );
      user = insert.rows[0];
    }

    const payload = { userid: user.userid, username: user.user_name, user_name: user.user_name, role: user.role || 'user' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, user: { userid: user.userid, username: user.user_name, email: user.user_email, name: user.user_name, role: user.role || 'user' } });
  } catch (err) {
    res.status(401).json({ message: 'Invalid Google token' });
  }
});

router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const ttlMs = 5 * 60 * 1000; // 5 นาที
  const siteName = process.env.SITE_NAME || 'Soil Sensor';
  const ref = Math.floor(100000 + Math.random() * 900000).toString();

  // เก็บ OTP ชั่วคราวในหน่วยความจำ พร้อมรีเซ็ตตัวจับเวลาเมื่อขอใหม่
  global.otpStore = global.otpStore || {};
  const previous = global.otpStore[email];
  if (previous && previous.timeout) {
    clearTimeout(previous.timeout);
  }
  const timeout = setTimeout(() => {
    delete global.otpStore[email];
  }, ttlMs);
  global.otpStore[email] = { code: otp, expiresAt: Date.now() + ttlMs, timeout, ref };

  const subject = `${siteName} - OTP สำหรับยืนยันอีเมล`;
  const body = `รหัส OTP ของคุณคือ: ${otp}\n\nใช้ได้ภายใน 5 นาที\nจากระบบ ${siteName}\n\nหมายเลขอ้างอิง: ${ref}`;
  await sendEmail(email, subject, body);
  res.json({ message: 'OTP sent', ref });
});

router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;
  if (global.otps && global.otps[email] !== otp) return res.status(400).json({ message: 'Invalid OTP' });
  const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET user_password=$1, updated_at=NOW() WHERE user_email=$2', [hashed, email]);
  delete global.otps[email];
  res.json({ message: 'Password reset' });
});

// Verify OTP (for registration)
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required' });

  const store = global.otpStore || {};
  const entry = store[email];
  if (!entry) return res.status(400).json({ message: 'OTP not found or expired' });
  if (Date.now() > entry.expiresAt) {
    delete global.otpStore[email];
    return res.status(400).json({ message: 'OTP expired' });
  }
  if (entry.code !== otp) return res.status(400).json({ message: 'Invalid OTP' });

  // ลบ OTP หลังใช้แล้ว
  if (entry.timeout) clearTimeout(entry.timeout);
  delete global.otpStore[email];
  res.json({ message: 'OTP verified' });
});

router.put('/change-password', require('../middleware/auth'), async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const { rows } = await pool.query('SELECT userid, user_password FROM users WHERE user_name=$1 LIMIT 1', [req.user.username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(oldPassword, user.user_password))) {
    return res.status(401).json({ message: 'Invalid old password' });
  }
  const hashed = await bcrypt.hash(newPassword, 10);
  await pool.query('UPDATE users SET user_password=$1, updated_at=NOW() WHERE userid=$2', [hashed, user.userid]);
  res.json({ message: 'Password changed' });
});

router.get('/check-email/:email', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE user_email=$1 LIMIT 1', [req.params.email]);
  res.json({ exists: !!rows[0] });
});

router.get('/check-username/:username', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE user_name=$1 LIMIT 1', [req.params.username]);
  res.json({ exists: !!rows[0] });
});

// Alias for frontend compatibility
router.get('/users/check-username/:username', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE user_name=$1 LIMIT 1', [req.params.username]);
  res.json({ exists: !!rows[0] });
});

// Save/complete profile for current Firebase user
router.post('/complete-profile', require('../middleware/auth'), async (req, res) => {
  try {
    const { user_name, user_phone } = req.body;
    if (!user_name) {
      return res.status(400).json({ message: 'user_name is required' });
    }

    // ensure username unique (excluding self)
    const exists = await pool.query(
      'SELECT 1 FROM users WHERE user_name=$1 AND userid <> $2 LIMIT 1',
      [user_name, req.user.userid]
    );
    if (exists.rows[0]) {
      return res.status(409).json({ message: 'Username already taken' });
    }

    const { rows } = await pool.query(
      `UPDATE users
       SET user_name=$1, user_phone=$2, updated_at=NOW()
       WHERE userid=$3
       RETURNING userid, user_name, user_email, user_phone, role`,
      [user_name, user_phone || null, req.user.userid]
    );

    return res.json({ message: 'Profile updated', user: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Get current authenticated user's profile
router.get('/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid FROM users WHERE userid=$1',
      [req.user.userid]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

// Alias endpoints for Angular compatibility
router.get('/user/profile', require('../middleware/auth'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid FROM users WHERE userid=$1',
      [req.user.userid]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

router.get('/user/me', require('../middleware/auth'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid FROM users WHERE userid=$1',
      [req.user.userid]
    );
    if (!rows[0]) return res.status(404).json({ message: 'User not found' });
    return res.json({ user: rows[0] });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
});

module.exports = router;