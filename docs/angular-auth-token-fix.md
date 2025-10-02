# 🔧 Angular Auth Token Fix

## 🚨 **ปัญหาที่พบ:**

### **Error Messages:**
```
GET http://localhost:3000/api/auth/me 401 (Unauthorized)
GET http://localhost:3000/api/user/profile 403 (Forbidden)
GET http://localhost:3000/api/admin/devices 403 (Forbidden)
GET http://localhost:3000/api/users/regular 403 (Forbidden)
GET http://localhost:3000/api/reports 403 (Forbidden)
```

### **สาเหตุ:**
1. **Firebase Token Issues:** Angular ส่ง Firebase token ที่หมดอายุหรือไม่ถูกต้อง
2. **Auth Middleware Problems:** Middleware ไม่สามารถ verify Firebase token ได้
3. **Token Format Issues:** Token อาจไม่ได้ format ถูกต้อง
4. **User Role Issues:** User อาจไม่มี role ที่เหมาะสมสำหรับ admin endpoints

## 🔧 **การแก้ไข:**

### **1. เพิ่ม Debug Logging ใน Auth Middleware:**

#### **Firebase Token Verification:**
```javascript
try {
  // Try to verify as Firebase ID token first
  decoded = await admin.auth().verifyIdToken(token);
  firebaseUid = decoded.uid;
  email = decoded.email || null;
  name = decoded.name || (email ? email.split('@')[0] : 'user');
  console.log('✅ Firebase token verified successfully:', { uid: firebaseUid, email });
} catch (firebaseError) {
  console.warn('⚠️ Firebase token verification failed:', firebaseError.message);
  // ... JWT fallback
}
```

#### **JWT Token Verification:**
```javascript
try {
  decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  firebaseUid = null; // JWT doesn't have Firebase UID
  email = decoded.email || null;
  name = decoded.user_name || decoded.username || (email ? email.split('@')[0] : 'user');
  console.log('✅ JWT token verified successfully:', { userid: decoded.userid, email });
} catch (jwtError) {
  console.error('JWT verification failed:', jwtError.message);
  // ... error handling
}
```

#### **User Authentication Success:**
```javascript
console.log('✅ User authenticated:', { 
  userid: req.user.userid, 
  email: req.user.email, 
  role: req.user.role 
});
```

### **2. เพิ่ม Debug Endpoint:**

#### **Token Debug Endpoint:**
```javascript
// Debug endpoint to check token
router.post('/debug-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    let result = { token: token.substring(0, 50) + '...' };

    // Try Firebase verification
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      result.firebase = {
        success: true,
        uid: decoded.uid,
        email: decoded.email,
        exp: new Date(decoded.exp * 1000).toISOString()
      };
    } catch (firebaseError) {
      result.firebase = {
        success: false,
        error: firebaseError.message
      };
    }

    // Try JWT verification
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      result.jwt = {
        success: true,
        userid: decoded.userid,
        email: decoded.email,
        exp: new Date(decoded.exp * 1000).toISOString()
      };
    } catch (jwtError) {
      result.jwt = {
        success: false,
        error: jwtError.message
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});
```

## 🧪 **การ Debug:**

### **1. ตรวจสอบ Firebase Connection:**
```bash
curl -X GET http://localhost:3000/health
# Expected: {"status":"OK","firebase":"connected",...}
```

### **2. ทดสอบ Token Debug:**
```bash
curl -X POST http://localhost:3000/api/auth/debug-token \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_FIREBASE_TOKEN_HERE"}'
```

### **3. ตรวจสอบ Server Logs:**
```
✅ Firebase token verified successfully: { uid: 'Q1rUo1J8oigi6JSQaItd3C09iwh1', email: 'mrtgamer76@gmail.com' }
✅ User authenticated: { userid: 7, email: 'mrtgamer76@gmail.com', role: 'user' }
```

## 📊 **การวิเคราะห์ปัญหา:**

### **จาก Log ที่ได้:**
```
main.component.ts:87 🔑 User UID: Q1rUo1J8oigi6JSQaItd3C09iwh1
main.component.ts:156 📧 User email from PostgreSQL: mrtgamer76@gmail.com
main.component.ts:160 🆔 User ID from PostgreSQL: 7
```

### **ปัญหาที่เป็นไปได้:**

#### **1. Token Expiration:**
- Firebase token หมดอายุ
- Angular ไม่ได้ refresh token
- Token ไม่ได้ส่งมาถูกต้อง

#### **2. Role Permission:**
- User มี role = 'user' แต่พยายามเข้า admin endpoints
- Admin endpoints ต้องการ role = 'admin'

