const fs = require('fs');
const { pool } = require('./config/db');

async function createReportsTable() {
  try {
    console.log('🔧 Creating reports table...');
    
    const sql = fs.readFileSync('./create-reports-table.sql', 'utf8');
    
    // แยกคำสั่ง SQL และรันทีละคำสั่ง
    const statements = sql.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('📝 Executing:', statement.trim().substring(0, 50) + '...');
        await pool.query(statement);
      }
    }
    
    console.log('✅ Reports table created successfully!');
    
    // ทดสอบดึงข้อมูล
    const { rows } = await pool.query('SELECT COUNT(*) FROM reports');
    console.log('📊 Total reports:', rows[0].count);
    
  } catch (error) {
    console.error('❌ Error creating reports table:', error);
  } finally {
    process.exit(0);
  }
}

createReportsTable();
