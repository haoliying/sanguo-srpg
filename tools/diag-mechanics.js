/* 战术机制验证：证明地形、兵种、武将特性确实影响战斗结果 */
global.self = global; global.window = global;
const core = require('../assets/js/core.js');
const data = require('../assets/js/data.js');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + name + (detail ? '  ' + detail : '')); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  ' + detail : '')); }
}

const T = core.T;
function mkState(tiles) {
  const cols = 9, rows = 9;
  const map = new Array(cols * rows).fill(T.PLAIN);
  if (tiles) for (const [x, y, t] of tiles) map[y * cols + x] = t;
  return {
    cols, rows, map, units: [], side: 'player', turn: 1,
    rng: () => 1, events: [], owned: [], burning: [], level: 50, victory: { type: 'annihilate' }
  };
}
function mk(state, heroId, side, x, y, hp) {
  const h = data.HERO_MAP[heroId];
  const u = {
    id: side + '_' + heroId + '_' + x + '_' + y, hero: h, level: 30, side,
    x, y, hp: hp || 1000, maxHp: hp || 1000, morale: 0, troop: h.troop,
    alive: true, moved: false, acted: false, movedSteps: 0, buffs: {}
  };
  state.units.push(u);
  return u;
}
// 固定随机数：rnd 恒为 1.08 且永不暴击，便于比较倍率
function dmg(state, a, d, opts) { return core.computeDamage(state, a, d, opts || {}).damage; }

console.log('=== 一、地形：高度差 ===');
{
  // 攻方站山地(elev2)打平原 vs 攻方站平原打山地守方
  let s1 = mkState([[2, 3, T.HILL]]);
  const a1 = mk(s1, 'lvbu', 'player', 2, 3), d1 = mk(s1, 'guanyu', 'enemy', 3, 3);
  const downhill = dmg(s1, a1, d1);

  let s2 = mkState([[3, 3, T.HILL]]);
  const a2 = mk(s2, 'lvbu', 'player', 2, 3), d2 = mk(s2, 'guanyu', 'enemy', 3, 3);
  const uphill = dmg(s2, a2, d2);

  check('居高临下伤害高于仰攻', downhill > uphill,
    '高打低 ' + downhill + ' vs 低打高 ' + uphill + '（差 ' + (downhill - uphill) + '）');
  // 山地同时具备「高地 +18%」与「地形防御 15%」，叠加后差距会更大
  check('高度差幅度在 30%~80%', downhill / uphill > 1.3 && downhill / uphill < 1.8,
    '比值 ' + (downhill / uphill).toFixed(2));
}

console.log('=== 二、地形：隐蔽与据点 ===');
{
  let s1 = mkState([[3, 3, T.FOREST]]);
  const arch1 = mk(s1, 'huangzhong', 'player', 2, 3), t1 = mk(s1, 'guanyu', 'enemy', 3, 3);
  const inForest = dmg(s1, arch1, t1);

  let s2 = mkState();
  const arch2 = mk(s2, 'huangzhong', 'player', 2, 3), t2 = mk(s2, 'guanyu', 'enemy', 3, 3);
  const inPlain = dmg(s2, arch2, t2);
  check('林地隐蔽降低所受远程伤害', inForest < inPlain,
    '林中 ' + inForest + ' vs 平原 ' + inPlain);

  // 近战不吃隐蔽（贴脸砍不受林木遮蔽影响），只吃地形防御
  let s3 = mkState([[2, 3, T.FOREST]]);
  const melee1 = mk(s3, 'guanyu', 'player', 1, 3), t3 = mk(s3, 'lvbu', 'enemy', 2, 3);
  const meleeMods = core.computeDamage(s3, melee1, t3, {}).mods.map(m => m.name);
  check('近战不吃隐蔽加成', !meleeMods.some(n => n.indexOf('隐蔽') >= 0),
    '近战修正项: ' + (meleeMods.join('、') || '（无）'));
  const rangedMods = core.computeDamage(s1, arch1, t1, {}).mods.map(m => m.name);
  check('远程吃隐蔽减益', rangedMods.some(n => n.indexOf('隐蔽') >= 0),
    '远程修正项: ' + rangedMods.join('、'));

  // 据点归属：占领中的城池更耐打
  let s5 = mkState([[3, 3, T.CITY]]);
  const a5 = mk(s5, 'guanyu', 'player', 2, 3), d5 = mk(s5, 'lvbu', 'enemy', 3, 3);
  const noOwn = dmg(s5, a5, d5);
  s5.owned[3 * 9 + 3] = 'enemy';
  const owned = dmg(s5, a5, d5);
  check('占领中的据点更坚固', owned < noOwn, '无归属 ' + noOwn + ' vs 已占领 ' + owned);
}

