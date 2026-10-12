import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless:true });
try {
  const page=await browser.newPage(); await page.goto(process.env.PREVIEW_URL||'http://127.0.0.1:18766');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.locator('#setting-theme').selectOption('light');
  await page.reload();
  await page.evaluate(()=>window.wallpaperPropertyListener.applyUserProperties({theme:{value:'dark'}}));
  assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('light')),true,'initial WE defaults overwrite saved UI choice');
  await page.evaluate(()=>window.wallpaperPropertyListener.applyUserProperties({theme:{value:'dark'}}));
  assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('light')),false,'explicit WE property change not applied');
  console.log('Wallpaper Engine property precedence passed: saved UI settings survive initial defaults; live property edits apply.');
} finally { await browser.close(); }
