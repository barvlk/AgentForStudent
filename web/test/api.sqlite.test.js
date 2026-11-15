// اختبارات الـ API والقاعدة على SQLite (ملف مؤقت).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

process.env.AFS_DB = 'sqlite';
delete process.env.DATABASE_URL;
process.env.AFS_WEB_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'afs-')), 'test.db');
process.env.GEMINI_API_KEY = '';
process.env.AFS_DEMO_STUDENT_ID = '441126225';
process.env.AFS_DEMO_PASSWORD = 'Demo2026x';

const { defineApiTests } = await import('./lib/api-suite.js');
defineApiTests('sqlite');
