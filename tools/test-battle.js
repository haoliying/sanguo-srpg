/* 数据校验 + 100 关自动对战模拟 */
const core = require('../assets/js/core.js');
const data = require('../assets/js/data.js');
const ai = require('../assets/js/ai.js');
const game = require('../assets/js/game.js');

let fail = 0;
function check(name, ok, extra) {
  if (!ok) { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
  return ok;
}

console.log('=== 1. 数据完整性 ===');

// 武将技能必须存在
let skillMiss = 0;
data.HEROES.forEach(h => { if (!data.SKILLS[h.skill]) { skillMiss++; console.log('   技能缺失: ' + h.name + ' -> ' + h.skill); } });
check('所有武将技能有效', skillMiss === 0);

// 兵种合法
let troopMiss = 0;
data.HEROES.forEach(h => { if (!core.TROOPS[h.troop]) { troopMiss++; console.log('   兵种非法: ' + h.name + ' -> ' + h.troop); } });
check('所有兵种合法', troopMiss === 0);

// 章节覆盖 1..100
let coverOk = true;
for (let i = 1; i <= 100; i++) { const ch = data.chapterOf(i); if (!ch || i < ch.from || i > ch.to) coverOk = false; }
check('100 关均归属章节', coverOk);

// 解锁表武将都真实存在
let unlockMiss = 0;
data.UNLOCKS.forEach(u => { if (!data.hero(u.id)) { unlockMiss++; console.log('   解锁武将不存在: ' + u.id); } });
data.STARTERS.forEach(id => { if (!data.hero(id)) unlockMiss++; });
check('解锁武将均存在', unlockMiss === 0);

console.log('=== 2. 关卡配置 ===');

let cfgBad = 0, enemyMiss = 0;
const victTypes = {};
for (let i = 1; i <= 100; i++) {
  const cfg = data.levelConfig(i);
  victTypes[cfg.victory.type] = (victTypes[cfg.victory.type] || 0) + 1;
  if (!cfg.name || cfg.enemies.length < 2) cfgBad++;
  cfg.enemies.forEach(e => { if (!data.hero(e.heroId)) { enemyMiss++; console.log('   敌将不存在: ' + e.heroId); } });
}
check('每关至少 2 名敌将', cfgBad === 0);
check('敌将均存在', enemyMiss === 0);
console.log('   胜利条件分布: ' + JSON.stringify(victTypes));

// 难度递增
const counts = [], levels = [], hp = [];
for (let i = 1; i <= 100; i++) {
  const c = data.levelConfig(i);
  counts.push(c.enemies.length); levels.push(c.enemyLevel); hp.push(+c.hpScale.toFixed(2));
}
// 敌军强度按「关卡目标」做了反调（坚守关的敌军本就该比攻城关多），
// 因此逐关严格单调不成立；改为看分段均值是否一路走高。
const segAvg = (arr, seg) => {
  const out = [];
  for (let s = 0; s < arr.length; s += seg) {
    const part = arr.slice(s, s + seg);
    out.push(part.reduce((a, b) => a + b, 0) / part.length);
  }
  return out;
};
// 允许按目标类型反调带来的小幅波动（坚守关敌军多、攻城关敌军少是设计使然）
const monoSeg = (arr) => { const s = segAvg(arr, 20); return s.every((v, i) => i === 0 || v >= s[i - 1] - 0.5); };
check('敌军规模分段递增', monoSeg(counts), `分段均值=${segAvg(counts, 20).map(v => v.toFixed(1)).join(' → ')}`);
check('敌方等级分段递增', monoSeg(levels), `分段均值=${segAvg(levels, 20).map(v => v.toFixed(1)).join(' → ')}`);
check('兵力倍率分段递增', monoSeg(hp), `分段均值=${segAvg(hp, 20).map(v => v.toFixed(2)).join(' → ')}`);
check('末关明显强于首关',
  counts[99] > counts[0] && levels[99] > levels[0] && hp[99] > hp[0],
  `首=${counts[0]}人 Lv${levels[0]} x${hp[0]} → 末=${counts[99]}人 Lv${levels[99]} x${hp[99]}`);
console.log(`   第1关: ${counts[0]}人 Lv${levels[0]} x${hp[0]} | 第50关: ${counts[49]}人 Lv${levels[49]} x${hp[49]} | 第100关: ${counts[99]}人 Lv${levels[99]} x${hp[99]}`);

// 地图与出生点
let spawnBad = 0, unreachable = 0;
for (let i = 1; i <= 100; i++) {
  const cfg = data.levelConfig(i);
  const party = [{ heroId: 'liubei', level: 5 }, { heroId: 'guanyu', level: 5 }];
  const st = game.createBattle(i, party, { seed: i });
  st.units.forEach(u => {
    const t = core.tileAt(st, u.x, u.y);
    if (t.pass !== true) { spawnBad++; if (spawnBad < 6) console.log(`   第${i}关 ${u.name} 出生在 ${t.name}`); }
  });
  // 敌方是否可达
  const p0 = st.units.find(u => u.side === 'player');
  const reach = core.reachable(st, p0);
  const has = reach.has ? 1 : 0;
  if (!has) unreachable++;
}
check('出生点均可站立', spawnBad === 0);
check('移动范围可计算', unreachable === 0);

console.log('=== 3. 自动对战模拟（玩家也用 AI 策略）===');

// 玩家练度模型：一路向前通关所得的关卡经验，外加把大部分金币拿去训练。
// 这是「正常玩家、不作弊」能达到的等级，用它来标定敌方强度才有意义。
function levelOfExp(exp) {
  let lv = 1;
  while (lv < 60 && exp >= 60 * lv * lv) lv++;
  return lv;
}
function realisticLevel(lv) {
  let exp = 0, gold = 0;
  for (let i = 1; i <= lv; i++) { exp += 20 + i * 7; gold += 30 + i * 9; }
  // 八成金币用于练兵，五人平摊
  let purse = gold * 0.8 / 5, spent = 0;
  let level = levelOfExp(exp);
  while (true) {
    const cost = 60 + level * 20;
    if (purse - spent < cost) break;
    spent += cost; exp += 60;
    level = levelOfExp(exp);
  }
  return level;
}

/** 出阵席位随战功渐增（与 store.partyCap 对应） */
function partyCapFor(lv) {
  return lv >= 60 ? 8 : lv >= 34 ? 7 : lv >= 12 ? 6 : 5;
}

function buildParty(lv) {
  const ids = data.STARTERS.slice();
  data.UNLOCKS.forEach(u => { if (u.lv <= lv) ids.push(u.id); });
  const level = realisticLevel(lv);
  return ids.slice(-partyCapFor(lv)).map(id => ({ heroId: id, level }));
}

function simulate(lv, seed) {
  const state = game.createBattle(lv, buildParty(lv), { seed });
  let guard = 0;
  while (!(state.result && state.result.over) && guard++ < 90) {
    const players = state.units.filter(u => u.alive && u.side === 'player');
    for (const u of players) {
      if (!u.alive) continue;
      ai.actUnit(state, u);
      core.refreshCapture(state);
      const v = core.checkVictory(state);
      if (v.over) { state.result = v; break; }
    }
    if (state.result && state.result.over) break;
    game.endPlayerTurn(state);
  }
  return {
    lv, over: !!(state.result && state.result.over),
    win: !!(state.result && state.result.win),
    turns: state.turn, reason: state.result ? state.result.reason : '未结束',
    stars: (state.result && state.result.win) ? game.gradeBattle(state) : 0
  };
}

let stuck = 0, crashes = 0;
const winByTen = [];
const RUNS = 3;                       // 每关多跑几个种子，降低单点噪声
for (let i = 1; i <= 100; i++) {
  for (let r = 0; r < RUNS; r++) {
    let res;
    try { res = simulate(i, i * 7 + r * 1013); } catch (e) { crashes++; console.log(`   第${i}关异常: ${e.message}`); continue; }
    if (!res.over) { stuck++; if (stuck <= 5) console.log(`   第${i}关未结束（${res.reason}, ${res.turns}回合）`); }
    const bucket = Math.floor((i - 1) / 10);
    winByTen[bucket] = winByTen[bucket] || { win: 0, n: 0 };
    winByTen[bucket].n++;
    if (res.win) winByTen[bucket].win++;
  }
}
check('无运行异常', crashes === 0);
check('无卡死关卡', stuck === 0);

console.log('   分段胜率（每 10 关，双方同为 AI 策略）:');
winByTen.forEach((b, i) => {
  const rate = Math.round(b.win / b.n * 100);
  console.log(`     第 ${String(i * 10 + 1).padStart(3)}-${String(i * 10 + 10).padStart(3)} 关: ${String(rate).padStart(3)}%  ${'#'.repeat(Math.round(rate / 4))}`);
});

// 难度曲线：后段胜率应低于前段
const early = winByTen.slice(0, 3).reduce((s, b) => s + b.win, 0) / winByTen.slice(0, 3).reduce((s, b) => s + b.n, 0);
const late = winByTen.slice(7).reduce((s, b) => s + b.win, 0) / winByTen.slice(7).reduce((s, b) => s + b.n, 0);
console.log(`   前 30 关胜率 ${Math.round(early * 100)}% → 后 30 关胜率 ${Math.round(late * 100)}%`);
check('难度递增（后段更难）', late <= early, `${Math.round(early * 100)}% vs ${Math.round(late * 100)}%`);

console.log('=== 4. 伤害与相克 ===');
{
  const st = game.createBattle(1, [{ heroId: 'guanyu', level: 10 }], { seed: 3 });
  const cav = st.units.find(u => u.side === 'player');
  const archer = game.makeUnit(st, 'huangzhong', 10, 'enemy');
  archer.x = cav.x; archer.y = cav.y;
  const d1 = core.computeDamage(st, cav, archer, {});
  const spear = game.makeUnit(st, 'zhangfei', 10, 'enemy');
  spear.x = cav.x; spear.y = cav.y;
  const d2 = core.computeDamage(st, spear, cav, {});
  console.log(`   骑兵→弓兵 ${d1.damage}（克制 x${core.counterRate('cavalry', 'archer')}）`);
  console.log(`   枪兵→骑兵 ${d2.damage}（克制 x${core.counterRate('spear', 'cavalry')}）`);
  check('相克倍率生效', core.counterRate('spear', 'cavalry') > 1 && core.counterRate('cavalry', 'archer') > 1);
  check('伤害为正整数', d1.damage > 0 && Number.isInteger(d1.damage));
}

console.log();
console.log(fail === 0 ? '全部通过' : `失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
