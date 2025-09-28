# 📷 Image Management Endpoints

## 🔧 **Endpoints สำหรับจัดการภาพจาก Firebase Storage**

### **1. ดูภาพทั้งหมด (Admin Only)**
```
GET /api/images
```

**Response:**
```json
{
  "images": [
    {
      "imageid": 1,
      "reportid": 5,
      "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg",
      "report_title": "ปัญหาดินเสื่อมโทรม",
      "report_description": "พบปัญหาดินเสื่อมโทรมในพื้นที่",
      "report_status": "pending",
      "report_created_at": "2025-01-23T10:00:00.000Z"
    }
  ]
}
```

**Permissions:**
- **Admin Only:** เฉพาะ admin เท่านั้นที่ดูภาพทั้งหมดได้

### **2. ดูภาพตาม Report ID**
```
GET /api/images/report/:reportid
```

**Response:**
```json
{
  "images": [
    {
      "imageid": 1,
      "reportid": 5,
      "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg"
    },
    {
      "imageid": 2,
      "reportid": 5,
      "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage2.jpg"
    }
  ]
}
```

**Permissions:**
- **User:** ดูได้เฉพาะภาพของ report ที่เป็นของตัวเอง
- **Admin:** ดูได้ภาพของทุก report

### **3. ดูภาพเฉพาะ (Single Image)**
```
GET /api/images/:id
```

**Response:**
```json
{
  "image": {
    "imageid": 1,
    "reportid": 5,
    "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg",
    "report_title": "ปัญหาดินเสื่อมโทรม",
    "report_userid": 7
  }
}
```

**Permissions:**
- **User:** ดูได้เฉพาะภาพของ report ที่เป็นของตัวเอง
- **Admin:** ดูได้ภาพของทุก report

### **4. เพิ่มภาพใหม่**
```
POST /api/images
```

**Request Body:**
```json
{
  "reportid": 5,
  "imageUrl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg"
}
```

**Response:**
```json
{
  "message": "Image added successfully",
  "image": {
    "imageid": 1,
    "reportid": 5,
    "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg"
  }
}
```

**Permissions:**
- **User:** เพิ่มได้เฉพาะใน report ที่เป็นของตัวเอง
- **Admin:** เพิ่มได้ในทุก report

### **5. แก้ไข URL ภาพ**
```
PUT /api/images/:id
```

**Request Body:**
```json
{
  "imageUrl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fnew_image.jpg"
}
```

**Response:**
```json
{
  "message": "Image updated successfully",
  "image": {
    "imageid": 1,
    "reportid": 5,
    "imageurl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fnew_image.jpg"
  }
}
```

**Permissions:**
- **User:** แก้ไขได้เฉพาะภาพของ report ที่เป็นของตัวเอง
- **Admin:** แก้ไขได้ภาพของทุก report

### **6. ลบภาพ**
```
DELETE /api/images/:id
```

**Response:**
```json
{
  "message": "Image deleted successfully"
}
```

**Permissions:**
- **User:** ลบได้เฉพาะภาพของ report ที่เป็นของตัวเอง
- **Admin:** ลบได้ภาพของทุก report

### **7. สถิติภาพ (Admin Only)**
```
GET /api/images/stats/overview
```

**Response:**
```json
{
  "stats": {
    "total_images": 25,
    "reports_with_images": 15,
    "pending_images": 10,
    "approved_images": 12,
    "rejected_images": 3
  }
}
```

**Permissions:**
- **Admin Only:** เฉพาะ admin เท่านั้นที่ดูสถิติได้

## 🛡️ **Security Features**

### **1. Authentication Required**
- ทุก endpoint ต้องมี JWT token หรือ Firebase ID token
- ใช้ `authMiddleware` ตรวจสอบ

### **2. Authorization**
- **User:** จัดการได้เฉพาะภาพของ report ที่เป็นของตัวเอง
- **Admin:** จัดการได้ภาพของทุก report

### **3. Validation**
- **Image URL:** ตรวจสอบ format (ต้องขึ้นต้นด้วย http:// หรือ https://)
- **Report ID:** ตรวจสอบว่า report มีอยู่จริง
- **Required Fields:** ตรวจสอบข้อมูลที่จำเป็น

### **4. Error Handling**
- **400:** Bad Request (ข้อมูลไม่ครบหรือ format ผิด)
- **403:** Forbidden (ไม่มีสิทธิ์)
- **404:** Not Found (ไม่พบภาพหรือ report)
- **500:** Internal Server Error

## 📋 **ตัวอย่างการใช้งาน**

### **1. User เพิ่มภาพใน report ของตัวเอง:**
```bash
curl -X POST http://localhost:3000/api/images \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "reportid": 5,
    "imageUrl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fimage1.jpg"
  }'
```

### **2. User ดูภาพใน report ของตัวเอง:**
```bash
curl -X GET http://localhost:3000/api/images/report/5 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### **3. Admin ดูภาพทั้งหมด:**
```bash
curl -X GET http://localhost:3000/api/images \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### **4. Admin ดูสถิติภาพ:**
```bash
curl -X GET http://localhost:3000/api/images/stats/overview \
  -H "Authorization: Bearer ADMIN_JWT_TOKEN"
```

### **5. User แก้ไข URL ภาพ:**
```bash
curl -X PUT http://localhost:3000/api/images/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "imageUrl": "https://firebasestorage.googleapis.com/v0/b/project/o/images%2Fupdated_image.jpg"
  }'
```

### **6. User ลบภาพ:**
```bash
curl -X DELETE http://localhost:3000/api/images/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 🎯 **Console Logs**

### **Add Image:**
```
📷 Add image request: {reportid: 5, imageUrl: 'https://...', requester: 7, role: 'user'}
✅ Image added successfully: {imageid: 1, reportid: 5, imageurl: 'https://...'}
```

### **Update Image:**
```
📷 Update image request: {id: '1', imageUrl: 'https://...', requester: 7, role: 'user'}
✅ Image updated successfully: {imageid: 1, reportid: 5, imageurl: 'https://...'}
```

### **Delete Image:**
```
🗑️ Delete image request: {id: '1', requester: 7, role: 'user'}
✅ Image deleted successfully: {imageid: 1, reportid: 5}
```

## 🗄️ **Database Schema**

### **Table: image**
```sql
CREATE TABLE image (
  imageid SERIAL PRIMARY KEY,
  reportid INTEGER REFERENCES reports(reportid) ON DELETE CASCADE,
  imageUrl TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **Relationships:**
- `image.reportid` → `reports.reportid` (Foreign Key)
- เมื่อลบ report จะลบภาพทั้งหมดใน report นั้นด้วย (CASCADE)

## 🔄 **Integration with Reports**

### **1. เมื่อสร้าง Report:**
```javascript
// 1. สร้าง report ก่อน
const report = await createReport(reportData);

// 2. เพิ่มภาพใน report
const images = await Promise.all(
  imageUrls.map(url => 
    addImage({ reportid: report.reportid, imageUrl: url })
  )
);
```

### **2. เมื่อดู Report:**
```javascript
// 1. ดึงข้อมูล report
const report = await getReport(reportId);

// 2. ดึงภาพใน report
const images = await getImagesByReport(reportId);

// 3. รวมข้อมูล
const reportWithImages = { ...report, images };
```

## 📚 **เอกสารที่สร้าง:**
- `docs/image-management-endpoints.md` - Image Management Endpoints

**ตอนนี้ระบบพร้อมแล้ว! มี endpoints ครบถ้วนสำหรับจัดการภาพจาก Firebase Storage** 📷✨
