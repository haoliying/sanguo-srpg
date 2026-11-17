/* 视觉验证：移动范围高亮 / 施法瞄准 / 后期关卡 */
const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const BASE = 'http://127.0.0.1:8124/index.html';

  // 1. 选中单位 → 移动范围
  await page.goto(BASE + '#/battle/1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 20000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player' && !x.acted);
    SG.battle.clickTile(u.x, u.y);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/shots/10-moverange.png' });

  // 2. 施法瞄准态
  await page.evaluate(() => {
    const s = SG.battle.getState();
    s.units.filter(u => u.side === 'player').forEach(u => { u.morale = 100; });
    const me = SG.battle.getSelected() || s.units.find(x => x.side === 'player' && !x.acted);
    SG.battle.clickTile(me.x, me.y);
  });
  await page.click('#bt-skill');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/shots/11-aiming.png' });

  // 3. 后期关卡（城池地形）
  await page.goto(BASE + '#/battle/40', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player' && !x.acted);
    SG.battle.clickTile(u.x, u.y);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/shots/12-late-level.png' });

  // 4. 桌面宽屏战场
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await desk.newPage();
  await dp.goto(BASE + '#/battle/1', { waitUntil: 'networkidle' });
  await dp.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 20000 });
  await dp.waitForTimeout(900);
  await dp.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player' && !x.acted);
    SG.battle.clickTile(u.x, u.y);
  });
  await dp.waitForTimeout(400);
  await dp.screenshot({ path: 'tools/shots/13-desktop.png' });

  await browser.close();
  console.log('完成');
})().catch(e => { console.error(e); process.exit(1); });
