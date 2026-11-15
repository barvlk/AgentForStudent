// نفس المجموعة على PostgreSQL حقيقي (PGlite يعمل داخل Node في الذاكرة) للتحقق من صحة SQL على Postgres.
process.env.AFS_DB = 'pglite';
delete process.env.DATABASE_URL;
process.env.GEMINI_API_KEY = '';
process.env.AFS_DEMO_STUDENT_ID = '441126225';
process.env.AFS_DEMO_PASSWORD = 'Demo2026x';

const { defineApiTests } = await import('./lib/api-suite.js');
defineApiTests('pglite');
