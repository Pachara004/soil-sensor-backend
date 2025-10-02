# 🗄️ **พัฒนาส่วนของ API (Backend) ด้วย PostgreSQL**

## 📋 **ภาพรวมระบบ Backend**

ส่วนนี้เป็นการสร้างระบบ Backend โดยใช้ **PostgreSQL** ซึ่งเป็นฐานข้อมูลเชิงสัมพันธ์ (Relational Database) ที่มีประสิทธิภาพสูง ร่วมกับ **Node.js** และ **Express.js** สำหรับสร้าง RESTful API เพื่อประมวลผลข้อมูลและรับส่งข้อมูลระหว่างเซ็นเซอร์กับเว็บไซต์

---

## 🏗️ **สถาปัตยกรรมระบบ Backend**

### **1. Database Layer (PostgreSQL)**
```
┌─────────────────────────────────────┐
│           PostgreSQL Database        │
│  ┌─────────────────────────────────┐ │
│  │  Tables:                        │ │
│  │  • users (ผู้ใช้งาน)            │ │
│  │  • devices (อุปกรณ์ IoT)        │ │
│  │  • measurements (ข้อมูลการวัด)   │ │
│  │  • areas (พื้นที่การวัด)        │ │
│  │  • reports (รายงานปัญหา)        │ │
│  │  • images (รูปภาพ)              │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### **2. API Layer (Node.js + Express.js)**
```
┌─────────────────────────────────────┐
│         Express.js Server           │
│  ┌─────────────────────────────────┐ │
│  │  API Routes:                    │ │
│  │  • /api/auth (Authentication)   │ │
│  │  • /api/measurements (ข้อมูลวัด) │ │
│  │  • /api/devices (อุปกรณ์)       │ │
│  │  • /api/users (ผู้ใช้)          │ │
│  │  • /api/reports (รายงาน)        │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### **3. Real-time Layer (Socket.IO + Firebase)**
```
┌─────────────────────────────────────┐
│     Real-time Communication         │
│  ┌─────────────────────────────────┐ │
│  │  • Socket.IO (WebSocket)        │ │
│  │  • Firebase Realtime Database   │ │
│  │  • Live sensor data streaming   │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 🔧 **ขั้นตอนสำคัญในการพัฒนา Backend**

### **1. การตั้งค่าฐานข้อมูล PostgreSQL**

#### **A. การเชื่อมต่อฐานข้อมูล (`config/db.js`)**
```javascript
const { Pool } = require('pg');

// การตั้งค่าการเชื่อมต่อ PostgreSQL (Neon)
const connectionString = 'postgresql://neondb_owner:npg_moC9gDneHaZ3@ep-wild-water-a1qolg9l-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: connectionString,
});

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected to Neon successfully!');
    client.release();
  } catch (err) {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  }
};

module.exports = { pool, connectDB };
```

#### **B. โครงสร้างตารางฐานข้อมูล**
```sql
-- ตาราง users (ผู้ใช้งาน)
CREATE TABLE users (
  userid SERIAL PRIMARY KEY,
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) UNIQUE NOT NULL,
  user_phone VARCHAR(20),
  role VARCHAR(50) DEFAULT 'user',
  firebase_uid VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ตาราง devices (อุปกรณ์ IoT)
CREATE TABLE device (
  deviceid SERIAL PRIMARY KEY,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  device_type VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  userid INTEGER REFERENCES users(userid),
  created_at TIMESTAMP DEFAULT NOW()
);

