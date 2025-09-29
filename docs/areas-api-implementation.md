# 🏞️ Areas API Implementation

## 🎯 **เป้าหมาย:**
สร้างระบบ Areas API สำหรับการจัดการข้อมูลพื้นที่วัด โดยเมื่อผู้ใช้เลือกตำแหน่งวัดและกดยืนยัน จะสร้างข้อมูลใน table `areas` และ `areas_at`

## 🗄️ **Database Structure:**

### **Table: `areas`**
```sql
CREATE TABLE areas (
  areasid SERIAL PRIMARY KEY,
  area_name VARCHAR(255),
  potassium_avg NUMERIC,
  ph_avg NUMERIC,
  temperature_avg NUMERIC,
  totalmeasurement INTEGER,
  textupdated TIMESTAMP,
  phosphorus_avg NUMERIC,
  nitrogen_avg NUMERIC,
  moisture_avg NUMERIC,
  created_at TIMESTAMP,
  userid INTEGER
);
```

### **Table: `areas_at`**
```sql
CREATE TABLE areas_at (
  areasid INTEGER,
  measurementid INTEGER,
  PRIMARY KEY (areasid, measurementid)
);
```

### **Table: `measurement`**
```sql
CREATE TABLE measurement (
  measurementid SERIAL PRIMARY KEY,
  deviceid INTEGER,
  measurement_date DATE,
  measurement_time TIME,
  temperature NUMERIC,
  moisture NUMERIC,
  ph NUMERIC,
  phosphorus NUMERIC,
  potassium_avg NUMERIC,
  nitrogen NUMERIC,
  location VARCHAR(255),
  lng NUMERIC,
  lat NUMERIC,
  is_epoch BOOLEAN,
  is_uptime BOOLEAN,
  created_at TIMESTAMP
);
```

## 🔧 **API Endpoints:**

### **1. Create Area with Measurements**
```http
POST /api/measurements/create-area
```

**Request Body:**
```json
{
  "area_name": "พื้นที่ทดสอบ 1",
  "deviceId": "21",
  "measurements": [
    {
      "temperature": 25.0,
      "moisture": 60.0,
      "nitrogen": 20.0,
      "phosphorus": 15.0,
      "potassium": 25.0,
      "ph": 6.5,
      "location": "12.5",
      "lat": 16.24,
      "lng": 99.99,
      "measurement_date": "2025-09-29",
      "measurement_time": "10:00:00"
    },
    {
      "temperature": 26.0,
      "moisture": 65.0,
      "nitrogen": 22.0,
      "phosphorus": 18.0,
      "potassium": 28.0,
      "ph": 6.8,
      "location": "12.5",
      "lat": 16.25,
      "lng": 100.00,
      "measurement_date": "2025-09-29",
      "measurement_time": "10:05:00"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Area created successfully",
  "area": {
    "areasid": 1,
    "area_name": "พื้นที่ทดสอบ 1",
    "potassium_avg": "26.50",
    "ph_avg": "6.65",
    "temperature_avg": "25.50",
    "totalmeasurement": 2,
    "textupdated": "2025-09-29T07:15:15.173Z",
    "phosphorus_avg": "16.50",
    "nitrogen_avg": "21.00",
    "moisture_avg": "62.50",
    "created_at": "2025-09-29T07:15:15.173Z",
    "userid": 22
  },
  "measurements": [24, 25]
}
```

### **2. Get Areas (for History Page)**
```http
GET /api/measurements/areas
```

**Response:**
```json
[
  {
    "areasid": 3,
    "area_name": "Test Area 2",
    "potassium_avg": "29.00",
    "ph_avg": "6.90",
    "temperature_avg": "26.50",
    "totalmeasurement": 2,
    "textupdated": "2025-09-29T07:17:18.974Z",
    "phosphorus_avg": "19.00",
    "nitrogen_avg": "23.00",
    "moisture_avg": "67.50",
    "created_at": "2025-09-29T07:17:18.974Z",
    "userid": 22
  },
  {
    "areasid": 1,
    "area_name": "Test Area 1",
    "potassium_avg": "25.00",
    "ph_avg": "6.50",
    "temperature_avg": "25.00",
    "totalmeasurement": 1,
    "textupdated": "2025-09-29T07:15:15.173Z",
    "phosphorus_avg": "15.00",
    "nitrogen_avg": "20.00",
    "moisture_avg": "60.00",
    "created_at": "2025-09-29T07:15:15.173Z",
    "userid": 22
  }
]
```

