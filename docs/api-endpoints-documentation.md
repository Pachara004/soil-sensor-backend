# 📚 API Endpoints Documentation

## 🎯 **ภาพรวมระบบ API**

ระบบ Soil Sensor Backend มี API endpoints ทั้งหมด **6 modules หลัก** ได้แก่:

1. **Authentication (auth)** - การจัดการผู้ใช้และการยืนยันตัวตน
2. **Users** - การจัดการข้อมูลผู้ใช้
3. **Devices** - การจัดการอุปกรณ์ IoT
4. **Measurements** - การจัดการข้อมูลการวัด
5. **Reports** - การจัดการรายงานปัญหา
6. **Images** - การจัดการรูปภาพ

---

## 🔐 **1. Authentication API (`/api/auth`)**

### **User Registration & Login**

#### **POST `/api/auth/register`**
- **หน้าที่:** สมัครสมาชิกใหม่
- **Body:** `{ email, username, name, phoneNumber, type, firebaseUid }`
- **Response:** ข้อมูลผู้ใช้ที่สร้างใหม่
- **ใช้งาน:** หน้าสมัครสมาชิก

#### **POST `/api/auth/login`**
- **หน้าที่:** เข้าสู่ระบบด้วย email/password
- **Body:** `{ email, password }`
- **Response:** JWT token และข้อมูลผู้ใช้
- **ใช้งาน:** หน้า login

#### **POST `/api/auth/google-login`**
- **หน้าที่:** เข้าสู่ระบบด้วย Google
- **Body:** `{ idToken }`
- **Response:** ข้อมูลผู้ใช้
- **ใช้งาน:** Google Sign-In

### **Password Management**

#### **POST `/api/auth/send-otp`**
- **หน้าที่:** ส่ง OTP สำหรับรีเซ็ตรหัสผ่าน
- **Body:** `{ email }`
- **Response:** `{ message, ref }`
- **ใช้งาน:** หน้า forgot password

#### **POST `/api/auth/verify-otp`**
- **หน้าที่:** ยืนยัน OTP
- **Body:** `{ email, otp, referenceNumber }`
- **Response:** `{ message }`
- **ใช้งาน:** หน้าใส่ OTP

#### **PUT `/api/auth/reset-password`**
- **หน้าที่:** รีเซ็ตรหัสผ่านใหม่
- **Body:** `{ email, otp, newPassword, referenceNumber }`
- **Response:** `{ message }`
- **ใช้งาน:** หน้าตั้งรหัสผ่านใหม่

### **User Profile**

#### **GET `/api/auth/me`**
- **หน้าที่:** ดูข้อมูลผู้ใช้ปัจจุบัน
- **Headers:** `Authorization: Bearer <token>`
- **Response:** ข้อมูลผู้ใช้
- **ใช้งาน:** แสดงข้อมูลโปรไฟล์

#### **PUT `/api/auth/profile`**
- **หน้าที่:** อัปเดตโปรไฟล์
- **Body:** `{ user_name, user_phone }`
- **Response:** ข้อมูลผู้ใช้ที่อัปเดตแล้ว
- **ใช้งาน:** หน้าแก้ไขโปรไฟล์

### **Account Management**

#### **DELETE `/api/auth/delete-account`**
- **หน้าที่:** ลบบัญชีผู้ใช้ตัวเอง
- **Response:** `{ message, deletedUser }`
- **ใช้งาน:** หน้าตั้งค่าบัญชี

#### **DELETE `/api/auth/admin/delete-user/:userid`**
- **หน้าที่:** Admin ลบผู้ใช้คนอื่น
- **Params:** `userid`
- **Response:** `{ message, deletedUser }`
- **ใช้งาน:** หน้า admin จัดการผู้ใช้

### **Utility Endpoints**

#### **GET `/api/auth/check-email/:email`**
- **หน้าที่:** ตรวจสอบว่า email มีอยู่แล้วหรือไม่
- **Response:** `{ exists: boolean }`

