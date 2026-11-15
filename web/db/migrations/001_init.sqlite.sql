-- AgentForStudent: initial schema (SQLite)
-- Normalized: students 1-N enrollments N-1 courses, students 1-1 users 1-N sessions, students 1-N tasks.

CREATE TABLE students (
  student_id  INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  level       TEXT NOT NULL
);

CREATE TABLE courses (
  course_code TEXT PRIMARY KEY,
  course_name TEXT NOT NULL,
  credits     REAL NOT NULL CHECK (credits >= 0 AND credits <= 12),
  domain      TEXT NOT NULL CHECK (domain IN ('AI', 'Math', 'Programming', 'Systems', 'General'))
);

CREATE TABLE enrollments (
  student_id  INTEGER NOT NULL REFERENCES students (student_id) ON DELETE CASCADE,
  course_code TEXT    NOT NULL REFERENCES courses (course_code),
  term_no     INTEGER NOT NULL CHECK (term_no BETWEEN 1 AND 20),
  score       REAL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  letter      TEXT CHECK (letter IS NULL OR letter IN ('A+', 'A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F')),
  points      REAL CHECK (points IS NULL OR (points >= 0 AND points <= 5)),
  PRIMARY KEY (student_id, course_code, term_no)
);
CREATE INDEX idx_enrollments_student_term ON enrollments (student_id, term_no);

CREATE TABLE users (
  student_id      INTEGER PRIMARY KEY REFERENCES students (student_id) ON DELETE CASCADE,
  password_hash   TEXT    NOT NULL,
  must_change     INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0, 1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    INTEGER
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users (student_id) ON DELETE CASCADE,
  created_at INTEGER  NOT NULL,
  last_seen  INTEGER  NOT NULL
);
CREATE INDEX idx_sessions_last_seen ON sessions (last_seen);

CREATE TABLE tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students (student_id) ON DELETE CASCADE,
  course     TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  priority   TEXT    NOT NULL CHECK (priority IN ('عالية', 'متوسطة', 'عادية')),
  due_date   TEXT,
  est_hours  REAL CHECK (est_hours IS NULL OR est_hours >= 0),
  done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at INTEGER  NOT NULL
);
CREATE INDEX idx_tasks_student_done ON tasks (student_id, done);

-- سجل التدقيق: بدون مفتاح أجنبي حتى تُسجَّل محاولات الدخول لأرقام غير موجودة أيضاً
CREATE TABLE audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  event      TEXT   NOT NULL,
  student_id TEXT,
  detail     TEXT
);
CREATE INDEX idx_audit_ts ON audit (ts);

-- السجل الأكاديمي المسطّح (يستخدمه نموذج التنبؤ والتحليلات)
CREATE VIEW v_records AS
SELECT e.student_id, s.name, s.level, e.term_no, e.course_code, c.course_name,
       c.credits, e.score, e.letter, e.points, c.domain
FROM enrollments e
JOIN students s ON s.student_id = e.student_id
JOIN courses  c ON c.course_code = e.course_code;

-- ملخص الطالب: المعدل التراكمي (من 4.00) والساعات المجتازة محسوبان بـ SQL
CREATE VIEW v_student_summary AS
SELECT s.student_id, s.name, s.level,
       COUNT(e.course_code) AS courses_count,
       COALESCE(
         SUM(CASE WHEN c.credits > 0 AND e.score IS NOT NULL THEN e.points * c.credits END)
         / NULLIF(SUM(CASE WHEN c.credits > 0 AND e.score IS NOT NULL THEN c.credits END), 0),
         0) AS gpa,
       COALESCE(SUM(CASE WHEN c.credits > 0 AND e.score IS NOT NULL AND e.points > 0 THEN c.credits END), 0) AS earned_hours
FROM students s
LEFT JOIN enrollments e ON e.student_id = s.student_id
LEFT JOIN courses c ON c.course_code = e.course_code
GROUP BY s.student_id, s.name, s.level;
