import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
try {
  const page = await browser.newPage();
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:18766');
  assert.equal(await page.locator('select').count(), 0, 'native selects must not be instantiated in Wallpaper Engine');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.locator('[data-choice-for="setting-theme"]').click();
  await page.getByRole('option', { name: '浅色', exact: true }).click();
  assert.equal(await page.locator('#setting-theme').evaluate(n => n.value), 'light');
  assert.equal(await page.locator('body').evaluate(n => n.classList.contains('light')), true);
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await page.locator('[data-choice-for="setting-metric"]').click();
  await page.getByRole('option', { name: '费用估算', exact: true }).click();
  assert.equal(await page.locator('#setting-metric').evaluate(n => n.value), 'spend');
  assert.equal(await page.locator('select').count(), 0);
  console.log('Custom choices passed: no visible native selects; theme and metric updates preserved.');
} finally { await browser.close(); }
