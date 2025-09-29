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
      `INSERT INTO users (user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
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

// Verify Google ID token and login/create user (Firebase Auth)
router.post('/google-login', async (req, res) => {
  const { idToken } = req.body;
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid: firebaseUid, email, name } = decodedToken;

    // Find or create user in PostgreSQL
    let user = null;

    // Try to find by firebase_uid first
    try {
      const byUid = await pool.query(
        'SELECT userid, user_name, user_email, role, firebase_uid FROM users WHERE firebase_uid = $1 LIMIT 1',
        [firebaseUid]
      );
      user = byUid.rows[0] || null;
    } catch (e) {
      // firebase_uid column may not exist
    }

    // Fallback: find by email
    if (!user && email) {
      const byEmail = await pool.query(
        'SELECT userid, user_name, user_email, role FROM users WHERE user_email = $1 LIMIT 1',
        [email]
      );
      user = byEmail.rows[0] || null;

      // Update firebase_uid if found by email
      if (user) {
        try {
          await pool.query(
            'UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE user_email = $2',
            [firebaseUid, email]
          );
        } catch (e) {
          // firebase_uid column may not exist
        }
      }
    }

    // Create new user if not found
    if (!user) {
      const username = email ? email.split('@')[0] : `user_${firebaseUid.slice(0, 8)}`;
      try {
        const insert = await pool.query(
          `INSERT INTO users (user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at)
           VALUES ($1, $2, NULL, 'user', $3, NOW(), NOW())
           RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
          [username, email, firebaseUid]
        );
        user = insert.rows[0];
      } catch (e) {
        const insert2 = await pool.query(
          `INSERT INTO users (user_name, user_email, user_phone, role, created_at, updated_at)
           VALUES ($1, $2, NULL, 'user', NOW(), NOW())
           RETURNING userid, user_name, user_email, user_phone, role, created_at, updated_at`,
          [username, email]
        );
        user = insert2.rows[0];
      }
    }

    // Return user data (no JWT token needed for Firebase Auth)
    res.json({
      message: 'Google login successful',
      user: {
        userid: user.userid,
        username: user.user_name,
        user_name: user.user_name,
        email: user.user_email,
        role: user.role || 'user',
        firebase_uid: firebaseUid
      }
    });
  } catch (err) {
    console.error('Google login error:', err);
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

  console.log('📧 OTP sent:', { email, otp, ref, expiresAt: new Date(Date.now() + ttlMs) });
  res.json({ message: 'OTP sent', ref });
});