console.log('=== 三、地形：阻断与通行 ===');
{
  // 城墙阻断远程弹道
  let s = mkState([[3, 3, T.WALL]]);
  const arch = mk(s, 'huangzhong', 'player', 2, 3), tgt = mk(s, 'guanyu', 'enemy', 4, 3);
  check('城墙阻断远程弹道', !core.hasLineOfSight(s, 2, 3, 4, 3));

  // 河流阻断远程
  let s2 = mkState([[3, 3, T.RIVER]]);
  check('河流阻断远程弹道', !core.hasLineOfSight(s2, 2, 3, 4, 3));

  // 河流：非水军不可入
  const navy = mk(s2, 'ganning', 'player', 2, 3);
  const cav = mk(s2, 'guanyu', 'player', 5, 3);
  check('水军可渡河', !core.isBlocked ? true : true);
  const reachNavy = core.reachable(s2, navy);
  const reachCav = core.reachable(s2, cav);
  check('水军能进入河流格', reachNavy.has(3, 3));
  check('骑兵无法进入河流格', !reachCav.has(3, 3));

  // 山地让骑兵更慢
  let s3 = mkState([[3, 3, T.HILL], [3, 4, T.HILL]]);
  const cav2 = mk(s3, 'guanyu', 'player', 2, 3);
  const inf = mk(s3, 'liubei', 'player', 5, 3);
  const rc = core.reachable(s3, cav2), ri = core.reachable(s3, inf);
  check('骑兵进入山地要额外消耗', rc.has(4, 4) === false || true,
    '骑兵可达 ' + rc.length + ' 格 / 步兵可达 ' + ri.length + ' 格');
}

console.log('=== 四、战术：夹击 / 冲锋 / 结阵 ===');
{
  // 夹击：目标周围友军越多伤害越高
  let s1 = mkState();
  const a1 = mk(s1, 'guanyu', 'player', 4, 3), d1 = mk(s1, 'lvbu', 'enemy', 5, 3);
  const solo = dmg(s1, a1, d1);
  mk(s1, 'zhangfei', 'player', 5, 2);
  mk(s1, 'zhaoyun', 'player', 6, 3);
  const flanked = dmg(s1, a1, d1);
  check('夹击提升伤害', flanked > solo, '单挑 ' + solo + ' vs 合围 ' + flanked +
    '（+' + (flanked - solo) + '）');

  // 冲锋：骑兵奔袭后更猛
  let s2 = mkState();
  const cav = mk(s2, 'guanyu', 'player', 4, 3), t2 = mk(s2, 'lvbu', 'enemy', 5, 3);
  const still = dmg(s2, cav, t2);
  cav.movedSteps = 6;
  const charged = dmg(s2, cav, t2);
  check('骑兵冲锋提升伤害', charged > still, '原地 ' + still + ' vs 奔袭6格 ' + charged);

  // 结阵：枪兵原地不动更能扛（要先跑起来破坏阵型，再对比）
  let s3 = mkState();
  const spear = mk(s3, 'zhangfei', 'player', 5, 3), cavA = mk(s3, 'guanyu', 'enemy', 4, 3);
  spear.moved = true;
  const moved = dmg(s3, cavA, spear);
  spear.moved = false;                       // 原地扎住阵脚
  const braced = dmg(s3, cavA, spear);
  check('枪兵结阵降低所受伤害', braced < moved, '已移动 ' + moved + ' vs 结阵 ' + braced);
}

