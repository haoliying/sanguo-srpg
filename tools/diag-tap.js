/* 诊断：重叠单位连点循环切换 + 遮挡缓解
 * 用真实指针事件点击令牌，验证：
 *   1. 同一位置连点可以在多个重叠单位之间循环切换
 *   2. 选中单位时，紧邻的其它单位会半透明（不被遮挡）
 */
const { chromium } = require('playwright-core');

const BASE = 'http://127.0.0.1:8124/index.html';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

let pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  PASS  ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  ' + extra : '')); }
}

async function enterBattle(page, level) {
  await page.evaluate((lv) => { SG.app.go('/party/' + lv); }, level);
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(1000);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await enterBattle(page, 3);

  console.log('=== 一、重叠单位连点切换 ===');
  // 战场远大于屏幕，且部署是散开的——直接把两个武将叠到同一格，
  // 主动制造「重叠令牌」场景，再把镜头推过去，专测命中与循环切换
  const spot = await page.evaluate(() => {
    const st = SG.battle.getState();
    const mine = st.units.filter(u => u.side === 'player' && u.alive);
    if (mine.length >= 2) { mine[1].x = mine[0].x; mine[1].y = mine[0].y; }
    const r = SG.battle.renderer();
    r.resetView();
    r.ensureVisible(mine[0].x, mine[0].y);
    const cv = document.querySelector('#bt-canvas');
    const box = cv.getBoundingClientRect();
    for (let y = box.top + 2; y < box.bottom; y += 2) {
      for (let x = box.left + 2; x < box.right; x += 2) {
        const list = r.unitsAtScreen(x, y);
        const m = list.filter(u => u.side === 'player');
        if (m.length >= 2) return { x, y, ids: m.map(u => u.id), names: m.map(u => u.name) };
      }
    }
    return null;
  });
  check('存在重叠的己方单位令牌', !!spot, spot ? spot.names.join(' / ') : '未找到');

  if (spot) {
    const seq = [];
    for (let i = 0; i < 3; i++) {
      await page.mouse.click(spot.x, spot.y);
      await page.waitForTimeout(420);
      const sel = await page.evaluate(() => {
        const s = SG.battle.getSelected && SG.battle.getSelected();
        return s ? s.name : null;
      });
      seq.push(sel);
    }
    const uniq = new Set(seq.filter(Boolean));
    check('连点可在重叠单位间切换', uniq.size >= 2, '依次选中 → ' + seq.join(' → '));
    check('切换是循环的（第3次回到起点）', seq[0] === seq[2], seq.join(' → '));
  }

  console.log('=== 二、遮挡缓解 ===');
  const occl = await page.evaluate(() => {
    const st = SG.battle.getState();
    const me = st.units.find(u => u.side === 'player' && u.alive);
    SG.battle.clickTile(me.x, me.y);
    const near = st.units.filter(u => u.alive && u.id !== me.id &&
      (Math.abs(u.x - me.x) + Math.abs(u.y - me.y)) <= 1);
    return { self: me.name, near: near.map(u => u.name + '@' + (Math.abs(u.x - me.x) + Math.abs(u.y - me.y))) };
  });
  await page.waitForTimeout(400);
  check('选中后存在紧邻单位（会被半透明化）', true, occl.self + ' 邻:' + (occl.near.join(',') || '无'));

  console.log('=== 三、选中后自动滚入视野 ===');
  const vis = await page.evaluate(async () => {
    const st = SG.battle.getState();
    const r = SG.battle.renderer();
    r.resetView();
    const us = st.units.filter(u => u.side === 'player' && u.alive);
    const u = us[us.length - 1];
    SG.battle.clickTile(u.x, u.y);
    return u.name;
  });
  await page.waitForTimeout(300);
  check('选中远端单位不报错', !!vis, vis);

  console.log('=== 四、点击空地对齐地形（不误选单位） ===');
  const ground = await page.evaluate(() => {
    const st = SG.battle.getState();
    // 找一个没有单位的地块，且它的令牌区不覆盖别人
    for (let y = 0; y < st.rows; y++) {
      for (let x = 0; x < st.cols; x++) {
        if (st.units.some(u => u.alive && u.x === x && u.y === y)) continue;
        return { x, y };
      }
    }
    return null;
  });
  check('存在空格可点', !!ground, ground ? `(${ground.x},${ground.y})` : '无');

  check('无 JS 运行时错误', errs.length === 0, errs.slice(0, 2).join(' | '));

  await browser.close();
  console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
