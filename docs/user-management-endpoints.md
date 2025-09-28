# 👤 User Management Endpoints

## 🔧 **Endpoints สำหรับแก้ไขข้อมูลผู้ใช้**

### **1. แก้ไขข้อมูลผู้ใช้ (Profile Update)**
```
PUT /api/users/:id
```

**Request Body:**
```json
{
  "user_name": "new_username",
  "user_phone": "081-234-5678",
  "user_email": "newemail@example.com"
}
```

**Response:**
```json
{
  "message": "User updated successfully",
  "user": {
    "userid": 7,
    "user_name": "new_username",
    "user_email": "newemail@example.com",
    "user_phone": "081-234-5678",
    "role": "user",
    "firebase_uid": "Q1rUo1J8oigi6JSQaItd3C09iwh1",
    "created_at": "2025-01-23T10:00:00.000Z",
    "updated_at": "2025-01-23T13:30:00.000Z"
  }
}
```

**Permissions:**
- **User:** แก้ไขได้เฉพาะข้อมูลของตัวเอง
- **Admin:** แก้ไขได้ข้อมูลของทุกคน

### **2. แก้ไขรหัสผ่าน (Change Password)**
```
PUT /api/users/:id/password
```

**Request Body:**
```json
{
  "currentPassword": "old_password",
  "newPassword": "new_password"
}
```

**Response:**
```json
{
  "message": "Password changed successfully"
}
```

**Permissions:**
- **User:** เปลี่ยนรหัสผ่านของตัวเองได้ (ต้องใส่รหัสผ่านเก่า)
- **Admin:** เปลี่ยนรหัสผ่านของทุกคนได้ (ไม่ต้องใส่รหัสผ่านเก่า)

### **3. เปลี่ยน Role (Admin Only)**
```
PUT /api/users/:id/role
```

**Request Body:**
```json
{
  "role": "admin"
}
```

**Response:**
```json
{
  "message": "User role updated successfully",
  "user": {
    "userid": 7,
    "user_name": "username",
    "user_email": "email@example.com",
    "role": "admin"
  }
}
```

**Permissions:**
- **Admin Only:** เฉพาะ admin เท่านั้นที่เปลี่ยน role ได้

## 🔍 **Endpoints สำหรับดูข้อมูลผู้ใช้**

### **1. ดูข้อมูลผู้ใช้ทั้งหมด (Admin) หรือข้อมูลตัวเอง (User)**
```
GET /api/users
```

**Response (Admin):**
```json
{
  "users": [
    {
      "userid": 7,
      "user_name": "username",
      "user_email": "email@example.com",
      "user_phone": "081-234-5678",
      "role": "user",
      "firebase_uid": "Q1rUo1J8oigi6JSQaItd3C09iwh1",
      "created_at": "2025-01-23T10:00:00.000Z",
      "updated_at": "2025-01-23T13:30:00.000Z"
    }
  ]
}
```

**Response (User):**
```json
{
  "user": {
    "userid": 7,
    "user_name": "username",
    "user_email": "email@example.com",
    "user_phone": "081-234-5678",
    "role": "user",
    "firebase_uid": "Q1rUo1J8oigi6JSQaItd3C09iwh1",
    "created_at": "2025-01-23T10:00:00.000Z",
    "updated_at": "2025-01-23T13:30:00.000Z"
  }
}
```

### **2. ดูข้อมูลผู้ใช้ทั้งหมด (Admin Only)**
```
GET /api/users/all
```

### **3. ดูข้อมูลผู้ใช้เฉพาะ (Admin)**
```
GET /api/users/:id
```

### **4. ดูข้อมูลตัวเอง (Alias)**
```
GET /api/users/profile
GET /api/users/me
```

## 🛡️ **Security Features**

### **1. Authentication Required**
- ทุก endpoint ต้องมี JWT token
- ใช้ `authMiddleware` ตรวจสอบ

### **2. Authorization**
- **User:** แก้ไขได้เฉพาะข้อมูลของตัวเอง
- **Admin:** แก้ไขได้ข้อมูลของทุกคน

### **3. Validation**
- **Username:** ตรวจสอบไม่ซ้ำ
- **Email:** ตรวจสอบไม่ซ้ำ
- **Password:** อย่างน้อย 6 ตัวอักษร
- **Current Password:** ตรวจสอบรหัสผ่านเก่า

### **4. Error Handling**
- **400:** Bad Request (ข้อมูลไม่ครบ)
- **401:** Unauthorized (รหัสผ่านผิด)
- **403:** Forbidden (ไม่มีสิทธิ์)
- **404:** Not Found (ไม่พบผู้ใช้)
- **409:** Conflict (ข้อมูลซ้ำ)
- **500:** Internal Server Error

## 📋 **ตัวอย่างการใช้งาน**

### **1. User แก้ไขข้อมูลตัวเอง:**
```bash
curl -X PUT http://localhost:3000/api/users/7 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "user_name": "new_username",
    "user_phone": "081-234-5678"
  }'
```

### **2. User เปลี่ยนรหัสผ่าน:**
```bash
curl -X PUT http://localhost:3000/api/users/7/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "currentPassword": "old_password",
    "newPassword": "new_password"
  }'
```

### **3. Admin แก้ไขข้อมูลผู้ใช้คนอื่น:**
```bash
curl -X PUT http://localhost:3000/api/users/7 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "user_name": "admin_updated_username",
    "user_email": "newemail@example.com"
  }'
```

### **4. Admin เปลี่ยนรหัสผ่านผู้ใช้คนอื่น:**
```bash
curl -X PUT http://localhost:3000/api/users/7/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN" \
  -d '{
    "newPassword": "admin_set_password"
  }'
```

## 🎯 **Console Logs**

### **Update User:**
```
👤 Update user request: {id: '7', user_name: 'new_username', user_phone: '081-234-5678', requester: 7, role: 'user'}
✅ User updated successfully: {userid: 7, user_name: 'new_username', ...}
```

### **Change Password:**
```
🔐 Change password request: {id: '7', requester: 7, role: 'user'}
✅ Password changed successfully for user: new_username
```

## 📚 **เอกสารที่สร้าง:**
- `docs/user-management-endpoints.md` - User Management Endpoints

**ตอนนี้ระบบพร้อมแล้ว! มี endpoints ครบถ้วนสำหรับแก้ไขข้อมูลผู้ใช้ทั้ง admin และ user** 🔧✨