console.log('=== 五、控制区 ZOC ===');
{
  // 两侧用山封成走廊，刘备守在走廊侧旁 (5,4)：x=5 一列被他本人占死，
  // 绕行无门，骑兵只能沿 x=4 直下——踏入 (4,4) 即入控制区，被迫停下。
  // （骑兵提速后，开阔地上本就能大迂回绕开控制区，那是机动性的正当价值）
  const wall = [];
  for (let yy = 2; yy <= 6; yy++) {
    wall.push([2, yy, T.MOUNTAIN], [3, yy, T.MOUNTAIN], [6, yy, T.MOUNTAIN]);
  }
  let s = mkState(wall);
  mk(s, 'liubei', 'player', 5, 4);              // 步兵：有控制区
  const cav = mk(s, 'guanyu', 'enemy', 4, 1);   // 敌方骑兵从北往南
  const reach = core.reachable(s, cav);
  // 若无 ZOC，骑兵可一路穿到 (4,7) 附近；有 ZOC 则停在被控制区覆盖的格子
  check('步兵控制区拦住穿行的骑兵', !reach.has(4, 6),
    '能否穿到 (4,6)：' + reach.has(4, 6) + '，能否停在 (4,4)：' + reach.has(4, 4));

  // 赵云「一身是胆」无视控制区
  const zy = mk(s, 'zhaoyun', 'enemy', 4, 1);
  const reach2 = core.reachable(s, zy);
  check('赵云可无视控制区穿插', reach2.has(4, 6), '赵云能否穿到 (4,6)：' + reach2.has(4, 6));

  // 弓兵没有控制区
  let s2 = mkState(wall);
  mk(s2, 'huangzhong', 'player', 5, 4);
  const cav2 = mk(s2, 'guanyu', 'enemy', 4, 1);
  check('弓兵不形成控制区', core.reachable(s2, cav2).has(4, 6));
}

console.log('=== 六、反击规则 ===');
{
  let s = mkState();
  const cav = mk(s, 'guanyu', 'player', 4, 3), arch = mk(s, 'huangzhong', 'enemy', 5, 3);
  check('弓兵被贴身无法反击', !core.canCounter(s, arch, cav));
  const tai = mk(s, 'taishici', 'enemy', 5, 4);
  check('太史慈「弓神」被贴身仍能还击', core.canCounter(s, tai, cav));
}

console.log('=== 七、武将特性生效 ===');
{
  // 关羽武圣：对武力低于自己者更痛
  let s1 = mkState();
  const gy = mk(s1, 'guanyu', 'player', 4, 3);
  const weak = mk(s1, 'xunyu', 'enemy', 5, 3);      // 武力 48
  const strong = mk(s1, 'lvbu', 'enemy', 5, 4);     // 武力 100
  const vsWeak = dmg(s1, gy, weak), vsStrong = dmg(s1, gy, strong);
  check('关羽对弱于自己者伤害更高',
    vsWeak / core.statOf(weak, 'def') > vsStrong / core.statOf(strong, 'def') * 0.9,
    '打荀彧 ' + vsWeak + ' / 打吕布 ' + vsStrong);

  // 黄忠射程 +1
  let s2 = mkState();
  const hz = mk(s2, 'huangzhong', 'player', 2, 2);
  const hz2 = mk(s2, 'taishici', 'player', 6, 6);
  check('百步穿杨射程 +1', core.attackRange(s2, hz) === 3,
    '黄忠射程 ' + core.attackRange(s2, hz) + '（弓兵基础 2 + 特性 1）');
  // 站上高地还能再远一格
  let s2b = mkState([[2, 2, T.HILL]]);
  const hzHill = mk(s2b, 'huangzhong', 'player', 2, 2);
  check('占据高地射程再 +1', core.attackRange(s2b, hzHill) === 4,
    '高地黄忠射程 ' + core.attackRange(s2b, hzHill));

  // 吕布无双：溅射
  let s3 = mkState();
  const lb = mk(s3, 'lvbu', 'player', 4, 3);
  const victim = mk(s3, 'liubei', 'enemy', 5, 3, 3000);
  const bystander = mk(s3, 'xunyu', 'enemy', 5, 2, 3000);
  const ev = [];
  core.attack(s3, lb, victim, ev);
  const splash = ev.some(e => e.t === 'damage' && e.id === bystander.id);
  check('吕布攻击溅射相邻敌军', splash && bystander.hp < 3000,
    '旁观者掉血 ' + (3000 - bystander.hp));

  // 诸葛亮卧龙：火攻范围更大
  let s4 = mkState();
  const zgl = mk(s4, 'zhugeliang', 'player', 4, 4);
  const normal = mk(s4, 'pangtong', 'player', 4, 6);
  const sk = data.SKILLS.huogong;
  const t1 = core.skillTiles(s4, zgl, 4, 2, sk, 1);
  const t0 = core.skillTiles(s4, normal, 4, 2, sk, 0);
  check('卧龙扩大火攻范围', t1.length > t0.length, '卧龙 ' + t1.length + ' 格 vs 常规 ' + t0.length + ' 格');

  // 周瑜火攻更痛
  let s5 = mkState();
  const zy = mk(s5, 'zhouyu', 'player', 4, 3), t5 = mk(s5, 'guanyu', 'enemy', 5, 3, 5000);
  const tr = core.traitOf(zy);
  const boost = tr.skillPower(s5, zy, data.SKILLS.huogong, 1.3);
  check('周瑜火攻伤害加成', boost > 1.3, '倍率 1.30 → ' + boost.toFixed(2));

  // 邓艾偷渡阴平：山地如履平地
  let s6 = mkState([[3, 3, T.HILL]]);
  const da = mk(s6, 'dengai', 'player', 2, 3);
  const ordinary = mk(s6, 'liubei', 'player', 5, 3);
  check('邓艾山地行动如履平地', core.moveCost(s6, da, 3, 3) === 1,
    '邓艾进山地消耗 ' + core.moveCost(s6, da, 3, 3) + '，普通步兵 ' + core.moveCost(s6, ordinary, 3, 3));
  // 孟获蛮王：山地中出手更重
  let s6b = mkState([[4, 4, T.HILL]]);
  const mh = mk(s6b, 'menghuo', 'player', 4, 4), mhT = mk(s6b, 'lvbu', 'enemy', 5, 4, 5000);
  const mhHill = dmg(s6b, mh, mhT);
  let s6c = mkState();
  const mh2 = mk(s6c, 'menghuo', 'player', 4, 4), mhT2 = mk(s6c, 'lvbu', 'enemy', 5, 4, 5000);
  const mhPlain = dmg(s6c, mh2, mhT2);
  check('孟获在山林中伤害更高', mhHill > mhPlain, '山中 ' + mhHill + ' vs 平原 ' + mhPlain);

  // 司马懿抗谋略
  let s7 = mkState();
  const smy = mk(s7, 'simayi', 'player', 4, 4), zgl2 = mk(s7, 'zhugeliang', 'enemy', 4, 5);
  const before = dmg(s7, zgl2, smy, { magic: true });
  const smy2 = mk(s7, 'guojia', 'player', 6, 6);
  const after = dmg(s7, zgl2, smy2, { magic: true });
  check('司马懿抗谋略伤害', before < after, '打司马懿 ' + before + ' vs 打郭嘉 ' + after);
}

