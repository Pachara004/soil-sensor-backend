# 📝 Report with Images Integration

## 🔧 **การแก้ไข Report API ให้รองรับการสร้างภาพ**

### **1. แก้ไข POST /api/reports (Create Report)**

#### **Request Body:**
```json
{
  "title": "ปัญหาดินเสื่อมโทรม",
  "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
  "images": [
    "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg",
    "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
  ]
}
```

#### **Response:**
```json
{
  "message": "Report sent successfully",
  "report": {
    "reportid": 5,
    "title": "ปัญหาดินเสื่อมโทรม",
    "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
    "type": "general",
    "priority": "medium",
    "status": "open",
    "userid": 7,
    "created_at": "2025-09-28T03:01:58.999Z",
    "updated_at": "2025-09-28T03:01:58.999Z"
  },
  "images": [
    {
      "imageid": 2,
      "reportid": 5,
      "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg"
    },
    {
      "imageid": 3,
      "reportid": 5,
      "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
    }
  ]
}
```

### **2. แก้ไข GET /api/reports (Admin - All Reports)**

#### **Response:**
```json
{
  "reports": [
    {
      "reportid": 5,
      "title": "ปัญหาดินเสื่อมโทรม",
      "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
      "type": "general",
      "priority": "medium",
      "status": "open",
      "userid": 7,
      "user_name": "pachararar_updated",
      "user_email": "mrtgamer76@gmail.com",
      "created_at": "2025-09-28T03:01:58.999Z",
      "updated_at": "2025-09-28T03:01:58.999Z",
      "images": [
        {
          "imageid": 2,
          "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg"
        },
        {
          "imageid": 3,
          "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
        }
      ]
    }
  ]
}
```

### **3. แก้ไข GET /api/reports/my (User - My Reports)**

#### **Response:**
```json
{
  "reports": [
    {
      "reportid": 5,
      "title": "ปัญหาดินเสื่อมโทรม",
      "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
      "type": "general",
      "priority": "medium",
      "status": "open",
      "userid": 7,
      "created_at": "2025-09-28T03:01:58.999Z",
      "updated_at": "2025-09-28T03:01:58.999Z",
      "images": [
        {
          "imageid": 2,
          "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg"
        },
        {
          "imageid": 3,
          "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
        }
      ]
    }
  ]
}
```

### **4. เพิ่ม GET /api/reports/:id (Single Report with Images)**

#### **Response:**
```json
{
  "report": {
    "reportid": 5,
    "title": "ปัญหาดินเสื่อมโทรม",
    "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
    "type": "general",
    "priority": "medium",
    "status": "open",
    "userid": 7,
    "user_name": "pachararar_updated",
    "user_email": "mrtgamer76@gmail.com",
    "created_at": "2025-09-28T03:01:58.999Z",
    "updated_at": "2025-09-28T03:01:58.999Z",
    "images": [
      {
        "imageid": 2,
        "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg"
      },
      {
        "imageid": 3,
        "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
      }
    ]
  }
}
```

## 🔄 **การทำงานของระบบ**

### **1. เมื่อสร้าง Report:**
```
1. เริ่ม Transaction
2. สร้าง Report ในตาราง reports
3. ตรวจสอบ images array
4. สร้าง Image records ในตาราง image (ถ้ามี)
5. Commit Transaction
6. ส่ง Response พร้อม Report และ Images
```

### **2. เมื่อดู Report:**
```
1. ดึงข้อมูล Report จากตาราง reports
2. ดึงข้อมูล Images จากตาราง image ตาม reportid
3. รวมข้อมูล Report และ Images
4. ส่ง Response พร้อมข้อมูลครบถ้วน
```

## 🛡️ **Security Features**

### **1. Transaction Management**
- ใช้ Database Transaction เพื่อความปลอดภัย
- ถ้าเกิด error จะ Rollback ทั้งหมด
- ใช้ Connection Pool อย่างถูกต้อง

### **2. Authorization**
- **User:** ดูได้เฉพาะ report ของตัวเอง
- **Admin:** ดูได้ทุก report

### **3. Validation**
- **Image URL:** ตรวจสอบ format (http:// หรือ https://)
- **Required Fields:** ตรวจสอบ title และ description
- **Array Validation:** ตรวจสอบ images เป็น array

## 📋 **ตัวอย่างการใช้งาน**

### **1. สร้าง Report พร้อมภาพ:**
```bash
curl -X POST http://localhost:3000/api/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "ปัญหาดินเสื่อมโทรม",
    "description": "พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม",
    "images": [
      "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil1.jpg",
      "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fsoil2.jpg"
    ]
  }'
```

### **2. ดู Report พร้อมภาพ:**
```bash
curl -X GET http://localhost:3000/api/reports/5 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **3. ดู Report ของตัวเอง:**
```bash
curl -X GET http://localhost:3000/api/reports/my \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🎯 **Console Logs**

### **Create Report:**
```
📝 Create report request: {title: 'ปัญหาดินเสื่อมโทรม', description: 'พบปัญหาดินเสื่อมโทรมในพื้นที่เกษตรกรรม', images: [...], requester: 7, role: 'user'}
✅ Report created successfully: {reportid: 5, title: 'ปัญหาดินเสื่อมโทรม'}
📷 Creating images for report: 5
✅ Image created: {imageid: 2, imageUrl: 'https://...'}
✅ Image created: {imageid: 3, imageUrl: 'https://...'}
```

## 🔗 **Integration with Image API**

### **1. เมื่อสร้าง Report:**
- ใช้ Image API เพื่อสร้างภาพในตาราง image
- เชื่อมโยงภาพกับ report ผ่าน reportid

### **2. เมื่อดู Report:**
- ใช้ Image API เพื่อดึงภาพตาม reportid
- รวมข้อมูล Report และ Images

### **3. เมื่อลบ Report:**
- ใช้ CASCADE DELETE เพื่อลบภาพทั้งหมดใน report นั้น

## 📚 **เอกสารที่สร้าง:**
- `docs/report-with-images-integration.md` - Report with Images Integration

**ตอนนี้ระบบพร้อมแล้ว! เมื่อ user สร้าง report แล้วจะสร้างข้อมูลใน table image ด้วย และสามารถเช็คตาม reportid ได้** 📝📷✨