### **3. Get Areas with Measurements**
```http
GET /api/measurements/areas/with-measurements
```

**Response:**
```json
[
  {
    "areasid": 1,
    "area_name": "Test Area 1",
    "potassium_avg": "25.00",
    "ph_avg": "6.50",
    "temperature_avg": "25.00",
    "totalmeasurement": 1,
    "textupdated": "2025-09-29T07:15:15.173Z",
    "phosphorus_avg": "15.00",
    "nitrogen_avg": "20.00",
    "moisture_avg": "60.00",
    "created_at": "2025-09-29T07:15:15.173Z",
    "userid": 22,
    "measurements": [
      {
        "measurementid": 24,
        "temperature": 25,
        "moisture": 60,
        "ph": 6.5,
        "phosphorus": 15,
        "potassium_avg": 25,
        "nitrogen": 20,
        "location": "12.5",
        "lng": 99.99,
        "lat": 16.24,
        "measurement_date": "2025-09-29",
        "measurement_time": "10:00:00",
        "created_at": "2025-09-29T14:15:15.226088"
      }
    ]
  }
]
```

## 🔄 **การทำงานของระบบ:**

### **1. Create Area Process:**
```
Angular ส่งข้อมูล measurements array
↓
API คำนวณค่าเฉลี่ย (averages)
↓
สร้าง record ใน table areas
↓
สร้าง records ใน table measurement
↓
สร้าง relationships ใน table areas_at
↓
ส่ง response กลับ
```

### **2. Average Calculation:**
```javascript
const totalMeasurements = measurements.length;
const temperature_avg = measurements.reduce((sum, m) => sum + (m.temperature || 0), 0) / totalMeasurements;
const moisture_avg = measurements.reduce((sum, m) => sum + (m.moisture || 0), 0) / totalMeasurements;
const ph_avg = measurements.reduce((sum, m) => sum + (m.ph || 0), 0) / totalMeasurements;
const phosphorus_avg = measurements.reduce((sum, m) => sum + (m.phosphorus || 0), 0) / totalMeasurements;
const potassium_avg = measurements.reduce((sum, m) => sum + (m.potassium || 0), 0) / totalMeasurements;
const nitrogen_avg = measurements.reduce((sum, m) => sum + (m.nitrogen || 0), 0) / totalMeasurements;
```