-- ตาราง measurements (ข้อมูลการวัด)
CREATE TABLE measurement (
  measurementid SERIAL PRIMARY KEY,
  deviceid INTEGER REFERENCES device(deviceid),
  temperature NUMERIC(5,2),
  moisture NUMERIC(5,2),
  ph NUMERIC(4,2),
  phosphorus NUMERIC(5,2),
  potassium_avg NUMERIC(5,2),
  nitrogen NUMERIC(5,2),
  location VARCHAR(255),
  lng NUMERIC(10,8),
  lat NUMERIC(10,8),
  areasid INTEGER REFERENCES areas(areasid),
  measurement_date DATE,
  measurement_time TIME,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ตาราง areas (พื้นที่การวัด)
CREATE TABLE areas (
  areasid SERIAL PRIMARY KEY,
  area_name VARCHAR(255) NOT NULL,
  temperature_avg NUMERIC(5,2),
  moisture_avg NUMERIC(5,2),
  ph_avg NUMERIC(4,2),
  phosphorus_avg NUMERIC(5,2),
  potassium_avg NUMERIC(5,2),
  nitrogen_avg NUMERIC(5,2),
  totalmeasurement INTEGER DEFAULT 0,
  userid INTEGER REFERENCES users(userid),
  deviceid INTEGER REFERENCES device(deviceid),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

### **2. การรับข้อมูลจากไมโครคอนโทรลเลอร์ (ESP32)**

#### **A. API Endpoint สำหรับรับข้อมูลเซ็นเซอร์**
```javascript
// POST /api/measurements - บันทึกข้อมูลการวัดจาก ESP32
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      deviceId,
      temperature,
      moisture,
      ph,
      phosphorus,
      potassium,
      nitrogen,
      location,
      lng,
      lat
    } = req.body;

    // บันทึกข้อมูลลงใน PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO measurement (deviceid, measurement_date, measurement_time, 
       temperature, moisture, ph, phosphorus, potassium_avg, nitrogen, 
       location, lng, lat, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       RETURNING *`,
      [deviceId, currentDate, currentTime, temperature, moisture, ph, 
       phosphorus, potassium, nitrogen, location, lng, lat]
    );

    res.status(201).json({ 
      message: 'Measurement saved successfully', 
      measurement: rows[0] 
    });
  } catch (err) {
    console.error('Error saving measurement:', err);
    res.status(500).json({ message: err.message });
  }
});
```

#### **B. การประมวลผลข้อมูลแบบ Real-time**
```javascript
// Socket.IO สำหรับข้อมูล Real-time
io.on('connection', (socket) => {
  socket.on('join-device', (deviceId) => {
    socket.join(deviceId);
    
    // เชื่อมต่อกับ Firebase Realtime Database สำหรับข้อมูล live
    const liveRef = db.ref(`live/${deviceId}`);
    
    liveRef.on('value', (snapshot) => {
      const payload = snapshot.val();
      if (payload) {
        // ส่งข้อมูล live ไปยัง client
        socket.emit('live-update', payload);
      }
    });
  });

  socket.on('save-measurement', async (data) => {
    const { deviceId, payload, areaId } = data;
    
    // บันทึกข้อมูลลงใน PostgreSQL
    // และเคลียร์ข้อมูล live ใน Firebase
    if (db) {
      await db.ref(`live/${deviceId}`).remove();
    }
  });
});
```

---

### **3. การสร้าง API Endpoints สำหรับให้บริการข้อมูล**

#### **A. API สำหรับดึงข้อมูลค่าดิน**
```javascript
// GET /api/measurements/areas - ดึงข้อมูลพื้นที่การวัด
router.get('/areas', authMiddleware, async (req, res) => {
  try {
    const { deviceid } = req.query;
    
    let query, params;
    if (deviceid) {
      // ดึงข้อมูลพื้นที่ของอุปกรณ์เฉพาะ
      query = 'SELECT * FROM areas WHERE userid = $1 AND deviceid = $2 ORDER BY created_at DESC';
      params = [req.user.userid, deviceid];
    } else {
      // ดึงข้อมูลพื้นที่ทั้งหมดของผู้ใช้
      query = 'SELECT * FROM areas WHERE userid = $1 ORDER BY created_at DESC';
      params = [req.user.userid];
    }

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching areas:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/measurements/:deviceId - ดึงข้อมูลการวัดของอุปกรณ์
router.get('/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { rows } = await pool.query(
      'SELECT * FROM measurement WHERE deviceid = $1 ORDER BY measurement_date DESC, measurement_time DESC',
      [deviceId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching measurements:', err);
    res.status(500).json({ message: err.message });
  }
});
```

#### **B. API สำหรับจัดการพื้นที่การวัด**
```javascript
// POST /api/measurements/create-area-immediately - สร้างพื้นที่ทันที
router.post('/create-area-immediately', authMiddleware, async (req, res) => {
  try {
    const { area_name, deviceId, area_size, coordinates } = req.body;

    // สร้างพื้นที่ใหม่ใน PostgreSQL
    const { rows: areaRows } = await pool.query(
      `INSERT INTO areas (area_name, temperature_avg, moisture_avg, ph_avg, 
       phosphorus_avg, potassium_avg, nitrogen_avg, totalmeasurement, 
       userid, deviceid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       RETURNING *`,
      [area_name, 0, 0, 0, 0, 0, 0, 0, req.user.userid, deviceId]
    );

    res.json({
      message: 'Area created successfully',
      area: areaRows[0],
      areaId: areaRows[0].areasid
    });
  } catch (err) {
    console.error('Error creating area:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/measurements/single-point - บันทึกการวัดจุดเดียว
router.post('/single-point', authMiddleware, async (req, res) => {
  try {
    const {
      deviceId, temperature, moisture, ph, phosphorus, 
      potassium, nitrogen, lat, lng, areaId, location
    } = req.body;

    // บันทึกข้อมูลการวัดลงใน PostgreSQL
    const { rows } = await pool.query(
      `INSERT INTO measurement (deviceid, measurement_date, measurement_time, 
       temperature, moisture, ph, phosphorus, potassium_avg, nitrogen, 
       location, lng, lat, areasid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
       RETURNING *`,
      [deviceId, measurementDate, measurementTime, temperature, moisture, 
       ph, phosphorus, potassium, nitrogen, location, lng, lat, areaId]
    );

    res.status(201).json({
      message: 'Measurement point saved successfully',
      measurement: rows[0]
    });
  } catch (err) {
    console.error('Error saving single measurement point:', err);
    res.status(500).json({ message: err.message });
  }
});
```

---

### **4. การจัดการข้อมูลผู้ใช้และการยืนยันตัวตน**

#### **A. Authentication API**
```javascript
// POST /api/auth/register - สมัครสมาชิก
router.post('/register', async (req, res) => {
  try {
    const { email, username, name, phoneNumber, type, firebaseUid } = req.body;

    // บันทึกข้อมูลผู้ใช้ลงใน PostgreSQL
    const result = await pool.query(
      `INSERT INTO users (user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW()) 
       RETURNING userid, user_name, user_email, user_phone, role, firebase_uid, created_at, updated_at`,
      [username, email, phoneNumber || null, type || 'user', firebaseUid]
    );

    res.status(201).json({
      message: 'Registered successfully',
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(400).json({ message: err.message });
  }
});

// POST /api/auth/google-login - เข้าสู่ระบบด้วย Google
router.post('/google-login', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    // ตรวจสอบ Firebase ID Token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid: firebaseUid, email, name } = decodedToken;

    // ค้นหาหรือสร้างผู้ใช้ใน PostgreSQL
    let user = await findOrCreateUser(firebaseUid, email, name);

    res.json({
      message: 'Google login successful',
      user: user
    });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(401).json({ message: 'Invalid Google token' });
  }
});
```

#### **B. Device Management API**
```javascript
// GET /api/devices - ดูอุปกรณ์ของผู้ใช้
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM device WHERE userid = $1 ORDER BY created_at DESC',
      [req.user.userid]
    );
    res.json({ devices: rows });
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/devices/claim - เชื่อมโยงอุปกรณ์
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { device_id, device_name } = req.body;

    // อัปเดตอุปกรณ์ให้เชื่อมโยงกับผู้ใช้
    const { rows } = await pool.query(
      'UPDATE device SET userid = $1, device_name = $2, updated_at = NOW() WHERE device_id = $3 RETURNING *',
      [req.user.userid, device_name, device_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }

    res.json({
      message: 'Device claimed successfully',
      device: rows[0]
    });
  } catch (err) {
    console.error('Error claiming device:', err);
    res.status(500).json({ message: err.message });
  }
});
```

---

## 🔄 **การทำงานแบบ Hybrid (PostgreSQL + Firebase)**

### **1. PostgreSQL สำหรับข้อมูลหลัก**
- **ข้อมูลผู้ใช้** (users)
- **ข้อมูลอุปกรณ์** (devices)
- **ข้อมูลการวัดที่บันทึกแล้ว** (measurements)
- **ข้อมูลพื้นที่การวัด** (areas)
- **รายงานปัญหา** (reports)

### **2. Firebase Realtime Database สำหรับข้อมูล Real-time**
- **ข้อมูล live จากเซ็นเซอร์** (`live/{deviceId}`)
- **การสื่อสารแบบ real-time** ระหว่าง ESP32 และ Web App

### **3. การทำงานร่วมกัน**
```javascript
// ตัวอย่างการบันทึกข้อมูลจาก Firebase ไป PostgreSQL
socket.on('save-measurement', async (data) => {
  try {
    const { deviceId, payload, areaId } = data;
    
    // 1. บันทึกข้อมูลลงใน PostgreSQL
    await pool.query(
      `INSERT INTO measurement (deviceid, temperature, moisture, ph, 
       phosphorus, potassium_avg, nitrogen, areasid, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [deviceId, payload.temperature, payload.moisture, payload.ph,
       payload.phosphorus, payload.potassium, payload.nitrogen, areaId]
    );
    
    // 2. เคลียร์ข้อมูล live ใน Firebase
    if (db) {
      await db.ref(`live/${deviceId}`).remove();
    }
    
    socket.emit('measurement-saved', {
      message: 'Measurement processed successfully',
      deviceId,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error saving measurement:', err);
    socket.emit('error', { message: err.message });
  }
});
```

---

## 📊 **ข้อดีของการใช้ PostgreSQL Backend**

### **1. ประสิทธิภาพและความเสถียร**
- **ACID Compliance** - รับประกันความถูกต้องของข้อมูล
- **Complex Queries** - รองรับ SQL queries ที่ซับซ้อน
- **Scalability** - รองรับข้อมูลจำนวนมาก
- **Indexing** - เพิ่มประสิทธิภาพการค้นหา

### **2. ความยืดหยุ่นในการจัดการข้อมูล**
- **Relational Data** - จัดการความสัมพันธ์ระหว่างตารางได้ดี
- **Data Integrity** - Foreign Key Constraints
- **Transactions** - รองรับการทำงานแบบ transaction
- **Backup & Recovery** - ระบบสำรองข้อมูลที่แข็งแกร่ง

### **3. ต้นทุนและการควบคุม**
- **Cost Effective** - ค่าใช้จ่ายต่ำกว่า BaaS
- **Full Control** - ควบคุมข้อมูลได้เต็มที่
- **No Vendor Lock-in** - ไม่ผูกมัดกับผู้ให้บริการเดียว
- **Custom Logic** - สามารถปรับแต่งได้ตามต้องการ

---

## 🚀 **การ Deploy และ Monitoring**

### **1. Database Hosting**
- **Neon** - PostgreSQL as a Service
- **Connection Pooling** - จัดการการเชื่อมต่อ
- **SSL/TLS** - ความปลอดภัยในการส่งข้อมูล

### **2. API Monitoring**
- **Health Check Endpoint** (`/health`)
- **Error Logging** - บันทึก errors
- **Performance Monitoring** - ติดตามประสิทธิภาพ

### **3. Security Features**
- **JWT Authentication** - ระบบยืนยันตัวตน
- **Role-based Authorization** - การจำกัดสิทธิ์
- **Input Validation** - ตรวจสอบข้อมูลนำเข้า
- **SQL Injection Prevention** - ป้องกัน SQL injection

---

## 🎯 **สรุป**

ระบบ Backend ที่ใช้ **PostgreSQL** ร่วมกับ **Node.js/Express.js** ให้ประสิทธิภาพและความยืดหยุ่นสูงในการจัดการข้อมูลเซ็นเซอร์ดิน โดยมีจุดเด่นคือ:

1. **ความเสถียรและประสิทธิภาพสูง** จาก PostgreSQL
2. **การจัดการข้อมูลแบบ Relational** ที่เหมาะกับข้อมูลที่มีความสัมพันธ์
3. **ความยืดหยุ่นในการพัฒนา** API endpoints ตามความต้องการ
4. **การทำงานแบบ Hybrid** ร่วมกับ Firebase สำหรับ real-time features
5. **ความปลอดภัยและการควบคุมข้อมูล** ที่สูง

**🎉 ระบบ Backend ที่ครบถ้วน เสถียร และพร้อมใช้งานจริง!** 🚀✨