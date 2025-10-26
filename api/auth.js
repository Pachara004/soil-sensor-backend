const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin'); // สำหรับ verify Google ID token (ตัวเลือก)
const { pool } = require('../config/db');
const { sendEmail } = require('../utils/email');
const { authMiddleware } = require('../middleware/auth');

router.post('/register', async (req, res) => {
  const { email, username, name, phoneNumber, type, firebaseUid, firebase_uid } = req.body;
  try {

    // รับ firebaseUid จากทั้ง camelCase และ snake_case
    const uid = firebaseUid || firebase_uid;

    // ตรวจสอบว่ามี firebaseUid หรือไม่
    if (!uid) {
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
        'SELECT userid, user_name, user_email, role, firebase_uid FROM users WHERE user_email = $1 LIMIT 1',
        [email]
      );
      user = byEmail.rows[0] || null;

      // Update firebase_uid if found by email (link Google account to existing user)
      if (user) {
        try {
          await pool.query(
            'UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE user_email = $2',
            [firebaseUid, email]
          );
          // Update user object with new firebase_uid
          user.firebase_uid = firebaseUid;
        } catch (e) {
          // firebase_uid column may not exist, but user can still login
          console.warn('Could not update firebase_uid:', e.message);
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
        // Check if it's a duplicate email error
        if (e.code === '23505' && e.constraint && e.constraint.includes('email')) {
          return res.status(409).json({
            message: 'Email already exists in system. Please use a different email or login with existing account.',
            error: 'EMAIL_EXISTS'
          });
        }

        // If firebase_uid column doesn't exist, try without it
        try {
          const insert2 = await pool.query(
            `INSERT INTO users (user_name, user_email, user_phone, role, created_at, updated_at)
             VALUES ($1, $2, NULL, 'user', NOW(), NOW())
             RETURNING userid, user_name, user_email, user_phone, role, created_at, updated_at`,
            [username, email]
          );
          user = insert2.rows[0];
        } catch (e2) {
          // Check if it's a duplicate email error
          if (e2.code === '23505' && e2.constraint && e2.constraint.includes('email')) {
            return res.status(409).json({
              message: 'Email already exists in system. Please use a different email or login with existing account.',
              error: 'EMAIL_EXISTS'
            });
          }

          console.error('Failed to create user:', e2);
          return res.status(500).json({
            message: 'Failed to create user account',
            error: 'USER_CREATION_FAILED'
          });
        }
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
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    console.log(`📧 Sending OTP to: ${email}`);

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

    let emailSent = true;
    try {
      await sendEmail(email, subject, body);
      console.log(`✅ OTP sent to ${email}: ${otp} (ref: ${ref})`);
    } catch (e) {
      // Log and continue — we still keep OTP in memory so frontend can proceed in dev/test
      emailSent = false;
      console.error('❌ sendEmail failed:', e && e.message ? e.message : e);
    }

    res.json({ 
      success: true,
      message: emailSent ? 'OTP sent successfully' : 'OTP generated (email not sent - email service unavailable)',
      email: email,
      ref: ref,
      expiresIn: 300, // 5 minutes in seconds
      nextStep: 'verify-otp', // บอก frontend ให้ไป step ถัดไป
      emailSent: emailSent
    });
  } catch (err) {
    console.error('❌ Error sending OTP:', err);
    res.status(500).json({ 
      success: false,
      message: 'เกิดข้อผิดพลาดในการส่ง OTP',
      error: err.message 
    });
  }
});

router.put('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword, referenceNumber } = req.body;


    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP, and new password are required' });
    }

    // ตรวจสอบ OTP จาก otpStore
    const store = global.otpStore || {};
    const entry = store[email];


    if (!entry) {
      return res.status(400).json({ message: 'OTP not found or expired' });
    }

    if (Date.now() > entry.expiresAt) {
      delete global.otpStore[email];
      return res.status(400).json({ message: 'OTP expired' });
    }


    if (entry.code !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    // ตรวจสอบว่า OTP ถูก verify แล้วหรือไม่
    if (!entry.verified) {
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
        await admin.auth().updateUser(user.firebase_uid, {
          password: newPassword
        });
      } catch (firebaseError) {
        // ไม่ return error เพราะ database update สำเร็จแล้ว
        // แค่ log error และดำเนินการต่อ
      }
    } else {
    }

    // ลบ OTP หลังใช้แล้ว
    if (entry.timeout) clearTimeout(entry.timeout);
    delete global.otpStore[email];

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
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

  res.json({ message: 'OTP verified' });
});

