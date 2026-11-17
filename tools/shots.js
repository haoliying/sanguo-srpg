/* 视觉截图：首页 / 战场 / 武将页 */
const { chromium } = require('playwright-core');
const fs = require('fs');

(async () => {
  fs.mkdirSync('tools/shots', { recursive: true });
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true
  });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true
  });
  const page = await ctx.newPage();
  const BASE = 'http://127.0.0.1:8124/index.html';

  await page.goto(BASE + '#/home', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tools/shots/01-home.png' });

  await page.goto(BASE + '#/levels', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tools/shots/02-levels.png' });

  await page.goto(BASE + '#/party/1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tools/shots/03-party.png', fullPage: true });

  await page.click('#btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 15000 });
  await page.waitForTimeout(900);
  // 选中一个武将看看信息卡
  await page.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player');
    SG.battle.clickTile(u.x, u.y);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/shots/04-battle.png' });

  // 深色模式战场
  await page.evaluate(() => { SG.ui.applyTheme('dark'); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'tools/shots/05-battle-dark.png' });

  await page.goto(BASE + '#/heroes', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tools/shots/06-heroes.png' });

  await browser.close();
  console.log('截图完成');
})().catch(e => { console.error(e); process.exit(1); });
