/* 截图：验证地形信息、武将特性、伤害预览的展示效果 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8124/index.html';
const OUT = path.join(__dirname, 'shots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function enterBattle(page, level) {
  await page.evaluate((lv) => { SG.app.go('/party/' + lv); }, level);
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  // ---------- 手机视口：战斗中的战术信息 ----------
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('  JS 错误:', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await enterBattle(page, 35);

  // 1) 选中己方武将：应显示特性 + 所处地形
  const mine = await page.evaluate(() => {
    const st = SG.battle.getState();
    const u = st.units.find(x => x.side === 'player' && x.alive);
    SG.battle.clickTile(u.x, u.y);
    return { name: u.hero.name, trait: u.hero.traitDef ? u.hero.traitDef.name : null };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '20-trait-card.png') });
  console.log('选中武将:', mine.name, '特性:', mine.trait);

  // 2) 点击一个够不着的敌人 → 敌情 + 伤害预览
  const foe = await page.evaluate(() => {
    const st = SG.battle.getState();
    const me = SG.battle.getSelected();
    const foes = st.units.filter(x => x.side === 'enemy' && x.alive);
    const far = foes.find(f => !SG.core.canHitFrom(st, me, me.x, me.y, f) &&
      SG.core.attackPositions(st, me, f).length === 0) || foes[foes.length - 1];
    SG.battle.clickTile(far.x, far.y);
    return { name: far.hero.name, trait: far.hero.traitDef ? far.hero.traitDef.name : null };
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, '21-damage-preview.png') });
  console.log('查看敌将:', foe.name, '特性:', foe.trait);

  // 3) 悬停地形
  const box = await page.locator('#bt-canvas').boundingBox();
  await page.mouse.click(box.x + 8, box.y + 8);      // 点空处取消选中
  await page.waitForTimeout(300);
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '22-terrain-info.png') });
  console.log('地形悬停截图完成');

  // ---------- 编队页：战术提示 ----------
  await page.evaluate(() => { SG.app.go('/party/35'); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '23-party-tactics.png') });
  console.log('编队页战术提示截图完成');

  // ---------- 武将图鉴：特性 ----------
  await page.evaluate(() => { SG.app.go('/heroes'); });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, '24-heroes-traits.png') });
  console.log('武将图鉴截图完成');

  // ---------- 桌面视口 ----------
  const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.goto(BASE, { waitUntil: 'networkidle' });
  await enterBattle(desk, 72);
  await desk.evaluate(() => {
    const st = SG.battle.getState();
    const u = st.units.find(x => x.side === 'player' && x.alive);
    SG.battle.clickTile(u.x, u.y);
  });
  await desk.waitForTimeout(700);
  await desk.screenshot({ path: path.join(OUT, '25-desktop-battle.png') });
  console.log('桌面战场截图完成');

  await browser.close();
  console.log('截图已生成于 tools/shots/');
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
