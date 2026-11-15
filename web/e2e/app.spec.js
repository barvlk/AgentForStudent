import { test, expect } from '@playwright/test';

const ID = '441126225', PW = 'Demo2026x';

async function login(page) {
  await page.goto('/');
  await page.locator('#sid').fill(ID);
  await page.locator('#pw').fill(PW);
  await page.locator('#login-btn').click();
  await expect(page.locator('#title')).toHaveText('لوحة الأداء الأكاديمي');
}
const nav = (page, tab) => page.locator(`[data-tab="${tab}"]:visible`).click();

test('wrong password shows one generic error and stays on login', async ({ page }) => {
  await page.goto('/');
  await page.locator('#sid').fill(ID);
  await page.locator('#pw').fill('definitely-wrong');
  await page.locator('#login-btn').click();
  await expect(page.locator('#login-error .alert.error')).toBeVisible();
  await expect(page.locator('#sid')).toBeVisible();
});

test('demo login shows the dashboard with mastery cards', async ({ page }) => {
  await login(page);
  await expect(page.locator('text=الإتقان وخطر التعثر حسب المجال')).toBeVisible();
});

test('tasks: add a task and see it ranked, then delete it', async ({ page }) => {
  await login(page);
  await nav(page, 'tasks');
  await expect(page.locator('#title')).toHaveText('المهام والمواعيد');
  await page.locator('summary', { hasText: 'إضافة مهمة جديدة' }).click();
  await page.locator('#task-form input[name=course]').fill('اختبار e2e');
  await page.locator('#task-form input[name=title]').fill('مهمة من Playwright');
  await page.locator('#task-form select[name=priority]').selectOption('عالية');
  await page.locator('#task-form button[type=submit]').click();
  const card = page.locator('.task', { hasText: 'مهمة من Playwright' });
  await expect(card).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await card.locator('button[title*="حذف"], button[aria-label*="حذف"]').first().click();
  await expect(card).toHaveCount(0);
});

test('GPA calculator: result updates, scenario save / load / delete', async ({ page }) => {
  await login(page);
  await nav(page, 'gpa');
  await expect(page.locator('#sem-result')).toContainText('3.52');
  await page.locator('#scale-seg [data-scale="5"]').click();
  await expect(page.locator('#sem-result')).toContainText('5.00');
  await page.locator('#scale-seg [data-scale="4"]').click();

  await page.locator('#sc-name').fill('سيناريو e2e');
  await page.locator('#sc-save').click();
  const item = page.locator('.sc-item', { hasText: 'سيناريو e2e' });
  await expect(item).toBeVisible();
  await page.locator('#add-row').click();
  const rows = await page.locator('.crow').count();
  await item.locator('[data-load]').click();
  await expect(page.locator('.crow')).toHaveCount(rows - 1);
  await item.locator('[data-del-sc]').click();
  await expect(item).toHaveCount(0);
});

test('chat: greeting and a compound question use several tools', async ({ page }) => {
  await login(page);
  await nav(page, 'chat');
  const input = page.locator('#msg-input');
  await input.fill('سلام عليكم');
  await page.locator('#send').click();
  await expect(page.locator('.msg.bot').last()).toContainText('أهلاً');
  await input.fill('وش مهامي وكيف ادرس اليوم');
  await page.locator('#send').click();
  const last = page.locator('.msg.bot').last();
  await expect(last).toContainText('get_my_priority_tasks');
  await expect(last).toContainText('get_my_weekly_study_plan');
});

test('every page fits the viewport width (no horizontal scroll)', async ({ page }) => {
  await login(page);
  for (const tab of ['dashboard', 'tasks', 'gpa', 'chat']) {
    await nav(page, tab);
    await page.waitForTimeout(600);
    const { vw, sw } = await page.evaluate(() => ({ vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
    expect(sw, `${tab} overflows horizontally`).toBeLessThanOrEqual(vw);
  }
});

test('logout returns to the login page', async ({ page }) => {
  await login(page);
  if (page.viewportSize().width > 860) await page.locator('#logout').click();
  else { page.once('dialog', (d) => d.accept()); await page.locator('#m-menu').click(); }
  await expect(page.locator('#login-btn')).toBeVisible();
});
