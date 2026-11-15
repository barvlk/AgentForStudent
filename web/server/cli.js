// أدوات سطر أوامر للقاعدة:  node server/cli.js status | sql "SELECT ..."
//   status : نوع القاعدة والمهاجرات وعدد صفوف كل جدول
//   sql    : تنفيذ استعلام قراءة فقط (SELECT) للاطلاع على البيانات
import { all, backend, migrations, close } from './db.js';

const [cmd, ...rest] = process.argv.slice(2);

try {
  if (cmd === 'status' || !cmd) {
    console.log(`قاعدة البيانات: ${backend}`);
    if (migrations.length) console.log(`مهاجرات طُبِّقت الآن: ${migrations.join(', ')}`);
    const applied = await all('SELECT id, applied_at FROM schema_migrations ORDER BY id');
    console.log(`المهاجرات المطبّقة: ${applied.map((m) => m.id).join(', ') || 'لا شيء'}`);
    for (const t of ['students', 'courses', 'enrollments', 'users', 'sessions', 'tasks', 'audit']) {
      console.log(`  ${t.padEnd(12)} ${(await all(`SELECT COUNT(*) AS c FROM ${t}`))[0].c}`);
    }
  } else if (cmd === 'sql') {
    const q = rest.join(' ').trim();
    if (!/^select\s/i.test(q) || /;\s*\S/.test(q)) throw new Error('مسموح فقط استعلام SELECT واحد.');
    console.table(await all(q));
  } else {
    console.log('الأوامر: status | sql "SELECT ..."');
  }
} finally {
  await close();
}
