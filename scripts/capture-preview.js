import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : undefined), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto((process.env.PREVIEW_URL || 'http://127.0.0.1:18766') + '/#demo=1');
  await page.locator('.account-card').first().waitFor();
  await page.screenshot({ path: 'wallpaper/preview.png' });
} finally { await browser.close(); }