#### **3. Token Format:**
- Token ไม่ได้ส่งใน Authorization header
- Token format ไม่ถูกต้อง (ไม่มี 'Bearer ' prefix)

## ✅ **วิธีแก้ไขปัญหา:**

### **1. สำหรับ Frontend (Angular):**

#### **ตรวจสอบ Token Refresh:**
```typescript
// ใน Angular service
async getValidToken(): Promise<string> {
  const user = await this.afAuth.currentUser;
  if (user) {
    const token = await user.getIdToken(true); // force refresh
    return token;
  }
  throw new Error('No authenticated user');
}
```

#### **ตรวจสอบ HTTP Headers:**
```typescript
// ใน HTTP interceptor
const token = await this.authService.getValidToken();
const authReq = req.clone({
  headers: req.headers.set('Authorization', `Bearer ${token}`)
});
```

### **2. สำหรับ Backend:**

#### **ปรับปรุง Error Messages:**
```javascript
// ใน auth middleware
if (!token) {
  return res.status(401).json({ 
    message: 'No token provided',
    error: 'MISSING_TOKEN'
  });
}

// สำหรับ admin endpoints
if (req.user.role !== 'admin') {
  return res.status(403).json({ 
    message: 'Admin access required',
    error: 'INSUFFICIENT_PERMISSIONS',
    userRole: req.user.role
  });
}
```

### **3. ตรวจสอบ User Role:**

#### **Query User Role:**
```sql
SELECT userid, user_name, user_email, role 
FROM users 
WHERE user_email = 'mrtgamer76@gmail.com';
```

#### **Update User Role (หากจำเป็น):**
```sql
UPDATE users 
SET role = 'admin' 
WHERE user_email = 'mrtgamer76@gmail.com';
```

## 🔐 **Security Considerations:**

### **1. Token Validation:**
- ตรวจสอบ token expiration
- Verify token signature
- Check token issuer

### **2. Role-based Access:**
- ตรวจสอบ user role ก่อนอนุญาตเข้าถึง
- Log access attempts
- Rate limiting

### **3. Error Handling:**
- ไม่เปิดเผยข้อมูลส่วนตัวใน error messages
- Log security events
- Monitor failed authentication attempts

## 📚 **ไฟล์ที่แก้ไข:**

### **Backend:**
- `middleware/auth.js` - เพิ่ม debug logging
- `api/auth.js` - เพิ่ม debug endpoint

### **เอกสาร:**
- `docs/angular-auth-token-fix.md` - เอกสารสรุปการแก้ไข

## 🎯 **ขั้นตอนการ Debug:**

### **1. ตรวจสอบ Server Logs:**
```bash
# ดู logs ใน terminal ที่รัน server
# มองหา debug messages จาก auth middleware
```

### **2. ทดสอบ Token:**
```bash
# ใช้ debug endpoint ทดสอบ token
curl -X POST http://localhost:3000/api/auth/debug-token \
  -H "Content-Type: application/json" \
  -d '{"token": "ACTUAL_TOKEN_FROM_ANGULAR"}'
```

### **3. ตรวจสอบ User Role:**
```bash
# ตรวจสอบ role ของ user
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer VALID_TOKEN"
```

### **4. อัปเดต User Role (หากจำเป็น):**
```sql
-- หาก user ต้องการ admin access
UPDATE users SET role = 'admin' WHERE userid = 7;
```

## 🎉 **สรุป:**

**✅ เพิ่ม Debug Tools สำหรับ Auth Token แล้ว!**

### **🔧 สิ่งที่เพิ่ม:**
- Debug logging ใน auth middleware ✅
- Token debug endpoint ✅
- Error handling ที่ดีขึ้น ✅
- การวิเคราะห์ปัญหา ✅

### **📊 ประโยชน์:**
- ง่ายต่อการ debug token issues ✅
- เข้าใจปัญหา authentication ได้ชัดเจน ✅
- ตรวจสอบ user role ได้ ✅
- Monitor security events ได้ ✅

### **🎯 ขั้นตอนต่อไป:**
1. ตรวจสอบ server logs เมื่อ Angular ส่ง request
2. ใช้ debug endpoint ทดสอบ token
3. ตรวจสอบ user role และอัปเดตหากจำเป็น
4. แก้ไข Angular token refresh mechanism

**🎉 ระบบ Debug ที่ครบถ้วนสำหรับ Auth Token!** 🚀✨

**ตอนนี้สามารถวิเคราะห์และแก้ไขปัญหา Authentication ได้อย่างมีประสิทธิภาพ!** 🔐🔍
