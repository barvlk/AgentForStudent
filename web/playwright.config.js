// اختبارات الواجهة الشاملة (E2E): تشغّل الخادم على قاعدة SQLite مؤقتة وتتحكم بمتصفح حقيقي بحجم سطح المكتب وبحجم الجوال.
// محلياً تستخدم Microsoft Edge المثبّت، وفي CI تستخدم Chromium الذي يثبّته Playwright.
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const PORT = 3997;
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'afs-e2e-')), 'e2e.db');

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.CI ? undefined : 'msedge',
    locale: 'ar-SA',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 900 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning server/index.js',
    url: `http://localhost:${PORT}/api/health`,
    timeout: 60000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT), AFS_DB: 'sqlite', AFS_WEB_DB: dbFile, GEMINI_API_KEY: '', DATABASE_URL: '',
      AFS_DEMO_STUDENT_ID: '441126225', AFS_DEMO_PASSWORD: 'Demo2026x', NODE_ENV: 'test',
    },
  },
});
