const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT
});

const connectDB = async () => {
  try {
    await pool.connect();
    console.log('PostgreSQL connected');
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };