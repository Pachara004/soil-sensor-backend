-- สร้างตาราง otp_verification สำหรับเก็บ OTP
CREATE TABLE IF NOT EXISTS otp_verification (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  otp VARCHAR(6) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP NULL
);

-- เพิ่มดัชนีสำหรับการค้นหาที่เร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_otp_verification_email ON otp_verification(email);
CREATE INDEX IF NOT EXISTS idx_otp_verification_expires_at ON otp_verification(expires_at);

-- ลบ OTP ที่หมดอายุ (สามารถรันเป็น cron job)
DELETE FROM otp_verification WHERE expires_at < NOW();