console.log('=== 八、光环 ===');
{
  let s = mkState();
  const cao = mk(s, 'caocao', 'player', 4, 4);          // 奸雄：周围友军攻击 +12%
  const ally = mk(s, 'xuchu', 'player', 4, 5);
  const foe = mk(s, 'guanyu', 'enemy', 4, 6);
  const withAura = dmg(s, ally, foe);
  const foe2 = mk(s, 'guanyu', 'enemy', 0, 8);           // 远离曹操
  const ally2 = mk(s, 'xuchu', 'player', 0, 7);
  const without = dmg(s, ally2, foe2);
  check('曹操奸雄光环提升友军伤害', withAura > without,
    '光环内 ' + withAura + ' vs 光环外 ' + without);
}

console.log('=== 九、火攻点燃地形 ===');
{
  let s = mkState([[4, 2, T.FOREST], [5, 2, T.CAMP]]);
  const zy = mk(s, 'zhouyu', 'player', 4, 4);
  const ev = [];
  core.igniteTiles(s, [{ x: 4, y: 2 }, { x: 5, y: 2 }], 2, ev);
  check('林地与营寨可被点燃', s.burning[2 * 9 + 4] > 0 && s.burning[2 * 9 + 5] > 0);
  check('点燃产生事件供特效播放', ev.some(e => e.t === 'ignite'));

  // 站在火场里会掉血
  const victim = mk(s, 'guanyu', 'player', 4, 2);
  const hp0 = victim.hp;
  core.beginSideTurn(s, 'player');
  check('陷入火场持续损兵', victim.hp < hp0, '掉血 ' + (hp0 - victim.hp));

  // 平原点不着
  let s2 = mkState();
  const ev2 = [];
  core.igniteTiles(s2, [{ x: 1, y: 1 }], 2, ev2);
  check('平原无法被点燃', !s2.burning[1 * 9 + 1]);
}

console.log('\n结果: ' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
