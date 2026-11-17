/* 战斗界面截图：选中武将后的卡片（兵数、一将数技）与战场全貌 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'shots', 'battle');
const BASE = process.env.BASE || 'http://127.0.0.1:8124';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LEVELS = (process.argv[2] || '39').split(',').map(s => parseInt(s, 10));

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });

  for (const lv of LEVELS) {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.log('  JS 错误:', e.message));
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.evaluate((l) => { SG.app.go('/party/' + l); }, lv);
    await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
    await page.click('#page-party #btn-go');
    await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
    await page.waitForTimeout(1000);

    const name = await page.evaluate(() => SG.battle.getState().config.name);
    const counts = await page.evaluate(() => {
      const st = SG.battle.getState();
      const foes = st.units.filter(u => u.side === 'enemy');
      return {
        mine: st.units.filter(u => u.side === 'player').length,
        foes: foes.length,
        levies: foes.filter(u => u.hero && u.hero.levy).length
      };
    });
    console.log(`第${lv}关 ${name}：我军 ${counts.mine} · 敌军 ${counts.foes}（营伍 ${counts.levies}）`);

    await page.screenshot({ path: path.join(OUT, `L${lv}-battle.png`) });

    // 选中第一位武将，让卡片显示兵数与技能列表
    await page.evaluate(() => {
      const st = SG.battle.getState();
      const u = st.units.find(x => x.side === 'player' && x.alive);
      if (u) SG.battle.clickTile(u.x, u.y);
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `L${lv}-card.png`) });

    // 展开全军一览，看大军编成
    await page.evaluate(() => {
      const b = document.querySelector('[data-act="roster"]');
      if (b) b.click();
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `L${lv}-roster.png`) });

    await page.close();
  }

  await browser.close();
  console.log('战斗界面截图已生成 tools/shots/battle/');
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
