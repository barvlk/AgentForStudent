// نفس المجموعة على PostgreSQL حقيقي عبر مشغّل pg (نفس مسار الموقع المنشور).
// لا يعمل إلا إذا حُدِّد TEST_DATABASE_URL، ولا يمسح المخطط إلا لو كانت القاعدة محلية (حماية من حذف بيانات حقيقية).
//   TEST_DATABASE_URL=postgres://postgres:pw@localhost:5432/afs npm run test:pg
import test from 'node:test';

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('pg suite skipped (set TEST_DATABASE_URL to run it)', { skip: true }, () => {});
} else {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error('TEST_DATABASE_URL must point to a LOCAL database: the test drops the public schema.');

  const pg = (await import('pg')).default;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await c.end();

  process.env.DATABASE_URL = url;
  delete process.env.AFS_DB;
  process.env.GEMINI_API_KEY = '';
  process.env.AFS_DEMO_STUDENT_ID = '441126225';
  process.env.AFS_DEMO_PASSWORD = 'Demo2026x';

  const { defineApiTests } = await import('./lib/api-suite.js');
  defineApiTests('pg');
}
