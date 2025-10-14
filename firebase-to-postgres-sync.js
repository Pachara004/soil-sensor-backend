const admin = require('firebase-admin');
const { Pool } = require('pg');
const path = require('path');

// Use the same Firebase config as server.js
require('dotenv').config();

// Firebase Admin SDK setup - use the same config as server.js
let serviceAccount;
try {
  serviceAccount = require('./firebase-service-account-key.json');
} catch (error) {
  console.log('⚠️ Firebase service account key not found, using environment variables...');
  
  // Use the same Firebase config as server.js
  if (process.env.FIREBASE_PRIVATE_KEY_BASE64) {
    const privateKey = Buffer.from(process.env.FIREBASE_PRIVATE_KEY_BASE64, 'base64').toString('utf8');
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };
  } else if (process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${process.env.FIREBASE_CLIENT_EMAIL}`
    };
  } else {
    console.error('❌ Missing Firebase environment variables. Please set:');
    console.error('   FIREBASE_PROJECT_ID');
    console.error('   FIREBASE_CLIENT_EMAIL');
    console.error('   FIREBASE_PRIVATE_KEY or FIREBASE_PRIVATE_KEY_BASE64');
    process.exit(1);
  }
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://soil-sensor-backend-default-rtdb.asia-southeast1.firebasedb.app"
});

const db = admin.database();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/soil_sensor_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

console.log('🔥 Firebase to PostgreSQL Sync Service Started');
console.log('📊 Listening for Firebase changes...');

// Sync existing measurements from Firebase
async function syncExistingMeasurements() {
  try {
    console.log('🔄 Syncing existing measurements from Firebase...');
    
    const measurementsRef = db.ref('/measurements');
    const snapshot = await measurementsRef.once('value');
    
    if (snapshot.exists()) {
      const measurements = snapshot.val();
      console.log(`📊 Found ${Object.keys(measurements).length} existing measurements`);
      
      for (const [deviceId, data] of Object.entries(measurements)) {
        console.log(`📊 Syncing existing measurement for device: ${deviceId}`);
        await syncMeasurementToPostgres(deviceId, data);
      }
    } else {
      console.log('📊 No existing measurements found');
    }
  } catch (error) {
    console.error('❌ Error syncing existing measurements:', error);
  }
}

// Listen to Firebase Realtime Database changes
function startFirebaseListener() {
  // Listen to /measurements/{deviceId} for final measurement data
  const measurementsRef = db.ref('/measurements');
  
  measurementsRef.on('child_added', async (snapshot) => {
    const deviceId = snapshot.key;
    const data = snapshot.val();
    
    console.log(`📊 New measurement added for device: ${deviceId}`);
    console.log('📊 Data:', JSON.stringify(data, null, 2));
    
    // Sync measurement to PostgreSQL
    await syncMeasurementToPostgres(deviceId, data);
  });
  
  measurementsRef.on('child_changed', async (snapshot) => {
    const deviceId = snapshot.key;
    const data = snapshot.val();
    
    console.log(`📊 Measurement updated for device: ${deviceId}`);
    console.log('📊 Data:', JSON.stringify(data, null, 2));
    
    // Sync measurement to PostgreSQL
    await syncMeasurementToPostgres(deviceId, data);
  });
  
  measurementsRef.on('child_removed', async (snapshot) => {
    const deviceId = snapshot.key;
    
    console.log(`🗑️ Measurement removed for device: ${deviceId}`);
    
    // Delete measurement from PostgreSQL
    await deleteMeasurementFromPostgres(deviceId);
  });
  
  // Listen to /live/{deviceId} for live measurement data
  const liveRef = db.ref('/live');
  
  liveRef.on('child_changed', async (snapshot) => {
    const deviceId = snapshot.key;
    const data = snapshot.val();
    
    console.log(`📡 Live data changed for device: ${deviceId}`);
    console.log('📊 Data:', JSON.stringify(data, null, 2));
    
    // Check if measurement is finished
    if (data.finished === true && data.temperature && data.ph && data.moisture) {
      console.log(`✅ Measurement completed for device: ${deviceId}`);
      await syncMeasurementToPostgres(deviceId, data);
    }
    
    // Update device status
    await syncDeviceStatusToPostgres(deviceId, data);
  });
  
  // Listen to /devices/{deviceId} for device info
  const devicesRef = db.ref('/devices');
  
  devicesRef.on('child_changed', async (snapshot) => {
    const deviceId = snapshot.key;
    const data = snapshot.val();
    
    console.log(`🔧 Device info changed for device: ${deviceId}`);
    await syncDeviceInfoToPostgres(deviceId, data);
  });
  
  // Listen to /devices/{deviceId}/location for GPS data
  devicesRef.on('child_changed', async (snapshot) => {
    const deviceId = snapshot.key;
    const locationSnapshot = snapshot.child('location');
    
    if (locationSnapshot.exists()) {
      const locationData = locationSnapshot.val();
      console.log(`🌍 GPS data for device: ${deviceId}`);
      await syncGPSDataToPostgres(deviceId, locationData);
    }
  });
}

// Function to delete measurement from PostgreSQL when removed from Firebase
async function deleteMeasurementFromPostgres(deviceId) {
  try {
    console.log(`🗑️ Deleting measurement for device: ${deviceId}`);
    
    // Find device in PostgreSQL by device_name
    const { rows: deviceRows } = await pool.query(
      'SELECT deviceid FROM device WHERE device_name = $1 LIMIT 1',
      [deviceId]
    );
    
    if (deviceRows.length === 0) {
      console.log(`❌ Device ${deviceId} not found in PostgreSQL`);
      return;
    }
    
    const finalDeviceId = deviceRows[0].deviceid;
    
    // Delete measurement from PostgreSQL
    const { rowCount } = await pool.query(
      'DELETE FROM measurement WHERE deviceid = $1',
      [finalDeviceId]
    );
    
    console.log(`✅ Deleted ${rowCount} measurement(s) for device: ${deviceId}`);
    
  } catch (error) {
    console.error('❌ Error deleting measurement from PostgreSQL:', error);
  }
}

// Sync measurement data directly to PostgreSQL
async function syncMeasurementToPostgres(deviceId, data) {
  try {
    console.log(`📊 Syncing measurement for ${deviceId} directly to PostgreSQL...`);
    
    const client = await pool.connect();

    try {
      // Get device ID from PostgreSQL
      const { rows: deviceRows } = await client.query(
        'SELECT deviceid FROM device WHERE device_name = $1 LIMIT 1',
        [deviceId]
      );
      
      if (deviceRows.length === 0) {
        console.log(`❌ Device ${deviceId} not found in PostgreSQL`);
        return;
      }

      const deviceDbId = deviceRows[0].deviceid;
      console.log(`✅ Found device ${deviceId} with ID: ${deviceDbId}`);

      // Insert measurement directly into PostgreSQL
      const insertQuery = `
        INSERT INTO measurement (
          deviceid, areasid, measurement_date, measurement_time,
          temperature, moisture, ph, nitrogen, phosphorus, potassium,
          lat, lng, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
        RETURNING measurementid
      `;

      const values = [
        deviceDbId,
        data.areasid || 87,
        data.measurement_date || new Date().toISOString().split('T')[0],
        data.measurement_time || new Date().toTimeString().split(' ')[0],
        data.temperature || 0,
        data.moisture || 0,
        data.ph || 0,
        data.nitrogen || 0,
        data.phosphorus || 0,
        data.potassium || 0,
        data.lat || null,
        data.lng || null
      ];

      const result = await client.query(insertQuery, values);
      console.log(`✅ Measurement synced to PostgreSQL: ID ${result.rows[0].measurementid}`);

    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Error syncing measurement to PostgreSQL:', error);
  }
}

// Sync device status to PostgreSQL
async function syncDeviceStatusToPostgres(deviceId, data) {
  try {
    const client = await pool.connect();
    
    const updateQuery = `
      UPDATE device SET 
        sensor_status = $1,
        sensor_online = $2,
        last_temperature = $3,
        last_moisture = $4,
        last_ph = $5,
        updated_at = NOW()
      WHERE device_name = $6
    `;
    
    const values = [
      data.sensor_status || 'offline',
      data.sensor_online || false,
      data.temperature || null,
      data.moisture || null,
      data.ph || null,
      deviceId
    ];
    
    await client.query(updateQuery, values);
    console.log(`✅ Device status synced for: ${deviceId}`);
    
    client.release();
  } catch (error) {
    console.error('❌ Error syncing device status:', error);
  }
}

// Sync device info to PostgreSQL
async function syncDeviceInfoToPostgres(deviceId, data) {
  try {
    const client = await pool.connect();
    
    // Check if device exists
    const checkQuery = 'SELECT deviceid FROM device WHERE device_name = $1';
    const checkResult = await client.query(checkQuery, [deviceId]);
    
    if (checkResult.rows.length === 0) {
      // Create new device
      const insertQuery = `
        INSERT INTO device (device_name, sensor_status, sensor_online, updated_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING deviceid
      `;
      
      const values = [
        deviceId,
        data.sensor_status || 'offline',
        data.sensor_online || false
      ];
      
      const result = await client.query(insertQuery, values);
      console.log(`✅ New device created: ${deviceId} (ID: ${result.rows[0].deviceid})`);
    } else {
      // Update existing device
      const updateQuery = `
        UPDATE device SET 
          sensor_status = $1,
          sensor_online = $2,
          updated_at = NOW()
        WHERE device_name = $3
      `;
      
      const values = [
        data.sensor_status || 'offline',
        data.sensor_online || false,
        deviceId
      ];
      
      await client.query(updateQuery, values);
      console.log(`✅ Device info updated: ${deviceId}`);
    }
    
    client.release();
  } catch (error) {
    console.error('❌ Error syncing device info:', error);
  }
}

// Sync GPS data to PostgreSQL
async function syncGPSDataToPostgres(deviceId, locationData) {
  try {
    const client = await pool.connect();
    
    // Get device_id from devices table
    const deviceQuery = 'SELECT deviceid FROM device WHERE device_name = $1';
    const deviceResult = await client.query(deviceQuery, [deviceId]);
    
    if (deviceResult.rows.length === 0) {
      console.log(`⚠️ Device ${deviceId} not found for GPS sync`);
      client.release();
      return;
    }
    
    const deviceDbId = deviceResult.rows[0].deviceid;
    
    // Insert GPS data
    const insertQuery = `
      INSERT INTO gps_history (
        deviceid, latitude, longitude, altitude, satellites, recorded_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
    `;
    
    const values = [
      deviceDbId,
      locationData.latitude || null,
      locationData.longitude || null,
      locationData.altitude || null,
      locationData.satellites || null
    ];
    
    await client.query(insertQuery, values);
    console.log(`✅ GPS data synced for device: ${deviceId}`);
    
    client.release();
  } catch (error) {
    console.error('❌ Error syncing GPS data:', error);
  }
}

// Start the listener and sync existing data
async function start() {
  try {
    // First sync existing measurements
    await syncExistingMeasurements();
    
    // Then start listening for new changes
    startFirebaseListener();
    
    console.log('✅ Firebase sync service is running!');
  } catch (error) {
    console.error('❌ Error starting sync service:', error);
  }
}

start();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Firebase to PostgreSQL sync service...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Firebase to PostgreSQL sync service...');
  process.exit(0);
});
