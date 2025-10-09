const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Verify Firebase ID token or JWT token and provision/find user in PostgreSQL
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.split(' ')[1]
      : null;
    if (!token) return res.status(401).json({ message: 'No token' });

    let decoded, firebaseUid, email, name;

    try {
      // Try to verify as Firebase ID token first
      decoded = await admin.auth().verifyIdToken(token);
      firebaseUid = decoded.uid;
      email = decoded.email || null;
      name = decoded.name || (email ? email.split('@')[0] : 'user');
      console.log('✅ Firebase token verified successfully:', { uid: firebaseUid, email });
    } catch (firebaseError) {
      console.warn('⚠️ Firebase token verification failed:', firebaseError.message);
      try {
        // If Firebase verification fails, try JWT verification
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        firebaseUid = null; // JWT doesn't have Firebase UID
        email = decoded.email || null;
        name = decoded.user_name || decoded.username || (email ? email.split('@')[0] : 'user');
        console.log('✅ JWT token verified successfully:', { userid: decoded.userid, email });
      } catch (jwtError) {
        console.error('JWT verification failed:', jwtError.message);
        console.error('Token:', token.substring(0, 50) + '...');
        console.error('Secret used:', process.env.JWT_SECRET || 'your-secret-key');
        return res.status(401).json({ message: 'Invalid token' });
      }
    }

    // 2) Find or create user in Postgres
    let userRow = null;

    // 2.1 For JWT tokens, find by userid directly
    if (decoded.userid) {
      const byId = await pool.query(
        'SELECT userid, user_name, user_email, role, firebase_uid FROM users WHERE userid = $1 LIMIT 1',
        [decoded.userid]
      );
      userRow = byId.rows[0] || null;
    }

    // 2.2 For Firebase tokens, try find by firebase_uid
    if (!userRow && firebaseUid) {
      try {
        const byUid = await pool.query(
          'SELECT userid, user_name, user_email, role, firebase_uid FROM users WHERE firebase_uid = $1 LIMIT 1',
          [firebaseUid]
        );
        userRow = byUid.rows[0] || null;
      } catch (e) {
        // table may not have firebase_uid yet; ignore and fallback to email
      }
    }

    // 2.3 fallback find by email
    if (!userRow && email) {
      const byEmail = await pool.query(
        'SELECT userid, user_name, user_email, role, firebase_uid FROM users WHERE user_email = $1 LIMIT 1',
        [email]
      );
      userRow = byEmail.rows[0] || null;

      // if exists but no firebase_uid column or value, try to set it (only for Firebase tokens)
      if (userRow && firebaseUid) {
        try {
          await pool.query(
            'UPDATE users SET firebase_uid = $1, updated_at = NOW() WHERE user_email = $2',
            [firebaseUid, email]
          );
        } catch (e) {
          // column may not exist; continue without setting firebase_uid
        }
      }
    }

    // 2.3 insert new if still not found
    if (!userRow) {
      const username = email ? email.split('@')[0] : `user_${firebaseUid.slice(0, 8)}`;
      // attempt insert with firebase_uid; if column missing, insert without it
      try {
        const insert = await pool.query(
          `INSERT INTO users (user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at)
           VALUES ($1, $2, NULL, 'user', $3, NOW(), NOW())
           RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
          [username, email, firebaseUid]
        );
        userRow = insert.rows[0];
      } catch (e) {
        const insert2 = await pool.query(
          `INSERT INTO users (user_name, user_email, user_phone, role, created_at, updated_at)
           VALUES ($1, $2, NULL, 'user', NOW(), NOW())
           RETURNING userid, user_name, user_email, user_phone, role, created_at, updated_at`,
          [username, email]
        );
        userRow = insert2.rows[0];
      }
    }

    // 3) Attach user to request
    req.user = {
      userid: userRow.userid,
      user_name: userRow.user_name,
      username: userRow.user_name,
      role: userRow.role || 'user',
      email: userRow.user_email || email,
      firebase_uid: firebaseUid,
      name: userRow.user_name || name,
    };

    console.log('✅ User authenticated:', {
      userid: req.user.userid,
      email: req.user.email,
      role: req.user.role
    });

    return next();
  } catch (err) {
    const message = err && err.message ? err.message : 'Unauthorized';
    return res.status(401).json({ message });
  }
};

module.exports = { authMiddleware };