#### **GET `/api/auth/check-username/:username`**
- **หน้าที่:** ตรวจสอบว่า username มีอยู่แล้วหรือไม่
- **Response:** `{ exists: boolean }`

#### **POST `/api/auth/debug-token`**
- **หน้าที่:** Debug token (สำหรับ development)
- **Body:** `{ token }`
- **Response:** ข้อมูลการ verify token

---

## 👥 **2. Users API (`/api/users`)**

### **User Management**

#### **GET `/api/users`**
- **หน้าที่:** 
  - Admin: ดูผู้ใช้ทั้งหมด
  - User: ดูโปรไฟล์ตัวเอง
- **Response:** `{ users: [] }` หรือ `{ user: {} }`
- **ใช้งาน:** หน้า admin, หน้าโปรไฟล์

#### **GET `/api/users/all`**
- **หน้าที่:** Admin ดูผู้ใช้ทั้งหมด
- **Response:** `{ users: [] }`
- **ใช้งาน:** หน้า admin

#### **GET `/api/users/regular`**
- **หน้าที่:** Admin ดูผู้ใช้ธรรมดา (ไม่ใช่ admin)
- **Response:** `{ users: [] }`
- **ใช้งาน:** หน้า admin

#### **GET `/api/users/:id`**
- **หน้าที่:** ดูข้อมูลผู้ใช้คนใดคนหนึ่ง
- **Params:** `id`
- **Response:** ข้อมูลผู้ใช้

#### **PUT `/api/users/:id`**
- **หน้าที่:** อัปเดตข้อมูลผู้ใช้
- **Body:** `{ user_name, user_phone, user_email }`
- **Response:** ข้อมูลผู้ใช้ที่อัปเดตแล้ว

#### **PUT `/api/users/:id/role`**
- **หน้าที่:** Admin เปลี่ยน role ผู้ใช้
- **Body:** `{ role }`
- **Response:** ข้อมูลผู้ใช้ที่อัปเดตแล้ว

#### **DELETE `/api/users/:id`**
- **หน้าที่:** Admin ลบผู้ใช้
- **Response:** `{ message }`

### **User Statistics**

#### **GET `/api/users/stats`**
- **หน้าที่:** ดูสถิติผู้ใช้
- **Response:** `{ totalUsers, adminUsers, regularUsers }`
- **ใช้งาน:** Dashboard admin

### **User Profile (Alias)**

#### **GET `/api/users/profile`**
- **หน้าที่:** ดูโปรไฟล์ (alias สำหรับ Angular)
- **Response:** ข้อมูลผู้ใช้

#### **PUT `/api/users/change-password/:id`**
- **หน้าที่:** เปลี่ยนรหัสผ่าน
- **Body:** `{ currentPassword, newPassword }`
- **Response:** `{ message }`

---

## 📱 **3. Devices API (`/api/devices`)**

### **Device Management**

#### **GET `/api/devices`**
- **หน้าที่:** ดูอุปกรณ์ของผู้ใช้
- **Response:** `{ devices: [] }`
- **ใช้งาน:** หน้าจัดการอุปกรณ์

#### **GET `/api/devices/by-username/:username`**
- **หน้าที่:** ดูอุปกรณ์ของผู้ใช้คนใดคนหนึ่ง
- **Params:** `username`
- **Response:** `{ devices: [] }`

#### **POST `/api/devices`**
- **หน้าที่:** เพิ่มอุปกรณ์ใหม่
- **Body:** `{ device_name, device_type, description }`
- **Response:** ข้อมูลอุปกรณ์ที่สร้างใหม่

#### **POST `/api/devices/claim`**
- **หน้าที่:** เชื่อมโยงอุปกรณ์กับผู้ใช้
- **Body:** `{ device_id, device_name }`
- **Response:** ข้อมูลอุปกรณ์ที่เชื่อมโยงแล้ว

#### **PUT `/api/devices/:id`**
- **หน้าที่:** อัปเดตข้อมูลอุปกรณ์
- **Body:** `{ device_name, device_type, description, status }`
- **Response:** ข้อมูลอุปกรณ์ที่อัปเดตแล้ว

