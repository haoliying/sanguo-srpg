/* 诊断：武将技完整施放流程（UI 按钮 + 点击落点） */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8124/index.html';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE + '#/battle/1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 20000 });
  await page.waitForTimeout(400);

  // 把一个敌人搬到刘备旁边，士气拉满
  const setup = await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = s.units.find(u => u.side === 'player' && u.alive);
    const foe = s.units.find(u => u.side === 'enemy' && u.alive);
    foe.x = me.x + 1; foe.y = me.y;
    s.units.filter(u => u.side === 'player').forEach(u => { u.morale = 100; });
    SG.battle.clickTile(me.x, me.y);
    return { me: me.name, skill: me.hero.skillDef.name, cost: me.hero.skillDef.cost, foe: foe.name, btnDisabled: document.querySelector('#bt-skill').disabled };
  });
  console.log('布阵:', JSON.stringify(setup));

  // 点技能按钮进入瞄准
  await page.click('#bt-skill');
  await page.waitForTimeout(150);
  const aim = await page.evaluate(() => ({
    aiming: SG.battle.isAiming(),
    btnText: document.querySelector('#bt-skill').textContent
  }));
  console.log('瞄准态:', JSON.stringify(aim));

  // 点击敌人所在格施放
  const foePos = await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = SG.battle.getSelected();
    const foe = s.units.find(u => u.side === 'enemy' && u.alive && Math.abs(u.x - me.x) + Math.abs(u.y - me.y) <= (me.hero.skillDef.range || 1));
    return foe ? { x: foe.x, y: foe.y, hp: foe.hp } : null;
  });
  console.log('目标格:', JSON.stringify(foePos));
  await page.evaluate(p => SG.battle.clickTile(p.x, p.y), foePos);
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const s = SG.battle.getState();
    return {
      events: s.events.slice(-4).map(e => e.t),
      morale: s.units.filter(u => u.side === 'player')[0].morale,
      locked: SG.battle.isLocked(),
      aiming: SG.battle.isAiming()
    };
  });
  console.log('施放后:', JSON.stringify(after));
  console.log('JS错误:', errors.length ? errors : '无');

  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
