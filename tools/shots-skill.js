/* 武将技特效截图：一计一式，逐个拍照验证「火攻」与「水淹」一眼可分 */
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, 'shots', 'skill');
const BASE = process.env.BASE || 'http://127.0.0.1:8124';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LEVEL = parseInt(process.argv[2] || '39', 10);

// 每种特效对应一组 (kind, element)，与 render.js 的 fxStyleOf 对应
const STYLES = [
  { file: 'fire', label: '火攻·烈焰', kind: 'burn', element: 'fire' },
  { file: 'water', label: '水淹·洪流', kind: 'flood', element: 'water' },
  { file: 'thunder', label: '五雷·天雷', kind: 'damage', element: 'thunder' },
  { file: 'rock', label: '落石·巨石', kind: 'rock', element: 'rock' },
  { file: 'arcane', label: '奇门·符阵', kind: 'damage', element: 'arcane' },
  { file: 'heal', label: '仁德·回春', kind: 'heal', element: null },
  { file: 'mind', label: '蛊惑·攻心', kind: 'bewitch', element: null },
  { file: 'array', label: '八阵·困敌', kind: 'stun', element: null },
  { file: 'blade', label: '兵刃·刀光', kind: 'damage', element: null }
];

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE, headless: true });
  const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log('  JS 错误:', e.message));
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.evaluate((l) => { SG.app.go('/party/' + l); }, LEVEL);
  await page.waitForSelector('#page-party #btn-go', { timeout: 20000 });
  await page.click('#page-party #btn-go');
  await page.waitForFunction(() => window.SG && SG.battle && SG.battle.getState(), { timeout: 30000 });
  await page.waitForTimeout(1000);

  const el = await page.$('#bt-canvas');
  const name = await page.evaluate(() => SG.battle.getState().config.name);
  console.log(`第${LEVEL}关 ${name} —— 逐计拍照`);

  for (const s of STYLES) {
    await page.evaluate((cfg) => {
      const r = SG.battle.renderer();
      const st = SG.battle.getState();
      r.clearAnims();
      // 找一片开阔陆地作特效中心（水上放火看不出来）
      let cx = Math.floor(st.cols / 2), cy = Math.floor(st.rows / 2), best = -1;
      for (let y = 2; y < st.rows - 2; y++) {
        for (let x = 2; x < st.cols - 2; x++) {
          const t = SG.core.TERRAIN[st.map[SG.core.idx(st, x, y)]];
          if (t.water || t.outside || t.cost >= 99) continue;
          let open = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const tt = SG.core.TERRAIN[st.map[SG.core.idx(st, x + dx, y + dy)]];
              if (tt && !tt.water && !tt.outside) open++;
            }
          }
          if (open > best) { best = open; cx = x; cy = y; }
        }
      }
      const tiles = [];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) tiles.push({ x: cx + dx, y: cy + dy });
      }
      r.centerOn(cx, cy);
      // 拖长时长，好让截图时特效正盛
      r.addSkillFx(tiles, { kind: cfg.kind, element: cfg.element, magic: false, dur: 60000 });
    }, s);
    await page.waitForTimeout(300);
    await el.screenshot({ path: path.join(OUT, `${s.file}.png`) });
    console.log(`  ${s.label} → ${s.file}.png`);
  }

  // 战场遗留物：水淹成泽、落石堵道、八阵困敌
  await page.evaluate(() => {
    const r = SG.battle.renderer();
    const st = SG.battle.getState();
    r.clearAnims();
    const cx = Math.floor(st.cols / 2), cy = Math.floor(st.rows / 2);
    const tiles = [];
    for (let d = -2; d <= 2; d++) tiles.push({ x: cx + d, y: cy });
    SG.core.layHazard(st, tiles, 'flood', 6, st.events);
    const rock = [];
    for (let d = -2; d <= 2; d++) rock.push({ x: cx + d, y: cy + 3 });
    SG.core.layHazard(st, rock, 'rock', 6, st.events);
    r.centerOn(cx, cy + 1);
  });
  await page.waitForTimeout(300);
  await el.screenshot({ path: path.join(OUT, 'hazard.png') });
  console.log('  战场遗留物（洪水+乱石） → hazard.png');

  await page.close();
  await browser.close();
  console.log('技能特效截图已生成 tools/shots/skill/');
  process.exit(0);
})().catch(e => { console.error('失败:', e.message); process.exit(1); });