#### **DELETE `/api/devices/:id`**
- **หน้าที่:** ลบอุปกรณ์
- **Response:** `{ message }`

### **Admin Device Management**

#### **POST `/api/devices/admin/add`**
- **หน้าที่:** Admin เพิ่มอุปกรณ์
- **Body:** `{ device_id, device_name, device_type }`
- **Response:** ข้อมูลอุปกรณ์ใหม่

#### **POST `/api/devices/admin/claim`**
- **หน้าที่:** Admin เชื่อมโยงอุปกรณ์ให้ผู้ใช้
- **Body:** `{ device_id, userid }`
- **Response:** ข้อมูลอุปกรณ์ที่เชื่อมโยงแล้ว

---

## 📊 **4. Measurements API (`/api/measurements`)**

### **Area Management**

#### **GET `/api/measurements/areas`**
- **หน้าที่:** ดูพื้นที่การวัดของผู้ใช้
- **Query:** `?deviceid=<id>` (optional)
- **Response:** `[ { areasid, area_name, ... } ]`
- **ใช้งาน:** หน้าประวัติการวัด

#### **GET `/api/measurements/areas/with-measurements`**
- **หน้าที่:** ดูพื้นที่พร้อมข้อมูลการวัด
- **Query:** `?deviceid=<id>` (optional)
- **Response:** พื้นที่พร้อมข้อมูลการวัดแต่ละจุด
- **ใช้งาน:** หน้าประวัติรายละเอียด

#### **POST `/api/measurements/create-area-immediately`**
- **หน้าที่:** สร้างพื้นที่ทันทีเมื่อยืนยันบนแผนที่
- **Body:** `{ area_name, deviceId, area_size, coordinates }`
- **Response:** ข้อมูลพื้นที่ที่สร้างใหม่
- **ใช้งาน:** หน้าวัดค่า (เมื่อยืนยันพื้นที่)

#### **POST `/api/measurements/create-area`**
- **หน้าที่:** สร้างพื้นที่พร้อมข้อมูลการวัด
- **Body:** `{ area_name, measurements, deviceId }`
- **Response:** ข้อมูลพื้นที่และการวัด
- **ใช้งาน:** หน้าวัดค่า (เมื่อวัดเสร็จ)

#### **PUT `/api/measurements/update-area/:areaId`**
- **หน้าที่:** อัปเดตค่าเฉลี่ยของพื้นที่
- **Body:** `{ measurements: [] }`
- **Response:** ข้อมูลพื้นที่ที่อัปเดตแล้ว
- **ใช้งาน:** หน้าวัดค่า (คำนวณค่าเฉลี่ย)

### **Measurement Data**

#### **GET `/api/measurements/:deviceId`**
- **หน้าที่:** ดูข้อมูลการวัดของอุปกรณ์
- **Params:** `deviceId`
- **Response:** `[ { measurementid, temperature, ... } ]`
- **ใช้งาน:** หน้าดูข้อมูลอุปกรณ์

#### **GET `/api/measurements/area/:areaId`**
- **หน้าที่:** ดูข้อมูลการวัดในพื้นที่
- **Params:** `areaId`
- **Response:** ข้อมูลการวัดทั้งหมดในพื้นที่นั้น
- **ใช้งาน:** หน้ารายละเอียดพื้นที่

#### **POST `/api/measurements/single-point`**
- **หน้าที่:** บันทึกการวัดจุดเดียว
- **Body:** `{ deviceId, temperature, moisture, ph, ..., lat, lng, areaId }`
- **Response:** ข้อมูลการวัดที่บันทึกแล้ว
- **ใช้งาน:** หน้าวัดค่า (วัดทีละจุด)

#### **POST `/api/measurements`**
- **หน้าที่:** บันทึกข้อมูลการวัดทั่วไป
- **Body:** `{ deviceId, temperature, moisture, ph, ..., lat, lng }`
- **Response:** ข้อมูลการวัดที่บันทึกแล้ว
- **ใช้งาน:** หน้าวัดค่าแบบเดี่ยว

