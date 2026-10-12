import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:18766');
  await page.getByRole('button', { name: '设置', exact: true }).click({ timeout: 5000 });
  await page.getByRole('button', { name: '数据与账号', exact: true }).click();
  await page.locator('#demo-mode').check();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.locator('.account-card').first().waitFor();
  await mkdir('artifacts/screenshots', { recursive: true });
  for (const [name, width, height] of [['1080p',1920,1080],['2k',2560,1440],['4k',3840,2160],['ultrawide',3440,1440],['portrait',1080,1920],['small',800,600]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(150);
    const metrics = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, cards: document.querySelectorAll('.account-card').length }));
    assert.ok(metrics.width <= width, `${name} horizontal overflow`);
    assert.ok(metrics.cards >= 3, `${name} missing accounts`);
    await page.screenshot({ path: resolve(`artifacts/screenshots/${name}.png`) });
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '统计', exact: true }).click();
  await page.locator('#setting-metric').selectOption('spend');
  await page.locator('#setting-horizon').selectOption('2592000000');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  await page.locator('#setting-lowResource').check();
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '统计', exact: true }).click();
  assert.equal(await page.locator('#setting-metric').inputValue(), 'spend');
  await page.getByRole('button', { name: '外观', exact: true }).click();
  assert.equal(await page.locator('#setting-lowResource').isChecked(), true);
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  assert.ok((await page.locator('#chart-note').textContent()).includes('估算'));
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: 6 resolutions, demo accounts, settings persistence, rolling range and low-resource mode.');
} finally { await browser.close(); }
