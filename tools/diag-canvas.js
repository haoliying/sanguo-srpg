/* 诊断：新建独立 renderer 绘制同一地图，对比主画布输出 */
const { chromium } = require('playwright-core');
const fs = require('fs');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  page.on('pageerror', e => console.log('JS 错误:', e.message));
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => SG.app.go('/party/39'));
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(1200);

  const res = await page.evaluate(() => {
    const st = SG.battle.getState();
    const cv2 = document.createElement('canvas');
    const r2 = SG.render.create(cv2);
    r2.resize(st, 420, 900);
    r2.draw(st, {});
    return {
      cv2size: [cv2.width, cv2.height],
      cv2shot: cv2.toDataURL('image/png'),
      tile: r2.tile
    };
  });
  fs.writeFileSync(__dirname + '/shots/board/diag-fresh.png',
    Buffer.from(res.cv2shot.split(',')[1], 'base64'));
  console.log('cv2 尺寸:', res.cv2size, 'tile:', res.tile);
  await browser.close();
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
