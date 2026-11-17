/* 诊断：地图放大后难度曲线为何偏移——统计每关的胜负与结束原因 */
const core = require('../assets/js/core.js');
const data = require('../assets/js/data.js');
const ai = require('../assets/js/ai.js');
const game = require('../assets/js/game.js');

const FROM = +(process.argv[2] || 11), TO = +(process.argv[3] || 30);

function realisticLevel(lv) {
  let exp = 0;
  for (let i = 1; i < lv; i++) exp += 20 + i * 7;
  let level = 1;
  const need = [0, 60, 140, 240, 370, 530, 720, 950, 1230, 1570];
  while (level < 10 && exp >= need[level]) level++;
  return level;
}
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
    for (const u of state.units.filter(u => u.alive && u.side === 'player')) {
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
    lv, win: !!(state.result && state.result.win), turns: state.turn,
    reason: state.result ? state.result.reason : '未结束',
    limit: state.turnLimit
  };
}

const reasons = {};
let sumTurns = 0, n = 0;
for (let lv = FROM; lv <= TO; lv++) {
  for (let r = 0; r < 3; r++) {
    const res = simulate(lv, lv * 7 + r * 1013);
    const key = res.win ? 'WIN' : (res.reason || '?');
    reasons[key] = (reasons[key] || 0) + 1;
    sumTurns += res.turns; n++;
    if (!res.win && lv <= FROM + 1) {
      console.log(`  第${lv}关 seed${r}: ${res.reason} @${res.turns}回合 (上限${res.limit})`);
    }
  }
}
console.log(`\n第${FROM}-${TO}关 结果分布:`, JSON.stringify(reasons));
console.log(`平均结束回合: ${(sumTurns / n).toFixed(1)}`);
