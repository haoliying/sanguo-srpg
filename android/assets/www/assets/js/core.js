/* ==========================================================================
 * core.js — 战棋规则引擎（纯逻辑，可在 Node 中单独测试）
 *
 * 职责：地图生成、移动力计算、攻击与反击、武将技、胜负判定、回合流程。
 * 所有随机都走 state.rng，保证同一关卡可复现。
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SG = root.SG || {};
    root.SG.core = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var core = {};

  /* ------------------------------------------------------------------ *
   * 地形
   * ------------------------------------------------------------------ */

  /*
   * 地形不只是「减伤数值」，每类都要有明确的战术定位：
   *   elev    高度：高打低加成、低打高减益；远程站高处射程 +1
   *   hide    隐蔽：降低所受远程/谋略伤害，林地可用于伏击
   *   blocks  阻断：城墙、高山阻断远程弹道；河流阻断陆上远程
   *   cav     骑兵额外移动消耗（骑兵不适山地林地）
   *   burn    可被火攻点燃，站在燃烧格上持续掉血
   *   capture 可占领据点：归属方回血、回士气、防御加成
   *   ban     禁止通过兵种的 key 列表（骑兵难行山路、辎重不可入沼泽）
   *   outside 图外：地图轮廓之外的虚空，用于生成不规则形状
   *   water   水面（结算时进入水战规则）
   */
  var TERRAIN = [
    { id: 0, key: 'plain', name: '平原', cost: 1, def: 0, elev: 0, hide: 0, blocks: false, pass: true, heal: 0, tip: '沃野千里，无险可守亦无阻难行' },
    { id: 1, key: 'grass', name: '草地', cost: 1, def: 5, elev: 0, hide: 5, blocks: false, pass: true, heal: 0, tip: '青葱牧野，轻微隐蔽' },
    { id: 2, key: 'downs', name: '丘陵', cost: 2, def: 10, elev: 1, hide: 0, blocks: false, pass: true, cav: 1, tip: '缓坡起伏，居高者略占优势；骑兵行动稍滞' },
    { id: 3, key: 'hill', name: '山地', cost: 2, def: 15, elev: 2, hide: 0, blocks: false, pass: true, cav: 1, rangeBonus: 1, tip: '高地：远程射程+1，居高临下伤害加成；骑兵额外消耗' },
    { id: 4, key: 'path', name: '山道', cost: 2, def: 8, elev: 2, hide: 0, blocks: false, pass: true, cav: 2, ban: ['wagon'], choke: true, rangeBonus: 1, tip: '群山中的羊肠小道：步兵可行，骑兵艰难，辎重队无法通过' },
    { id: 5, key: 'forest', name: '林地', cost: 2, def: 10, elev: 1, hide: 25, blocks: false, pass: true, cav: 1, ambush: true, burn: true, tip: '隐蔽：受远程伤害-25%，可设伏；一遇火攻即成火海' },
    { id: 6, key: 'marsh', name: '沼泽', cost: 3, def: 5, elev: -1, hide: 10, blocks: false, pass: true, cav: 3, ban: ['wagon'], sticky: true, tip: '泥沼陷足：消耗巨大，骑兵寸步难行，辎重队无法进入' },
    { id: 7, key: 'river', name: '河流', cost: 1, def: 0, elev: -1, hide: 0, blocks: true, pass: 'navy', heal: 0, water: true, flow: true, tip: '大江大河：非水军不可渡（除非桥梁浅滩）；阻断远程弹道' },
    { id: 8, key: 'lake', name: '湖泊', cost: 2, def: 0, elev: -2, hide: 0, blocks: false, pass: 'navy', heal: 0, water: true, tip: '湖沼水域：唯有水军可纵横其上' },
    { id: 9, key: 'ford', name: '浅滩', cost: 2, def: 0, elev: -1, hide: 0, blocks: false, pass: true, heal: 0, water: true, choke: true, tip: '水浅可涉：全军皆可通行，但行动迟缓且无法据守' },
    { id: 10, key: 'bridge', name: '桥梁', cost: 1, def: 0, elev: 0, hide: 0, blocks: false, pass: true, heal: 0, choke: true, tip: '咽喉要道，扼桥者可阻十万大军' },
    { id: 11, key: 'ship', name: '战船', cost: 2, def: 5, elev: 0, hide: 0, blocks: false, pass: true, heal: 0, water: true, burn: true, deck: true, tip: '连环楼船：陆师亦可登船水战，然一处着火则满江皆焚' },
    { id: 12, key: 'city', name: '城池', cost: 1, def: 20, elev: 2, hide: 0, blocks: false, pass: true, heal: 60, capture: true, tip: '坚城重镇：占领后每回合回血回气，防御大增' },
    { id: 13, key: 'camp', name: '营寨', cost: 1, def: 12, elev: 1, hide: 0, blocks: false, pass: true, heal: 30, capture: true, burn: true, tip: '连营寨栅：占领后回血；最怕一把火' },
    { id: 14, key: 'road', name: '道路', cost: 0.7, def: 0, elev: 0, hide: 0, blocks: false, pass: true, heal: 0, tip: '官道坦途，行军神速' },
    { id: 15, key: 'wall', name: '城墙', cost: 99, def: 0, elev: 3, hide: 0, blocks: true, pass: false, heal: 0, tip: '高墙深垒，不可通行，阻断远程弹道' },
    { id: 16, key: 'mountain', name: '高山', cost: 99, def: 0, elev: 4, hide: 0, blocks: true, pass: false, heal: 0, tip: '崇山峻岭，飞鸟难过；唯有山道可通' },
    { id: 17, key: 'void', name: '图外', cost: 99, def: 0, elev: 0, hide: 0, blocks: true, pass: false, heal: 0, outside: true, tip: '' }
  ];
  var T = {
    PLAIN: 0, GRASS: 1, DOWNS: 2, HILL: 3, PATH: 4, FOREST: 5, MARSH: 6,
    RIVER: 7, LAKE: 8, FORD: 9, BRIDGE: 10, SHIP: 11,
    CITY: 12, CAMP: 13, ROAD: 14, WALL: 15, MOUNTAIN: 16, VOID: 17
  };

  /*
   * 战场遗留物——大范围计略在地形上留下的痕迹。
   * 火烧连营、水淹七军、落石断路、八阵困敌，都不只是一次伤害，
   * 而是实实在在改写这片地：能截断行军路线、逼敌军改道，
   * 因而「用地形打仗」才是真战术，而非两军站定互砍。
   */
  var HAZ = { NONE: 0, FIRE: 1, FLOOD: 2, ROCK: 3, ARRAY: 4 };
  var HAZ_DEF = {
    1: {
      key: 'fire', name: '火场', turns: 3,
      cost: 3, cavCost: 5, dot: 0.07, tip: '烈焰熊熊：穿越代价高昂，停留每回合损兵'
    },
    2: {
      key: 'flood', name: '洪水', turns: 4,
      cost: 2, dot: 0.03, waterOnly: true, tip: '一片汪洋：非水军不得涉渡，行军路线断绝'
    },
    3: {
      key: 'rock', name: '乱石', turns: 5,
      block: true, tip: '巨石堵道：彻底阻断，数回合后渐渐清开'
    },
    4: {
      key: 'array', name: '阵法', turns: 2,
      cost: 2, stun: true, tip: '八阵图：入阵者方位迷乱，动弹不得'
    }
  };
  var HAZ_TERRAIN = {
    fire: {
      // 可燃烧的地形：林地、营寨、战船、草地、丘陵枯草
      burnable: ['forest', 'camp', 'ship', 'grass', 'downs'],
      // 火烧不过去的地方：水面、城墙、高山、图外
      immune: ['river', 'lake', 'wall', 'mountain', 'void', 'city']
    },
    flood: {
      // 水攻可淹的地形：低洼、水域、河滩
      lowland: ['river', 'lake', 'ford', 'marsh', 'plain', 'road', 'bridge', 'ship'],
      immune: ['mountain', 'wall', 'void', 'city', 'hill', 'path']
    },
    rock: {
      // 落石须依山势：紧邻高山/山地/山道
      source: ['mountain', 'hill', 'path'],
      immune: ['river', 'lake', 'void']
    }
  };

  function elevAt(state, x, y) { return tileAt(state, x, y).elev; }

  /* ---------------- 战场遗留物 ---------------- */

  function hazAt(state, x, y) {
    if (!state.hazard || !inBounds(state, x, y)) return 0;
    return state.hazard[idx(state, x, y)] || 0;
  }

  function hazDef(v) { return HAZ_DEF[v] || null; }

  /** 该格遗留物的剩余回合数（与类型分开存，便于倒计时） */
  function hazTurns(state, x, y) {
    if (!state.hazardTurns || !inBounds(state, x, y)) return 0;
    return state.hazardTurns[idx(state, x, y)] || 0;
  }

  function setHaz(state, x, y, v, turns) {
    if (!inBounds(state, x, y)) return;
    state.hazard = state.hazard || new Uint8Array(state.cols * state.rows);
    state.hazardTurns = state.hazardTurns || new Uint8Array(state.cols * state.rows);
    var k = idx(state, x, y);
    var d = hazDef(v);
    // 同类型叠加取较长者，避免重复施放把回合数白白冲掉
    if (state.hazard[k] === v) {
      state.hazardTurns[k] = Math.max(state.hazardTurns[k] || 0, turns);
    } else {
      state.hazard[k] = v;
      state.hazardTurns[k] = turns === undefined ? (d ? d.turns : 2) : turns;
      // 上方谷剧本：头一回点着谷中火，便记下时辰——两轮后天降骤雨
      if (v === HAZ.FIRE && state.scenario && state.scenario.flags &&
          state.scenario.flags.rainDouse && !state.fireLitTurn) {
        state.fireLitTurn = state.turn;
      }
    }
  }

  function clearHaz(state, x, y) {
    if (!state.hazard || !inBounds(state, x, y)) return;
    var k = idx(state, x, y);
    state.hazard[k] = 0;
    if (state.hazardTurns) state.hazardTurns[k] = 0;
  }

  /** 某格是否可燃烧 */
  function isBurnable(state, x, y) {
    var t = tileAt(state, x, y);
    return HAZ_TERRAIN.fire.burnable.indexOf(t.key) >= 0;
  }

  /** 某格是否可被水淹（低洼地带） */
  function isFloodable(state, x, y) {
    var t = tileAt(state, x, y);
    if (HAZ_TERRAIN.flood.immune.indexOf(t.key) >= 0) return false;
    // 高地淹不了；水域与低洼才是水攻的用武之地
    return t.water || t.elev <= 0 || HAZ_TERRAIN.flood.lowland.indexOf(t.key) >= 0;
  }

  /** 某格是否依山（可推落石） */
  function isRockable(state, x, y) {
    var t = tileAt(state, x, y);
    if (HAZ_TERRAIN.rock.immune.indexOf(t.key) >= 0) return false;
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    for (var d = 0; d < dirs.length; d++) {
      var nx = x + dirs[d][0], ny = y + dirs[d][1];
      if (!inBounds(state, nx, ny)) continue;
      if (HAZ_TERRAIN.rock.source.indexOf(tileAt(state, nx, ny).key) >= 0) return true;
    }
    return false;
  }

  /** 该格子是否属于地图实际范围（非方形地图的图外区域返回 false） */
  function isPlayable(state, x, y) {
    if (!inBounds(state, x, y)) return false;
    return !TERRAIN[state.map[idx(state, x, y)]].outside;
  }

  /* ------------------------------------------------------------------ *
   * 兵种与相克
   * ------------------------------------------------------------------ */

  /*
   * 六大兵种——出征前可为武将更换，直接决定移动力、射程与攻防：
   *   move/range  基础机动力与打击距离
   *   atk/def     攻防系数
   *   zoc         控制区：相邻敌军移动会被迫停下（近战兵种才有）
   *   melee       近战：只有近战能反击近战
   *   charge      冲锋：长距离奔袭后伤害递增
   *   brace       结阵：原地不动时防御提升、反骑兵加倍
   *   frail       脆皮：被贴身时无法反击
   *   water       水战：水面格攻防提升
   *   navySkill   水军通行证：可进入河流湖泊
   *   landPen     离水登岸的战力折损
   *   supply      辎重：为相邻友军补给（回血回气），自身极其笨重
   */
  var TROOPS = {
    infantry: {
      key: 'infantry', name: '步兵', short: '步', move: 6, range: 1, atk: 1.00, def: 1.14,
      zoc: true, melee: true, brace: true, tough: true,
      desc: '最坚实的军阵。四平八稳，山地沼泽皆可通行，据守要道无人能越雷池一步'
    },
    cavalry: {
      key: 'cavalry', name: '骑兵', short: '马', move: 12, range: 1, atk: 1.14, def: 0.92,
      zoc: true, melee: true, charge: true,
      desc: '来去如风，冲阵摧坚。奔袭三格以上伤害递增，但山地林地沼泽举步维艰'
    },
    archer: {
      key: 'archer', name: '弓兵', short: '弓', move: 5, range: 2, atk: 1.02, def: 0.90,
      melee: false, frail: true, volley: true,
      desc: '强弩齐射，隔距杀伤。占据高地更远一箭之遥，然一旦被近身便无力还手'
    },
    navy: {
      key: 'navy', name: '水军', short: '水', move: 7, range: 1, atk: 0.96, def: 1.02,
      zoc: true, melee: true, water: true, navySkill: true, landPen: 0.85,
      desc: '楼船斗舰，江河纵横。可渡江湖而断路断桥皆不足惧，登岸作战则战力折损'
    },
    wagon: {
      key: 'wagon', name: '辎重', short: '辎', move: 4, range: 1, atk: 0.72, def: 1.28,
      zoc: true, melee: true, supply: true, heavy: true, hpBonus: 0.25,
      desc: '粮草辎重、攻城器械。兵多血厚且能为友军补给，然笨重迟缓，山地沼泽小道一概难行'
    },
    scholar: {
      key: 'scholar', name: '谋士', short: '谋', move: 5, range: 3, atk: 0.84, def: 0.80,
      melee: false, frail: true, magic: true,
      desc: '运筹帷幄，谋略及远。火攻水攻兽攻皆出其手，最惧铁骑突袭近身'
    }
  };

  /** 旧存档兵种 key 兼容（枪兵并入步兵、策士并入谋士） */
  TROOPS.spear = TROOPS.infantry;
  TROOPS.strategist = TROOPS.scholar;

  /** 默认可用兵种（未在武将上声明时的兜底） */
  var DEFAULT_TROOPS = ['infantry', 'cavalry', 'archer', 'navy', 'wagon', 'scholar'];

  /** 某武将可配置的兵种列表 */
  function troopsFor(hero, unit) {
    if (hero && hero.troops && hero.troops.length) return hero.troops;
    return DEFAULT_TROOPS;
  }

  /** 地形是否禁止该兵种通过 */
  function terrainBans(tile, troopKey) {
    if (!tile || !tile.ban) return false;
    return tile.ban.indexOf(troopKey) >= 0;
  }

  /* ------------------------------------------------------------------ *
   * 武将特性（被动）
   *
   * TRAITS 的具体条目由 data.js 注册进来，这里只提供查询与钩子。
   * 每个特性可声明：
   *   dmg(state, unit, target, opts)   伤害倍率
   *   taken(state, unit, attacker)     受到伤害的倍率
   *   range(state, unit, base)         射程修正
   *   move(state, unit, base)          移动力修正
   *   moveCost(state, unit, tile, c)   进入某格消耗修正
   *   crit(state, unit, target)        额外暴击率
   *   aura(state, unit)                光环：返回 { allies:{atk,def}, enemies:{atk,def}, radius }
   *   onTurn(state, unit, events)      己方回合开始触发
   *   onKill(state, unit, events)      击杀触发
   *   onAttack(state, unit, target, events) 攻击后触发
   *   breakthrough / mountaineer 等布尔开关
   * ------------------------------------------------------------------ */

  var TRAITS = {};

  function traitOf(unit) {
    if (!unit || !unit.hero) return null;
    var key = unit.hero.trait;
    return key ? (TRAITS[key] || null) : null;
  }

  function hasTrait(unit, flag) {
    if (!unit || !unit.hero || !unit.hero.trait) return false;
    // 布尔开关既可在特性对象上声明，也可在武将身上直接带
    var tr = TRAITS[unit.hero.trait];
    if (tr && tr[flag]) return true;
    return !!unit.hero[flag];
  }

  /** 该兵种是否拥有控制区（阻挡敌军自由穿行） */
  function hasZOC(unit) { return !!TROOPS[unit.troop].zoc; }

  /** 敌方单位对 (x,y) 形成的控制区（不含单位自身所在格） */
  function zocAt(state, x, y, side) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || u.side === side) continue;
      if (!hasZOC(u)) continue;
      for (var d = 0; d < 4; d++) {
        if (u.x + dirs[d][0] === x && u.y + dirs[d][1] === y) return true;
      }
    }
    return false;
  }

  /** 相邻格上是否有敌军（用于夹击判定） */
  function adjacentEnemies(state, unit, side) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var out = [];
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || u.side === side) continue;
      for (var d = 0; d < 4; d++) {
        if (u.x + dirs[d][0] === unit.x && u.y + dirs[d][1] === unit.y) { out.push(u); break; }
      }
    }
    return out;
  }

  /** 相邻是否有己方辎重队提供补给 */
  function adjacentSupply(state, unit) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var d = 0; d < 4; d++) {
      var u = unitAt(state, unit.x + dirs[d][0], unit.y + dirs[d][1]);
      if (!u || !u.alive || u.side !== unit.side) continue;
      if (TROOPS[u.troop] && TROOPS[u.troop].supply) return u;
    }
    return null;
  }

  /** 夹击：目标周围每有一个攻击方友军，伤害 +10%（上限 +30%） */
  function flankBonus(state, attacker, defender) {
    var adj = adjacentEnemies(state, defender, defender.side)
      .filter(function (u) { return u.side === attacker.side && u.id !== attacker.id; });
    return Math.min(0.30, adj.length * 0.10);
  }

  // 攻击方 -> 防守方 的伤害倍率（六兵种相克）
  var COUNTER = {
    // 铁骑冲阵：专克弓弩与文职，最怕枪阵拒马
    cavalry: { archer: 1.35, scholar: 1.40, wagon: 1.25 },
    // 强弩压制：隔距杀伤，克枪阵与步卒
    archer: { infantry: 1.20, wagon: 1.15, navy: 1.10 },
    // 步卒（枪阵）：拒马结阵专破铁骑，兼克谋士与辎重。
    // 注意：不再反过来克弓兵——那会和 archer 克 infantry 相互抵消，两边都白写。
    infantry: { cavalry: 1.25, scholar: 1.10, wagon: 1.22 },
    // 谋士：谋略及远，克制笨重的辎重与步卒
    scholar: { infantry: 1.18, wagon: 1.25 },
    // 舟师：水陆两栖，登岸则钝
    navy: { archer: 1.15, scholar: 1.12 },
    // 辎重：兵多将广，耐久而钝
    wagon: { scholar: 1.15 }
  };
  // 旧存档兵种名兼容
  COUNTER.spear = COUNTER.infantry;
  COUNTER.strategist = COUNTER.scholar;

  function counterRate(aTroop, dTroop) {
    var row = COUNTER[aTroop];
    return (row && row[dTroop]) || 1;
  }

  /* ------------------------------------------------------------------ *
   * 随机数（可复现）
   * ------------------------------------------------------------------ */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashSeed(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* ------------------------------------------------------------------ *
   * 网格工具
   * ------------------------------------------------------------------ */

  function inBounds(state, x, y) {
    return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
  }

  function idx(state, x, y) { return y * state.cols + x; }

  function tileAt(state, x, y) {
    if (!inBounds(state, x, y)) return TERRAIN[T.WALL];
    return TERRAIN[state.map[idx(state, x, y)]];
  }

  /** 曼哈顿距离（战棋用四方向） */
  function dist(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

  function unitAt(state, x, y) {
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.alive && u.x === x && u.y === y) return u;
    }
    return null;
  }

  /** 该单位能否踏入 (x,y) 地块（只看地形，不看单位） */
  function terrainPassable(state, x, y, unit) {
    var t = tileAt(state, x, y);
    if (t.pass === false || t.outside) return false;
    var troop = unit ? TROOPS[unit.troop] : null;
    if (troop && terrainBans(t, unit.troop)) return false;
    if (t.pass === 'navy') {
      if (troop && (troop.navySkill || hasTrait(unit, 'riverwalk'))) return true;
      return false;
    }
    return true;
  }

  function isBlocked(state, x, y, unit) {
    if (!isPlayable(state, x, y)) return true;
    if (!terrainPassable(state, x, y, unit)) return true;
    // 遗留物阻断：乱石彻底堵死，洪水非水军不得涉渡
    var hz = hazAt(state, x, y);
    if (hz) {
      var hd = hazDef(hz);
      if (hd && hd.block) return true;
      if (hd && hd.waterOnly && !TROOPS[unit.troop].navySkill) return true;
    }
    var u = unitAt(state, x, y);
    if (u && u.side !== unit.side) return true;   // 敌军挡路
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 移动范围（Dijkstra，地形消耗不同）
   * ------------------------------------------------------------------ */

  /** 占位索引：一次遍历建表，免得逐格把全军扫一遍 */
  function occupancyOf(state) {
    var m = {};
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.alive) m[idx(state, u.x, u.y)] = u;
    }
    return m;
  }

  /** 控制区网格：同样一次建表，逐格查询 O(1) */
  function zocGrid(state, side) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var m = {};
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || u.side === side) continue;
      if (!TROOPS[u.troop].zoc) continue;
      for (var d = 0; d < 4; d++) {
        var x = u.x + dirs[d][0], y = u.y + dirs[d][1];
        if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) continue;
        m[idx(state, x, y)] = true;
      }
    }
    return m;
  }

  /** 有人挪了窝或阵亡，寻路缓存就得作废 */
  function bumpOccupancy(state) {
    state._occVersion = (state._occVersion || 0) + 1;
    state._reachCache = null;
  }

  function reachable(state, unit) {
    // 同一单位、同一位置、场面无变化 —— 直接复用上一次的推演结果。
    // AI 决策时会反复问「我能走到哪」，大军压境时这一下省下大半开销。
    var ver = state._occVersion || 0;
    var c = state._reachCache;
    if (c && c.unit === unit && c.x === unit.x && c.y === unit.y && c.ver === ver) return c.val;

    var mp = movePoints(state, unit);
    var occ = occupancyOf(state);
    var zoc = zocGrid(state, unit.side);
    var start = idx(state, unit.x, unit.y);
    var best = {};
    best[start] = 0;
    var prev = {};
    var frontier = [[unit.x, unit.y]];
    var head = 0;
    var result = [];

    var noZoc = hasTrait(unit, 'breakthrough');   // 赵云等可无视控制区穿插
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];

    while (head < frontier.length) {
      var cur = frontier[head++];
      var ci = idx(state, cur[0], cur[1]);
      var cost = best[ci];
      // 控制区：踏入敌军控制范围后必须停下，不能再穿过去（起点除外）
      if (ci !== start && !noZoc && zoc[ci]) continue;
      for (var d = 0; d < 4; d++) {
        var nx = cur[0] + dirs[d][0], ny = cur[1] + dirs[d][1];
        if (!isPlayable(state, nx, ny)) continue;
        if (!terrainPassable(state, nx, ny, unit)) continue;
        var ni0 = idx(state, nx, ny);
        var blocker = occ[ni0];
        if (blocker && blocker.side !== unit.side) continue;   // 敌军挡路
        var nc = cost + moveCost(state, unit, nx, ny);
        if (nc > mp) continue;
        if (best[ni0] === undefined || nc < best[ni0]) {
          best[ni0] = nc;
          prev[ni0] = ci;
          frontier.push([nx, ny]);
        }
      }
    }

    for (var k in best) {
      var i = parseInt(k, 10);
      if (i === start) continue;
      var x = i % state.cols, y = (i / state.cols) | 0;
      if (!occ[i]) result.push({ x: x, y: y, cost: best[i] });
    }
    result.sort(function (a, b) { return a.cost - b.cost; });
    result.pathOf = function (tx, ty) {
      var path = [];
      var ti = idx(state, tx, ty);
      if (best[ti] === undefined) return null;
      while (ti !== start) {
        path.unshift({ x: ti % state.cols, y: (ti / state.cols) | 0 });
        ti = prev[ti];
        if (ti === undefined) return null;
      }
      return path;
    };
    result.has = function (tx, ty) { return best[idx(state, tx, ty)] !== undefined; };
    state._reachCache = { unit: unit, x: unit.x, y: unit.y, ver: ver, val: result };
    return result;
  }

  /** 进入某格实际消耗的移动力（地形 + 兵种适配 + 天气 + 特性） */
  function moveCost(state, unit, x, y) {
    var t = tileAt(state, x, y);
    var troop = TROOPS[unit.troop];
    var c = t.cost;

    // 水面适配：甲板地形（战船）对水军如履平地，陆军则要爬上爬下
    if (t.deck) c = troop.navySkill ? 1 : 2;
    // 陆军勉强涉水过浅滩本就吃力
    if (t.key === 'ford' && !troop.navySkill) c += 1;

    // 骑兵不擅山地林地沼泽；「山地之王」类特性可免疫
    if (t.cav) {
      var pen = t.cav;
      if (troop.navySkill) pen = Math.max(0, pen - 1);       // 水军习水，反而不怵泥泞
      if (hasTrait(unit, 'mountaineer')) pen = 0;
      else if (hasTrait(unit, 'pathfinder')) pen = Math.max(0, pen - 1);
      c += pen;
    }
    // 辎重队笨重：非官道之上格外迟缓
    if (troop.heavy && t.cost >= 2) c += 1;

    // 天气：雨雪让行军加倍艰难
    var w = weather(state);
    if (w && w.moveCost) c = w.moveCost(c, t, unit);

    // 战场遗留物：火场难越、洪水泥泞、阵法迷途
    var hz = hazAt(state, x, y);
    if (hz) {
      var hd = hazDef(hz);
      if (hd) {
        if (hz === HAZ.FIRE && TROOPS[unit.troop].key === 'cavalry') c += hd.cavCost;
        else c += (hd.cost || 0);
        if (hz === HAZ.FIRE && hasTrait(unit, 'fireproof')) c -= hd.cost;
      }
    }

    var tr = traitOf(unit);
    if (tr && tr.moveCost) c = tr.moveCost(state, unit, t, c);
    return c;
  }

  var WEATHER = {
    clear: { key: 'clear', name: '晴', icon: '☀', desc: '天朗气清，一切如常', rates: 0.45 },
    cloudy: { key: 'cloudy', name: '阴', icon: '☁', desc: '云遮日色，火攻威力略减', rates: 0.15, fireMod: 0.85 },
    rain: { key: 'rain', name: '雨', icon: '☂', desc: '大雨滂沱：烈焰难燃，火计几乎无效；远程命中下降', rates: 0.14, fireMod: 0.25, douse: true, rangedMod: 0.88 },
    wind: { key: 'wind', name: '风', icon: '⌁', desc: '大风骤起：火借风势，火攻范围扩散且蔓延加快', rates: 0.12, fireMod: 1.35, fireRadius: 1, rangedMod: 1.06 },
    fog: { key: 'fog', name: '雾', icon: '≋', desc: '大雾迷江：远程射程-1，双方难以远距交战', rates: 0.08, rangeMod: -1, magicMod: 0.9 },
    snow: { key: 'snow', name: '雪', icon: '❄', desc: '大雪封山：全军行动迟缓，火势易熄', rates: 0.06, fireMod: 0.4, douse: 0.5 }
  };
  WEATHER.snow.moveCost = function (c, t) { return t.key === 'road' ? c : c + 1; };

  /** 当前天气（未初始化时视为晴） */
  function weather(state) {
    if (!state || !state.weather) return WEATHER.clear;
    return WEATHER[state.weather] || WEATHER.clear;
  }

  /** 掷一次天气演变：连着几轮同象则必变，免得一局从晴到尾 */
  function pickWeatherKey(state, curKey) {
    var forced = (state.weatherStreak || 0) >= 3;
    if (!forced && state.rng() < 0.45) return curKey;      // 天时该是变数，不宜一成不变
    // 剧本天象池：本关的天时只在池子里打转（华容道终是雨，三江口终是雾）
    if (state.weatherPool && state.weatherPool.length) {
      var pk = state.weatherPool[Math.floor(state.rng() * state.weatherPool.length)];
      if (WEATHER[pk]) return pk;
    }
    var pool = [], total = 0, k;
    for (k in WEATHER) {
      if (k === curKey) continue;
      pool.push([k, WEATHER[k].rates || 0.1]);
      total += WEATHER[k].rates || 0.1;
    }
    var pick = state.rng() * total, acc = 0;
    for (var i = 0; i < pool.length; i++) {
      acc += pool[i][1];
      if (pick <= acc) return pool[i][0];
    }
    return curKey;
  }

  function rollWeather(state) {
    return WEATHER[pickWeatherKey(state, weather(state).key)] || WEATHER.clear;
  }

  /**
   * 天时流转：敌我各行动一回合（一整轮）之后演变一次。
   * 天象提前一轮卜出（state.weatherNext），双方都能据此谋划——
   * 下一轮起风便该把火攻压到那时放，下一轮大雨则火计要趁早。
   */
  function advanceWeather(state) {
    state.events = state.events || [];
    var cur = state.weather || 'clear';

    /* 上方谷：谷中火起两轮之后，天降骤雨，烈焰尽灭——天不助汉 */
    if (state.fireLitTurn && !state.rainDoused &&
        state.turn - state.fireLitTurn >= 2) {
      state.rainDoused = true;
      var doused = 0;
      if (state.hazard) {
        for (var fi = 0; fi < state.hazard.length; fi++) {
          if (state.hazard[fi] === HAZ.FIRE) {
            state.hazard[fi] = 0;
            if (state.hazardTurns) state.hazardTurns[fi] = 0;
            if (state.burning) state.burning[fi] = 0;
            doused++;
          }
        }
      }
      state.weather = 'rain';
      state.weatherStreak = 0;
      state.events.push({
        t: 'weather', weather: 'rain', from: cur,
        note: doused ? '骤雨倾盆，谷中烈焰尽灭——天不助汉！' : '骤雨忽至，谷中再难点火——天不助汉！'
      });
      state.weatherNext = pickWeatherKey(state, 'rain');
      return state.weather;
    }

    /* 剧本天时：赤壁第三轮必起东南风，天意如此 */
    var scripted = state.weatherScript && state.weatherScript[state.turn];
    if (scripted && WEATHER[scripted]) {
      var fromKey = cur;
      state.weather = scripted;
      state.weatherStreak = 0;
      state.events.push({
        t: 'weather', weather: scripted, from: fromKey,
        note: (state.weatherNotes && state.weatherNotes[state.turn]) || null
      });
      state.weatherNext = pickWeatherKey(state, state.weather);
      return state.weather;
    }

    var next = state.weatherNext || cur;
    if (next !== cur) {
      state.weather = WEATHER[next] ? next : cur;
      state.weatherStreak = 0;
      state.events.push({ t: 'weather', weather: state.weather, from: cur });
    } else {
      state.weatherStreak = (state.weatherStreak || 0) + 1;
    }
    state.weatherNext = pickWeatherKey(state, state.weather);
    return state.weather;
  }

  /** 开局卜出首个天象与一轮之后的预告 */
  function initWeather(state, firstKey) {
    state.weather = firstKey && WEATHER[firstKey] ? firstKey : 'clear';
    state.weatherStreak = 0;
    state.weatherNext = pickWeatherKey(state, state.weather);
  }

  function setWeather(state, key) {
    state.weather = WEATHER[key] ? key : 'clear';
    // 强制改天（如夜观天象）时，预告也跟着刷新，免得下一轮又跳回去
    state.weatherNext = pickWeatherKey(state, state.weather);
    state.weatherStreak = 0;
  }

  function movePoints(state, unit) {
    var base = TROOPS[unit.troop].move;
    if (unit.buffs && unit.buffs.slow) base -= 2;
    if (unit.buffs && unit.buffs.haste) base += 2;
    var tr = traitOf(unit);
    if (tr && tr.move) base = tr.move(state, unit, base);
    return Math.max(1, base);
  }

  /** 站在 (x,y) 时的射程：高地让远程打得更远，大雾则压缩视野 */
  function rangeAt(state, unit, x, y) {
    var r = TROOPS[unit.troop].range;
    var t = tileAt(state, x, y);
    if (t.elev >= 2 && r > 1) r += 1;              // 居高临下
    var tr = traitOf(unit);
    if (tr && tr.range) r = tr.range(state, unit, r);
    var w = weather(state);
    if (w.rangeMod && r > 1) r += w.rangeMod;
    return Math.max(1, r);
  }

  function attackRange(state, unit) { return rangeAt(state, unit, unit.x, unit.y); }

  /**
   * 远程弹道是否被城墙/河流阻断。
   * 正交方向检查中间格；L 形路径只要有一条通畅即可射击。
   */
  function hasLineOfSight(state, ax, ay, bx, by) {
    if (ax === bx && ay === by) return true;
    var d = Math.abs(ax - bx) + Math.abs(ay - by);
    if (d <= 1) return true;
    var blocked = function (x, y) { return tileAt(state, x, y).blocks; };
    var x, y;
    if (ax === bx) {
      for (y = Math.min(ay, by) + 1; y < Math.max(ay, by); y++) if (blocked(ax, y)) return false;
      return true;
    }
    if (ay === by) {
      for (x = Math.min(ax, bx) + 1; x < Math.max(ax, bx); x++) if (blocked(x, ay)) return false;
      return true;
    }
    var ok1 = true, ok2 = true;
    for (x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) if (blocked(x, ay)) ok1 = false;
    for (y = Math.min(ay, by); y <= Math.max(ay, by); y++) if (blocked(bx, y)) ok1 = false;
    for (y = Math.min(ay, by); y <= Math.max(ay, by); y++) if (blocked(ax, y)) ok2 = false;
    for (x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) if (blocked(x, by)) ok2 = false;
    return ok1 || ok2;
  }

  /** 站在 (x,y) 时 unit 能攻击到的格子（含视线阻断判定） */
  function attackTiles(state, unit, x, y) {
    var r = rangeAt(state, unit, x, y);
    var out = [];
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r || (dx === 0 && dy === 0)) continue;
        var nx = x + dx, ny = y + dy;
        if (!inBounds(state, nx, ny)) continue;
        if (r > 1 && !hasLineOfSight(state, x, y, nx, ny)) continue;
        out.push({ x: nx, y: ny });
      }
    }
    return out;
  }

  /** 能攻击到 target 的所有站位（从移动范围中筛选） */
  function attackPositions(state, unit, target) {
    var reach = reachable(state, unit);
    var out = [];
    var start = { x: unit.x, y: unit.y };
    // 原地也算一个站位
    if (canHitFrom(state, unit, start.x, start.y, target)) out.push({ x: start.x, y: start.y, cost: 0 });
    for (var i = 0; i < reach.length; i++) {
      var p = reach[i];
      if (canHitFrom(state, unit, p.x, p.y, target)) out.push(p);
    }
    return out;
  }

  /** 站在 (px,py) 能否打到 target（射程 + 视线） */
  function canHitFrom(state, unit, px, py, target) {
    var r = rangeAt(state, unit, px, py);
    if (dist({ x: px, y: py }, target) > r) return false;
    if (r > 1 && !hasLineOfSight(state, px, py, target.x, target.y)) return false;
    return true;
  }

  /** 挑最优站位：地形防御、高地、据点、夹击、隐蔽都要纳入考量 */
  function bestAttackPosition(state, unit, target) {
    var positions = attackPositions(state, unit, target);
    if (!positions.length) return null;
    var ranged = TROOPS[unit.troop].range > 1;
    var best = null, bestScore = -1e9;
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var t = tileAt(state, p.x, p.y);
      var score = t.def * 1.0 - p.cost * 0.8;

      // 高地：居高临下
      if (t.elev >= 2) score += ranged ? 14 : 8;
      else if (t.elev === 1) score += 4;
      // 据点：占领后可回血
      if (t.capture) score += 10;
      // 隐蔽：远程单位喜欢林地
      if (ranged && t.hide >= 20) score += 8;
      // 夹击：站到能形成夹击的位置
      var adj = 0;
      var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (var d = 0; d < 4; d++) {
        var n = unitAt(state, target.x + dirs[d][0], target.y + dirs[d][1]);
        if (n && n.alive && n.side === unit.side && n.id !== unit.id) adj++;
      }
      score += adj * 6;
      // 远程单位偏好拉开距离
      if (ranged) score += Math.min(dist(p, target), 3) * 2.5;
      // 远程别站进敌方近战的控制区（会被贴身围殴）
      if (ranged && zocAt(state, p.x, p.y, unit.side)) score -= 9;
      // 骑兵：奔袭越远，冲锋势头越猛
      if (TROOPS[unit.troop].charge) score += Math.min(p.cost, 5) * 1.6;

      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  /* ------------------------------------------------------------------ *
   * 伤害
   * ------------------------------------------------------------------ */

  /*
   * 兵力即血槽：hp 就是这支部队还剩多少人马，打掉的就是兵。
   * 名将统带七八千，精锐营伍三四千，乌合之众一两千 —— 兵越多越经打，
   * 也越打得出分量。DMG_SCALE 随兵数量级上调，保持「七八合斩一将」的节奏。
   */
  var DMG_SCALE = 17.0;
  /** 兵势基准：满四千五百之众方算得上「完整建制」，超过不再加成 */
  var FULL_ARMY = 4500;

  function levelMod(level) { return 1 + (level - 1) * 0.055; }

  function statOf(unit, key) {
    var base = unit.hero[key] || 50;
    return base * levelMod(unit.level);
  }

  /**
   * 计算一次攻击的伤害。每一项地形/战术因素都单独计入 mods，
   * 供 UI 展示「为什么这一刀这么疼」。
   *
   * @param opts.magic      谋略伤害（用智力）
   * @param opts.skillPower 武将技倍率
   * @param opts.isCounter  反击
   */
  function computeDamage(state, attacker, defender, opts) {
    opts = opts || {};
    var troopA = TROOPS[attacker.troop];
    var troopD = TROOPS[defender.troop];
    var magic = !!opts.magic;
    var mods = [];
    var mul = function (name, factor) {
      if (Math.abs(factor - 1) < 0.001) return;
      dmg *= factor;
      mods.push({ name: name, factor: factor });
    };

    var power = magic ? statOf(attacker, 'int') * 1.15 : statOf(attacker, 'atk') * troopA.atk;
    var resist = magic ? statOf(defender, 'int') * 0.9 : statOf(defender, 'def') * troopD.def;

    var dmg = power * DMG_SCALE * (1 - resist / (resist + 300));

    // --- 兵种相克 ---
    mul(troopA.name + '克' + troopD.name, counterRate(troopA.key, troopD.key));

    // --- 高度差：居高临下 / 仰攻 ---
    var eA = elevAt(state, attacker.x, attacker.y);
    var eD = elevAt(state, defender.x, defender.y);
    var diff = eA - eD;
    if (diff >= 2) mul('居高临下', 1.18);
    else if (diff === 1) mul('占据高地', 1.09);
    else if (diff <= -2) mul('仰攻不利', 0.85);
    else if (diff === -1) mul('地势偏低', 0.93);

    // --- 防守方地形 ---
    var terr = tileAt(state, defender.x, defender.y);
    var element = opts.element || null;
    // 猛兽冲阵踏踏而来，敌兵据险顽抗的优势荡然无存
    var pierceTerrain = (element === 'beast');
    if (terr.def && !pierceTerrain) mul(terr.name + '据守', 1 - terr.def / 100);
    // 据点归属：守方占领中的城池营寨更坚固
    if (terr.capture && ownerAt(state, defender.x, defender.y) === defender.side && !pierceTerrain) {
      mul('据点驻防', 0.85);
    }
    // 隐蔽：只对远程与谋略生效（近战贴脸无效）；奇门之术可洞穿藏身之处
    var pierceHide = (element === 'beast' || element === 'arcane');
    if (terr.hide && !pierceHide && (troopA.range > 1 || magic)) {
      mul(terr.name + '隐蔽', 1 - terr.hide / 100);
    }
    // 水战：水军在江河如鱼得水，陆上部队陷入水中则吃亏
    if (terr.water) {
      if (troopD.water) mul('水军得水', 0.80);
      if (troopA.water) mul('水战娴熟', 1.25);
      else if (!magic) mul(terr.deck ? '甲板立足未稳' : '不习水战', terr.deck ? 0.92 : 0.80);
    } else {
      // 离水登陆，舟师战力折损
      if (troopA.water && troopA.landPen) mul('登岸作战', troopA.landPen);
      if (troopD.water && troopD.landPen) mul('舍舟登陆', troopD.landPen);
    }
    // 沼泽中难以闪避，挨打更疼
    if (terr.sticky && !magic) mul('陷于泥沼', 1.10);

    // --- 天气影响 ---
    var w = weather(state);
    var wIsRanged = !magic && troopA.range > 1;
    if (w.rangedMod && wIsRanged) mul(w.name + '·箭矢', w.rangedMod);
    if (w.magicMod && magic) mul(w.name + '·谋略', w.magicMod);

    // --- 谋略属性：火、水、兽、石 ---
    if (element) {
      var aTerr = tileAt(state, attacker.x, attacker.y);
      if (element === 'fire') {
        if (w.fireMod !== 1 && w.fireMod !== undefined) {
          mul(w.name + (w.fireMod >= 1 ? '助火势' : '抑火势'), w.fireMod);
        }
        if (terr.burn) mul(terr.name + '助燃', 1.18);
        if (terr.key === 'ship') mul('连环船焚', 1.25);
      } else if (element === 'water') {
        if (w.key === 'rain') mul('暴雨助澜', 1.18);
        if (terr.key === 'ship') mul('楼船倾覆', 1.22);
        else if (terr.water) mul('落水挣扎', 1.15);
      } else if (element === 'rock') {
        // 据高临下推石，敌军无处可躲
        if (aTerr.elev >= 2) mul('高崖投石', 1.28);
        else if (aTerr.elev >= 1) mul('居高掷石', 1.14);
        else mul('平地掷石', 0.88);
      } else if (element === 'beast') {
        if (terr.choke) mul('狭路难逃', 1.10);
      } else if (element === 'thunder') {
        // 雷霆最吃天时：风雨交加时天雷赫赫，晴空里不过寻常一击
        if (w.key === 'rain') mul('雷雨交加', 1.55);
        else if (w.key === 'wind') mul('风雷相激', 1.35);
        else if (w.key === 'snow') mul('雪天雷弱', 0.80);
        else mul('晴天霹雳', 0.95);
        if (terr.water) mul('水中导电', 1.20);
        else if (terr.elev >= 2) mul('高处引雷', 1.15);
      }
    }

    // --- 夹击：目标被我军合围（flankBonus 返回的是加成量） ---
    var fb = flankBonus(state, attacker, defender);
    if (fb > 0) mul('夹击合围', 1 + fb);

    // --- 骑兵冲锋：奔袭越远势头越猛 ---
    var steps = attacker.movedSteps || 0;
    if (troopA.charge && steps >= 3 && !magic) {
      mul('铁骑冲锋', 1 + Math.min(0.30, (steps - 2) * 0.10));
    }

    // --- 枪兵结阵：原地不动拒马，专克骑兵 ---
    if (troopD.brace && !defender.moved && !magic) {
      mul(troopA.charge ? '结阵拒马' : '结阵固守', troopA.charge ? 0.70 : 0.85);
    }

    // --- 士气崩溃：残兵更容易被打崩 ---
    var dr = defender.hp / defender.maxHp;
    if (dr < 0.3) mul('敌军溃散', 1.12);

    // --- 主将亲兵：大营重重护卫，孤身陷阵才致命 ---
    if (defender.isLeader) {
      var guards = 0;
      for (var gi = 0; gi < state.units.length; gi++) {
        var g = state.units[gi];
        if (!g.alive || g.side !== defender.side || g.id === defender.id) continue;
        if (core.dist(g, defender) <= 1) guards++;
      }
      if (guards >= 2) mul('亲兵护持', 0.86);
      else if (guards === 1) mul('亲兵护卫', 0.93);
      else mul('孤军陷阵', 1.10);
    }

    // --- 兵势：人马多寡直接决定这一击的分量 ---
    // 万人之师倾巢而出与数百残兵零敲碎打，绝不该打出一样的杀伤。
    // 以六千为「建制完整」，兵越多出手越重；打到只剩两三千，气势也就散了。
    var sa = Math.min(1, attacker.hp / FULL_ARMY);
    mul('兵势', 0.55 + 0.45 * sa);
    // 众寡悬殊：兵多的一方压着兵少的一方打
    var sd = Math.min(1, defender.hp / FULL_ARMY);
    var gap = sa - sd;
    if (gap >= 0.2) mul('以众凌寡', 1 + Math.min(0.28, (gap - 0.2) * 0.55));
    else if (gap <= -0.2) mul('寡不敌众', 1 - Math.min(0.24, (-gap - 0.2) * 0.48));

    // --- 增益 ---
    if (attacker.buffs && attacker.buffs.atkUp) mul('鼓舞', 1.25);
    if (attacker.buffs && attacker.buffs.atkDown) mul('阵脚扰乱', 0.76);
    if (defender.buffs && defender.buffs.defUp) mul('据守', 0.78);
    if (defender.buffs && defender.buffs.defDown) mul('守备虚空', 1.20);
    // 蛊惑：妖言乱心者，最惧谋略攻心
    if (defender.buffs && defender.buffs.bewitch && magic) mul('心神蛊惑', 1.25);

    // --- 武将特性 ---
    var trA = traitOf(attacker);
    if (trA && trA.dmg) mul(trA.name, trA.dmg(state, attacker, defender, opts));
    var trD = traitOf(defender);
    if (trD && trD.taken) mul(trD.name + '（守）', trD.taken(state, defender, attacker, opts));

    // --- 光环 ---
    var aura = auraMods(state, attacker, defender);
    if (aura.atk !== 1) mul(aura.atkName, aura.atk);
    if (aura.def !== 1) mul(aura.defName, aura.def);

    // --- 辎重补给：身边有己方粮草队的部队更经打 ---
    if (adjacentSupply(state, defender)) mul('辎重补给', 0.90);

    if (opts.skillPower) mul('武将技', opts.skillPower);
    if (opts.isCounter) {
      // 枪兵结阵反击骑兵格外凶狠
      if (troopD.brace && !defender.moved && troopA.charge) mul('反击·拒马', 1.45);
      else mul('反击', 0.7);
    }

    var rnd = 0.92 + state.rng() * 0.16;
    dmg *= rnd;

    var critRate = 0.08 + (trA && trA.crit ? trA.crit(state, attacker, defender, opts) : 0);
    var crit = state.rng() < critRate;
    if (crit) { dmg *= 1.5; mods.push({ name: '会心一击', factor: 1.5 }); }

    return { damage: Math.max(1, Math.round(dmg)), crit: crit, mods: mods };
  }

  /** 据点归属（'player' / 'enemy' / null） */
  function ownerAt(state, x, y) {
    if (!state.owned) return null;
    var o = state.owned[idx(state, x, y)];
    return o === undefined ? null : o;
  }

  /**
   * 光环：周围友军/敌军特性对本次攻防的影响。
   * 只取一个最强光环，避免叠加失控。
   */
  function auraMods(state, attacker, defender) {
    var res = { atk: 1, def: 1, atkName: '', defName: '' };
    var bestAtk = 1, bestDef = 1;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive) continue;
      var tr = traitOf(u);
      if (!tr || !tr.aura) continue;
      var a = tr.aura(state, u);
      if (!a) continue;
      var d = Math.abs(u.x - attacker.x) + Math.abs(u.y - attacker.y);
      var d2 = Math.abs(u.x - defender.x) + Math.abs(u.y - defender.y);
      var radius = a.radius || 1;
      if (u.side === attacker.side && d <= radius && a.allies) {
        if (a.allies.atk && a.allies.atk > bestAtk) { bestAtk = a.allies.atk; res.atkName = tr.name + '光环'; }
      }
      if (u.side === defender.side && d2 <= radius && a.allies) {
        if (a.allies.def && a.allies.def < bestDef) { bestDef = a.allies.def; res.defName = tr.name + '光环'; }
      }
      if (u.side !== attacker.side && d <= radius && a.enemies) {
        if (a.enemies.atk && a.enemies.atk < bestAtk) { bestAtk = a.enemies.atk; res.atkName = tr.name + '威压'; }
      }
    }
    res.atk = bestAtk;
    res.def = bestDef;
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 战斗行动（返回事件序列供渲染播放动画）
   * ------------------------------------------------------------------ */

  function moveUnit(state, unit, path) {
    if (!path || !path.length) return [];
    var from = { x: unit.x, y: unit.y };
    var last = path[path.length - 1];
    unit.x = last.x;
    unit.y = last.y;
    // 记录本回合行军步数，供骑兵冲锋判定
    unit.movedSteps = (unit.movedSteps || 0) + path.length;
    // 移动后自然脱离结阵状态
    unit.moved = true;
    // 踏上据点即占领
    captureTile(state, unit);
    bumpOccupancy(state);
    var evs = [{ t: 'move', id: unit.id, path: path.slice(), from: from }];
    // 误入八阵图：当回合再难动作
    checkArrayTrap(state, unit, evs);
    // 夺旗：踏上旗杆所在格即得旗，此后旗随人走
    var fe = tryTakeFlag(state, unit);
    if (fe) evs = evs.concat(fe);
    // 带上起点，渲染层才能从原位置插值播放动画
    return evs;
  }

  /**
   * 夺旗。旗在谁脚下归谁，携旗者移动则旗随人走；
   * 携旗者阵亡，旗便落在他倒下的地方，任人再夺——
   * 于是护旗与截旗成了真正的拉锯，双方都不得不调兵。
   */
  function tryTakeFlag(state, unit) {
    var f = state.flag;
    if (!f || !unit || !unit.alive) return null;
    // 携旗者自己：旗跟着人走
    if (f.carrier === unit.id) {
      f.x = unit.x; f.y = unit.y;
      return null;
    }
    if (f.carrier) return null;                       // 旗在别人手里，抢不去
    if (f.x !== unit.x || f.y !== unit.y) return null;
    f.owner = unit.side;
    f.carrier = unit.id;
    state.events = state.events || [];
    state.events.push({ t: 'flag', side: unit.side, id: unit.id, x: unit.x, y: unit.y });
    state.events.push({
      t: 'note',
      text: unit.name + (unit.side === 'player' ? '夺得敌军帅旗，速速送回本阵！' : '夺回帅旗')
    });
    return [{ t: 'flag', side: unit.side, id: unit.id, x: unit.x, y: unit.y }];
  }

  /** 携旗者若已阵亡，帅旗便落在其倒下之处 */
  function settleFlag(state) {
    var f = state.flag;
    if (!f || !f.carrier) return;
    var holder = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].id === f.carrier) { holder = state.units[i]; break; }
    }
    if (holder && holder.alive) { f.x = holder.x; f.y = holder.y; return; }
    f.carrier = null;
    f.owner = null;
    state.events = state.events || [];
    state.events.push({ t: 'flagLost', x: f.x, y: f.y });
    state.events.push({ t: 'note', text: '帅旗落地，谁先夺得归谁' });
  }

  /** 攻入敌城后守住了几轮（敌城得手不算完，须守到下一轮才作数） */
  function trackCapital(state) {
    if (!state.capturePoints) return;
    for (var i = 0; i < state.capturePoints.length; i++) {
      var p = state.capturePoints[i];
      if (!p.capital) continue;
      if (p.owner === 'player') {
        if (state.cityHeldSince === null || state.cityHeldSince === undefined) {
          state.cityHeldSince = state.turn;
        }
      } else {
        state.cityHeldSince = null;
      }
    }
  }

  /** 占领据点：城池与营寨易主 */
  function captureTile(state, unit) {
    var t = tileAt(state, unit.x, unit.y);
    if (!t.capture) return;
    if (!state.owned) state.owned = [];
    var i = idx(state, unit.x, unit.y);
    if (state.owned[i] === unit.side) return;
    state.owned[i] = unit.side;
    state.events = state.events || [];
    state.events.push({ t: 'capture', x: unit.x, y: unit.y, side: unit.side });
    gainMorale(unit, 10);
  }

  function gainMorale(unit, amount) {
    unit.morale = Math.max(0, Math.min(100, unit.morale + amount));
  }

  /**
   * 护驾：主帅身陷重围时，身边将士会替他挡刀。
   * 这是演义里「典韦护主」「许褚挡箭」的那股狠劲 ——
   * 有亲兵随行的大将极难被一波带走，孤身陷阵者则朝不保夕。
   */
  function pickGuard(state, lord) {
    var best = null, bestHp = 0;
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (!u.alive || u.side !== lord.side || u.id === lord.id) continue;
      if (core.dist(u, lord) !== 1) continue;
      if (u.hp <= u.maxHp * 0.35) continue;          // 自身难保者不能护驾
      if (u.isLeader || u.isBoss) continue;
      if (u.hp > bestHp) { bestHp = u.hp; best = u; }
    }
    return best;
  }

  function applyDamage(state, target, amount, events) {
    events = events || [];
    if ((target.isLeader || target.isBoss) && amount > 0) {
      var guard = pickGuard(state, target);
      if (guard) {
        var share = Math.round(amount * 0.32);
        amount -= share;
        guard.hp -= share;
        events.push({ t: 'damage', id: guard.id, amount: share, x: guard.x, y: guard.y, guard: true });
        events.push({ t: 'note', text: guard.name + '挺身护驾' });
        gainMorale(guard, 10);
        if (guard.hp <= 0) {
          guard.hp = 0; guard.alive = false; bumpOccupancy(state);
          events.push({ t: 'die', id: guard.id, x: guard.x, y: guard.y });
        }
      }
    }
    target.hp -= amount;
    events.push({ t: 'damage', id: target.id, amount: amount, x: target.x, y: target.y });
    gainMorale(target, 16);
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      bumpOccupancy(state);
      events.push({ t: 'die', id: target.id, x: target.x, y: target.y });
      return true;
    }
    return false;
  }

  /**
   * 执行一次攻击（含反击）。attacker 需已在攻击位置。
   */
  /** 能否反击：只有近战兵种才能反击，且要够得着、看得见 */
  function canCounter(state, defender, attacker) {
    if (!defender.alive) return false;
    // 弓兵/谋士被贴身无法还手，除非有「弓神」这类特性
    if (!TROOPS[defender.troop].melee && !hasTrait(defender, 'counter')) return false;
    if (!canHitFrom(state, defender, defender.x, defender.y, attacker)) return false;
    return true;
  }

  function attack(state, attacker, defender, events) {
    events = events || [];
    var res = computeDamage(state, attacker, defender, {});
    events.push({
      t: 'attack', id: attacker.id, target: defender.id,
      crit: res.crit, damage: res.damage, mods: res.mods
    });
    gainMorale(attacker, 26);
    var died = applyDamage(state, defender, res.damage, events);
    if (died) gainMorale(attacker, 20);

    var trA = traitOf(attacker);
    if (trA && trA.onAttack) trA.onAttack(state, attacker, defender, events, res.damage);

    // 反击
    if (canCounter(state, defender, attacker)) {
      var back = computeDamage(state, defender, attacker, { isCounter: true });
      events.push({
        t: 'counter', id: defender.id, target: attacker.id,
        crit: back.crit, damage: back.damage, mods: back.mods
      });
      applyDamage(state, attacker, back.damage, events);
    }
    // 先落定行动状态，再触发击杀效果——「威震逍遥津」这类特性才能重置再行动
    attacker.acted = true;
    attacker.moved = true;
    if (died && trA && trA.onKill) trA.onKill(state, attacker, events);
    return events;
  }

  /* ------------------------------------------------------------------ *
   * 武将技
   * ------------------------------------------------------------------ */

  function skillTiles(state, unit, tx, ty, skill, extra) {
    var out = [];
    var r = (skill.radius || 0) + (extra || 0);
    switch (skill.shape) {
      case 'single':
        out.push({ x: tx, y: ty });
        break;
      case 'square':
        for (var dy = -r; dy <= r; dy++) {
          for (var dx = -r; dx <= r; dx++) {
            var x = tx + dx, y = ty + dy;
            if (inBounds(state, x, y)) out.push({ x: x, y: y });
          }
        }
        break;
      case 'cross':
        out.push({ x: tx, y: ty });
        [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
          var x = tx + d[0], y = ty + d[1];
          if (inBounds(state, x, y)) out.push({ x: x, y: y });
        });
        break;
      case 'line':
        var ddx = Math.sign(tx - unit.x), ddy = Math.sign(ty - unit.y);
        for (var k = 1; k <= (skill.length || 2); k++) {
          var lx = unit.x + ddx * k, ly = unit.y + ddy * k;
          if (inBounds(state, lx, ly)) out.push({ x: lx, y: ly });
        }
        break;
      case 'self':
        out.push({ x: unit.x, y: unit.y });
        break;
    }
    return out;
  }

  /** 技能实际士气消耗（可被特性下调） */
  function skillCost(state, unit, skill) {
    var c = skill.cost || 0;
    var tr = traitOf(unit);
    if (tr && tr.skillCost) c = tr.skillCost(state, unit, c);
    return c;
  }

  function canUseSkill(state, unit, skill) {
    if (unit.morale < skillCost(state, unit, skill)) return false;
    if (unit.skillUsed) return false;
    return true;
  }

  /**
   * 计略与地形的契合度。
   * 古人用兵讲究「因地制宜」：火烧连营须有林、水淹七军须有洼、
   * 落石断路须依山。用地对了威力倍增并留下战场遗留物（截断敌军路线），
   * 用地错了则大打折扣——这正是「调动敌军、择地而战」的乐趣所在。
   */
  function terrainFit(state, tx, ty, skill) {
    var t = tileAt(state, tx, ty);
    var out = { power: 1, hazard: null, miss: false, label: '' };
    if (!skill.need) return out;

    if (skill.need === 'burnable') {
      if (isBurnable(state, tx, ty)) {
        out.power = 1.40; out.hazard = HAZ.FIRE; out.label = '火乘地势';
      } else {
        out.power = 0.70; out.miss = true; out.label = '无物可焚';
      }
    } else if (skill.need === 'floodable') {
      if (isFloodable(state, tx, ty)) {
        out.power = 1.30; out.hazard = HAZ.FLOOD; out.label = '水就低洼';
      } else {
        out.power = 0.68; out.miss = true; out.label = '高亢难淹';
      }
    } else if (skill.need === 'rockable') {
      if (isRockable(state, tx, ty)) {
        out.power = 1.45; out.hazard = HAZ.ROCK; out.label = '凭高滚木';
      } else {
        out.power = 0.62; out.miss = true; out.label = '无山可依';
      }
    } else if (skill.need === 'open') {
      // 骑兵冲阵、箭雨覆盖：开阔地才展得开
      if (t.key === 'plain' || t.key === 'grass' || t.key === 'road') {
        out.power = 1.25; out.label = '地势开阔';
      } else {
        out.power = 0.85; out.label = '局促难施';
      }
    }
    return out;
  }

  /** 在技能覆盖范围内铺开遗留物（只落在契合的地形上，且不超过 maxTiles 格） */
  function layHazard(state, tiles, kind, turns, events, maxTiles) {
    var v = HAZ[kind.toUpperCase()];
    if (!v) return;
    var laid = 0;
    var cap = maxTiles || 999;
    for (var i = 0; i < tiles.length; i++) {
      var x = tiles[i].x, y = tiles[i].y;
      if (!inBounds(state, x, y) || !isPlayable(state, x, y)) continue;
      var ok = false;
      if (v === HAZ.FIRE) ok = isBurnable(state, x, y);
      else if (v === HAZ.FLOOD) ok = isFloodable(state, x, y);
      else if (v === HAZ.ROCK) ok = isRockable(state, x, y);
      else ok = true;
      if (!ok || laid >= cap) continue;
      // 别把自家兄弟活埋在石头底下
      var occ = unitAt(state, x, y);
      if (v === HAZ.ROCK && occ) continue;
      setHaz(state, x, y, v, turns);
      laid++;
      events.push({ t: 'hazard', x: x, y: y, kind: kind });
    }
    if (laid) {
      var d = hazDef(v);
      events.push({ t: 'note', text: (d ? d.name : kind) + '弥漫，' + laid + ' 处路段已断' });
    }
  }

  function useSkill(state, unit, tx, ty, skill, events) {
    events = events || [];
    var trS = traitOf(unit);
    unit.morale -= skillCost(state, unit, skill);
    unit.skillUsed = true;
    unit.acted = true;
    unit.moved = true;
    var extraWeather = 0;
    if (skill.element === 'fire') {
      var wNow = weather(state);
      // 风助火势：扩散一圈；雨浇：火几乎点不着
      if (wNow.fireRadius) extraWeather = wNow.fireRadius;
    }
    var extraFire = (trS && trS.skillRadius) ? trS.skillRadius(state, unit, skill) : 0;
    var tiles = skillTiles(state, unit, tx, ty, skill, extraFire + extraWeather);

    // 水攻可以息灭火
    if (skill.element === 'water') douseTiles(state, tiles, events);

    /*
     * 地形契合：同一把火，烧林与烧石地是两回事。
     * 计略讲究「因地制宜」——火攻找林地营寨、水攻找低洼水泽、
     * 落石依山势，用对了地方威力倍增且能留下战场遗留物（断道、火场），
     * 用错了地方只是一记寻常打击。
     */
    var fit = terrainFit(state, tx, ty, skill);

    events.push({
      t: 'skill', id: unit.id, skill: skill.name, tiles: tiles.slice(),
      kind: skill.effect, element: skill.element || null, fit: fit,
      magic: skill.type === 'magic'
    });
    if (fit.miss) {
      events.push({ t: 'note', text: skill.name + '：此处地势不合，计无所施' });
    }

    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i];
      var u = unitAt(state, tile.x, tile.y);
      if (!u || !u.alive) continue;
      var friendly = u.side === unit.side;

      if (skill.effect === 'heal') {
        if (!friendly) continue;
        var heal = Math.round(u.maxHp * (skill.power || 0.3));
        u.hp = Math.min(u.maxHp, u.hp + heal);
        events.push({ t: 'heal', id: u.id, amount: heal, x: u.x, y: u.y });
      } else if (skill.effect === 'buff') {
        if (!friendly) continue;
        u.buffs = u.buffs || {};
        u.buffs[skill.buff || 'atkUp'] = 2;
        gainMorale(u, 20);
        events.push({ t: 'buff', id: u.id, buff: skill.buff || 'atkUp' });
      } else {
        if (friendly) continue;   // 攻击类技能不误伤友军
        var power = skill.power || 1.6;
        if (trS && trS.skillPower) power = trS.skillPower(state, unit, skill, power);
        power *= fit.power;                          // 因地制宜：地势合则威力倍增
        var res = computeDamage(state, unit, u, {
          magic: skill.type === 'magic',
          skillPower: power,
          element: skill.element || null
        });
        if (fit.label) (res.mods = res.mods || []).push({ name: fit.label, factor: fit.power });
        events.push({ t: 'damage', id: u.id, amount: res.damage, crit: res.crit, x: u.x, y: u.y, mods: res.mods });
        u.hp -= res.damage;
        gainMorale(u, 12);
        if (skill.effect === 'burn') { u.buffs = u.buffs || {}; u.buffs.burn = 2; }
        // 疑兵 / 伪报：中计者军心动摇，下一回合动弹不得
        if (skill.effect === 'panic') {
          u.buffs = u.buffs || {};
          u.buffs.panic = 1;
          u.morale = Math.max(0, u.morale - 25);
          events.push({ t: 'panic', id: u.id, x: u.x, y: u.y });
        }
        // 伏兵：林莽山坳间杀出，猝不及防者伤亡倍增
        if (skill.effect === 'ambush') {
          var aT = tileAt(state, u.x, u.y);
          if (aT.ambush || aT.elev >= 2) {
            var extra = Math.round(res.damage * 0.45);
            u.hp -= extra;
            res.damage += extra;
            events.push({ t: 'damage', id: u.id, amount: extra, x: u.x, y: u.y, mods: [{ name: '伏兵四起', factor: 1.45 }] });
          }
        }
        // 诈败：佯输诈走，敌贪功追击，阵脚自乱
        if (skill.effect === 'feint') {
          u.buffs = u.buffs || {};
          u.buffs.panic = 1;
          u.morale = Math.max(0, u.morale - 30);
          events.push({ t: 'panic', id: u.id, x: u.x, y: u.y });
        }
        // 反间：离间敌将与其主公，中计者阵前倒戈、敌我不分
        if (skill.effect === 'chaos') {
          u.buffs = u.buffs || {};
          u.buffs.chaos = 1;
          u.morale = Math.max(0, u.morale - 20);
          events.push({ t: 'chaos', id: u.id, x: u.x, y: u.y });
        }
        // 蛊惑：妖言惑众，军心溃散，更禁不起攻心之谋
        if (skill.effect === 'bewitch') {
          u.buffs = u.buffs || {};
          u.buffs.bewitch = 2;
          u.morale = Math.max(0, u.morale - 35);
          events.push({ t: 'bewitch', id: u.id, x: u.x, y: u.y });
        }
        // 扰乱 / 虚备：削弱敌军攻守
        if (skill.effect === 'debuff') {
          u.buffs = u.buffs || {};
          u.buffs[skill.debuff || 'atkDown'] = 2;
          u.morale = Math.max(0, u.morale - 18);
          events.push({ t: 'debuff', id: u.id, buff: skill.debuff || 'atkDown' });
        }
        // 八阵图：陷于阵中动弹不得
        if (skill.effect === 'stun') {
          u.buffs = u.buffs || {};
          u.buffs.stun = 1;
          events.push({ t: 'stun', id: u.id, x: u.x, y: u.y });
        }
        // 招降：兵败如山倒之际，阵前劝降可令其倒戈来投
        if (skill.effect === 'defect') {
          if (u.hp > 0 && u.hp / u.maxHp < 0.42 && !u.isLeader && !u.isBoss) {
            var chance = 0.35 + (statOf(unit, 'int') - statOf(u, 'int')) / 300;
            if (state.rng() < Math.max(0.12, Math.min(0.92, chance))) {
              u.side = unit.side;
              u.morale = 30;
              u.buffs = u.buffs || {};
              delete u.buffs.panic; delete u.buffs.chaos;
              events.push({ t: 'defect', id: u.id, x: u.x, y: u.y, side: u.side });
              events.push({ t: 'note', text: u.name + '阵前倒戈' });
            } else {
              events.push({ t: 'note', text: u.name + '不为所动' });
            }
          } else {
            events.push({ t: 'note', text: u.name + '兵势尚盛，劝降不成' });
          }
        }
        if (u.hp <= 0) {
          u.hp = 0; u.alive = false; bumpOccupancy(state);
          events.push({ t: 'die', id: u.id, x: u.x, y: u.y });
          gainMorale(unit, 25);
          if (trS && trS.onKill) trS.onKill(state, unit, events);
        }
      }
    }
    // 火攻类技能点燃林地与营寨，形成持续火场
    if (skill.effect === 'burn') {
      var w2 = weather(state);
      if (w2.douse === true) {
        events.push({ t: 'note', text: '大雨倾盆，火计难成' });
      } else {
        var turns = (trS && trS.skillIgnite) ? trS.skillIgnite(state, unit, skill, 3) : 3;
        if (typeof w2.fireMod === 'number') turns = Math.max(1, Math.round(turns * w2.fireMod));
        igniteTiles(state, tiles, turns, events);
        // 火场同时成为战场遗留物：阻断与灼伤并存
        layHazard(state, tiles, 'fire', turns, events);
      }
    }
    // 水攻淹地：低洼处一片汪洋，敌军非水军不得渡
    if (skill.effect === 'flood') {
      layHazard(state, tiles, 'flood', 4, events);
    }
    // 落石：山上推下的巨石堵死山道（数回合后渐渐清开，免得地图被石头填死）
    if (skill.effect === 'rock') {
      layHazard(state, tiles, 'rock', 5, events, 4);
    }
    // 八阵图：乱石堆成的迷阵困住敌骑
    if (skill.effect === 'stun') {
      layHazard(state, tiles, 'array', 2, events);
    }
    // 空城：故作从容，守备自坚，来犯之敌反生疑惧
    if (skill.effect === 'bluff') {
      unit.buffs = unit.buffs || {};
      unit.buffs.defUp = 2;
      gainMorale(unit, 25);
      events.push({ t: 'buff', id: unit.id, buff: 'defUp' });
      var around = [];
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          var au = unitAt(state, unit.x + dx, unit.y + dy);
          if (au && au.alive && au.side !== unit.side) around.push(au);
        }
      }
      for (var ai2 = 0; ai2 < around.length; ai2++) {
        var foe = around[ai2];
        foe.buffs = foe.buffs || {};
        foe.buffs.panic = 1;
        gainMorale(foe, -22);
        events.push({ t: 'panic', id: foe.id, x: foe.x, y: foe.y });
      }
      events.push({ t: 'note', text: '空城之计，来敌疑惧不前' });
    }
    // 天变：直接改易天时
    if (skill.effect === 'weather') {
      var pool = ['clear', 'wind', 'rain', 'fog'];
      var pickKey = pool[Math.floor(state.rng() * pool.length)];
      // 谋略值越高，越可能掷出有利于己方的天时
      if (statOf(unit, 'int') >= 90) pickKey = state.rng() < 0.5 ? 'wind' : 'rain';
      setWeather(state, pickKey);
      events.push({ t: 'weather', weather: pickKey });
    }
    return events;
  }

  /** 水攻浇熄范围内的火焰 */
  function douseTiles(state, tiles, events) {
    if (!state.burning) return;
    for (var i = 0; i < tiles.length; i++) {
      var k = idx(state, tiles[i].x, tiles[i].y);
      if (state.burning[k]) {
        state.burning[k] = 0;
        events.push({ t: 'douse', x: tiles[i].x, y: tiles[i].y });
      }
    }
  }

  /* ------------------------------------------------------------------ *
   * 回合流程
   * ------------------------------------------------------------------ */

  /** 初始化据点归属：据点默认归敌方（需夺回），站在上面的单位即时易主 */
  function initOwnership(state) {
    state.owned = [];
    for (var i = 0; i < state.map.length; i++) {
      if (TERRAIN[state.map[i]].capture) state.owned[i] = 'enemy';
    }
    for (var j = 0; j < state.units.length; j++) {
      var u = state.units[j];
      if (!u.alive) continue;
      if (tileAt(state, u.x, u.y).capture) state.owned[idx(state, u.x, u.y)] = u.side;
    }
    state.burning = [];
  }

  /** 点燃地块（火攻类技能），站在燃烧格上持续掉血 */
  function igniteTiles(state, tiles, turns, events) {
    state.burning = state.burning || [];
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var terrain = tileAt(state, t.x, t.y);
      if (!terrain.burn) continue;                  // 只有林地、营寨这类可燃地形会烧起来
      var k = idx(state, t.x, t.y);
      state.burning[k] = (state.burning[k] || 0) + turns;
      events = events || [];
      events.push({ t: 'ignite', x: t.x, y: t.y });
    }
    return events;
  }

  function beginSideTurn(state, side) {
    state.events = state.events || [];
    for (var i = 0; i < state.units.length; i++) {
      var u = state.units[i];
      if (u.side !== side || !u.alive) continue;
      u.moved = false;
      u.acted = false;
      u.skillUsed = false;
      u.movedSteps = 0;                              // 冲锋计数清零
      gainMorale(u, 14);

      // 中疑兵之计：军心惶惑，这一回合动弹不得
      if (u.buffs && u.buffs.panic) {
        delete u.buffs.panic;
        u.acted = true;
        state.events.push({ t: 'panic', id: u.id, x: u.x, y: u.y });
      }

      var t = tileAt(state, u.x, u.y);
      var owner = ownerAt(state, u.x, u.y);

      // 据点恢复：占领中的城池营寨持续回血回气
      if (t.heal > 0 && u.hp < u.maxHp && (owner === u.side || owner === null)) {
        var heal = Math.round(u.maxHp * t.heal / 1000);
        u.hp = Math.min(u.maxHp, u.hp + heal);
        state.events.push({ t: 'heal', id: u.id, amount: heal, x: u.x, y: u.y, terrain: true });
        gainMorale(u, 6);
      }

      // 燃烧地块：陷入火场持续损兵
      var bi = idx(state, u.x, u.y);
      if (state.burning && state.burning[bi] > 0) {
        state.burning[bi]--;
        var fire = Math.round(u.maxHp * 0.07);
        u.hp -= fire;
        state.events.push({ t: 'damage', id: u.id, amount: fire, x: u.x, y: u.y, burn: true });
        if (u.hp <= 0) { u.hp = 0; u.alive = false; bumpOccupancy(state); state.events.push({ t: 'die', id: u.id, x: u.x, y: u.y }); }
      }

      // 身上灼烧
      if (u.buffs && u.buffs.burn) {
        u.buffs.burn--;
        var burn = Math.round(u.maxHp * 0.05);
        u.hp -= burn;
        state.events.push({ t: 'damage', id: u.id, amount: burn, x: u.x, y: u.y, burn: true });
        if (u.hp <= 0) { u.hp = 0; u.alive = false; bumpOccupancy(state); state.events.push({ t: 'die', id: u.id, x: u.x, y: u.y }); }
        if (u.buffs.burn <= 0) delete u.buffs.burn;
      }
      // 辎重补给：粮草队让身边友军喘息回气
      if (TROOPS[u.troop] && TROOPS[u.troop].supply) {
        var mates = supplyTargets(state, u);
        for (var m = 0; m < mates.length; m++) {
          var f = mates[m];
          if (f.hp < f.maxHp) {
            var supply = Math.round(f.maxHp * 0.06);
            f.hp = Math.min(f.maxHp, f.hp + supply);
            state.events.push({ t: 'heal', id: f.id, amount: supply, x: f.x, y: f.y, terrain: true });
          }
          gainMorale(f, 8);
        }
      }

      // 增益与异常状态倒计时
      if (u.buffs) {
        ['atkUp', 'defUp', 'slow', 'haste', 'atkDown', 'defDown', 'bewitch'].forEach(function (k) {
          if (u.buffs[k]) { u.buffs[k]--; if (u.buffs[k] <= 0) delete u.buffs[k]; }
        });
      }
      // 中反间之计：阵前神智昏乱，这一回合敌我不分地砍向身边人
      if (u.buffs && u.buffs.chaos) {
        delete u.buffs.chaos;
        u.chaosAct = true;
        state.events.push({ t: 'note', text: u.name + '阵前倒戈，敌我不分' });
      } else if (u.chaosAct) {
        u.chaosAct = false;
      }
      // 八阵图：陷阵者这一回合动弹不得
      if (u.buffs && u.buffs.stun) {
        delete u.buffs.stun;
        u.acted = true; u.moved = true;
        u.morale = Math.max(0, u.morale - 15);
        state.events.push({ t: 'stun', id: u.id, x: u.x, y: u.y });
      }
      // 武将特性：回合触发
      var tr = traitOf(u);
      if (tr && tr.onTurn) tr.onTurn(state, u, state.events);
    }

    // 天气压制或助长火场
    extinguish(state);
    // 战场遗留物随时间消退
    tickHazard(state, side);
  }

  /** 遗留物倒计时：火熄、水退、阵散（乱石长存） */
  function tickHazard(state, side) {
    if (!state.hazard) return;
    var w = weather(state);
    for (var i = 0; i < state.hazard.length; i++) {
      var v = state.hazard[i];
      if (!v) continue;
      var t = state.hazardTurns ? (state.hazardTurns[i] || 0) : 0;
      // 大雨加速灭火退水
      if (w.douse === true && v === HAZ.FIRE) t -= 1;
      t -= 1;
      if (t <= 0) {
        state.hazard[i] = 0;
        if (state.hazardTurns) state.hazardTurns[i] = 0;
        if (state.burning) state.burning[i] = 0;
        state.events.push({
          t: 'hazardEnd', x: i % state.cols, y: (i / state.cols) | 0,
          kind: (hazDef(v) || {}).key
        });
      } else if (state.hazardTurns) {
        state.hazardTurns[i] = t;
      }
    }
  }

  /** 踏入八阵图者方位迷乱，当回合再难动作 */
  function checkArrayTrap(state, unit, events) {
    if (hazAt(state, unit.x, unit.y) !== HAZ.ARRAY) return;
    unit.buffs = unit.buffs || {};
    unit.buffs.stun = 1;
    unit.acted = true;
    unit.moved = true;
    events = events || state.events;
    events.push({ t: 'stun', id: unit.id, x: unit.x, y: unit.y });
    events.push({ t: 'note', text: unit.name + '陷于阵中，方位迷乱' });
  }

  /** 辎重队可补给的相邻友军（不含自身） */
  function supplyTargets(state, unit) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], out = [];
    for (var d = 0; d < 4; d++) {
      var u = unitAt(state, unit.x + dirs[d][0], unit.y + dirs[d][1]);
      if (u && u.alive && u.side === unit.side && u.id !== unit.id) out.push(u);
    }
    return out;
  }

  /** 雨天/雪天压制火势，风天则助长蔓延 */
  function extinguish(state) {
    if (!state.burning) return;
    var w = weather(state);
    if (!w.douse && w.fireMod !== 1) {
      // 风：火苗向相邻可燃地块蔓延
      if (w.fireRadius) spreadFire(state);
      return;
    }
    for (var i = 0; i < state.burning.length; i++) {
      if (!state.burning[i]) continue;
      if (typeof w.douse === 'number') {
        if (state.rng() < w.douse) state.burning[i] = Math.max(0, state.burning[i] - 1);
      } else {
        state.burning[i] = 0;
      }
    }
  }

  /** 火随风走：把火场向四周可燃地块推开 */
  function spreadFire(state) {
    if (!state.burning) return;
    var snapshot = state.burning.slice();
    for (var i = 0; i < snapshot.length; i++) {
      if (!snapshot[i]) continue;
      var x = i % state.cols, y = (i / state.cols) | 0;
      var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (var d = 0; d < 4; d++) {
        var nx = x + dirs[d][0], ny = y + dirs[d][1];
        if (!isPlayable(state, nx, ny)) continue;
        var t = tileAt(state, nx, ny);
        if (!t.burn) continue;
        if (state.rng() > 0.45) continue;
        var ni = idx(state, nx, ny);
        state.burning[ni] = Math.max(state.burning[ni] || 0, snapshot[i]);
      }
    }
  }

  function endTurn(state) {
    state.turn++;
    if (state.side === 'player') {
      state.side = 'enemy';
    } else {
      state.side = 'player';
      // 一整轮过去（敌我各一回合），天时演变一次
      advanceWeather(state);
    }
    beginSideTurn(state, state.side);
    return checkVictory(state);
  }

  /* ------------------------------------------------------------------ *
   * 胜负判定
   * ------------------------------------------------------------------ */

  function aliveOf(state, side) {
    return state.units.filter(function (u) { return u.alive && u.side === side; });
  }

  function checkVictory(state) {
    var players = aliveOf(state, 'player');
    var enemies = aliveOf(state, 'enemy');
    var v = state.victory || { type: 'annihilate' };

    // 先判失败
    if (!players.length) return { over: true, win: false, reason: '全军覆没' };
    var leaderUnit = null;
    for (var li = 0; li < state.units.length; li++) {
      if (state.units[li].side === 'player' && state.units[li].isLeader) { leaderUnit = state.units[li]; break; }
    }
    if (leaderUnit && !leaderUnit.alive) {
      // 主帅陨落，三军自乱：不必当场崩溃，但撑不了几回合
      if (state.leaderFellAt === undefined || state.leaderFellAt === null) {
        state.leaderFellAt = state.turn;
        state.events = state.events || [];
        state.events.push({ t: 'note', text: '主帅陨落，三军自乱！务必速战速决' });
        aliveOf(state, 'player').forEach(function (u) {
          gainMorale(u, -40);
          u.buffs = u.buffs || {};
          u.buffs.leaderless = 99;
        });
      }
      if (state.turn - state.leaderFellAt >= 3) {
        return { over: true, win: false, reason: '主帅陨落，全军崩溃' };
      }
    }

    var escort = state.units.filter(function (u) { return u.side === 'player' && u.isEscort; });
    if (v.type === 'escort' && escort.length && !escort[0].alive) {
      return { over: true, win: false, reason: '护送目标阵亡' };
    }

    if (v.type === 'turnLimit' && state.turn > (v.turns || 15)) {
      return { over: true, win: false, reason: '回合耗尽' };
    }
    if (v.type !== 'survive' && v.type !== 'turnLimit' && state.turn > state.turnLimit) {
      return { over: true, win: false, reason: '回合耗尽' };
    }

    // 再判胜利
    var won = false, why = '';
    switch (v.type) {
      case 'annihilate':
        won = enemies.length === 0; why = '敌军全灭';
        break;
      case 'boss':
        var boss = state.units.filter(function (u) { return u.side === 'enemy' && u.isBoss; });
        won = boss.length ? !boss[0].alive : enemies.length === 0;
        why = '击杀敌将';
        break;
      case 'capture':
        won = state.capturePoints.length > 0 && state.capturePoints.every(function (p) {
          return p.owner === 'player';
        });
        why = '占据全部据点';
        break;
      case 'city': {
        // 攻城：得城不算完，须守到下一轮才作数——否则一阵冲进去又被人夺回
        var cap = null;
        for (var cpi = 0; cpi < state.capturePoints.length; cpi++) {
          if (state.capturePoints[cpi].capital) { cap = state.capturePoints[cpi]; break; }
        }
        if (!cap) { won = enemies.length === 0; why = '敌军全灭'; }
        else {
          won = cap.owner === 'player' &&
            state.cityHeldSince !== null && state.cityHeldSince !== undefined &&
            (state.turn - state.cityHeldSince) >= 1;
          why = '攻入敌城';
        }
        break;
      }
      case 'flag': {
        // 夺旗：夺得帅旗还要活着送回本阵
        var fl = state.flag;
        if (!fl) { won = enemies.length === 0; why = '敌军全灭'; }
        else {
          var holder = null;
          if (fl.carrier) {
            for (var fi2 = 0; fi2 < state.units.length; fi2++) {
              if (state.units[fi2].id === fl.carrier) { holder = state.units[fi2]; break; }
            }
          }
          var tgt = v.target;
          var arrived = false;
          if (holder && holder.alive && holder.side === 'player') {
            if (tgt) arrived = (holder.x === tgt.x && holder.y === tgt.y);
            else arrived = holder.y >= state.rows - 3;
          }
          won = fl.owner === 'player' && arrived;
          why = '夺得帅旗';
        }
        break;
      }
      case 'survive':
        won = state.turn > (v.turns || 10);
        why = '成功坚守';
        break;
      case 'escort':
        if (escort.length) {
          var e = escort[0];
          won = !!(v.target && e.x === v.target.x && e.y === v.target.y);
          why = '护送抵达';
        }
        break;
      default:
        won = enemies.length === 0;
    }
    if (won) return { over: true, win: true, reason: why };
    return { over: false };
  }

  /** 单位站上据点即改变归属 */
  function refreshCapture(state) {
    if (!state.capturePoints) return;
    for (var i = 0; i < state.capturePoints.length; i++) {
      var p = state.capturePoints[i];
      var u = unitAt(state, p.x, p.y);
      if (u && u.alive) p.owner = u.side;
    }
    settleFlag(state);
    trackCapital(state);
  }

  /* ------------------------------------------------------------------ *
   * 地图生成
   * ------------------------------------------------------------------ */

  function valueNoise(rnd, w, h, scale) {
    var gw = Math.ceil(w / scale) + 1, gh = Math.ceil(h / scale) + 1;
    var grid = [];
    for (var i = 0; i < gw * gh; i++) grid.push(rnd());
    return function (x, y) {
      var fx = x / scale, fy = y / scale;
      var x0 = Math.floor(fx), y0 = Math.floor(fy);
      var tx = fx - x0, ty = fy - y0;
      function g(ix, iy) {
        ix = Math.max(0, Math.min(gw - 1, ix));
        iy = Math.max(0, Math.min(gh - 1, iy));
        return grid[iy * gw + ix];
      }
      var sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      var a = g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx;
      var b = g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx;
      return a * (1 - sy) + b * sy;
    };
  }

  /* ------------------------------------------------------------------ *
   * 地图生成：按「剧本」而非纯随机来布置山河
   *
   * spec 是一份地图配方，可声明：
   *   cols/rows              尺寸
   *   shape                  'rect' | 'oval' | 'irregular' | 'coast'
   *   base                   基础地貌 'plain' | 'grass'
   *   downs/hill/forest/marsh/grass  各类地貌占比（0..1）
   *   rivers[]               {axis,at,amp,wave,phase,width,bridges[],fords[]}
   *   lakes[]                {x,y,r}（比例坐标）
   *   ships[]                {x,y,w,h} 江面上的连环战船
   *   ranges[]               {axis,at,amp,wave,width} 山脉（不可通行）
   *   peaks[]                {x,y,r} 孤峰
   *   trails                 穿山小道的数量
   *   walls[]                {axis,at,from,to,gap} 关隘城墙
   *   cities[]/camps[]       {x,y}（比例坐标）据点
   * ------------------------------------------------------------------ */

  function generateMap(spec) {
    spec = spec || {};
    var cols = spec.cols || 20, rows = spec.rows || 20;
    var rnd = mulberry32(hashSeed('sanguo-map|' + (spec.seed || 1)));
    var map = new Uint8Array(cols * rows);
    /**
     * 地表起伏（0..1 以上，渲染层专用）。
     * 只靠地形类型画山，同种地形必然一模一样；有了高度图，
     * 同是「山地」也能有陡坡缓坡之分，山脊线才会连绵起伏而不是一排相同的方块。
     */
    var hgt = new Float32Array(cols * rows);
    var nMacro = valueNoise(rnd, cols, rows, 4.5);
    var nMicro = valueNoise(rnd, cols, rows, 1.9);
    var nEdge = valueNoise(rnd, cols, rows, 2.6);

    function put(x, y, t) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      map[y * cols + x] = t;
    }
    function setH(x, y, v) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      hgt[y * cols + x] = v;
    }
    function addH(x, y, d) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return;
      hgt[y * cols + x] += d;
    }
    function getH(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return 0;
      return hgt[y * cols + x];
    }
    function atGet(x, y) {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return T.VOID;
      return map[y * cols + x];
    }
    function rx(p) { return Math.max(0, Math.min(cols - 1, Math.round(p * (cols - 1)))); }
    function ry(p) { return Math.max(0, Math.min(rows - 1, Math.round(p * (rows - 1)))); }

    /* 1) 基础地貌：主噪声定山原，次噪声定林草 */
    var w = {
      downs: spec.downs || 0.14,
      hill: spec.hill || 0.10,
      forest: spec.forest || 0.14,
      marsh: spec.marsh || 0,
      grass: spec.grass || 0.24
    };
    var baseId = spec.base === 'grass' ? T.GRASS : T.PLAIN;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var v = nMacro(x, y), m = nMicro(x, y), t = baseId;
        if (w.marsh && v < w.marsh) t = T.MARSH;
        else if (v > 1 - w.hill) t = T.HILL;
        else if (v > 1 - w.hill - w.downs) t = T.DOWNS;
        else if (m > 1 - w.forest) t = T.FOREST;
        else if (m > 1 - w.forest - w.grass) t = (baseId === T.GRASS ? T.PLAIN : T.GRASS);
        put(x, y, t);
        // 起伏底子：主噪声定大势（山原起伏），次噪声加碎抖（同种地形也参差）
        setH(x, y, v * 0.66 + m * 0.13);
      }
    }

    /* 2) 轮廓：图外虚空让地图不再是死板的矩形 */
    var shape = spec.shape || 'irregular';
    if (shape !== 'rect') applyShape(map, cols, rows, shape, nEdge, spec);

    /* 3) 水网：江河湖泊 */
    var rivers = spec.rivers || [];
    for (var i = 0; i < rivers.length; i++) carveRiver(map, hgt, cols, rows, rivers[i]);
    var lakes = spec.lakes || [];
    for (var li = 0; li < lakes.length; li++) carveLake(map, hgt, cols, rows, lakes[li], nEdge);

    /* 4) 山峦：崇山峻岭不可通行 */
    var ranges = spec.ranges || [];
    for (var ri = 0; ri < ranges.length; ri++) carveRange(map, hgt, cols, rows, ranges[ri]);
    var peaks = spec.peaks || [];
    for (var pi = 0; pi < peaks.length; pi++) carvePeak(map, hgt, cols, rows, peaks[pi]);

    /* 5) 山中小道：窄窄一线，辎重绝难通过 */
    if (spec.trails) carveTrails(map, cols, rows, spec.trails, spec.trailAxis || 'v');

    /* 6) 关隘城墙 */
    var walls = spec.walls || [];
    for (var wi = 0; wi < walls.length; wi++) carveWall(map, hgt, cols, rows, walls[wi]);

    /* 7) 江面战船 */
    var ships = spec.ships || [];
    for (var si = 0; si < ships.length; si++) carveShips(map, cols, rows, ships[si]);

    /* 8) 连通南北的官道 */
    if (spec.road !== false) carveRoad(map, cols, rows, rnd);

    /* 9) 据点 */
    var capturePoints = [];
    var cities = spec.cities || [];
    for (var ci = 0; ci < cities.length; ci++) {
      var ccx = rx(cities[ci].x), ccy = ry(cities[ci].y);
      put(ccx, ccy, T.CITY);
      openAround(map, cols, rows, ccx, ccy);
      capturePoints.push({
        x: ccx, y: ccy, owner: cities[ci].owner || 'enemy',
        capital: !!cities[ci].capital, home: !!cities[ci].home, kind: 'city'
      });
    }
    var camps = spec.camps || [];
    for (var kp = 0; kp < camps.length; kp++) {
      var px = rx(camps[kp].x), py = ry(camps[kp].y);
      put(px, py, T.CAMP);
      openAround(map, cols, rows, px, py);
      capturePoints.push({
        x: px, y: py, owner: camps[kp].owner || 'enemy',
        capital: !!camps[kp].capital, home: !!camps[kp].home, kind: 'camp'
      });
    }

    /* 10) 敌军帅旗：夺旗关的目标物 */
    var flagPos = null;
    if (spec.flag) {
      var flx = rx(spec.flag.x), fly = ry(spec.flag.y);
      var fi = fly * cols + flx;
      // 旗杆得立在人能到的地方
      if (map[fi] === T.VOID || map[fi] === T.WALL || map[fi] === T.MOUNTAIN) map[fi] = T.PLAIN;
      openAround(map, cols, rows, flx, fly);
      flagPos = { x: flx, y: fly };
    }

    return {
      cols: cols, rows: rows, map: map, height: hgt,
      capturePoints: capturePoints, flagPos: flagPos
    };
  }

  /** 图外轮廓：把地图边缘雕成自然形状 */
  function applyShape(map, cols, rows, shape, noise, spec) {
    var cx0 = (cols - 1) / 2, cy0 = (rows - 1) / 2;
    var shrink = spec.shrink === undefined ? 0.06 : spec.shrink;
    for (var y = 0; y < rows; y++) {
      for (var x = 0; x < cols; x++) {
        var nx = (x - cx0) / (cols / 2), ny = (y - cy0) / (rows / 2);
        // 椭圆要包得住整张矩形，只在四角外侧收边
        var d = (shape === 'oval')
          ? Math.sqrt(nx * nx + ny * ny) * 0.74
          : Math.max(Math.abs(nx), Math.abs(ny));
        var jitter = (noise(x, y) - 0.5) * (shape === 'oval' ? 0.20 : 0.16);
        if (d > 1 - shrink + jitter) map[y * cols + x] = T.VOID;
      }
    }
    // 临海地形：一侧被江海吞没，形成曲折的岸线
    if (shape === 'coast') {
      var edge = spec.coastAt === undefined ? 0.74 : spec.coastAt;
      for (var cy2 = 0; cy2 < rows; cy2++) {
        for (var cx2 = 0; cx2 < cols; cx2++) {
          if (cx2 < cols * edge * 0.72) continue;
          var k = cy2 * cols + cx2;
          if (map[k] === T.VOID) continue;
          var deep = (cx2 / cols - edge) * 3 + (noise(cx2, cy2) - 0.42);
          if (deep > 0.12) map[k] = T.LAKE;
          else if (deep > -0.12 && map[k] !== T.LAKE) map[k] = T.MARSH;
        }
      }
    }
  }

  /**
   * 蜿蜒中心线。
   * 单一正弦太规整，一眼就看穿是机器画的；三层频率各异的正弦叠加后，
   * 才有了「大势蜿蜒 + 局部扭曲」的自然感。河流与山脉共用这条中心线。
   */
  function meander(len, cross, opt) {
    var at = (opt.at === undefined ? 0.5 : opt.at) * (cross - 1);
    var amp = opt.amp === undefined ? 1.5 : opt.amp;
    var wave = opt.wave || 9;
    var phase = opt.phase || 0;
    var out = [];
    for (var t = 0; t < len; t++) {
      out.push(at
        + Math.sin(t / wave * Math.PI * 2 + phase) * amp
        + Math.sin(t / (wave * 0.37) * Math.PI * 2 + phase * 1.9) * amp * 0.42
        + Math.sin(t / (wave * 0.17) * Math.PI * 2 + phase * 2.7) * amp * 0.17);
    }
    return out;
  }

  /**
   * 河道：中心线 + 沿程半宽。
   * 宽度随流程起伏——宽处成江、窄处成溪，这样「有宽窄」才立得住。
   */
  function riverBelt(cols, rows, r) {
    var vertical = r.axis !== 'h';
    var len = vertical ? rows : cols;
    var cross = vertical ? cols : rows;
    var width = r.width || 1;
    var line = meander(len, cross, r);
    var rnd = mulberry32(hashSeed('river-w|' + (r.at || 0.5) + '|' + (r.axis || 'v') + '|' + len));
    var wPhase = rnd() * Math.PI * 2;
    var wFreq = 1.3 + rnd() * 2.2;
    var out = [];
    for (var t = 0; t < len; t++) {
      var u = t / Math.max(1, len - 1);
      var wv = Math.sin(u * Math.PI * wFreq + wPhase) * 0.5 + 0.5;
      // 半宽在 0.55~1.15 倍之间起伏；下限 0.5 保证河道不会断流
      var half = Math.max(0.5, (width / 2) * (0.55 + wv * 0.60 + (width >= 3 ? 0.22 : 0)));
      out.push({ t: t, center: line[t], half: half });
    }
    return out;
  }

  /** 江面连环战船：只泊在够宽的大江上，小溪里列楼船说不通 */
  function placeShipsOnRiver(map, cols, rows, belt, vertical, width) {
    if (width < 3) return;
    // 主锚地选江面最宽处，上下游再各补一小撮；段与段之间留出水路——
    // 江面不该被船铺满，那是堵墙，不是水战阵形
    var best = -1, bestH = -1;
    for (var i = 3; i < belt.length - 3; i++) {
      if (belt[i].half > bestH) { bestH = belt[i].half; best = i; }
    }
    if (best < 0) return;
    var berths = [best];
    if (best > belt.length * 0.42) berths.push(Math.max(2, Math.round(best - belt.length * 0.30)));
    if (best < belt.length * 0.58) berths.push(Math.min(belt.length - 3, Math.round(best + belt.length * 0.30)));
    for (var n = 0; n < berths.length; n++) {
      var span = n === 0 ? 4 : 2;
      for (var d = -Math.floor(span / 2); d <= Math.floor(span / 2); d++) {
        var b = belt[berths[n] + d];
        if (!b) continue;
        var c0 = Math.round(b.center);
        // 船阵只占河心，两岸各留一条水道
        var hw = Math.min(Math.max(0, Math.floor(b.half) - 1), n === 0 ? 2 : 1);
        for (var c = c0 - hw; c <= c0 + hw; c++) {
          var x = vertical ? c : b.t, y = vertical ? b.t : c;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          var k = y * cols + x;
          if (map[k] === T.RIVER) map[k] = T.SHIP;
        }
      }
    }
  }

  function carveRiver(map, hgt, cols, rows, r) {
    var vertical = r.axis !== 'h';
    var belt = riverBelt(cols, rows, r);
    var bridges = r.bridges || [];
    var fords = r.fords || [];
    var width = r.width || 1;

    var lo0, hi0, c, x, y, k;
    for (var i = 0; i < belt.length; i++) {
      var b = belt[i];
      var isBridge = bridges.indexOf(b.t) >= 0;
      var isFord = fords.indexOf(b.t) >= 0;
      lo0 = Math.round(b.center - b.half + 0.5);
      hi0 = Math.round(b.center + b.half - 0.5);
      for (c = lo0; c <= hi0; c++) {
        x = vertical ? c : b.t; y = vertical ? b.t : c;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        k = y * cols + x;
        if (map[k] === T.VOID) continue;
        map[k] = isBridge ? T.BRIDGE : (isFord ? T.FORD : T.RIVER);
        // 河床下切，江面越宽陷得越深
        hgt[k] -= 0.10 + b.half * 0.035;
      }
    }

    // 大河行船
    if (r.ships !== false) placeShipsOnRiver(map, cols, rows, belt, vertical, width);

    // 一道河至少给一座桥或一处浅滩，否则两岸永不相通。
    // 桥要架在最窄处——宽处架桥既不合常理，桥身也长得离谱。
    if (!bridges.length && !fords.length) {
      var pick = -1, pickH = 1e9;
      for (var s = Math.floor(belt.length * 0.25); s < belt.length * 0.75; s++) {
        if (belt[s].half < pickH) { pickH = belt[s].half; pick = s; }
      }
      var bb = belt[pick];
      if (bb) {
        for (c = Math.round(bb.center - bb.half + 0.5); c <= Math.round(bb.center + bb.half - 0.5); c++) {
          x = vertical ? c : bb.t; y = vertical ? bb.t : c;
          if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
          k = y * cols + x;
          if (map[k] === T.RIVER) map[k] = (r.crossing === 'ford') ? T.FORD : T.BRIDGE;
        }
      }
    }
  }

  function carveLake(map, hgt, cols, rows, l, noise) {
    var cx = Math.round(l.x * (cols - 1)), cy = Math.round(l.y * (rows - 1));
    var rad = Math.max(1, Math.round((l.r || 0.12) * Math.min(cols, rows)));
    for (var y = cy - rad; y <= cy + rad; y++) {
      for (var x = cx - rad; x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        var dx = (x - cx) / rad, dy = (y - cy) / rad;
        var d = Math.sqrt(dx * dx + dy * dy);
        var jitter = (noise(x, y) - 0.5) * 0.45;
        var k = y * cols + x;
        if (d <= 0.62 + jitter) { map[k] = T.LAKE; hgt[k] -= 0.17; }
        else if (d <= 0.95 + jitter && map[k] !== T.LAKE) {
          // 湖畔泥泞
          var cur = map[k];
          if (cur !== T.VOID && cur !== T.RIVER) { map[k] = T.MARSH; hgt[k] -= 0.05; }
        }
      }
    }
  }

  function carveRange(map, hgt, cols, rows, rg) {
    var vertical = rg.axis !== 'h';
    var len = vertical ? rows : cols;
    var cross = vertical ? cols : rows;
    var width = rg.width || 1;
    var line = meander(len, cross, rg);
    var rnd = mulberry32(hashSeed('range|' + (rg.at || 0.5) + '|' + (rg.axis || 'v') + '|' + len));
    var hPhase = rnd() * Math.PI * 2;
    var hFreq = 0.7 + rnd() * 1.7;
    var cells = [];
    for (var t = 0; t < len; t++) {
      var u = t / Math.max(1, len - 1);
      var c0 = Math.round(line[t]);
      // 脊线起伏：有的段落高耸成峰，有的段落低落成岗。
      // 少了这一层，山脉就会像一堵等高的墙，处处一个模样。
      var ridge = 0.5 + 0.5 * Math.sin(u * Math.PI * hFreq + hPhase);
      var hw = Math.max(0, Math.round((width - 1) / 2));
      for (var c = c0 - hw; c <= c0 + hw; c++) {
        var x = vertical ? c : t, y = vertical ? t : c;
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        var k = y * cols + x;
        if (map[k] === T.VOID) continue;
        map[k] = T.MOUNTAIN;
        // 横截面：山脊最厚，向两翼递减
        var off = hw > 0 ? (1 - Math.abs(c - c0) / (hw + 0.7)) : 1;
        var h = 0.55 + ridge * 0.70 * (0.52 + off * 0.48);
        if (h > hgt[k]) hgt[k] = h;
        cells.push({ x: x, y: y });
      }
    }
    // 山脚过渡为山地，让山体不显得突兀
    var NB = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (var j = 0; j < cells.length; j++) {
      var p = cells[j];
      for (var d2 = 0; d2 < 4; d2++) {
        var nx = p.x + NB[d2][0], ny = p.y + NB[d2][1];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        var kk = ny * cols + nx;
        if (map[kk] === T.PLAIN || map[kk] === T.GRASS) {
          map[kk] = T.HILL;
          if (hgt[kk] < 0.34) hgt[kk] = 0.34;
        }
      }
    }
  }

  function carvePeak(map, hgt, cols, rows, p) {
    var cx = Math.round(p.x * (cols - 1)), cy = Math.round(p.y * (rows - 1));
    var rad = Math.max(1, Math.round((p.r || 0.1) * Math.min(cols, rows)));
    for (var y = cy - rad; y <= cy + rad; y++) {
      for (var x = cx - rad; x <= cx + rad; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        var dx = x - cx, dy = y - cy;
        var d = Math.sqrt(dx * dx + dy * dy);
        var k = y * cols + x;
        if (d <= rad * 0.55) {
          map[k] = T.MOUNTAIN;
          // 锥体：峰心最高，向山脚平滑跌落
          var h = 0.95 - (d / Math.max(1, rad * 0.55)) * 0.30;
          if (h > hgt[k]) hgt[k] = h;
        } else if (d <= rad) {
          if (map[k] !== T.VOID) {
            map[k] = T.HILL;
            var h2 = 0.46 - (d / rad) * 0.16;
            if (h2 > hgt[k]) hgt[k] = h2;
          }
        }
      }
    }
  }

  /** 出使山脉中必有羊肠小道：沿最能贯穿山脉的那几条线凿开通路 */
  function carveTrails(map, cols, rows, count, preferAxis) {
    var axes = preferAxis === 'h' ? ['h', 'v'] : ['v', 'h'];
    var made = 0;
    for (var a = 0; a < axes.length && made < count; a++) {
      var axis = axes[a];
      var lineCount = axis === 'h' ? rows : cols;
      var cross = axis === 'h' ? cols : rows;
      function mountCount(axis, line, cross) {
        var n = 0;
        for (var k = 0; k < cross; k++) {
          var x = axis === 'h' ? k : line, y = axis === 'h' ? line : k;
          if (map[y * cols + x] === T.MOUNTAIN) n++;
        }
        return n;
      }
      var lines = [];
      for (var t = 0; t < lineCount; t++) lines.push(t);
      lines.sort(function (p, q) { return mountCount(axis, q, cross) - mountCount(axis, p, cross); });
      for (var i = 0; i < lines.length && made < count; i++) {
        if (mountCount(axis, lines[i], cross) < 2) continue;
        for (var k2 = 0; k2 < cross; k2++) {
          var x2 = axis === 'h' ? k2 : lines[i], y2 = axis === 'h' ? lines[i] : k2;
          if (map[y2 * cols + x2] === T.MOUNTAIN) map[y2 * cols + x2] = T.PATH;
        }
        made++;
      }
    }
  }

  /** 关隘：一道城墙 + 一个关口缺口 */
  function carveWall(map, hgt, cols, rows, wl) {
    var vertical = wl.axis !== 'h';
    var at = Math.round((wl.at === undefined ? 0.5 : wl.at) * ((vertical ? cols : rows) - 1));
    var from = wl.from === undefined ? 0 : Math.round(wl.from * ((vertical ? rows : cols) - 1));
    var to = wl.to === undefined ? (vertical ? rows : cols) - 1
      : Math.round(wl.to * ((vertical ? rows : cols) - 1));
    var gap = wl.gap === undefined ? Math.floor((from + to) / 2) : Math.round(wl.gap * ((vertical ? rows : cols) - 1));
    for (var k = from; k <= to; k++) {
      var x = vertical ? at : k, y = vertical ? k : at;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      var kk = y * cols + x;
      if (k === gap) {
        map[kk] = T.ROAD;      // 关门
        continue;
      }
      if (map[kk] === T.VOID) continue;
      map[kk] = T.WALL;
      if (hgt[kk] < 0.52) hgt[kk] = 0.52;
    }
  }

  /** 连绵战船：江面上的连环楼船，陆军可登但极怕火 */
  function carveShips(map, cols, rows, s) {
    var cx = Math.round(s.x * (cols - 1)), cy = Math.round(s.y * (rows - 1));
    var ww = Math.max(1, Math.round(s.w || 3)), hh = Math.max(1, Math.round(s.h || 2));
    for (var y = cy - hh; y <= cy + hh; y++) {
      for (var x = cx - ww; x <= cx + ww; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        var cur = map[y * cols + x];
        if (cur === T.RIVER || cur === T.LAKE) map[y * cols + x] = T.SHIP;
      }
    }
  }

  /** 据点四周要留出可站之地：别把城池孤悬在山尖水心 */
  function openAround(map, cols, rows, cx, cy) {
    [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(function (d) {
      var nx = cx + d[0], ny = cy + d[1];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      var k = ny * cols + nx;
      if (map[k] === T.MOUNTAIN || map[k] === T.WALL || map[k] === T.LAKE) map[k] = T.PLAIN;
    });
  }

  /** 自南向北贯通的官道，行军与辎重的命脉 */
  function carveRoad(map, cols, rows, rnd) {
    var x = Math.floor(cols / 2);
    for (var y = rows - 1; y >= 0; y--) {
      var k = y * cols + x;
      var cur = map[k];
      if (cur === T.VOID || cur === T.MOUNTAIN || cur === T.WALL) {
        // 遇阻则向侧翼绕一段
        x += (rnd() < 0.5 ? -1 : 1);
        if (x < 0) x = 0; if (x >= cols) x = cols - 1;
        continue;
      }
      if (cur === T.RIVER || cur === T.LAKE) continue;      // 江面自有桥梁
      if (cur !== T.BRIDGE && cur !== T.FORD && cur !== T.CITY && cur !== T.CAMP && cur !== T.SHIP) {
        map[k] = T.ROAD;
      }
      if (rnd() < 0.22) {
        x += (rnd() < 0.5 ? -1 : 1);
        if (x < 0) x = 0; if (x >= cols) x = cols - 1;
      }
    }
  }

  /** 找一块可站立的空地（用于出生点） */
  function findSpawn(state, side, rnd, used, unit) {
    var rows = state.rows, cols = state.cols;
    function ok(x, y) {
      if (!isPlayable(state, x, y)) return false;
      if (unit && !terrainPassable(state, x, y, unit)) return false;
      if (unitAt(state, x, y)) return false;
      var key = x + ',' + y;
      if (used[key]) return false;
      // 出生点最好别窝在河心孤岛上，至少有一块可落脚的邻地
      return true;
    }
    // 部署带：贴着各自半场的内缘，而不是死守地图最边缘。
    // 战场放大后若还从图的最上/最下两端出发，两军要走十几回合才照面，
    // 大半局耗在跑路上；收拢到 0.28 / 0.72 一带，接战距离才回到合理范围，
    // 地图依然辽阔，只是不用再空跑。
    var lo = Math.round(rows * (side === 'player' ? 0.66 : 0.28));
    var span = Math.max(2, Math.round(rows * 0.09));
    for (var tries = 0; tries < 300; tries++) {
      var x = Math.floor(rnd() * cols);
      var y = Math.max(0, Math.min(rows - 1, lo + Math.floor(rnd() * span)));
      if (!ok(x, y)) continue;
      used[x + ',' + y] = true;
      return { x: x, y: y };
    }
    // 兜底：线性扫描（玩家从下方扫，敌人在上方）
    var ys = [];
    for (var i = 0; i < rows; i++) ys.push(i);
    if (side === 'player') ys.reverse();
    for (var yi = 0; yi < ys.length; yi++) {
      for (var xx = 0; xx < cols; xx++) {
        if (ok(xx, ys[yi])) { used[xx + ',' + ys[yi]] = true; return { x: xx, y: ys[yi] }; }
      }
    }
    // 再兜底：任意可站立格
    for (var yy = 0; yy < rows; yy++) {
      for (var x2 = 0; x2 < cols; x2++) {
        if (!isPlayable(state, x2, yy)) continue;
        if (unitAt(state, x2, yy)) continue;
        used[x2 + ',' + yy] = true;
        return { x: x2, y: yy };
      }
    }
    return { x: 0, y: 0 };
  }

  /** 保证出生区连通：从玩家出生点做洪水填充，凿开不可达的敌方出生点 */
  function ensureConnected(state) {
    var start = null;
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].side === 'player') { start = state.units[i]; break; }
    }
    if (!start) return;
    // 以「步兵」为基准衡量可达性：步兵通行的地方最多，
    // 骑兵/辎重受限另行约束（那正是地形战术的一部分）
    var probe = { troop: 'infantry', side: start.side, hero: null };
    var seen = {};
    var stack = [[start.x, start.y]];
    seen[idx(state, start.x, start.y)] = 1;
    while (stack.length) {
      var c = stack.pop();
      var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (var d = 0; d < 4; d++) {
        var nx = c[0] + dirs[d][0], ny = c[1] + dirs[d][1];
        if (!isPlayable(state, nx, ny)) continue;
        var ni = idx(state, nx, ny);
        if (seen[ni]) continue;
        if (!terrainPassable(state, nx, ny, probe)) continue;
        seen[ni] = 1;
        stack.push([nx, ny]);
      }
    }

    for (var u = 0; u < state.units.length; u++) {
      var unit = state.units[u];
      if (unit.side !== 'enemy') continue;
      if (seen[idx(state, unit.x, unit.y)]) continue;
      // 沿直线凿路：把到玩家出生点的路径上的阻挡地形改成平原
      var cx = unit.x, cy = unit.y;
      while (cx !== start.x || cy !== start.y) {
        var ti = idx(state, cx, cy);
        var tt = TERRAIN[state.map[ti]];
        if (tt.pass !== true || tt.outside) {
          state.map[ti] = T.PLAIN;
          if (state.owned && state.owned[ti] !== undefined) delete state.owned[ti];
          var ci = captureIndex(state, cx, cy);
          if (ci >= 0) state.capturePoints.splice(ci, 1);
        }
        if (cx < start.x) cx++; else if (cx > start.x) cx--;
        else if (cy < start.y) cy++; else if (cy > start.y) cy--;
      }
    }
  }

  function captureIndex(state, x, y) {
    if (!state.capturePoints) return -1;
    for (var i = 0; i < state.capturePoints.length; i++) {
      if (state.capturePoints[i].x === x && state.capturePoints[i].y === y) return i;
    }
    return -1;
  }

  /* ------------------------------------------------------------------ *
   * 对外导出
   * ------------------------------------------------------------------ */

  core.TERRAIN = TERRAIN;
  core.T = T;
  core.TROOPS = TROOPS;
  core.COUNTER = COUNTER;
  core.counterRate = counterRate;
  core.mulberry32 = mulberry32;
  core.hashSeed = hashSeed;

  core.inBounds = inBounds;
  core.idx = idx;
  core.tileAt = tileAt;
  core.dist = dist;
  core.unitAt = unitAt;
  core.aliveOf = aliveOf;

  core.HAZ = HAZ;
  core.HAZ_DEF = HAZ_DEF;
  core.hazAt = hazAt;
  core.hazDef = hazDef;
  core.hazTurns = hazTurns;
  core.setHaz = setHaz;
  core.clearHaz = clearHaz;
  core.isBurnable = isBurnable;
  core.isFloodable = isFloodable;
  core.isRockable = isRockable;
  core.terrainFit = terrainFit;
  core.layHazard = layHazard;
  core.reachable = reachable;
  core.bumpOccupancy = bumpOccupancy;
  core.occupancyOf = occupancyOf;
  core.movePoints = movePoints;
  core.attackTiles = attackTiles;
  core.attackRange = attackRange;
  core.attackPositions = attackPositions;
  core.bestAttackPosition = bestAttackPosition;

  core.computeDamage = computeDamage;
  core.statOf = statOf;
  core.levelMod = levelMod;
  core.zocAt = zocAt;
  core.hasZOC = hasZOC;
  core.adjacentEnemies = adjacentEnemies;
  core.flankBonus = flankBonus;
  core.elevAt = elevAt;
  core.hasLineOfSight = hasLineOfSight;
  core.canHitFrom = canHitFrom;
  core.canCounter = canCounter;
  core.rangeAt = rangeAt;
  core.ownerAt = ownerAt;
  core.captureTile = captureTile;
  core.initOwnership = initOwnership;
  core.igniteTiles = igniteTiles;
  core.moveCost = moveCost;
  core.traitOf = traitOf;
  core.hasTrait = hasTrait;
  core.TRAITS = TRAITS;
  core.registerTraits = function (table) {
    for (var k in table) if (Object.prototype.hasOwnProperty.call(table, k)) TRAITS[k] = table[k];
  };
  core.moveUnit = moveUnit;
  core.attack = attack;
  core.applyDamage = applyDamage;
  core.gainMorale = gainMorale;

  core.skillTiles = skillTiles;
  core.canUseSkill = canUseSkill;
  core.skillCost = skillCost;
  core.useSkill = useSkill;

  core.beginSideTurn = beginSideTurn;
  core.endTurn = endTurn;
  core.checkVictory = checkVictory;
  core.refreshCapture = refreshCapture;

  core.generateMap = generateMap;
  core.findSpawn = findSpawn;
  core.ensureConnected = ensureConnected;
  core.valueNoise = valueNoise;

  /* ---- 新增：地形查询与天气 ---- */
  core.WEATHER = WEATHER;
  core.weather = weather;
  core.rollWeather = rollWeather;
  core.advanceWeather = advanceWeather;
  core.initWeather = initWeather;
  core.pickWeatherKey = pickWeatherKey;
  core.setWeather = setWeather;
  core.isPlayable = isPlayable;
  core.terrainPassable = terrainPassable;
  core.terrainBans = terrainBans;
  core.troopsFor = troopsFor;
  core.DEFAULT_TROOPS = DEFAULT_TROOPS;
  core.adjacentSupply = adjacentSupply;
  core.supplyTargets = supplyTargets;
  core.spreadFire = spreadFire;

  return core;
});