router.put('/reset-password', async (req, res) => {
  try {
    console.log('🔐 Reset password request body:', req.body);
    const { email, otp, newPassword, referenceNumber } = req.body;

    console.log('🔍 Parsed fields:', {
      email: !!email,
      otp: !!otp,
      newPassword: !!newPassword,
      referenceNumber: !!referenceNumber
    });

    if (!email || !otp || !newPassword) {
      console.log('❌ Missing required fields:', { email: !!email, otp: !!otp, newPassword: !!newPassword });
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    // ตรวจสอบ OTP จาก otpStore
    const store = global.otpStore || {};
    const entry = store[email];

    console.log('🔍 OTP Store check:', {
      email,
      hasEntry: !!entry,
      storeKeys: Object.keys(store),
      entryExpires: entry ? new Date(entry.expiresAt) : null,
      entryCode: entry ? entry.code : null,
      entryRef: entry ? entry.ref : null,
      currentTime: new Date(),
      isExpired: entry ? Date.now() > entry.expiresAt : true
    });

    if (!entry) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }

    if (Date.now() > entry.expiresAt) {
      delete global.otpStore[email];
      return res.status(400).json({ message: 'OTP expired' });
    }

    console.log('🔍 OTP Comparison:', {
      receivedOtp: otp,
      storedOtp: entry.code,
      otpMatch: entry.code === otp
    });

    if (entry.code !== otp) {
      console.log('❌ OTP mismatch:', { received: otp, stored: entry.code });
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // ตรวจสอบว่า OTP ถูก verify แล้วหรือไม่
    if (!entry.verified) {
      console.log('❌ OTP not verified yet');
      return res.status(400).json({ message: 'OTP must be verified first' });
    }

    // Hash รหัสผ่านใหม่
    const hashed = await bcrypt.hash(newPassword, 10);

    // อัปเดตรหัสผ่านในฐานข้อมูล
    const result = await pool.query(
      'UPDATE users SET user_password=$1, updated_at=NOW() WHERE user_email=$2 RETURNING userid, firebase_uid',
      [hashed, email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    // อัปเดตรหัสผ่านใน Firebase Auth (ถ้ามี firebase_uid)
    if (user.firebase_uid) {
      try {
        console.log('🔥 Updating Firebase Auth password for UID:', user.firebase_uid);
        await admin.auth().updateUser(user.firebase_uid, {
          password: newPassword
        });
        console.log('✅ Firebase Auth password updated successfully');
      } catch (firebaseError) {
        console.error('❌ Firebase Auth update error:', firebaseError);
        // ไม่ return error เพราะ database update สำเร็จแล้ว
        // แค่ log error และดำเนินการต่อ
      }
    } else {
      console.log('ℹ️ No Firebase UID found, skipping Firebase Auth update');
    }

    // ลบ OTP หลังใช้แล้ว
    if (entry.timeout) clearTimeout(entry.timeout);
    delete global.otpStore[email];

    console.log('✅ Password reset successful for:', email);
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('❌ Reset password error:', err);
    console.error('❌ Error details:', {
      message: err.message,
      stack: err.stack,
      code: err.code,
      detail: err.detail
    });
    res.status(500).json({ message: 'Internal server error' });
  }
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

  // ไม่ลบ OTP หลัง verify เพื่อให้ใช้ใน reset password ได้
  // เพิ่ม flag เพื่อระบุว่า OTP ถูก verify แล้ว
  entry.verified = true;

  console.log('✅ OTP verified for:', email);
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

// Delete user account (both Firebase Auth and PostgreSQL)
router.delete('/delete-account', require('../middleware/auth'), async (req, res) => {
  try {
    console.log('🗑️ Delete account request for user:', req.user.userid);

    // Get user data first
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, firebase_uid FROM users WHERE userid=$1',
      [req.user.userid]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];
    console.log('👤 User to delete:', {
      userid: user.userid,
      user_name: user.user_name,
      user_email: user.user_email,
      firebase_uid: user.firebase_uid
    });

    // Start transaction to ensure data consistency
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Delete related data first (to avoid foreign key constraints)
      console.log('🗑️ Deleting related data...');

      // Delete areas_at relationships
      await client.query('DELETE FROM areas_at WHERE areasid IN (SELECT areasid FROM areas WHERE userid = $1)', [user.userid]);
      console.log('✅ Deleted areas_at relationships');

      // Delete areas
      await client.query('DELETE FROM areas WHERE userid = $1', [user.userid]);
      console.log('✅ Deleted areas');

      // Delete measurements
      await client.query('DELETE FROM measurement WHERE deviceid IN (SELECT deviceid FROM device WHERE userid = $1)', [user.userid]);
      console.log('✅ Deleted measurements');

      // Delete devices
      await client.query('DELETE FROM device WHERE userid = $1', [user.userid]);
      console.log('✅ Deleted devices');

      // Delete images first (they reference reports)
      await client.query('DELETE FROM images WHERE reportid IN (SELECT reportid FROM reports WHERE userid = $1)', [user.userid]);
      console.log('✅ Deleted images');

      // Delete reports
      await client.query('DELETE FROM reports WHERE userid = $1', [user.userid]);
      console.log('✅ Deleted reports');

      // 2. Delete user from PostgreSQL
      await client.query('DELETE FROM users WHERE userid = $1', [user.userid]);
      console.log('✅ Deleted user from PostgreSQL');

      // 3. Delete user from Firebase Auth (if firebase_uid exists)
      if (user.firebase_uid) {
        try {
          console.log('🔥 Deleting user from Firebase Auth:', user.firebase_uid);
          await admin.auth().deleteUser(user.firebase_uid);
          console.log('✅ Deleted user from Firebase Auth');
        } catch (firebaseError) {
          console.error('❌ Firebase Auth delete error:', firebaseError);
          // Continue with PostgreSQL deletion even if Firebase fails
          // This ensures data consistency
        }
      } else {
        console.log('ℹ️ No Firebase UID found, skipping Firebase Auth deletion');
      }

      await client.query('COMMIT');
      console.log('✅ Transaction committed successfully');

      res.json({
        message: 'Account deleted successfully',
        deletedUser: {
          userid: user.userid,
          user_name: user.user_name,
          user_email: user.user_email,
          firebase_uid: user.firebase_uid
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Delete account error:', err);
    res.status(500).json({
      message: 'Failed to delete account',
      error: err.message
    });
  }
});

// Admin endpoint to delete any user (admin only)
router.delete('/admin/delete-user/:userid', require('../middleware/auth'), async (req, res) => {
  try {
    // Check if current user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const targetUserid = parseInt(req.params.userid);
    if (!targetUserid || targetUserid === req.user.userid) {
      return res.status(400).json({ message: 'Invalid user ID or cannot delete self' });
    }

    console.log('🗑️ Admin delete user request:', {
      adminUserid: req.user.userid,
      targetUserid: targetUserid
    });

    // Get target user data
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, firebase_uid FROM users WHERE userid=$1',
      [targetUserid]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const targetUser = rows[0];
    console.log('👤 Target user to delete:', targetUser);

    // Start transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete related data
      console.log('🗑️ Deleting related data for user:', targetUserid);

      // Delete areas_at relationships
      await client.query('DELETE FROM areas_at WHERE areasid IN (SELECT areasid FROM areas WHERE userid = $1)', [targetUserid]);
      console.log('✅ Deleted areas_at relationships');

      // Delete areas
      await client.query('DELETE FROM areas WHERE userid = $1', [targetUserid]);
      console.log('✅ Deleted areas');

      // Delete measurements
      await client.query('DELETE FROM measurement WHERE deviceid IN (SELECT deviceid FROM device WHERE userid = $1)', [targetUserid]);
      console.log('✅ Deleted measurements');

      // Delete devices
      await client.query('DELETE FROM device WHERE userid = $1', [targetUserid]);
      console.log('✅ Deleted devices');

      // Delete images first (they reference reports)
      await client.query('DELETE FROM images WHERE reportid IN (SELECT reportid FROM reports WHERE userid = $1)', [targetUserid]);
      console.log('✅ Deleted images');

      // Delete reports
      await client.query('DELETE FROM reports WHERE userid = $1', [targetUserid]);
      console.log('✅ Deleted reports');

      // Delete user from PostgreSQL
      await client.query('DELETE FROM users WHERE userid = $1', [targetUserid]);
      console.log('✅ Deleted user from PostgreSQL');

      // Delete user from Firebase Auth
      if (targetUser.firebase_uid) {
        try {
          console.log('🔥 Deleting user from Firebase Auth:', targetUser.firebase_uid);
          await admin.auth().deleteUser(targetUser.firebase_uid);
          console.log('✅ Deleted user from Firebase Auth');
        } catch (firebaseError) {
          console.error('❌ Firebase Auth delete error:', firebaseError);
        }
      }

      await client.query('COMMIT');
      console.log('✅ Admin delete transaction committed');

      res.json({
        message: 'User deleted successfully by admin',
        deletedUser: targetUser,
        deletedBy: {
          userid: req.user.userid,
          username: req.user.username
        }
      });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Admin delete transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('❌ Admin delete user error:', err);
    res.status(500).json({
      message: 'Failed to delete user',
      error: err.message
    });
  }
});

module.exports = router;