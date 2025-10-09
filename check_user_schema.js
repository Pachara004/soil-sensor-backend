const { pool } = require('./config/db');

async function checkUserSchema() {
  try {
    console.log('🔍 Checking user schema and data...');
    
    // Check users table structure
    const { rows: userColumns } = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📊 Users table structure:');
    userColumns.forEach(col => console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`));
    
    // Check specific user data
    console.log('\n📊 User data for userid 7:');
    const { rows: userData } = await pool.query(`
      SELECT * FROM users WHERE userid = 7
    `);
    
    if (userData.length > 0) {
      const user = userData[0];
      console.log('  - User ID:', user.userid);
      console.log('  - User Name:', user.user_name);
      console.log('  - User Email:', user.user_email);
      console.log('  - Role:', user.role);
      console.log('  - Firebase UID:', user.firebase_uid);
      console.log('  - Created:', user.created_at);
    } else {
      console.log('  - No user found with userid 7');
    }
    
    // Check device data
    console.log('\n📊 Device data for userid 7:');
    const { rows: deviceData } = await pool.query(`
      SELECT d.*, u.user_name, u.user_email 
      FROM device d 
      LEFT JOIN users u ON d.userid = u.userid 
      WHERE d.userid = 7
    `);
    
    if (deviceData.length > 0) {
      deviceData.forEach((device, i) => {
        console.log(`  ${i+1}. Device: ${device.device_name}`);
        console.log(`     User: ${device.user_name} (${device.user_email})`);
        console.log(`     Status: ${device.device_status}`);
        console.log(`     API Key: ${device.api_key}`);
        console.log(`     Created: ${device.created_at}`);
        console.log('');
      });
    } else {
      console.log('  - No devices found for userid 7');
    }
    
  } catch (err) {
    console.error('❌ Error checking user schema:', err.message);
  } finally {
    await pool.end();
  }
}

checkUserSchema();