#### **PUT `/api/measurements/:id`**
- **หน้าที่:** แก้ไขข้อมูลการวัด
- **Body:** `{ temperature, moisture, ph, ... }`
- **Response:** ข้อมูลการวัดที่แก้ไขแล้ว

#### **DELETE `/api/measurements/:id`**
- **หน้าที่:** ลบข้อมูลการวัด
- **Response:** `{ message }`

---

## 📋 **5. Reports API (`/api/reports`)**

### **Report Management**

#### **GET `/api/reports`**
- **หน้าที่:** 
  - Admin: ดูรายงานทั้งหมด
  - User: ดูรายงานของตัวเอง
- **Response:** `{ reports: [] }`
- **ใช้งาน:** หน้ารายงานปัญหา

#### **GET `/api/reports/user`**
- **หน้าที่:** ดูรายงานของผู้ใช้ปัจจุบัน
- **Response:** `{ reports: [] }`
- **ใช้งาน:** หน้ารายงานส่วนตัว

#### **GET `/api/reports/:id`**
- **หน้าที่:** ดูรายงานเฉพาะ
- **Params:** `id`
- **Response:** ข้อมูลรายงานและรูปภาพ
- **ใช้งาน:** หน้ารายละเอียดรายงาน

#### **POST `/api/reports`**
- **หน้าที่:** สร้างรายงานใหม่
- **Body:** `{ title, description, type, priority, images }`
- **Response:** ข้อมูลรายงานที่สร้างใหม่
- **ใช้งาน:** หน้าส่งรายงานปัญหา

#### **PUT `/api/reports/:id/status`**
- **หน้าที่:** Admin อัปเดตสถานะรายงาน
- **Body:** `{ status }`
- **Response:** ข้อมูลรายงานที่อัปเดตแล้ว
- **ใช้งาน:** หน้า admin จัดการรายงาน

#### **DELETE `/api/reports/:id`**
- **หน้าที่:** ลบรายงาน
- **Response:** `{ message }`
- **ใช้งาน:** หน้าจัดการรายงาน

---

## 🖼️ **6. Images API (`/api/images`)**

### **Image Management**

#### **GET `/api/images`**
- **หน้าที่:** Admin ดูรูปภาพทั้งหมด
- **Response:** `{ images: [] }`
- **ใช้งาน:** หน้า admin จัดการรูปภาพ

#### **GET `/api/images/report/:reportId`**
- **หน้าที่:** ดูรูปภาพของรายงาน
- **Params:** `reportId`
- **Response:** `{ images: [] }`
- **ใช้งาน:** หน้ารายละเอียดรายงาน

#### **GET `/api/images/:id`**
- **หน้าที่:** ดูรูปภาพเฉพาะ
- **Params:** `id`
- **Response:** ข้อมูลรูปภาพ

#### **POST `/api/images`**
- **หน้าที่:** เพิ่มรูปภาพใหม่
- **Body:** `{ reportid, imageUrl }`
- **Response:** ข้อมูลรูปภาพที่เพิ่มใหม่
- **ใช้งาน:** หน้าส่งรายงาน

#### **PUT `/api/images/:id`**
- **หน้าที่:** แก้ไขรูปภาพ
- **Body:** `{ imageUrl }`
- **Response:** ข้อมูลรูปภาพที่แก้ไขแล้ว

#### **DELETE `/api/images/:id`**
- **หน้าที่:** ลบรูปภาพ
- **Response:** `{ message }`

#### **GET `/api/images/stats`**
- **หน้าที่:** ดูสถิติรูปภาพ
- **Response:** `{ totalImages, imagesByReport }`
- **ใช้งาน:** Dashboard admin

---

## 🔧 **7. Admin API (`/api/admin`)**

### **Admin Device Management**

#### **GET `/api/admin/devices`**
- **หน้าที่:** Admin ดูอุปกรณ์ทั้งหมด
- **Response:** `{ devices: [] }`
- **ใช้งาน:** หน้า admin จัดการอุปกรณ์

