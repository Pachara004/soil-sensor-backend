const admin = require('firebase-admin');
const { pool } = require('../config/db');

module.exports = async function firebaseAuthToUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    let email = null;
    let uid = null;

    if (token) {
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        email = decoded.email || null;
        uid = decoded.uid;
      } catch (e) {
        // continue to fallback methods
      }
    }

    // Fallback: allow client to pass x-user-email/x-user-id or query ?userEmail=&userId= (for local dev)
    if (!email && !uid) {
      email = req.headers['x-user-email'] || req.query.userEmail || null;
      uid = req.headers['x-user-id'] || req.query.userId || null;
    }

    if (!email && !uid) {
      // Final dev fallback: pick the most recently created user (DEV ONLY)
      try {
        const { rows: anyUser } = await pool.query(
          'SELECT userid, user_email, firebase_uid, role FROM users ORDER BY userid DESC LIMIT 1'
        );
        if (anyUser.length) {
          req.user = anyUser[0];
          return next();
        }
      } catch (_) {}
      return res.status(401).json({ message: 'Invalid token' });
    }

    const { rows } = await pool.query(
      `SELECT userid, user_email, firebase_uid, role
       FROM users
       WHERE firebase_uid = $1 OR user_email = $2
       LIMIT 1`,
      [uid, email]
    );

    if (rows.length === 0) return res.status(401).json({ message: 'User not found' });

    req.user = rows[0];
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};


