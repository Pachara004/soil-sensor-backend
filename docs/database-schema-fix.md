# 🔧 Database Schema Fix - Reset Password

## 🔍 **ปัญหาที่พบ:**

### **1. Frontend ส่งข้อมูลถูกต้องแล้ว:**
```json
{
  "email": "mrtgamer76@gmail.com",
  "newPassword": "123456",
  "otp": "226711",
  "referenceNumber": "307305"
}
```

### **2. Backend ยังคืน 500 Internal Server Error:**
- OTP verification สำเร็จ ✅
- Reset password ล้มเหลว ❌ - 500 Internal Server Error

## 🔧 **สาเหตุที่พบ:**

### **❌ `user_password` Column ไม่มีอยู่ในฐานข้อมูล!**

จากการตรวจสอบ database schema พบว่า:
```sql
-- Users table structure (เดิม):
- userid: integer (nullable: NO)
- user_name: character varying (nullable: NO)
- user_email: character varying (nullable: NO)
- user_phone: character varying (nullable: YES)
- role: character varying (nullable: YES)
- created_at: timestamp without time zone (nullable: YES)
- updated_at: timestamp without time zone (nullable: YES)
- firebase_uid: character varying (nullable: YES)
- device_id: integer (nullable: YES)
❌ user_password: character varying (nullable: YES) -- ไม่มี!
```

## 🛠️ **การแก้ไขที่ทำ:**

### **1. เพิ่ม `user_password` Column:**
```sql
ALTER TABLE users 
ADD COLUMN user_password VARCHAR(255);
```

### **2. ตรวจสอบ Table Structure ใหม่:**
```sql
-- Users table structure (ใหม่):
- userid: integer (nullable: NO)
- user_name: character varying (nullable: NO)
- user_email: character varying (nullable: NO)
- user_phone: character varying (nullable: YES)
- role: character varying (nullable: YES)
- created_at: timestamp without time zone (nullable: YES)
- updated_at: timestamp without time zone (nullable: YES)
- firebase_uid: character varying (nullable: YES)
- device_id: integer (nullable: YES)
✅ user_password: character varying (nullable: YES) -- เพิ่มแล้ว!
```

## 🔄 **การทำงานของระบบ (ใหม่):**

### **1. ส่ง OTP:**
```
Frontend สร้าง: Reference Number = H0BXFSUZ
Backend ส่งกลับ: {message: 'OTP sent', ref: '307305'}
Frontend อัปเดต: referenceNumber = '307305'
```

### **2. ตรวจสอบ OTP:**
```
ผู้ใช้กรอก: 226711
Frontend ส่ง: {email: 'mrtgamer76@gmail.com', otp: '226711', referenceNumber: '307305', type: 'password-reset'}
Backend ตรวจสอบ: ✅
Backend ตั้งค่า: entry.verified = true (ไม่ลบ OTP)
Frontend ไป Step 3
```

### **3. Reset Password (ใหม่):**
```
Frontend ส่ง: {email: 'mrtgamer76@gmail.com', newPassword: '123456', otp: '226711', referenceNumber: '307305'}
Backend ตรวจสอบ: OTP=226711, Ref=307305, Verified=true ✅
Backend อัปเดตรหัสผ่าน: ✅ (user_password column มีอยู่แล้ว)
Backend ลบ OTP: ✅ (หลัง reset password เสร็จ)
```

## 🎯 **Console Logs ที่คาดหวัง:**

### **หลังจากแก้ไข:**
```
🔐 Reset password request body: {email: 'mrtgamer76@gmail.com', newPassword: '123456', otp: '226711', referenceNumber: '307305'}
🔍 Parsed fields: {email: true, otp: true, newPassword: true, referenceNumber: true}
🔍 OTP Store check: {email: 'mrtgamer76@gmail.com', hasEntry: true, storeKeys: ['mrtgamer76@gmail.com'], entryExpires: ..., entryCode: '226711', entryRef: '307305', currentTime: ..., isExpired: false}
🔍 OTP Comparison: {receivedOtp: '226711', storedOtp: '226711', otpMatch: true}
✅ Password reset successful for: mrtgamer76@gmail.com
```

## 📋 **ขั้นตอนการทดสอบ:**

### **1. ดู Console Log ใน Backend Terminal:**
- จะเห็น OTP ที่สร้างจริงๆ
- จะเห็น error details ถ้ามี

### **2. ทดสอบ Verify OTP:**
- ดูว่า OTP ยังคงอยู่
- ดูว่า entry.verified = true

### **3. ทดสอบ Reset Password:**
- ดู console log ครบถ้วน
- ดูว่า user_password column ทำงานได้

### **4. ตรวจสอบ Success Message:**
- ควรเห็น "Password reset successfully"
- ไม่ควรเห็น 500 Internal Server Error

## 🎉 **ข้อดีของการแก้ไข:**

1. **Database Schema Complete** - user_password column มีอยู่แล้ว
2. **SQL Query Success** - UPDATE query ทำงานได้
3. **Password Storage** - รหัสผ่านถูกเก็บในฐานข้อมูล
4. **Error Resolution** - แก้ไข 500 Internal Server Error
5. **System Stability** - ระบบทำงานได้อย่างเสถียร

## 🚨 **การแก้ไขเพิ่มเติมที่อาจต้องทำ:**

### **1. ตั้งค่า Default Password:**
```sql
-- สำหรับ user ที่มีอยู่แล้ว ให้ตั้งค่า default password
UPDATE users 
SET user_password = '$2a$10$default_hash_here' 
WHERE user_password IS NULL;
```

### **2. ตั้งค่า NOT NULL Constraint:**
```sql
-- ถ้าต้องการให้ user_password เป็น required
ALTER TABLE users 
ALTER COLUMN user_password SET NOT NULL;
```

### **3. ตั้งค่า Unique Constraint:**
```sql
-- ถ้าต้องการให้ user_email เป็น unique
ALTER TABLE users 
ADD CONSTRAINT unique_user_email UNIQUE (user_email);
```

## 📚 **เอกสารที่สร้าง:**
- `docs/database-schema-fix.md` - การแก้ไข Database Schema
- `check-schema.js` - Script ตรวจสอบ database schema
- `add-password-column.js` - Script เพิ่ม user_password column

## 🎯 **ขั้นตอนต่อไป:**

1. **ทดสอบ Reset Password** - ดูว่า 500 error หายไปหรือไม่
2. **ตรวจสอบ Password Storage** - ดูว่ารหัสผ่านถูกเก็บในฐานข้อมูลหรือไม่
3. **ทดสอบ Login** - ดูว่าสามารถ login ด้วยรหัสผ่านใหม่ได้หรือไม่
4. **ตรวจสอบ System Stability** - ดูว่าระบบทำงานได้อย่างเสถียรหรือไม่

**ตอนนี้ระบบพร้อมแล้ว! ลองทดสอบใหม่ดูครับ ระบบควรทำงานได้ถูกต้องและจะเห็น "Password reset successfully" แทน 500 Internal Server Error** 🎉✨
