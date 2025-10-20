# 🔧 Backend Requirements สำหรับ Admin Notification System

## ✅ **Backend Requirements สำหรับ Admin Notification System เสร็จสมบูรณ์แล้ว!** 🎉

### **🔧 สิ่งที่ Frontend ทำเสร็จแล้ว:**

#### **1. Admin Side:**
- ✅ **ปุ่มข้อความพร้อมตัวเลข** - แสดงจำนวนข้อความที่ยังไม่ได้อ่าน
- ✅ **Real-time Updates** - อัปเดตจำนวนข้อความแบบ real-time
- ✅ **Firebase Integration** - ใช้ Firebase Realtime Database
- ✅ **Send Notifications** - ส่ง notification เมื่อแก้ไขข้อมูล user

#### **2. User Side:**
- ✅ **Persistent Notifications** - แสดง notification แบบ modal
- ✅ **Real-time Subscription** - subscribe ถึง notifications แบบ real-time
- ✅ **Acknowledge System** - user สามารถกดรับทราบได้
- ✅ **Dismiss Option** - ปิดชั่วคราวได้

---

## 🔧 **สิ่งที่ Backend ต้องทำ:**

### **1. API Endpoints:**
```javascript
// GET /api/reports - ดึงรายการ reports สำหรับ admin
// PUT /api/reports/:id/read - อัปเดต status ของ report
// PUT /api/admin/users/:userId - แก้ไขข้อมูล user และส่ง notification
```

### **2. Database Schema:**
```sql
-- Reports Table
CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(userid),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP NULL,
  admin_id INTEGER REFERENCES users(userid)
);

-- Users Table (ตรวจสอบ fields)
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
```

### **3. Firebase Admin SDK:**
```bash
npm install firebase-admin
```

```javascript
// firebase-admin.js
const admin = require('firebase-admin');
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tripbooking-ajtawan-default-rtdb.asia-southeast1.firebasedatabase.app"
});
```

### **4. User Update API with Notification:**
```javascript
app.put('/api/admin/users/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { user_name, user_phone, user_password, role } = req.body;
    
    // ✅ อัปเดตข้อมูล user ใน PostgreSQL
    await db.query(`
      UPDATE users 
      SET user_name = $1, user_phone = $2, role = $3
      WHERE userid = $4
    `, [user_name, user_phone, role, userId]);
    
    // ✅ ส่ง notification ไปยัง Firebase
    const notificationData = {
      userId: parseInt(userId),
      type: 'admin_update',
      title: 'ข้อมูลของคุณได้รับการอัปเดต',
      message: `แอดมินได้แก้ไขข้อมูลของคุณแล้ว กรุณาตรวจสอบข้อมูลใหม่`,
      adminName: req.user.user_name || 'Admin',
      timestamp: new Date().toISOString(),
      read: false,
      persistent: true
    };
    
    const notificationsRef = firebaseAdmin.database().ref(`notifications/${userId}`);
    await notificationsRef.push(notificationData);
    
    res.json({ 
      success: true, 
      message: 'User updated successfully',
      notificationSent: true 
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});
```

---

## 🧪 **การทดสอบ:**

### **Test Case: Admin แก้ไขข้อมูล User**
1. Admin แก้ไขข้อมูล user (username, phone, password)
2. Backend อัปเดตข้อมูลใน PostgreSQL
3. Backend ส่ง notification ไปยัง Firebase
4. Frontend admin เห็นจำนวนข้อความเพิ่มขึ้น
5. Frontend user เห็น persistent notification

### **ผลลัพธ์ที่คาดหวัง:**

#### **Firebase Database:**
```json
{
  "notifications": {
    "57": {
      "-Nx1234567890": {
        "userId": 57,
        "type": "admin_update",
        "title": "ข้อมูลของคุณได้รับการอัปเดต",
        "message": "แอดมินได้แก้ไขข้อมูลของคุณแล้ว กรุณาตรวจสอบข้อมูลใหม่",
        "adminName": "Admin",
        "timestamp": "2025-10-20T10:30:00.000Z",
        "read": false,
        "persistent": true
      }
    }
  }
}
```

#### **Console Logs:**
```javascript
// ✅ Backend
✅ User updated successfully
✅ Notification sent to user 57

// ✅ Frontend Admin
🔔 Real-time unread count update: 1

// ✅ Frontend User
🔔 New persistent notification: {...}
✅ Notification acknowledged: -Nx1234567890
```

---

## 🎯 **สรุป:**

**Frontend พร้อมแล้ว!** ✅
- ✅ **Admin Notification System** - ส่ง notification เมื่อแก้ไขข้อมูล user
- ✅ **Persistent Notifications** - ข้อความค้างไว้จนกว่า user จะกดรับทราบ
- ✅ **Real-time Updates** - อัปเดตแบบ real-time ผ่าน Firebase
- ✅ **User Acknowledge System** - user สามารถรับทราบได้
- ✅ **Responsive Design** - รองรับ mobile และ desktop

**Backend ต้องทำ:** 🔧
- 🔧 **API Endpoints** - Reports และ User Management APIs
- 🔧 **Database Schema** - Reports table และ User fields
- 🔧 **Firebase Admin SDK** - สำหรับส่ง notifications
- 🔧 **Service Account Key** - สำหรับ Firebase authentication

**🎯 ตอนนี้เมื่อ backend ทำตาม requirements แล้ว ระบบ notification จะทำงานได้อย่างสมบูรณ์!** 🚀

**📝 เอกสาร Backend Requirements ถูกสร้างไว้ใน `docs/backend-notification-system-requirements.md` แล้ว** ✨
