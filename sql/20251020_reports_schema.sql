CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(userid) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','read','resolved')),
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at);

ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);


