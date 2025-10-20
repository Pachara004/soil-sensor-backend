# 🔧 OTP Auto-Next Step Fix

## ✅ **การแก้ไขให้เด้งไป step ถัดไปเมื่อส่ง OTP เสร็จสมบูรณ์แล้ว!**

### **🎯 วัตถุประสงค์:**
- เมื่อกดปุ่ม "ส่ง OTP" แล้วให้เด้งไปที่ step ถัดไปเพื่อกรอก OTP เลย
- Frontend สามารถใช้ `nextStep: 'verify-otp'` เพื่อเปลี่ยน step อัตโนมัติ

---

## 🔧 **การแก้ไข:**

### **1. ปรับปรุง API Response:**

#### **ไฟล์:** `api/auth.js`
```javascript
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    console.log(`📧 Sending OTP to: ${email}`);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const ttlMs = 5 * 60 * 1000; // 5 นาที
    const siteName = process.env.SITE_NAME || 'Soil Sensor';
    const ref = Math.floor(100000 + Math.random() * 900000).toString();

    // เก็บ OTP ชั่วคราวในหน่วยความจำ พร้อมรีเซ็ตตัวจับเวลาเมื่อขอใหม่
    global.otpStore = global.otpStore || {};
    const previous = global.otpStore[email];
    if (previous && previous.timeout) {
      clearTimeout(previous.timeout);
    }
    const timeout = setTimeout(() => {
      delete global.otpStore[email];
    }, ttlMs);
    global.otpStore[email] = { code: otp, expiresAt: Date.now() + ttlMs, timeout, ref };

    const subject = `${siteName} - OTP สำหรับยืนยันอีเมล`;
    const body = `รหัส OTP ของคุณคือ: ${otp}\n\nใช้ได้ภายใน 5 นาที\nจากระบบ ${siteName}\n\nหมายเลขอ้างอิง: ${ref}`;
    await sendEmail(email, subject, body);

    console.log(`✅ OTP sent to ${email}: ${otp} (ref: ${ref})`);

    res.json({ 
      success: true,
      message: 'OTP sent successfully',
      email: email,
      ref: ref,
      expiresIn: 300, // 5 minutes in seconds
      nextStep: 'verify-otp' // บอก frontend ให้ไป step ถัดไป
    });
  } catch (err) {
    console.error('❌ Error sending OTP:', err);
    res.status(500).json({ 
      success: false,
      message: 'เกิดข้อผิดพลาดในการส่ง OTP',
      error: err.message 
    });
  }
});
```

---

## 📊 **API Response ที่ปรับปรุง:**

### **Send OTP Endpoint:**
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "email": "mrtgamer76@gmail.com"
}
```

### **Response (ใหม่):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "email": "mrtgamer76@gmail.com",
  "ref": "404883",
  "expiresIn": 300,
  "nextStep": "verify-otp"
}
```

### **Response Fields:**
- **`success`** - boolean - บอกว่าสำเร็จหรือไม่
- **`message`** - string - ข้อความแจ้งเตือน
- **`email`** - string - อีเมลที่ส่ง OTP ไป
- **`ref`** - string - หมายเลขอ้างอิง
- **`expiresIn`** - number - หมดอายุในกี่วินาที (300 = 5 นาที)
- **`nextStep`** - string - บอก frontend ให้ไป step ไหน ('verify-otp')

---

## 🧪 **การทดสอบ:**

### **Test Case: Send OTP**
```bash
curl -v -X POST "http://localhost:3000/api/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"email": "mrtgamer76@gmail.com"}'
```

### **ผลลัพธ์:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "email": "mrtgamer76@gmail.com",
  "ref": "404883",
  "expiresIn": 300,
  "nextStep": "verify-otp"
}
```

### **HTTP Response:**
```
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Length: 136
{"success":true,"message":"OTP sent successfully","email":"mrtgamer76@gmail.com","ref":"404883","expiresIn":300,"nextStep":"verify-otp"}
```

---

## 🎯 **การใช้งานใน Frontend:**

### **Angular Component Example:**
```typescript
async sendOTP() {
  try {
    const response = await this.http.post<any>('/api/auth/send-otp', {
      email: this.email
    }).toPromise();

    if (response.success) {
      // ✅ OTP ส่งสำเร็จ
      console.log('✅ OTP sent:', response.message);
      console.log('📧 Email:', response.email);
      console.log('🔢 Reference:', response.ref);
      console.log('⏰ Expires in:', response.expiresIn, 'seconds');
      
      // 🎯 เด้งไป step ถัดไป
      if (response.nextStep === 'verify-otp') {
        this.currentStep = 2; // ไป step 2 (กรอก OTP)
        this.showOTPInput = true;
      }
      
      // แสดงข้อความสำเร็จ
      this.showSuccessMessage('OTP ส่งไปยังอีเมลของคุณแล้ว');
      
    } else {
      // ❌ OTP ส่งไม่สำเร็จ
      console.error('❌ OTP send failed:', response.message);
      this.showErrorMessage(response.message);
    }
  } catch (error) {
    console.error('❌ Error sending OTP:', error);
    this.showErrorMessage('เกิดข้อผิดพลาดในการส่ง OTP');
  }
}
```

---

## 🎨 **UI Flow ที่คาดหวัง:**

### **Step 1: กรอกอีเมล**
```
┌─────────────────────────┐
│ ใส่อีเมลของคุณ           │
│ [mrtgamer76@gmail.com]  │
│ [ส่ง OTP]               │
└─────────────────────────┘
```

### **Step 2: กรอก OTP (เด้งไปอัตโนมัติ)**
```
┌─────────────────────────┐
│ ยืนยันรหัส OTP          │
│ [123456]                │
│ [ยืนยัน]                │
│ ⏰ หมดอายุใน 4:59       │
└─────────────────────────┘
```

---

## 📋 **Checklist การแก้ไข:**

- [x] **เพิ่ม success field** - บอกว่าสำเร็จหรือไม่
- [x] **เพิ่ม nextStep field** - บอก frontend ให้ไป step ไหน
- [x] **เพิ่ม expiresIn field** - บอกหมดอายุในกี่วินาที
- [x] **เพิ่ม error handling** - จัดการ error ได้ดี
- [x] **เพิ่ม logging** - console.log สำหรับ debugging
- [x] **ทดสอบ API** - curl test สำเร็จ
- [x] **Response format** - ส่งข้อมูลครบถ้วน

---

## 🎉 **สรุป:**

**การแก้ไขให้เด้งไป step ถัดไปเมื่อส่ง OTP เสร็จสมบูรณ์!**

**ตอนนี้ระบบจะ:**
- ✅ **ส่ง OTP สำเร็จ** - API ส่ง response ที่ครบถ้วน
- ✅ **บอก step ถัดไป** - `nextStep: 'verify-otp'`
- ✅ **บอกหมดอายุ** - `expiresIn: 300` (5 นาที)
- ✅ **Frontend เด้งได้** - ใช้ `nextStep` เพื่อเปลี่ยน step
- ✅ **UX ดีขึ้น** - ไม่ต้องกดปุ่มเพิ่ม

**🎯 Frontend สามารถใช้ `response.nextStep` เพื่อเด้งไป step ถัดไปอัตโนมัติ!** 🚀

**ตอนนี้ผู้ใช้จะได้ประสบการณ์ที่ดีขึ้น - กดส่ง OTP แล้วเด้งไปกรอก OTP เลย!** ✨