### **3. Database Operations:**
```javascript
// 1. Create area record
const { rows: areaRows } = await pool.query(
  `INSERT INTO areas (area_name, temperature_avg, moisture_avg, ph_avg, phosphorus_avg, potassium_avg, nitrogen_avg, totalmeasurement, userid, created_at)
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
   RETURNING *`,
  [area_name, temperature_avg, moisture_avg, ph_avg, phosphorus_avg, potassium_avg, nitrogen_avg, totalMeasurements, req.user.userid]
);

// 2. Create individual measurements
for (const measurement of measurements) {
  const { rows: measurementRows } = await pool.query(
    `INSERT INTO measurement (deviceid, measurement_date, measurement_time, temperature, moisture, ph, phosphorus, potassium_avg, nitrogen, location, lng, lat, is_epoch, is_uptime, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
     RETURNING *`,
    [deviceId, measurement.measurement_date, measurement.measurement_time, measurement.temperature, measurement.moisture, measurement.ph, measurement.phosphorus, measurement.potassium, measurement.nitrogen, measurement.location, measurement.lng, measurement.lat, measurement.is_epoch || false, measurement.is_uptime || false]
  );
  measurementIds.push(measurementRows[0].measurementid);
}

// 3. Create area-measurement relationships
for (const measurementId of measurementIds) {
  await pool.query(
    'INSERT INTO areas_at (areasid, measurementid) VALUES ($1, $2)',
    [areaId, measurementId]
  );
}
```

## 🧪 **การทดสอบ:**

### **Test Case 1: Single Measurement Area**
```bash
curl -X POST http://localhost:3000/api/measurements/create-area \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "area_name": "Test Area 1",
    "deviceId": "21",
    "measurements": [{
      "temperature": 25.0,
      "moisture": 60.0,
      "nitrogen": 20.0,
      "phosphorus": 15.0,
      "potassium": 25.0,
      "ph": 6.5,
      "location": "12.5",
      "lat": 16.24,
      "lng": 99.99,
      "measurement_date": "2025-09-29",
      "measurement_time": "10:00:00"
    }]
  }'
```

**Result:** ✅ Area created with 1 measurement

### **Test Case 2: Multiple Measurements Area**
```bash
curl -X POST http://localhost:3000/api/measurements/create-area \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "area_name": "Test Area 2",
    "deviceId": "21",
    "measurements": [
      {
        "temperature": 26.0,
        "moisture": 65.0,
        "nitrogen": 22.0,
        "phosphorus": 18.0,
        "potassium": 28.0,
        "ph": 6.8,
        "location": "25.75",
        "lat": 16.25,
        "lng": 99.99,
        "measurement_date": "2025-09-29",
        "measurement_time": "10:05:00"
      },
      {
        "temperature": 27.0,
        "moisture": 70.0,
        "nitrogen": 24.0,
        "phosphorus": 20.0,
        "potassium": 30.0,
        "ph": 7.0,
        "location": "25.75",
        "lat": 16.26,
        "lng": 99.99,
        "measurement_date": "2025-09-29",
        "measurement_time": "10:10:00"
      }
    ]
  }'
```

**Result:** ✅ Area created with 2 measurements, averages calculated correctly

### **Test Case 3: Get Areas**
```bash
curl -X GET http://localhost:3000/api/measurements/areas \
  -H "Authorization: Bearer TOKEN"
```

**Result:** ✅ Returns all areas for the user

### **Test Case 4: Get Areas with Measurements**
```bash
curl -X GET http://localhost:3000/api/measurements/areas/with-measurements \
  -H "Authorization: Bearer TOKEN"
```

**Result:** ✅ Returns areas with nested measurements array

## 🛡️ **Error Handling:**

### **1. Missing Required Fields:**
```javascript
if (!area_name || !measurements || !Array.isArray(measurements) || measurements.length === 0) {
  return res.status(400).json({ message: 'Area name and measurements array are required' });
}
```

### **2. Database Errors:**
```javascript
try {
  // Database operations
} catch (err) {
  console.error('Error creating area:', err);
  res.status(500).json({ message: err.message });
}
```

### **3. Route Conflicts:**
```javascript
// Specific routes MUST be before parameterized routes
router.get('/areas', authMiddleware, async (req, res) => { ... });
router.get('/areas/with-measurements', authMiddleware, async (req, res) => { ... });
router.get('/:deviceId', authMiddleware, async (req, res) => { ... }); // This must be last
```

## 📚 **ประโยชน์ของระบบ:**

### **1. Data Organization:**
- จัดกลุ่ม measurements ตามพื้นที่
- คำนวณค่าเฉลี่ยอัตโนมัติ
- ง่ายต่อการ query และ analysis

### **2. Performance:**
- ลดจำนวน API calls
- ข้อมูลสรุปพร้อมใช้งาน
- Index ทำงานได้ดีขึ้น

### **3. User Experience:**
- หน้า history แสดงข้อมูลสรุป
- ไม่ต้องโหลด measurements ทีละตัว
- ข้อมูลครบถ้วนในครั้งเดียว

### **4. Scalability:**
- รองรับ measurements จำนวนมาก
- ระบบ relationship ที่ยืดหยุ่น
- ง่ายต่อการขยายฟีเจอร์

## 🎉 **สรุป:**

**✅ Areas API Implementation สำเร็จแล้ว!**

### **🔧 สิ่งที่ทำได้:**
- **Create Area API** - สร้าง area พร้อม measurements ✅
- **Get Areas API** - ดึงข้อมูล areas สำหรับ history page ✅
- **Get Areas with Measurements** - ดึงข้อมูล areas พร้อม measurements ✅
- **Average Calculation** - คำนวณค่าเฉลี่ยอัตโนมัติ ✅
- **Database Relationships** - สร้างความสัมพันธ์ areas_at ✅

### **🧪 การทดสอบที่ผ่าน:**
- Single measurement area ✅
- Multiple measurements area ✅
- Areas listing ✅
- Areas with measurements ✅
- Route conflicts resolution ✅

### **📊 ตัวอย่างข้อมูล:**
```json
{
  "areasid": 1,
  "area_name": "Test Area 1",
  "temperature_avg": "25.00",
  "moisture_avg": "60.00",
  "ph_avg": "6.50",
  "phosphorus_avg": "15.00",
  "potassium_avg": "25.00",
  "nitrogen_avg": "20.00",
  "totalmeasurement": 1,
  "created_at": "2025-09-29T07:15:15.173Z"
}
```

**🎯 ตอนนี้หน้า history สามารถแสดงข้อมูลจาก table areas แล้ว!** ✅🎉

**ระบบพร้อมใช้งานสำหรับ Angular frontend!** 🚀✨
