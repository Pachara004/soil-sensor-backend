# 🗑️ Report Delete Endpoint

## 🔧 **DELETE /api/reports/:id (Admin Only)**

### **Endpoint:**
```
DELETE /api/reports/:id
```

### **Authorization:**
- **Admin Only:** เฉพาะ admin เท่านั้นที่ลบ report ได้
- **Authentication:** ต้องมี JWT token หรือ Firebase ID token

### **Request:**
```bash
curl -X DELETE http://localhost:3000/api/reports/5 \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### **Response (Success):**
```json
{
  "message": "Report deleted successfully",
  "deletedReport": {
    "reportid": 5,
    "title": "ปัญหาดินเสื่อมโทรม",
    "userid": 7
  }
}
```

### **Response (Error - Not Admin):**
```json
{
  "message": "Access denied. Admin role required."
}
```

### **Response (Error - Report Not Found):**
```json
{
  "message": "Report not found"
}
```

## 🛡️ **Security Features**

### **1. Authorization Check:**
```javascript
if (req.user.role !== 'admin') {
  return res.status(403).json({ message: 'Access denied. Admin role required.' });
}
```

### **2. Report Existence Check:**
```javascript
const { rows: reportRows } = await pool.query(
  'SELECT reportid, title, userid FROM reports WHERE reportid = $1',
  [id]
);

if (reportRows.length === 0) {
  return res.status(404).json({ message: 'Report not found' });
}
```

### **3. CASCADE DELETE:**
- เมื่อลบ report จะลบภาพทั้งหมดใน report นั้นด้วย (CASCADE DELETE)
- ไม่ต้องลบภาพแยกต่างหาก

## 🎯 **Console Logs**

### **Delete Report:**
```
🗑️ Delete report request: {id: '5', requester: 22, role: 'admin'}
✅ Report deleted successfully: {reportid: 5, title: 'ปัญหาดินเสื่อมโทรม', userid: 7}
```

## 📋 **ตัวอย่างการใช้งาน**

### **1. Admin ลบ Report:**
```bash
curl -X DELETE http://localhost:3000/api/reports/5 \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### **2. User พยายามลบ Report (จะได้ 403):**
```bash
curl -X DELETE http://localhost:3000/api/reports/5 \
  -H "Authorization: Bearer USER_JWT_TOKEN"
```

### **3. ลบ Report ที่ไม่มีอยู่ (จะได้ 404):**
```bash
curl -X DELETE http://localhost:3000/api/reports/999 \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

## 🔄 **การทำงานของระบบ**

### **1. เมื่อลบ Report:**
```
1. ตรวจสอบ Authorization (ต้องเป็น admin)
2. ตรวจสอบว่า Report มีอยู่จริง
3. ลบ Report จากตาราง reports
4. ภาพทั้งหมดใน Report จะถูกลบอัตโนมัติ (CASCADE DELETE)
5. ส่ง Response พร้อมข้อมูล Report ที่ถูกลบ
```

### **2. CASCADE DELETE:**
```sql
-- เมื่อลบ report จะลบภาพทั้งหมดใน report นั้นด้วย
DELETE FROM reports WHERE reportid = $1;
-- ภาพในตาราง image จะถูกลบอัตโนมัติเนื่องจาก CASCADE DELETE
```

## 🚨 **Error Handling**

### **1. 403 Forbidden:**
- User ไม่ใช่ admin
- ไม่มีสิทธิ์ลบ report

### **2. 404 Not Found:**
- Report ไม่มีอยู่จริง
- Report ID ไม่ถูกต้อง

### **3. 500 Internal Server Error:**
- Database error
- Server error

## 📚 **เอกสารที่สร้าง:**
- `docs/report-delete-endpoint.md` - Report Delete Endpoint

## 🎉 **สรุป**

**ตอนนี้มีเส้นลบ report สำหรับ admin แล้ว!**

### **✅ ฟีเจอร์ที่เพิ่ม:**
- **DELETE /api/reports/:id** - ลบ report (Admin Only)
- **Authorization Check** - ตรวจสอบสิทธิ์ admin
- **Report Existence Check** - ตรวจสอบว่า report มีอยู่จริง
- **CASCADE DELETE** - ลบภาพทั้งหมดใน report อัตโนมัติ
- **Console Logs** - ดูการทำงานได้ชัดเจน
- **Error Handling** - จัดการ error ได้ดี

### **🔧 การทดสอบที่ผ่าน:**
1. **✅ User ลบ Report** - ได้ 403 Forbidden
2. **✅ Admin ลบ Report** - สำเร็จ
3. **✅ ลบ Report ที่ไม่มี** - ได้ 404 Not Found

**ตอนนี้ระบบมี CRUD operations ครบถ้วนสำหรับ Report แล้ว!** 📝🗑️✨
