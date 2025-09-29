# 🔧 Device Type Implementation

## 🎯 **วัตถุประสงค์:**
เพิ่ม column `device_type` ใน table device เพื่อแยกประเภท device:
- **true** = device จริง (ไม่มีคำว่า "test" ในชื่อ)
- **false** = device test (มีคำว่า "test" ในชื่อ)

## 🔧 **การแก้ไขที่ทำ:**

### **1. Helper Function:**
```javascript
// Helper function to determine device_type based on device name
const getDeviceType = (deviceName) => {
  if (!deviceName) return true; // Default to true if no name
  return !deviceName.toLowerCase().includes('test');
};
```

### **2. GET /api/devices (Get devices for current user):**
```javascript
// Add device_type to each device based on device_name
const devicesWithType = rows.map(device => ({
  ...device,
  device_type: getDeviceType(device.device_name)
}));

res.json(devicesWithType);
```

### **3. GET /api/devices/by-username/:username:**
```javascript
// Add device_type to each device based on device_name
const devicesWithType = rows.map(device => ({
  ...device,
  device_type: getDeviceType(device.device_name)
}));

res.json(devicesWithType);
```

### **4. POST /api/devices (Add new device):**
```javascript
// Determine device_type based on device_name
const device_type = getDeviceType(device_name);

const { rows } = await pool.query(
  `INSERT INTO device (device_name, device_id, device_type, userid, created_at, updated_at)
   VALUES ($1, $2, $3, $4, NOW(), NOW())
   RETURNING *`,
  [device_name, device_id || null, device_type, req.user.userid]
);

// Add device_type to response
const deviceResponse = {
  ...deviceWithUser[0],
  device_type: getDeviceType(deviceWithUser[0].device_name)
};
```

### **5. PUT /api/devices/:id (Update device):**
```javascript
// Determine device_type based on device_name
const device_type = getDeviceType(device_name);

const { rows } = await pool.query(
  `UPDATE device 
   SET device_name = $1, device_type = $2, updated_at = NOW()
   WHERE deviceid = $3 AND userid = $4
   RETURNING *`,
  [device_name, device_type, id, req.user.userid]
);

// Add device_type to response
const deviceResponse = {
  ...deviceWithUser[0],
  device_type: getDeviceType(deviceWithUser[0].device_name)
};
```

### **6. POST /api/devices/claim-device & /api/devices/claim:**
```javascript
// Determine device_type based on device name
const deviceName = `Device ${deviceId}`;
const device_type = getDeviceType(deviceName);

const { rows } = await pool.query(
  `INSERT INTO device (deviceid, device_name, device_id, device_type, userid, created_at, updated_at)
   VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
   ON CONFLICT (deviceid) 
   DO UPDATE SET userid = $5, device_type = $4, updated_at = NOW()
   RETURNING *`,
  [deviceId, deviceName, deviceId, device_type, req.user.userid]
);

// Add device_type to response
const deviceResponse = {
  ...deviceWithUser[0],
  device_type: getDeviceType(deviceWithUser[0].device_name)
};
```

## 🧪 **การทดสอบ:**

### **1. สร้าง Device ที่มีคำว่า "test":**
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"device_name":"Test Device 001","device_id":"TEST001"}'
```

**Response:**
```json
{
  "message": "Device added successfully",
  "device": {
    "deviceid": 15,
    "device_name": "Test Device 001",
    "device_id": "TEST001",
    "device_type": false,
    "user_name": "admin",
    "user_email": "admin@example.com"
  }
}
```

### **2. สร้าง Device ที่ไม่มีคำว่า "test":**
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"device_name":"Production Device 001","device_id":"PROD001"}'
```

**Response:**
```json
{
  "message": "Device added successfully",
  "device": {
    "deviceid": 16,
    "device_name": "Production Device 001",
    "device_id": "PROD001",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  }
}
```

