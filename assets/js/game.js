/* ==========================================================================
 * game.js — 战斗流程：开局布阵、玩家操作、回合推进、结算
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./data.js'), require('./ai.js'));
  } else {
    root.SG = root.SG || {};
    root.SG.game = factory(root.SG.core, root.SG.data, root.SG.ai);
  }
})(typeof self !== 'undefined' ? self : this, function (core, data, ai) {
  'use strict';

  var game = {};

  /**
   * 组建一支队伍。
   * @param troopKey 出征前选定的兵种（不传则用武将的默认兵种）
   * @param restrict 是否只允许该武将可配置的兵种（敌方布阵也按演义来限定）
   */
  /** 名将的兵力值以「千」计，上阵时换算成实际带兵数 */
  var SOLDIER_SCALE = 8;

  function makeUnit(state, heroId, level, side, troopKey, restrict) {
    var hero = data.hero(heroId);
    if (!hero) throw new Error('未知武将：' + heroId);
    // 名将统带七八千，营伍按编制实数计，皆随等级增厚
    var base = hero.levy ? hero.hp : hero.hp * SOLDIER_SCALE;
    var maxHp = Math.round(base * (1 + (level - 1) * 0.06));

    var troop = hero.troop;
    if (troopKey) {
      var allowed = core.troopsFor(hero);
      if (allowed.indexOf(troopKey) >= 0 || !restrict) troop = troopKey;
      else troop = hero.troop;
    }
    var tp = core.TROOPS[troop] || core.TROOPS.infantry;
    // 辎重队人马众多，血厚而钝；远程/文职则相对单薄
    if (tp.hpBonus) maxHp = Math.round(maxHp * (1 + tp.hpBonus));

    return {
      id: 'u' + (state.nextId++),
      heroId: heroId,
      hero: hero,
      name: hero.name,
      side: side,
      troop: troop,
      baseTroop: hero.troop,
      level: level,
      x: -1, y: -1,
      hp: maxHp,
      maxHp: maxHp,
      morale: 32,          // 开局就有一定士气，避免前几回合完全放不出武将技
      alive: true,
      moved: false,
      acted: false,
      skillUsed: false,
      isLeader: false,
      isBoss: false,
      isEscort: false,
      buffs: {}
    };
  }

  /** 一军之主：主公亲征则主公为帅，否则推举军中第一勇士 */
  var LORDS = ['liubei', 'caocao', 'sunquan', 'sunce', 'yuanshao', 'liuzhang', 'dongzhuo',
    'zhangjiao', 'gongsunzan', 'simayi', 'simayan', 'menghuo', 'lvbu', 'lubu'];

  function pickLeader(state) {
    var players = state.units.filter(function (u) { return u.side === 'player'; });
    if (!players.length) return null;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < players.length; i++) {
      var u = players[i];
      var s = u.level * 1.2 + (u.hero.atk + u.hero.def) * 0.05;
      if (LORDS.indexOf(u.heroId) >= 0) s += 60;        // 主公压阵
      if (s > bestScore) { bestScore = s; best = u; }
    }
    players.forEach(function (u) { u.isLeader = false; });
    if (best) {
      best.isLeader = true;
      // 中军亲卫：主帅麾下兵马更多
      best.maxHp = Math.round(best.maxHp * 1.22);
      best.hp = best.maxHp;
    }
    return best;
  }

  /** 从指定位置起找最近的、陆军能站立的格子（用于校准目标点） */
  function nearestFreeTile(state, from) {
    var probe = { troop: 'infantry' };
    if (!from) from = { x: state.cols - 1, y: 0 };
    for (var r = 0; r < Math.max(state.cols, state.rows); r++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          var x = from.x + dx, y = from.y + dy;
          if (!core.isPlayable(state, x, y)) continue;
          if (!core.terrainPassable(state, x, y, probe)) continue;
          return { x: x, y: y };
        }
      }
    }
    return { x: Math.max(0, Math.min(state.cols - 1, from.x)), y: Math.max(0, Math.min(state.rows - 1, from.y)) };
  }

  /** 开一局战斗。party：[{heroId, level, troop}]；opts.seed 可固定随机序列（测试用） */
  function createBattle(levelIndex, party, opts) {
    opts = opts || {};
    var cfg = data.levelConfig(levelIndex);
    var m = core.generateMap(cfg.map || cfg);
    var state = {
      level: levelIndex,
      config: cfg,
      cols: m.cols,
      rows: m.rows,
      map: m.map,
      height: m.height,
      hazard: new Uint8Array(m.cols * m.rows),
      hazardTurns: new Uint8Array(m.cols * m.rows),
      capturePoints: m.capturePoints || [],
      units: [],
      side: 'player',
      turn: 1,
      turnLimit: cfg.turnLimit,
      victory: cfg.victory,
      rng: core.mulberry32(core.hashSeed('battle|' + levelIndex + '|' +
        (opts.seed !== undefined ? opts.seed : Date.now()))),
      events: [],
      log: [],
      result: null,
      nextId: 1,
      weather: null,
      weatherNext: null,
      weatherStreak: 0,
      // 敌军帅旗：夺旗关的核心目标，谁踏上谁得，携旗者阵亡则旗落原地
      flag: m.flagPos ? { x: m.flagPos.x, y: m.flagPos.y, owner: 'enemy', carrier: null } : null,
      cityHeldSince: null
    };

    var rnd = core.mulberry32(core.hashSeed('spawn|' + levelIndex));
    var used = {};

    // 我方布阵（地图下方）；troop 出征前选定的兵种
    for (var i = 0; i < party.length; i++) {
      var p = party[i];
      var u = makeUnit(state, p.heroId, p.level || 1, 'player', p.troop, true);
      state.units.push(u);
      var pos = core.findSpawn(state, 'player', rnd, used, u);
      u.x = pos.x; u.y = pos.y;
      used[u.x + ',' + u.y] = true;
    }
    // 主公（或军中第一勇士）为帅：主将阵亡即全军崩溃，不能让弱卒挂帅
    pickLeader(state);

    // 敌方布阵（地图上方）：守将与其亲兵各守palace其位
    for (var k = 0; k < cfg.enemies.length; k++) {
      var e = cfg.enemies[k];
      var eu = makeUnit(state, e.heroId, e.level, 'enemy', e.troop, true);
      eu.maxHp = Math.round(eu.maxHp * cfg.hpScale);
      eu.hp = eu.maxHp;
      if (e.isBoss) eu.isBoss = true;
      state.units.push(eu);
      var epos = core.findSpawn(state, 'enemy', rnd, used, eu);
      eu.x = epos.x; eu.y = epos.y;
      used[eu.x + ',' + eu.y] = true;
    }

    // 护送关：把队伍中最后一位设为护送目标，目的地在敌方腹地
    if (cfg.victory.type === 'escort') {
      var players = state.units.filter(function (x) { return x.side === 'player'; });
      var escort = players[players.length - 1];
      escort.isEscort = true;
      var target = nearestFreeTile(state, cfg.victory.target);
      cfg.victory.target = { x: target.x, y: target.y };
    }

    // 据点归属：地图配方里写在南侧（我方一侧）的本就是自家营垒，
    // 只有敌军实控或地图上默认属敌的，才需要去夺回来
    for (var c = 0; c < state.capturePoints.length; c++) {
      var cp = state.capturePoints[c];
      var cu = core.unitAt(state, cp.x, cp.y);
      cp.owner = cu ? cu.side : (cp.owner === 'player' ? 'player' : 'enemy');
    }

    core.ensureConnected(state);
    core.initOwnership(state);
    setupScenario(state, cfg, false);

    // 攻城关：锁定敌城所在格；万一地图上没城，退回夺点，别出现打不赢的死局
    if (state.victory.type === 'city') {
      var cap = null;
      for (var q = 0; q < state.capturePoints.length; q++) {
        if (state.capturePoints[q].capital) { cap = state.capturePoints[q]; break; }
      }
      if (cap) {
        state.victory.target = { x: cap.x, y: cap.y };
        cap.owner = 'enemy';
      } else {
        state.victory.type = 'capture';
      }
    }
    // 夺旗关：确认接应本阵，否则无处交旗
    if (state.victory.type === 'flag') {
      var home = null;
      for (var h = 0; h < state.capturePoints.length; h++) {
        if (state.capturePoints[h].home) { home = state.capturePoints[h]; break; }
      }
      if (home && state.flag) state.victory.target = { x: home.x, y: home.y };
      else if (state.flag) state.victory.target = { x: state.flag.x, y: state.rows - 3 };
      else state.victory.type = 'annihilate';
    }

    core.beginSideTurn(state, 'player');
    return state;
  }

  /**
   * 剧本布置：名战役的天时、天气池与剧本、地形遗留物与情节标记。
   * 新开局与恢复存档共用，恢复时 savedWeather 非空则沿用存档里的天象。
   */
  function setupScenario(state, cfg, restored) {
    state.scenario = cfg.scenario || null;
    var mw = (cfg.map && cfg.map.weather) || null;
    if (mw) {
      state.weatherPool = mw.pool || null;
      state.weatherScript = mw.script || null;
      state.weatherNotes = mw.notes || null;
    }

    if (restored && restored.weather) {
      // 存档里带着天象与剧情进度：原样接续，别让读档改写天意
      state.weather = restored.weather;
      state.weatherStreak = restored.weatherStreak || 0;
      state.weatherNext = restored.weatherNext || restored.weather;
      state.rainDoused = !!restored.rainDoused;
      state.fireLitTurn = restored.fireLitTurn || null;
    } else {
      core.initWeather(state, mw && mw.first ? mw.first : 'clear');
    }

    // 存档里带着遗留物（火场/洪水/乱石）：原样铺回战场
    if (restored && restored.hazard) {
      for (var ri = 0; ri < state.hazard.length && ri < restored.hazard.length; ri++) {
        state.hazard[ri] = restored.hazard[ri] || 0;
        state.hazardTurns[ri] = restored.hazardTurns ? (restored.hazardTurns[ri] || 0) : 0;
      }
      return;
    }

    /* 水淹七军：开战即是泽国——低洼处预先一片汪洋 */
    var hzs = (cfg.scenario && cfg.scenario.hazards) || [];
    for (var hi = 0; hi < hzs.length; hi++) {
      var hz = hzs[hi];
      var hx = hz.x, hy = hz.y;
      if (cfg.map && cfg.map.mirrored) hx = 1 - hx;   // 地图镜像，淹没区也跟着翻
      var cx0 = Math.max(0, Math.min(state.cols - 1, Math.round(hx * (state.cols - 1))));
      var cy0 = Math.max(0, Math.min(state.rows - 1, Math.round(hy * (state.rows - 1))));
      var rr = Math.max(1, Math.round(hz.r * Math.min(state.cols, state.rows)));
      for (var yy = cy0 - rr; yy <= cy0 + rr; yy++) {
        for (var xx = cx0 - rr; xx <= cx0 + rr; xx++) {
          if (xx < 0 || yy < 0 || xx >= state.cols || yy >= state.rows) continue;
          var dd = Math.hypot(xx - cx0, yy - cy0);
          if (dd > rr * (0.82 + 0.3 * ((xx * 31 + yy * 17) % 10) / 10)) continue;   // 边缘犬牙交错
          var tt = core.tileAt(state, xx, yy);
          if (tt.key === 'mountain' || tt.key === 'wall' || tt.key === 'void' ||
              tt.key === 'city' || tt.key === 'hill') continue;
          core.setHaz(state, xx, yy, core.HAZ.FLOOD, 12);
        }
      }
      state.events.push({ t: 'note', text: '汉水暴涨，低洼之处已成泽国！' });
    }
  }

  /* ------------------------------------------------------------------ *
   * 玩家操作
   * ------------------------------------------------------------------ */

  function canAct(state, unit) {
    return unit && unit.alive && unit.side === 'player' && !unit.acted && state.side === 'player'
      && !unit.chaosAct && !(state.result && state.result.over);
  }

  function moveUnit(state, unit, path) {
    if (!canAct(state, unit)) return null;
    var events = core.moveUnit(state, unit, path);
    unit.moved = true;
    core.refreshCapture(state);
    pushEvents(state, events);
    state.result = core.checkVictory(state);
    return events;
  }

  function attack(state, unit, target) {
    if (!canAct(state, unit)) return null;
    // 需要移动到攻击位
    var moveEvents = [];
    if (core.dist(unit, target) > core.attackRange(state, unit)) {
      var pos = core.bestAttackPosition(state, unit, target);
      if (!pos) return null;
      if (!(pos.x === unit.x && pos.y === unit.y)) {
        var reach = core.reachable(state, unit);
        var path = reach.pathOf(pos.x, pos.y);
        if (path && path.length) moveEvents = core.moveUnit(state, unit, path);
        else { unit.x = pos.x; unit.y = pos.y; }
      }
    }
    var events = moveEvents.concat(core.attack(state, unit, target, []));
    core.refreshCapture(state);
    pushEvents(state, events);
    state.result = core.checkVictory(state);
    return events;
  }

  function castSkill(state, unit, tx, ty, skill) {
    if (!canAct(state, unit)) return null;
    if (!skill) {
      var list = (unit.hero && unit.hero.skillDefs) ? unit.hero.skillDefs : [];
      skill = list[0] || unit.hero.skillDef;
    }
    if (!skill || !core.canUseSkill(state, unit, skill)) return null;
    var range = skill.range || 1;
    if (range > 0 && Math.abs(unit.x - tx) + Math.abs(unit.y - ty) > range) return null;
    var events = core.useSkill(state, unit, tx, ty, skill, []);
    core.refreshCapture(state);
    pushEvents(state, events);
    state.result = core.checkVictory(state);
    return events;
  }

  function pushEvents(state, events) {
    if (!events) return;
    for (var i = 0; i < events.length; i++) state.events.push(events[i]);
    if (state.events.length > 400) state.events.splice(0, state.events.length - 400);
  }

  /** 玩家结束回合 → 敌方行动 → 回到玩家 */
  function endPlayerTurn(state) {
    if (state.result && state.result.over) return state.result;
    state.side = 'enemy';
    core.beginSideTurn(state, 'enemy');

    ai.runEnemyTurn(state);

    if (!state.result || !state.result.over) {
      state.turn++;
      state.side = 'player';
      // 敌我各走一回合，天时演变一次（并卜出下轮天象，供双方谋划）
      core.advanceWeather(state);
      core.beginSideTurn(state, 'player');
      state.result = core.checkVictory(state);
    }
    return state.result;
  }

  /* ------------------------------------------------------------------ *
   * 结算
   * ------------------------------------------------------------------ */

  function gradeBattle(state) {
    var alive = core.aliveOf(state, 'player').length;
    var total = state.units.filter(function (u) { return u.side === 'player'; }).length;
    var aliveRatio = total ? alive / total : 0;
    var stars = 1;
    if (state.victory.type === 'survive') {
      stars = aliveRatio >= 0.9 ? 3 : aliveRatio >= 0.6 ? 2 : 1;
    } else {
      var turnRatio = state.turn / Math.max(1, state.turnLimit);
      if (aliveRatio >= 0.6 && turnRatio <= 0.85) stars = 2;
      if (aliveRatio >= 0.85 && turnRatio <= 0.6) stars = 3;
    }
    return stars;
  }

  function settle(state) {
    var win = !!(state.result && state.result.win);
    var stars = win ? gradeBattle(state) : 0;
    var cfg = state.config;
    var survivors = core.aliveOf(state, 'player');
    return {
      win: win,
      stars: stars,
      reason: state.result ? state.result.reason : '',
      exp: win ? Math.round(cfg.rewards.exp * (0.6 + stars * 0.2)) : Math.round(cfg.rewards.exp * 0.15),
      gold: win ? Math.round(cfg.rewards.gold * (0.6 + stars * 0.2)) : 0,
      unlock: win ? cfg.rewards.unlock : null,
      survivors: survivors.map(function (u) { return u.heroId; }),
      turns: state.turn
    };
  }

  /* ------------------------------------------------------------------ *
   * 存档序列化
   * ------------------------------------------------------------------ */

  function serialize(state) {
    return {
      level: state.level,
      turn: state.turn,
      side: state.side,
      victory: state.victory,
      turnLimit: state.turnLimit,
      capturePoints: state.capturePoints,
      // 天时与剧情进度、战场遗留物一并入档，读档后天意不改
      weather: state.weather || null,
      weatherStreak: state.weatherStreak || 0,
      weatherNext: state.weatherNext || null,
      rainDoused: !!state.rainDoused,
      fireLitTurn: state.fireLitTurn || null,
      hazard: state.hazard ? Array.prototype.slice.call(state.hazard) : null,
      hazardTurns: state.hazardTurns ? Array.prototype.slice.call(state.hazardTurns) : null,
      units: state.units.map(function (u) {
        return {
          heroId: u.heroId, level: u.level, side: u.side,
          x: u.x, y: u.y, hp: u.hp, maxHp: u.maxHp, morale: u.morale,
          alive: u.alive, moved: u.moved, acted: u.acted, skillUsed: u.skillUsed,
          isLeader: u.isLeader, isBoss: u.isBoss, isEscort: u.isEscort, buffs: u.buffs
        };
      })
    };
  }

  function restore(saved) {
    var cfg = data.levelConfig(saved.level);
    var m = core.generateMap(cfg.map || cfg);
    var state = {
      level: saved.level,
      config: cfg,
      cols: m.cols, rows: m.rows, map: m.map, height: m.height,
      hazard: new Uint8Array(m.cols * m.rows),
      hazardTurns: new Uint8Array(m.cols * m.rows),
      capturePoints: saved.capturePoints || [],
      units: [],
      side: saved.side || 'player',
      turn: saved.turn || 1,
      turnLimit: saved.turnLimit || cfg.turnLimit,
      victory: saved.victory || cfg.victory,
      rng: core.mulberry32(core.hashSeed('battle|' + saved.level + '|' + Date.now())),
      events: [], log: [], result: null, nextId: 1
    };
    saved.units.forEach(function (s) {
      var u = makeUnit(state, s.heroId, s.level, s.side);
      u.x = s.x; u.y = s.y;
      u.hp = s.hp; u.maxHp = s.maxHp; u.morale = s.morale;
      u.alive = s.alive; u.moved = s.moved; u.acted = s.acted; u.skillUsed = s.skillUsed;
      u.isLeader = s.isLeader; u.isBoss = s.isBoss; u.isEscort = s.isEscort;
      u.buffs = s.buffs || {};
      state.units.push(u);
    });
    // 天时、剧本进度与战场遗留物：按存档接续（无存档信息则按剧本重布）
    setupScenario(state, cfg, saved);
    return state;
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  game.createBattle = createBattle;
  game.makeUnit = makeUnit;
  game.canAct = canAct;
  game.moveUnit = moveUnit;
  game.attack = attack;
  game.castSkill = castSkill;
  game.endPlayerTurn = endPlayerTurn;
  game.gradeBattle = gradeBattle;
  game.settle = settle;
  game.serialize = serialize;
  game.restore = restore;

  return game;
});
