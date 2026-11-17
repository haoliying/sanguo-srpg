/* 诊断：量化 buildBase 在不同 dpr 下的耗时 */
const { chromium } = require('playwright-core');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const DPR = +(process.argv[2] || 2);

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: DPR });
  page.on('pageerror', e => console.log('JS 错误:', e.message));
  await page.goto('http://127.0.0.1:8124/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(() => SG.app.go('/party/39'));
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(600);

  const res = await page.evaluate(async () => {
    const st = SG.battle.getState();
    const cv2 = document.createElement('canvas');
    const r2 = SG.render.create(cv2);
    r2.resize(st, 420, 900);
    // 第一次 draw（含 buildBase）
    let t0 = performance.now();
    r2.draw(st, {});
    const t1 = performance.now();
    // 第二次 draw（命中 baseKey 缓存）
    r2.draw(st, {});
    const t2 = performance.now();
    return { firstDrawMs: Math.round(t1 - t0), cachedDrawMs: Math.round(t2 - t1) };
  });
  console.log(`dpr=${DPR}  首帧(含地形烘焙): ${res.firstDrawMs}ms  缓存帧: ${res.cachedDrawMs}ms`);
  await browser.close();
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