router.put('/change-password', require('../middleware/auth').authMiddleware, async (req, res) => {
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


router.get('/check-username/:username', async (req, res) => {
  const { rows } = await pool.query('SELECT 1 FROM users WHERE user_name=$1 LIMIT 1', [req.params.username]);
  res.json({ exists: !!rows[0] });
});

// Save/complete profile for current Firebase user
router.post('/complete-profile', require('../middleware/auth').authMiddleware, async (req, res) => {
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
router.get('/me', require('../middleware/auth').authMiddleware, async (req, res) => {
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
router.get('/user/profile', require('../middleware/auth').authMiddleware, async (req, res) => {
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

router.get('/user/me', require('../middleware/auth').authMiddleware, async (req, res) => {
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
router.delete('/delete-account', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {

    // Get user data first
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, firebase_uid FROM users WHERE userid=$1',
      [req.user.userid]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];

    // Start transaction to ensure data consistency
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1. Delete related data first (to avoid foreign key constraints)

      // Delete areas_at relationships
      await client.query('DELETE FROM areas_at WHERE areasid IN (SELECT areasid FROM areas WHERE userid = $1)', [user.userid]);

      // Delete areas
      await client.query('DELETE FROM areas WHERE userid = $1', [user.userid]);

      // Delete measurements
      await client.query('DELETE FROM measurement WHERE deviceid IN (SELECT deviceid FROM device WHERE userid = $1)', [user.userid]);

      // Delete devices
      await client.query('DELETE FROM device WHERE userid = $1', [user.userid]);

      // Delete images first (they reference reports)
      await client.query('DELETE FROM images WHERE reportid IN (SELECT reportid FROM reports WHERE userid = $1)', [user.userid]);

      // Delete reports
      await client.query('DELETE FROM reports WHERE userid = $1', [user.userid]);

      // 2. Delete user from PostgreSQL
      await client.query('DELETE FROM users WHERE userid = $1', [user.userid]);

      // 3. Delete user from Firebase Auth (if firebase_uid exists)
      if (user.firebase_uid) {
        try {
          await admin.auth().deleteUser(user.firebase_uid);
        } catch (firebaseError) {
          // Continue with PostgreSQL deletion even if Firebase fails
          // This ensures data consistency
        }
      } else {
      }

      await client.query('COMMIT');

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
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({
      message: 'Failed to delete account',
      error: err.message
    });
  }
});

// Admin endpoint to delete any user (admin only)
router.delete('/admin/delete-user/:userid', require('../middleware/auth').authMiddleware, async (req, res) => {
  try {
    // Check if current user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const targetUserid = parseInt(req.params.userid);
    if (!targetUserid || isNaN(targetUserid)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }

    if (targetUserid === req.user.userid) {
      return res.status(400).json({ message: 'Cannot delete yourself' });
    }

    // Get target user data
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, firebase_uid FROM users WHERE userid=$1',
      [targetUserid]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: 'Target user not found' });
    }

    const targetUser = rows[0];

    // Start transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete related data in correct order (foreign key constraints)

      // Delete measurements first (they reference areas and devices)
      await client.query('DELETE FROM measurement WHERE deviceid IN (SELECT deviceid FROM device WHERE userid = $1)', [targetUserid]);

      // Delete areas_at relationships
      await client.query('DELETE FROM areas_at WHERE areasid IN (SELECT areasid FROM areas WHERE userid = $1)', [targetUserid]);

      // Delete areas
      await client.query('DELETE FROM areas WHERE userid = $1', [targetUserid]);

      // Delete devices
      await client.query('DELETE FROM device WHERE userid = $1', [targetUserid]);

      // Delete images first (they reference reports)
      await client.query('DELETE FROM images WHERE reportid IN (SELECT reportid FROM reports WHERE userid = $1)', [targetUserid]);

      // Delete reports
      await client.query('DELETE FROM reports WHERE userid = $1', [targetUserid]);

      // Delete user from PostgreSQL
      await client.query('DELETE FROM users WHERE userid = $1', [targetUserid]);

      // Delete user from Firebase Auth (if exists)
      if (targetUser.firebase_uid) {
        try {
          await admin.auth().deleteUser(targetUser.firebase_uid);
          console.log('Firebase user deleted:', targetUser.firebase_uid);
        } catch (firebaseError) {
          console.log('Firebase user deletion failed (may not exist):', firebaseError.message);
        }
      }

      await client.query('COMMIT');

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
      console.error('Transaction error:', error);
      throw error;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({
      message: 'Failed to delete user',
      error: err.message
    });
  }
});

// Temporary endpoint for /api/devices (until Render deploys new code)
router.get('/devices', async (req, res) => {
  try {
    console.log('🔍 Getting all devices (temporary endpoint)...');
    
    const { rows } = await pool.query(`
      SELECT 
        d.*,
        u.user_name,
        u.user_email,
        u.role,
        u.firebase_uid
      FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      ORDER BY d.created_at DESC
    `);
    
    console.log(`📊 Found ${rows.length} devices`);
    
    const devices = rows.map(device => ({
      deviceid: device.deviceid,
      device_name: device.device_name,
      device_status: device.device_status,
      user_name: device.user_name,
      user_email: device.user_email,
      role: device.role,
      firebase_uid: device.firebase_uid,
      created_at: device.created_at,
      updated_at: device.updated_at
    }));
    
    res.json(devices);
    
  } catch (err) {
    console.error('Error getting all devices:', err);
    res.status(500).json({ message: err.message });
  }
});

// Temporary POST endpoint for /api/devices (until Render deploys new code)
router.post('/devices', async (req, res) => {
  try {
    const { deviceId, device_name, status, device_type, description, userid } = req.body;
    
    console.log('🔧 Creating new device (temporary endpoint):', {
      deviceId,
      device_name,
      status,
      device_type,
      description,
      userid
    });
    
    // Validate required fields
    if (!deviceId || !device_name) {
      return res.status(400).json({ 
        message: 'deviceId and device_name are required' 
      });
    }
    
    // Check if device already exists
    const existingDevice = await pool.query(
      'SELECT deviceid FROM device WHERE device_name = $1 OR deviceid = $2',
      [device_name, deviceId]
    );
    
    if (existingDevice.rows.length > 0) {
      return res.status(409).json({ 
        message: 'Device already exists with this name or ID' 
      });
    }
    
    // Generate API key for device authentication
    const apiKey = 'sk_' + Math.random().toString(36).substring(2, 15) + 
                   Math.random().toString(36).substring(2, 15);
    
    // Insert new device
    const result = await pool.query(`
      INSERT INTO device (
        deviceid, device_name, device_status, device_type, 
        description, userid, api_key, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING deviceid, device_name, device_status, device_type, 
                description, userid, api_key, created_at, updated_at
    `, [
      deviceId,
      device_name,
      status || 'offline',
      device_type || false,
      description || null,
      userid || null,
      apiKey
    ]);
    
    const newDevice = result.rows[0];
    console.log('✅ Device created successfully (temporary):', {
      deviceid: newDevice.deviceid,
      device_name: newDevice.device_name,
      api_key: newDevice.api_key.substring(0, 10) + '...'
    });
    
    res.status(201).json({
      message: 'Device created successfully',
      device: {
        deviceid: newDevice.deviceid,
        device_name: newDevice.device_name,
        device_status: newDevice.device_status,
        device_type: newDevice.device_type,
        description: newDevice.description,
        userid: newDevice.userid,
        api_key: newDevice.api_key,
        created_at: newDevice.created_at,
        updated_at: newDevice.updated_at
      }
    });
    
  } catch (err) {
    console.error('Error creating device (temporary):', err);
    res.status(500).json({ message: err.message });
  }
});

// Debug endpoint to check token
router.post('/debug-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    let result = { token: token.substring(0, 50) + '...' };

    // Try Firebase verification
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      result.firebase = {
        success: true,
        uid: decoded.uid,
        email: decoded.email,
        exp: new Date(decoded.exp * 1000).toISOString()
      };
    } catch (firebaseError) {
      result.firebase = {
        success: false,
        error: firebaseError.message
      };
    }

    // Try JWT verification
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      result.jwt = {
        success: true,
        userid: decoded.userid,
        email: decoded.email,
        exp: new Date(decoded.exp * 1000).toISOString()
      };
    } catch (jwtError) {
      result.jwt = {
        success: false,
        error: jwtError.message
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Check email availability
router.get('/check-email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    console.log(`🔍 Checking email availability for: ${email}`);
    
    // Check if email exists in database
    const { rows } = await pool.query(
      'SELECT userid, user_email FROM users WHERE user_email = $1',
      [email]
    );
    
    const emailExists = rows.length > 0;
    
    console.log(`📧 Email ${email} exists: ${emailExists}`);
    
    res.json({
      email: email,
      available: !emailExists,
      exists: emailExists,
      message: emailExists ? 'Email already registered' : 'Email available'
    });
    
  } catch (err) {
    console.error('❌ Error checking email:', err);
    res.status(500).json({ 
      message: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมลกับฐานข้อมูล',
      error: err.message 
    });
  }
});


// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    console.log(`🔐 Verifying OTP for: ${email}`);
    
    // Check OTP in database
    const { rows } = await pool.query(
      'SELECT otp, expires_at FROM otp_verification WHERE email = $1 AND expires_at > NOW()',
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(400).json({ 
        message: 'OTP not found or expired',
        valid: false 
      });
    }
    
    const storedOtp = rows[0].otp;
    const isValid = storedOtp === otp;
    
    console.log(`🔐 OTP verification for ${email}: ${isValid ? 'VALID' : 'INVALID'}`);
    
    res.json({
      message: isValid ? 'OTP verified successfully' : 'Invalid OTP',
      valid: isValid,
      email: email
    });
    
  } catch (err) {
    console.error('❌ Error verifying OTP:', err);
    res.status(500).json({ 
      message: 'เกิดข้อผิดพลาดในการตรวจสอบ OTP',
      error: err.message 
    });
  }
});

// Get current user profile (me endpoint)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at FROM users WHERE userid = $1',
      [req.user.userid]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;