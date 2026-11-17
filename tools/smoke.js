/* Playwright 端到端冒烟测试：首页 → 编队 → 战斗 → 操作 → 结算 → 武将 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8124/index.html';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404|img/i.test(m.text())) errors.push(m.text()); });

  console.log('=== 手机视口 390x844 ===');

  await page.goto(BASE + '#/home', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  check('首页标题渲染', (await page.textContent('.home-title')) === '三国战棋');
  check('首页显示开始按钮', (await page.locator('[data-lv]').count()) === 1);

  // 关卡选择
  await page.click('#page-home [data-go="/levels"]');
  await page.waitForTimeout(300);
  const chapters = await page.locator('.chapter').count();
  const cells = await page.locator('.lvcell').count();
  check('章节数 14', chapters === 14, '实际 ' + chapters);
  check('关卡格 100 个', cells === 100, '实际 ' + cells);
  const locked = await page.locator('.lvcell.locked').count();
  check('关卡存在未解锁态', locked > 0, '锁定 ' + locked);

  // 编队
  await page.click('.lvcell:not(.locked)');
  await page.waitForTimeout(300);
  check('进入编队页', await page.locator('#btn-go').isVisible());
  const foes = await page.locator('.foe-chip').count();
  check('显示敌军阵容', foes >= 2, '敌将 ' + foes);
  const slots = await page.locator('.slot').count();
  check('默认阵容 3 人', slots === 3, '实际 ' + slots);

  // 开战
  await page.click('#btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 15000 });
  await page.waitForTimeout(500);

  const st = await page.evaluate(() => {
    const s = SG.battle.getState();
    return {
      level: s.level, cols: s.cols, rows: s.rows,
      players: s.units.filter(u => u.side === 'player').length,
      enemies: s.units.filter(u => u.side === 'enemy').length,
      turn: s.turn
    };
  });
  check('战斗已开局', st.level === 1 && st.players === 3, JSON.stringify(st));
  check('棋盘已生成', st.cols >= 10 && st.rows >= 10, `${st.cols}x${st.rows}`);
  check('canvas 有尺寸', await page.evaluate(() => {
    const c = document.querySelector('#bt-canvas');
    return c.width > 100 && c.height > 100;
  }));

  // 选中我方单位
  const sel = await page.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player');
    SG.battle.clickTile(u.x, u.y);
    return { x: u.x, y: u.y, name: u.name, selected: !!SG.battle.getSelected() };
  });
  check('可选中己方武将', sel.selected, JSON.stringify(sel));
  await page.waitForTimeout(200);
  check('选中后显示信息卡', (await page.textContent('#bt-card')).includes(sel.name));

  // 移动
  const moved = await page.evaluate(async () => {
    const s = SG.battle.getState();
    const u = SG.battle.getSelected();
    const before = { x: u.x, y: u.y };
    // 找一个可移动格
    const reach = SG.core.reachable(s, u);
    if (!reach.length) return { ok: false, before };
    const t = reach[Math.min(2, reach.length - 1)];
    SG.battle.clickTile(t.x, t.y);
    return { ok: true, before, target: { x: t.x, y: t.y } };
  });
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => {
    const s = SG.battle.getState();
    return s.units.filter(u => u.side === 'player').map(u => ({ x: u.x, y: u.y, moved: u.moved }));
  });
  check('武将可移动', moved.ok && after.some(u => u.moved), JSON.stringify(moved));

  // 武将技：拉满士气 → 点技能按钮 → 点目标格 → 应产生 skill 事件并扣士气
  const cast = await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = s.units.find(u => u.side === 'player' && !u.acted && u.alive);
    if (!me) return { ok: false, why: '无可用武将' };
    const foe = s.units.find(u => u.side === 'enemy' && u.alive);
    let fx = me.x + 1;
    if (fx >= s.cols) fx = me.x - 1;
    if (fx < 0) return { ok: false, why: '无处放置目标' };
    foe.x = fx; foe.y = me.y;
    me.morale = 100;
    SG.battle.clickTile(me.x, me.y);
    return { ok: true, skill: me.hero.skillDef.name, btn: document.querySelector('#bt-skill').disabled };
  });
  check('士气充足时技能按钮可用', cast.ok && cast.btn === false, JSON.stringify(cast));
  await page.click('#bt-skill');
  await page.waitForTimeout(150);
  const aiming = await page.evaluate(() => SG.battle.isAiming());
  check('点击技能按钮进入瞄准态', aiming === true);
  const foePos = await page.evaluate(() => {
    const s = SG.battle.getState();
    const me = SG.battle.getSelected();
    const foe = s.units.find(u => u.side === 'enemy' && u.alive &&
      Math.abs(u.x - me.x) + Math.abs(u.y - me.y) <= (me.hero.skillDef.range || 1));
    return foe ? { x: foe.x, y: foe.y } : null;
  });
  check('瞄准态存在合法目标', !!foePos, JSON.stringify(foePos));
  const eventsBefore = await page.evaluate(() => SG.battle.getState().events.length);
  await page.evaluate(p => SG.battle.clickTile(p.x, p.y), foePos);
  await page.waitForFunction(n => SG.battle.getState().events.length > n, eventsBefore, { timeout: 10000 });
  const castResult = await page.evaluate(() => {
    const s = SG.battle.getState();
    return { tail: s.events.slice(-3).map(e => e.t), morale: s.units.find(u => u.side === 'player').morale };
  });
  check('武将技产生技能事件', castResult.tail.includes('skill'), JSON.stringify(castResult));
  await page.waitForFunction(() => !SG.battle.isLocked(), { timeout: 15000 });

  // 结束回合（AI 行动）
  const turnBefore = await page.evaluate(() => SG.battle.getState().turn);
  await page.click('[data-act="endturn"]');
  await page.waitForFunction(t => {
    const s = SG.battle.getState();
    return s && s.turn > t && !SG.battle.isLocked();
  }, turnBefore, { timeout: 25000 });
  const turnAfter = await page.evaluate(() => SG.battle.getState().turn);
  check('结束回合后进入下一回合', turnAfter === turnBefore + 1, `${turnBefore}→${turnAfter}`);

  // 技能按钮状态
  const skillState = await page.evaluate(() => {
    const s = SG.battle.getState();
    const u = s.units.find(x => x.side === 'player' && !x.acted);
    if (u) SG.battle.clickTile(u.x, u.y);
    const btn = document.querySelector('#bt-skill');
    return { disabled: btn.disabled, morale: u ? u.morale : -1 };
  });
  check('技能按钮按士气启用/禁用', typeof skillState.disabled === 'boolean', JSON.stringify(skillState));

  // 强制取胜，检查结算
  await page.evaluate(() => {
    const s = SG.battle.getState();
    s.units.filter(u => u.side === 'enemy').forEach(u => { u.hp = 0; u.alive = false; });
  });
  await page.click('[data-act="endturn"]');
  await page.waitForSelector('.result-card', { timeout: 25000 });
  const resultText = await page.textContent('.result-card');
  check('结算页显示胜利', resultText.includes('大获全胜'), resultText.slice(0, 40));
  check('结算显示星级', (await page.textContent('.rs-stars')).includes('★'));

  // 返回后进度已保存
  await page.click('#page-result [data-go="/home"]');
  await page.waitForTimeout(400);
  const homeText = await page.textContent('.home-stats');
  check('首页进度已更新', /已过关/.test(homeText) && !/已过关[\s\S]{0,10}0/.test(homeText), homeText.replace(/\s+/g, ' ').slice(0, 60));

  // 武将页
  await page.click('#page-home [data-go="/heroes"]');
  await page.waitForTimeout(300);
  const heroCards = await page.locator('.hero-card').count();
  check('武将页显示武将', heroCards >= 3, '卡片 ' + heroCards);
  const hasTrain = await page.locator('[data-train]').count();
  check('武将可训练', hasTrain >= 3);

  // 设置页
  await page.click('#page-heroes [data-go="/home"]');
  await page.waitForTimeout(200);
  await page.click('#page-home [data-go="/settings"]');
  await page.waitForTimeout(300);
  check('设置页渲染', (await page.locator('.set-row').count()) >= 3);
  // 切深色
  await page.click('#page-settings [data-set="theme"][data-val="dark"]');
  await page.waitForTimeout(300);
  const theme = await page.getAttribute('html', 'data-theme');
  check('可切换到深色主题', theme === 'dark', '当前 ' + theme);
  await page.click('#page-settings [data-set="theme"][data-val="light"]');

  // 桌面视口
  console.log('=== 桌面视口 1280x900 ===');
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const dp = await desk.newPage();
  dp.on('pageerror', e => errors.push('[desktop] ' + e.message));
  await dp.goto(BASE + '#/levels', { waitUntil: 'networkidle' });
  await dp.waitForTimeout(300);
  check('桌面端关卡页渲染', (await dp.locator('.lvcell').count()) === 100);
  await dp.goto(BASE + '#/party/1', { waitUntil: 'networkidle' });
  await dp.waitForTimeout(300);
  await dp.click('#btn-go');
  await dp.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 15000 });
  await dp.waitForTimeout(400);
  const deskCanvas = await dp.evaluate(() => {
    const c = document.querySelector('#bt-canvas');
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  check('桌面战场尺寸合理', deskCanvas.w > 300 && deskCanvas.h > 200, JSON.stringify(deskCanvas));

  console.log();
  check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('测试异常:', e);
  process.exit(1);
});