#### **POST `/api/admin/devices`**
- **หน้าที่:** Admin เพิ่มอุปกรณ์ใหม่
- **Body:** `{ device_id, device_name, device_type }`
- **Response:** ข้อมูลอุปกรณ์ใหม่

#### **DELETE `/api/admin/devices/:id`**
- **หน้าที่:** Admin ลบอุปกรณ์
- **Response:** `{ message }`

### **Admin User Management**

#### **GET `/api/admin/users`**
- **หน้าที่:** Admin ดูผู้ใช้ทั้งหมด
- **Response:** `{ users: [] }`

#### **PUT `/api/admin/users/:id`**
- **หน้าที่:** Admin แก้ไขข้อมูลผู้ใช้
- **Body:** `{ user_name, user_email, role }`
- **Response:** ข้อมูลผู้ใช้ที่แก้ไขแล้ว

#### **DELETE `/api/admin/users/:id`**
- **หน้าที่:** Admin ลบผู้ใช้
- **Response:** `{ message }`

---

## 🏥 **8. Health Check API**

#### **GET `/health`**
- **หน้าที่:** ตรวจสอบสถานะระบบ
- **Response:** `{ status, firebase, email, timestamp }`
- **ใช้งาน:** Monitoring, Health Check

---

## 🔐 **Authentication & Authorization**

### **Authentication Methods:**
1. **Firebase ID Token** - สำหรับ Google Sign-In
2. **JWT Token** - สำหรับ email/password login

### **Authorization Levels:**
1. **Public** - ไม่ต้อง login (health, check-email, check-username)
2. **User** - ต้อง login (measurements, devices, reports ของตัวเอง)
3. **Admin** - ต้องมี role admin (จัดการผู้ใช้, ดูข้อมูลทั้งหมด)

### **Headers Required:**
```
Authorization: Bearer <firebase_token_or_jwt_token>
Content-Type: application/json
```

---

## 📱 **Usage Examples**

### **1. User Registration:**
```javascript
POST /api/auth/register
{
  "email": "user@example.com",
  "username": "testuser",
  "name": "Test User",
  "phoneNumber": "0812345678",
  "type": "user",
  "firebaseUid": "firebase_uid_here"
}
```

### **2. Create Measurement Area:**
```javascript
POST /api/measurements/create-area-immediately
{
  "area_name": "พื้นที่ทดสอบ 1",
  "deviceId": "26",
  "area_size": "100.5",
  "coordinates": [[lat, lng], [lat, lng], ...]
}
```

### **3. Save Single Measurement:**
```javascript
POST /api/measurements/single-point
{
  "deviceId": "26",
  "temperature": 25.5,
  "moisture": 65.2,
  "ph": 6.8,
  "phosphorus": 15.3,
  "potassium": 20.1,
  "nitrogen": 12.7,
  "lat": 16.246,
  "lng": 103.250,
  "areaId": 27
}
```

### **4. Create Report:**
```javascript
POST /api/reports
{
  "title": "อุปกรณ์ขัดข้อง",
  "description": "เซนเซอร์ไม่ทำงาน",
  "type": "technical",
  "priority": "high",
  "images": ["https://example.com/image1.jpg"]
}
```

---

## 🎯 **สรุป**

ระบบ API มีทั้งหมด **50+ endpoints** แบ่งเป็น:
- **Authentication:** 12 endpoints
- **Users:** 10 endpoints  
- **Devices:** 8 endpoints
- **Measurements:** 12 endpoints
- **Reports:** 6 endpoints
- **Images:** 7 endpoints
- **Admin:** 6 endpoints
- **Health:** 1 endpoint

**การใช้งานหลัก:**
1. **Mobile/Web App** - ใช้ Firebase Auth + API calls
2. **Admin Panel** - ใช้ JWT Auth + Admin APIs
3. **IoT Devices** - ส่งข้อมูลผ่าน Measurements API
4. **Monitoring** - ใช้ Health Check API

**Security Features:**
- JWT & Firebase Authentication
- Role-based Authorization  
- Input Validation
- Error Handling
- Rate Limiting (ในอนาคต)
