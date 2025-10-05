# 🗄️ **การวิเคราะห์ตารางและคอลัมน์ที่ไม่ได้ใช้ในฐานข้อมูล**

## 📊 **สรุปการวิเคราะห์**

จากการตรวจสอบโค้ดในโปรเจ็ค พบว่ามีตารางและคอลัมน์บางส่วนที่ไม่ได้ใช้งานจริง:

---

## ❌ **ตารางที่ไม่ได้ใช้ (Unused Tables)**

### **1. `add_device` Table**
```sql
-- ❌ ไม่ได้ใช้ในระบบ
CREATE TABLE add_device (
  userid INTEGER,
  deviceid INTEGER,
  added_at TIMESTAMP
);
```
**สถานะ:** ไม่พบการใช้งานในโค้ดใดๆ

### **2. `bug_report` Table**
```sql
-- ❌ ไม่ได้ใช้ในระบบ
CREATE TABLE bug_report (
  reportid INTEGER,
  userid INTEGER,
  report_date DATE,
  report_message TEXT,
  report_status VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
**สถานะ:** ไม่พบการใช้งานในโค้ดใดๆ

### **3. `image` Table (มี `images` แทน)**
```sql
-- ❌ ไม่ได้ใช้ในระบบ (มี images table แทน)
CREATE TABLE image (
  imageid INTEGER,
  reportid INTEGER,
  imageurl TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
**สถานะ:** ไม่พบการใช้งานในโค้ด แต่มี `images` table ที่ใช้งานจริง

### **4. `report` Table (มี `reports` แทน)**
```sql
-- ❌ ไม่ได้ใช้ในระบบ (มี reports table แทน)
CREATE TABLE report (
  userid INTEGER,
  reportid INTEGER
);
```
**สถานะ:** ไม่พบการใช้งานในโค้ด แต่มี `reports` table ที่ใช้งานจริง

---

## ⚠️ **คอลัมน์ที่ไม่ได้ใช้ (Unused Columns)**

### **1. ใน `measurement` Table:**
```sql
-- ⚠️ คอลัมน์ที่ไม่ได้ใช้จริง
is_epoch BOOLEAN,     -- ไม่ได้ใช้ในการประมวลผล
is_uptime BOOLEAN     -- ไม่ได้ใช้ในการประมวลผล
```

### **2. ใน `device` Table:**
```sql
-- ⚠️ คอลัมน์ที่ไม่ได้ใช้จริง
device_type BOOLEAN   -- ไม่ได้ใช้ในการประมวลผล
```

### **3. ใน `users` Table:**
```sql
-- ⚠️ คอลัมน์ที่ไม่ได้ใช้จริง
device_id INTEGER     -- ไม่ได้ใช้ในการประมวลผล
user_password VARCHAR -- ไม่ได้ใช้ (ใช้ Firebase Auth แทน)
```

---

## ✅ **ตารางที่ใช้งานจริง (Used Tables)**

### **1. `users` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE users (
  userid INTEGER PRIMARY KEY,
  user_name VARCHAR,
  user_email VARCHAR,
  user_phone VARCHAR,
  role VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  firebase_uid VARCHAR
);
```

### **2. `device` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE device (
  deviceid INTEGER PRIMARY KEY,
  device_name VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  userid INTEGER,
  device_id VARCHAR
);
```

### **3. `measurement` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE measurement (
  measurementid INTEGER PRIMARY KEY,
  deviceid INTEGER,
  measurement_date DATE,
  measurement_time TIME,
  temperature NUMERIC,
  moisture NUMERIC,
  ph NUMERIC,
  phosphorus NUMERIC,
  nitrogen NUMERIC,
  lng TEXT,
  lat TEXT,
  created_at TIMESTAMP,
  areasid INTEGER,
  potassium NUMERIC
);
```

### **4. `areas` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE areas (
  areasid INTEGER PRIMARY KEY,
  area_name VARCHAR,
  potassium_avg NUMERIC,
  ph_avg NUMERIC,
  temperature_avg NUMERIC,
  totalmeasurement INTEGER,
  textupdated TIMESTAMP,
  phosphorus_avg NUMERIC,
  nitrogen_avg NUMERIC,
  moisture_avg NUMERIC,
  created_at TIMESTAMP,
  userid INTEGER,
  deviceid INTEGER
);
```

