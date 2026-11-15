-- AgentForStudent: saved GPA scenarios per student (SQLite)
CREATE TABLE gpa_scenarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students (student_id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  scale       INTEGER NOT NULL CHECK (scale IN (4, 5)),
  prev_gpa    REAL    NOT NULL CHECK (prev_gpa >= 0 AND prev_gpa <= 5),
  prev_hours  REAL    NOT NULL CHECK (prev_hours >= 0),
  courses     TEXT    NOT NULL,  -- JSON: [{name, hours, letter}]
  result_gpa  REAL    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_gpa_scenarios_student ON gpa_scenarios (student_id, created_at);
