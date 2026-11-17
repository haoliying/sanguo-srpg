/* 截图：只截战场棋盘（对比地形美术与可读性） */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8124/index.html';
const OUT = path.join(__dirname, 'shots', 'board');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function enterBattle(page, level) {
  await page.evaluate((lv) => { SG.app.go('/party/' + lv); }, level);
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(1200);
}

(async () => {
  const levels = (process.argv[2] || '3,18,35,72').split(',').map(Number);
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  for (const lv of levels) {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => console.log('  JS 错误:', e.message));
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await enterBattle(page, lv);
    const name = await page.evaluate(() => SG.battle.getState().config.name);
    // 整体战斗页
    await page.screenshot({ path: path.join(OUT, `L${lv}-full.png`) });
    // 只截棋盘
    const el = await page.$('#bt-canvas');
    await el.screenshot({ path: path.join(OUT, `L${lv}-board.png`) });
    // 选中一个己方 再看一次（含移动范围）
    await page.evaluate(() => {
      const st = SG.battle.getState();
      const u = st.units.find(x => x.side === 'player' && x.alive && !x.acted);
      if (u) SG.battle.clickTile(u.x, u.y);
    });
    await page.waitForTimeout(500);
    await (await page.$('#bt-canvas')).screenshot({ path: path.join(OUT, `L${lv}-board-sel.png`) });
    console.log(`L${lv} ${name} 完成`);
    await page.close();
  }
  await browser.close();
  console.log('棋盘截图已生成 tools/shots/board/');
})().catch(e => { console.error('失败:', e.message); process.exit(1); })
  .finally(() => { setTimeout(() => process.exit(0), 500); });   // 大离屏画布会让 close 挂起，兜底强退