### **5. `areas_at` Table**
```sql
-- ✅ ใช้งานจริง (Junction table)
CREATE TABLE areas_at (
  areasid INTEGER,
  measurementid INTEGER,
  PRIMARY KEY (areasid, measurementid)
);
```

### **6. `reports` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE reports (
  reportid INTEGER PRIMARY KEY,
  title VARCHAR,
  description TEXT,
  type VARCHAR,
  priority VARCHAR,
  status VARCHAR,
  userid INTEGER,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### **7. `images` Table**
```sql
-- ✅ ใช้งานจริง
CREATE TABLE images (
  imageid INTEGER PRIMARY KEY,
  reportid INTEGER,
  imageurl TEXT
);
```

---

## 🧹 **คำแนะนำการทำความสะอาด**

### **1. ตารางที่ควรลบ:**
```sql
-- ลบตารางที่ไม่ได้ใช้
DROP TABLE IF EXISTS add_device;
DROP TABLE IF EXISTS bug_report;
DROP TABLE IF EXISTS image;  -- มี images แทน
DROP TABLE IF EXISTS report; -- มี reports แทน
```

### **2. คอลัมน์ที่ควรลบ:**
```sql
-- ลบคอลัมน์ที่ไม่ได้ใช้
ALTER TABLE measurement DROP COLUMN IF EXISTS is_epoch;
ALTER TABLE measurement DROP COLUMN IF EXISTS is_uptime;
ALTER TABLE device DROP COLUMN IF EXISTS device_type;
ALTER TABLE users DROP COLUMN IF EXISTS device_id;
ALTER TABLE users DROP COLUMN IF EXISTS user_password;
```

### **3. การทำความสะอาดโค้ด:**
```javascript
// ลบการอ้างอิงถึงคอลัมน์ที่ไม่ได้ใช้
// ใน api/measurement.js
// ลบ is_epoch, is_uptime จาก INSERT queries

// ใน api/device.js  
// ลบ device_type จาก INSERT queries

// ใน api/auth.js
// ลบ user_password จาก INSERT queries
```

---

## 📊 **สรุปผลการวิเคราะห์**

### **ตารางที่ไม่ได้ใช้: 4 ตาราง**
- `add_device` ❌
- `bug_report` ❌  
- `image` ❌ (มี `images` แทน)
- `report` ❌ (มี `reports` แทน)

### **คอลัมน์ที่ไม่ได้ใช้: 5 คอลัมน์**
- `measurement.is_epoch` ❌
- `measurement.is_uptime` ❌
- `device.device_type` ❌
- `users.device_id` ❌
- `users.user_password` ❌

### **ตารางที่ใช้งานจริง: 7 ตาราง**
- `users` ✅
- `device` ✅
- `measurement` ✅
- `areas` ✅
- `areas_at` ✅
- `reports` ✅
- `images` ✅

---

## 🎯 **ข้อเสนอแนะ**

1. **ลบตารางที่ไม่ได้ใช้** เพื่อลดความซับซ้อนของฐานข้อมูล
2. **ลบคอลัมน์ที่ไม่ได้ใช้** เพื่อประหยัดพื้นที่เก็บข้อมูล
3. **ทำความสะอาดโค้ด** โดยลบการอ้างอิงถึงตารางและคอลัมน์ที่ไม่ได้ใช้
4. **สร้างเอกสาร** ระบุโครงสร้างฐานข้อมูลที่ใช้งานจริง

**🎯 การทำความสะอาดจะทำให้ระบบมีประสิทธิภาพและง่ายต่อการบำรุงรักษามากขึ้น!** 🚀✨
