/* 调试：技能施放后点结束回合，观察是否卡死 */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8124/index.html';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('  [console]', m.text().slice(0, 200)); });

  await page.goto(BASE + '#/battle/1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 20000 });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = s.units.find(u => u.side === 'player' && u.alive);
    const foe = s.units.find(u => u.side === 'enemy' && u.alive);
    let fx = me.x + 1; if (fx >= s.cols) fx = me.x - 1;
    foe.x = fx; foe.y = me.y;
    me.morale = 100;
    SG.battle.clickTile(me.x, me.y);
  });
  await page.click('#bt-skill');
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = SG.battle.getSelected();
    const foe = s.units.find(u => u.side === 'enemy' && u.alive &&
      Math.abs(u.x - me.x) + Math.abs(u.y - me.y) <= (me.hero.skillDef.range || 1));
    SG.battle.clickTile(foe.x, foe.y);
  });
  await page.waitForTimeout(1600);

  const t0 = await page.evaluate(() => ({ turn: SG.battle.getState().turn, locked: SG.battle.isLocked() }));
  console.log('施放后:', JSON.stringify(t0));

  await page.click('[data-act="endturn"]');
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => {
      const s = SG.battle.getState();
      return { turn: s.turn, locked: SG.battle.isLocked(), side: s.side,
        events: s.events.length, result: s.result };
    });
    console.log('t+' + (i + 1) * 0.7 + 's:', JSON.stringify(st));
    if (!st.locked && st.side === 'player') break;
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
