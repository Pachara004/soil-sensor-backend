const { Pool } = require('pg');

// กำหนด connection string ของคุณจาก Neon
const connectionString = 'postgresql://neondb_owner:npg_moC9gDneHaZ3@ep-wild-water-a1qolg9l-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';
const pool = new Pool({
  connectionString: connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected to Neon successfully!');
    client.release(); // คืน client กลับสู่ pool
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  }
};

// เรียกใช้ฟังก์ชันเพื่อทดสอบการเชื่อมต่อ
connectDB();

module.exports = { pool, connectDB };''