-- สร้างตาราง reports สำหรับเก็บ notifications
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(userid) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP NULL,
  admin_id INTEGER REFERENCES users(userid) ON DELETE SET NULL,
  type VARCHAR(50) DEFAULT 'admin_update'
);

-- เพิ่มดัชนีสำหรับการค้นหาที่เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_admin_id ON reports(admin_id);

-- เพิ่มคอลัมน์ที่อาจจะไม่มีในตาราง users
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_phone VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- สร้างดัชนีสำหรับตาราง users
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_user_name ON users(user_name);
CREATE INDEX IF NOT EXISTS idx_users_user_email ON users(user_email);

-- ตัวอย่างข้อมูลสำหรับทดสอบ
INSERT INTO reports (user_id, title, message, status, admin_id, type) VALUES
(7, 'ข้อมูลของคุณได้รับการอัปเดต', 'แอดมินได้แก้ไขข้อมูลของคุณแล้ว กรุณาตรวจสอบข้อมูลใหม่', 'new', 1, 'admin_update'),
(7, 'รหัสผ่านของคุณถูกเปลี่ยน', 'แอดมินได้เปลี่ยนรหัสผ่านของคุณแล้ว กรุณาเข้าสู่ระบบใหม่', 'new', 1, 'admin_update')
ON CONFLICT DO NOTHING;