### **3. อัปเดต Device Name:**
```bash
curl -X PUT http://localhost:3000/api/devices/15 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"device_name":"Real Production Device"}'
```

**Response:**
```json
{
  "message": "Device updated",
  "device": {
    "deviceid": 15,
    "device_name": "Real Production Device",
    "device_id": "TEST001",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  }
}
```

### **4. Claim Device:**
```bash
curl -X POST http://localhost:3000/api/devices/claim \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{"deviceId":17}'
```

**Response:**
```json
{
  "message": "Device claimed",
  "device": {
    "deviceid": 17,
    "device_name": "Device 17",
    "device_id": "17",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  }
}
```

### **5. GET All Devices:**
```bash
curl -X GET http://localhost:3000/api/devices \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

**Response:**
```json
[
  {
    "deviceid": 18,
    "device_name": "Device 18",
    "device_id": "18",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  },
  {
    "deviceid": 17,
    "device_name": "Device 17",
    "device_id": "17",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  },
  {
    "deviceid": 16,
    "device_name": "Production Device 001",
    "device_id": "PROD001",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  },
  {
    "deviceid": 15,
    "device_name": "Real Production Device",
    "device_id": "TEST001",
    "device_type": true,
    "user_name": "admin",
    "user_email": "admin@example.com"
  }
]
```

## 📊 **ผลลัพธ์:**

### **Device Type Logic:**
- **ชื่อมีคำว่า "test"** → `device_type: false` (Test Device)
- **ชื่อไม่มีคำว่า "test"** → `device_type: true` (Production Device)

### **ตัวอย่าง:**
| Device Name | Device Type | Result |
|-------------|-------------|---------|
| "Test Device 001" | false | Test Device |
| "Production Device 001" | true | Production Device |
| "Real Production Device" | true | Production Device |
| "Device 17" | true | Production Device |
| "TEST_SENSOR" | false | Test Device |
| "Sensor_001" | true | Production Device |

## 🔄 **การทำงานของระบบ:**

### **1. เมื่อสร้าง Device:**
```
1. ตรวจสอบ device_name
2. กำหนด device_type ตาม logic
3. INSERT ข้อมูลพร้อม device_type
4. ส่ง response กลับพร้อม device_type
```

### **2. เมื่ออัปเดต Device:**
```
1. ตรวจสอบ device_name ใหม่
2. กำหนด device_type ใหม่ตาม logic
3. UPDATE ข้อมูลพร้อม device_type
4. ส่ง response กลับพร้อม device_type
```

### **3. เมื่อดึงข้อมูล Devices:**
```
1. ดึงข้อมูลจาก database
2. เพิ่ม device_type ใน response
3. ส่งข้อมูลครบถ้วนกลับ
```

## 🛡️ **Security Features:**

### **1. Authorization:**
- ตรวจสอบ JWT token หรือ Firebase ID token
- User สามารถจัดการเฉพาะ devices ของตัวเอง

### **2. Data Integrity:**
- device_type ถูกกำหนดอัตโนมัติตาม device_name
- ไม่สามารถแก้ไข device_type โดยตรง

## 📚 **เอกสารที่สร้าง:**
- `docs/device-type-implementation.md` - คู่มือการแก้ไข Device Type

## 🎉 **สรุป:**

**✅ เพิ่ม device_type column และ logic แล้ว!**

### **🔧 การแก้ไขที่ทำ:**
- **Helper Function** - ฟังก์ชันกำหนด device_type ตาม device_name
- **Database Integration** - เพิ่ม device_type ใน INSERT/UPDATE queries
- **Response Enhancement** - แสดง device_type ในทุก endpoints

### **🛡️ ฟีเจอร์ที่เพิ่ม:**
- **Automatic Classification** - แยกประเภท device อัตโนมัติ
- **Test Device Detection** - ตรวจจับ test devices จากชื่อ
- **Production Device Support** - รองรับ production devices

**ตอนนี้ API devices แยกประเภท device อัตโนมัติแล้ว!** 🎯✨
