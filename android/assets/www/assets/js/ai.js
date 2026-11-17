/* ==========================================================================
 * ai.js — 敌方决策
 *
 * 思路：先考虑武将技（治疗/范围伤害），再考虑攻击（能击杀最优），
 * 最后才朝最有价值的目标推进。难度档决定 AI 会不会用技能与集火。
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./data.js'));
  } else {
    root.SG = root.SG || {};
    root.SG.ai = factory(root.SG.core, root.SG.data);
  }
})(typeof self !== 'undefined' ? self : this, function (core, data) {
  'use strict';

  var ai = {};

  /** 关卡越高，AI 越聪明：1=只会莽，3=会用技能与集火 */
  function aiLevel(state) {
    var lv = state.level || 1;
    // 敌方用兵的火候随关号渐进：起初只知莽撞冲杀，后来会用计、会集火、会截旗
    return lv >= 80 ? 4 : lv >= 55 ? 3 : lv >= 22 ? 2 : 1;
  }

  /** 本回合全军集火的那个目标（近似实现「齐射」「合围」） */
  function focusOf(state, unit) {
    if (!state.focus) return null;
    if (state.focus.side !== unit.side) return null;
    if (state.focus.turn !== state.turn) return null;
    var t = state.units.filter(function (u) { return u.id === state.focus.id && u.alive; })[0];
    return t ? t.id : null;
  }

  function rememberFocus(state, unit, target) {
    state.focus = { id: target.id, side: unit.side, turn: state.turn };
  }

  /** 目标是否正在围攻我方主将 —— 那就先打他 */
  function targetBesieges(state, unit, target) {
    var leaders = state.units.filter(function (u) {
      return u.side === unit.side && u.alive && (u.isLeader || (unit.isLeader && u.id === unit.id));
    });
    for (var i = 0; i < leaders.length; i++) {
      if (core.dist(target, leaders[i]) <= 1) return true;
    }
    return false;
  }

  function scoreTarget(state, unit, target) {
    var dmg = core.computeDamage(state, unit, target, {}).damage;
    var score = dmg;
    if (dmg >= target.hp) score += 600;                        // 这一下能打死
    score += (1 - target.hp / target.maxHp) * 80;              // 残血优先
    if (target.troop === 'scholar' || target.troop === 'strategist') score += 45;  // 先掐掉谋士
    if (target.troop === 'archer') score += 20;
    if (target.isLeader) score += 12;
    if (target.isEscort) score += 140;
    if (target.isBoss) score += 130;                           // 斩将关的核心目标
    // 同阵将士齐 mLana 所指：跟着上一击打同一个目标，形成集火
    var f = focusOf(state, unit);
    if (f && target.id === f) score += 70;
    // 主将遭围攻：拼死也要把扑上来的敌人拽开
    if (targetBesieges(state, unit, target)) score += 90;
    // 斩将关里小兵只是障碍，别把火力浪费在他们身上
    if (state.victory && state.victory.type === 'boss' && !target.isBoss) score -= 70;
    score -= core.dist(unit, target) * 3;
    return score;
  }

  /**
   * 地形价值评估：让 AI 的行军路线有战术意图
   * 远程抢高地与林地、近战抢据点、骑兵避开山林、脆皮躲开控制区
   */
  function tileValue(state, unit, p) {
    var t = core.tileAt(state, p.x, p.y);
    var troop = core.TROOPS[unit.troop];
    var ranged = troop.range > 1;
    var v = 0;

    if (t.elev >= 3) v += ranged ? 18 : 9;                  // 绝顶居高临下
    else if (t.elev >= 2) v += ranged ? 14 : 6;
    else if (t.elev === 1) v += 3;
    else if (t.elev <= -1) v -= ranged ? 8 : 4;             // 低洼处仰攻吃亏

    if (t.capture) {
      var owner = core.ownerAt(state, p.x, p.y);
      v += owner === unit.side ? 10 : 12;                    // 占据无名之地更值钱
    }
    if (ranged && t.hide >= 20) v += 10;                     // 远程躲进林地
    if (ranged && core.zocAt(state, p.x, p.y, unit.side)) v -= 22;   // 别被贴身
    if (t.choke) v += troop.zoc ? 9 : 2;                     // 扼守桥渡咽喉
    if (t.key === 'road') v += 2;                            // 官道行军快
    if (t.sticky) v -= 14;                                   // 陷进泥沼是兵家大忌
    if (t.key === 'path') v -= troop.heavy ? 30 : 4;         // 山道窄仄，辎重绝难通过
    if (troop.charge && t.cav) v -= 7;                       // 骑兵不爱山地林地
    if (troop.water && t.water) v += 10;                     // 水军爱水
    if (troop.water && !t.water) v -= 6;                     // 舟师离水
    if (!troop.navySkill && t.key === 'ship') v -= 6;        // 陆师登船立足未稳
    return v;
  }

  /** 朝某格推进：在可移动范围内权衡「离目标近」与「地形好」 */
  function moveToward(state, unit, target) {
    var reach = core.reachable(state, unit);
    var bestScore = -Infinity, bestTile = null;
    for (var i = 0; i < reach.length; i++) {
      var p = reach[i];
      var d = Math.abs(p.x - target.x) + Math.abs(p.y - target.y);
      var score = -d * 10 + tileValue(state, unit, p);
      if (score > bestScore) { bestScore = score; bestTile = p; }
    }
    if (!bestTile) return false;
    var path = reach.pathOf(bestTile.x, bestTile.y);
    state.events.push({ t: 'move', id: unit.id, path: (path || [bestTile]).slice() });
    unit.x = bestTile.x;
    unit.y = bestTile.y;
    core.bumpOccupancy(state);
    return true;
  }

  /**
   * 风筝：远程单位被贴身时，先退到安全距离再射击。
   * 这是弓兵与谋士能否活下来的关键。
   */
  function kiteAway(state, unit, enemies) {
    var reach = core.reachable(state, unit);
    var spots = [{ x: unit.x, y: unit.y, cost: 0 }].concat(reach);
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < spots.length; i++) {
      var p = spots[i];
      var near = Infinity;
      for (var e = 0; e < enemies.length; e++) {
        var d = Math.abs(p.x - enemies[e].x) + Math.abs(p.y - enemies[e].y);
        if (d < near) near = d;
      }
      if (near <= 1) continue;                          // 仍然贴身，不考虑
      // 必须能打到人，否则撤退毫无意义
      var canShoot = false;
      for (var k = 0; k < enemies.length; k++) {
        if (core.canHitFrom(state, unit, p.x, p.y, enemies[k])) { canShoot = true; break; }
      }
      if (!canShoot) continue;
      var score = near * 6 + tileValue(state, unit, p) - p.cost * 0.5;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return false;
    if (best.x === unit.x && best.y === unit.y) return false;
    var path = reach.pathOf(best.x, best.y);
    state.events.push({ t: 'move', id: unit.id, path: (path || [best]).slice() });
    unit.x = best.x; unit.y = best.y;
    core.bumpOccupancy(state);
    return true;
  }

  function nearestOf(state, unit, list) {
    var best = null, bd = Infinity;
    for (var i = 0; i < list.length; i++) {
      var d = Math.abs(unit.x - list[i].x) + Math.abs(unit.y - list[i].y);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  function attackBest(state, unit, candidates) {
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var e = candidates[i];
      var pos = core.bestAttackPosition(state, unit, e);
      if (!pos) continue;
      var sx = unit.x, sy = unit.y;
      unit.x = pos.x; unit.y = pos.y;
      var s = scoreTarget(state, unit, e);
      unit.x = sx; unit.y = sy;
      if (s > bestScore) { bestScore = s; best = { enemy: e, pos: pos }; }
    }
    if (!best) return false;
    if (!(best.pos.x === unit.x && best.pos.y === unit.y)) {
      var reach = core.reachable(state, unit);
      var path = reach.pathOf(best.pos.x, best.pos.y);
      if (path && path.length) core.moveUnit(state, unit, path);
      else { unit.x = best.pos.x; unit.y = best.pos.y; }
    }
    rememberFocus(state, unit, best.enemy);
    core.attack(state, unit, best.enemy, state.events);
    return true;
  }

  /** 谋士：找最值得治疗的目标 */
  function healTarget(state, unit) {
    var friends = core.aliveOf(state, unit.side);
    var best = null, bestRatio = 0.999;
    for (var i = 0; i < friends.length; i++) {
      var f = friends[i];
      var ratio = f.hp / f.maxHp;
      if (ratio < 0.65 && ratio < bestRatio && core.dist(unit, f) <= 2) {
        bestRatio = ratio; best = f;
      }
    }
    return best;
  }

  /** 天时是否利于此计：大雨别说火攻，狂风则是纵火的东风 */
  function weatherFit(state, skill) {
    var w = core.weather(state);
    if (skill.element === 'fire' || skill.effect === 'burn') {
      if (w.key === 'rain') return 0.15;
      if (w.key === 'snow') return 0.4;
      if (w.key === 'wind') return 1.6;
      return 1;
    }
    if (skill.element === 'water') {
      return w.key === 'rain' ? 1.4 : 1;
    }
    if (skill.element === 'thunder') {
      if (w.key === 'rain') return 1.6;
      if (w.key === 'wind') return 1.3;
      if (w.key === 'snow') return 0.75;
      return 0.9;
    }
    if (skill.type === 'magic') {
      if (w.key === 'fog') return 0.85;
      return 1;
    }
    if (skill.type === 'phys' && !skill.element) {
      // 风沙（简化的风雨）干扰箭矢准头
      return (w.key === 'wind' || w.key === 'rain') ? 0.9 : 1;
    }
    return 1;
  }

  /** 范围技能能覆盖几个敌人 */
  function skillHitCount(state, unit, enemies, skill) {
    var best = 0, bestTile = null, bestTerrain = 1, bestHazard = false;
    var fit = weatherFit(state, skill);
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (core.dist(unit, e) > (skill.range || 1)) continue;
      var tiles = core.skillTiles(state, unit, e.x, e.y, skill);
      var n = 0;
      for (var t = 0; t < tiles.length; t++) {
        var u = core.unitAt(state, tiles[t].x, tiles[t].y);
        if (u && u.alive && u.side !== unit.side) n++;
        // 火攻：能引燃林地、营寨、连环船的地方最值得烧
        var tt = core.tileAt(state, tiles[t].x, tiles[t].y);
        if ((skill.effect === 'burn') && tt.burn) n += (tt.key === 'ship' ? 1.2 : 0.5);
      }
      // 因地制宜：同一计打在不同地势上，效果天差地别
      var tf = core.terrainFit(state, e.x, e.y, skill);
      n *= fit * tf.power;
      // 能改地形的计略（水淹成泽、落石堵道）值当得多——截断敌军行军路线
      if (tf.hazard && (tf.hazard === core.HAZ.FLOOD || tf.hazard === core.HAZ.ROCK)) n += 0.8;
      if (n > best) {
        best = n; bestTile = { x: e.x, y: e.y };
        bestTerrain = tf.power; bestHazard = !!tf.hazard;
      }
    }
    return { count: best, tile: bestTile, fit: fit, terrain: bestTerrain, hazard: bestHazard };
  }

  /**
   * 让一个敌方单位行动。返回 true 表示已行动完毕。
   * 事件会追加到 state.events 供渲染播放。
   */
  /** 残兵怯战：血槽见底又贴着敌人时，先脱身保住老本 */
  function retreat(state, unit, enemies) {
    var reach = core.reachable(state, unit);
    var best = null, bestScore = -Infinity;
    var spots = [{ x: unit.x, y: unit.y, cost: 0 }].concat(reach);
    for (var i = 0; i < spots.length; i++) {
      var p = spots[i];
      var near = Infinity;
      for (var e = 0; e < enemies.length; e++) {
        var d = Math.abs(p.x - enemies[e].x) + Math.abs(p.y - enemies[e].y);
        if (d < near) near = d;
      }
      // 尽量往己方人多的地方靠
      var cover = 0;
      var mates = core.aliveOf(state, unit.side);
      for (var m = 0; m < mates.length; m++) {
        if (mates[m].id === unit.id) continue;
        if (Math.abs(mates[m].x - p.x) + Math.abs(mates[m].y - p.y) <= 2) cover++;
      }
      var score = near * 8 + cover * 7 + tileValue(state, unit, p) - p.cost * 0.4;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best || (best.x === unit.x && best.y === unit.y)) return false;
    var path = reach.pathOf(best.x, best.y);
    core.moveUnit(state, unit, (path && path.length) ? path : [best]);
    return true;
  }

  /** 一将身怀数计，逐计掂量过去，挑最值当的那一手 */
  function skillsOf(unit) {
    if (unit.hero && unit.hero.skillDefs && unit.hero.skillDefs.length) return unit.hero.skillDefs;
    return unit.hero && unit.hero.skillDef ? [unit.hero.skillDef] : [];
  }

  /** 控制类计略的目标：主将、最凶的铁骑、兵多势众者 */
  function controlTarget(state, unit, enemies, skill) {
    var range = Math.max(1, skill.range || 1);
    var best = null, bestVal = 0;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (core.dist(unit, e) > range) continue;
      var v = 30 + (e.hp / e.maxHp) * 25;
      if (e.isLeader) v += 45;
      if (e.isBoss) v += 30;
      if (e.troop === 'cavalry') v += 12;                 // 先绊住冲得最凶的
      if (core.TROOPS[e.troop] && core.TROOPS[e.troop].range > 1) v += 8;
      if (v > bestVal) { bestVal = v; best = { x: e.x, y: e.y, val: v }; }
    }
    return best;
  }

  var CONTROL_FX = ['chaos', 'stun', 'panic', 'feint', 'debuff', 'bewitch'];

  function actUnit(state, unit) {
    var level = aiLevel(state);
    var enemies = core.aliveOf(state, unit.side === 'enemy' ? 'player' : 'enemy');
    if (!enemies.length) return true;

    // 中反间之计：敌我不分，抄刀砍向身边的人（哪怕是自家兄弟）
    if (unit.chaosAct) {
      unit.chaosAct = false;
      var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      var near = [];
      for (var d = 0; d < 4; d++) {
        var nu = core.unitAt(state, unit.x + dirs[d][0], unit.y + dirs[d][1]);
        if (nu && nu.alive) near.push(nu);
      }
      if (near.length) {
        core.attack(state, unit, near[Math.floor(state.rng() * near.length)], state.events);
      }
      unit.moved = unit.acted = true;
      return true;
    }

    var skills = skillsOf(unit);
    var events = state.events;
    var v = state.victory || {};
    var range = core.attackRange(state, unit);

    // 残血怯战：先撤回本阵再图后计
    if (level >= 2 && unit.hp / unit.maxHp < 0.26 && !unit.isBoss && !unit.isLeader) {
      var danger = enemies.filter(function (e) { return core.dist(unit, e) <= 2; });
      if (danger.length) {
        retreat(state, unit, enemies);
        // 撤到安全距离后还能射击就补一箭
        var pot = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
        if (pot.length) core.attack(state, unit, pot[0], events);
        unit.moved = unit.acted = true;
        return true;
      }
    }

    // 0) 关卡目标优先：护送 / 夺点 / 坚守
    if (unit.isEscort && v.type === 'escort' && v.target) {
      if (unit.x === v.target.x && unit.y === v.target.y) { unit.moved = unit.acted = true; return true; }
      moveToward(state, unit, v.target);
      unit.moved = unit.acted = true;
      return true;
    }

    if (v.type === 'capture' && state.capturePoints && state.capturePoints.length) {
      var need = state.capturePoints.filter(function (p) { return p.owner !== unit.side; });
      if (need.length) {
        var standing = need.some(function (p) { return p.x === unit.x && p.y === unit.y; });
        var inRange = enemies.filter(function (e) { return core.dist(unit, e) <= range; });
        // 已经站在要夺的点上、且够得着敌人 —— 先打
        if (!(standing && inRange.length)) {
          if (standing) { unit.moved = unit.acted = true; return true; }   // 守着刚占的点
          var pt = nearestOf(state, unit, need);
          if (pt) {
            moveToward(state, unit, pt);
            var after = enemies.filter(function (e) { return core.dist(unit, e) <= range && e.alive; });
            if (after.length) core.attack(state, unit, after[0], events);
            unit.moved = unit.acted = true;
            return true;
          }
        }
      }
    }

    // 攻城关：敌城是唯一的目标，攻方须拿下，守方须夺回
    if (v.type === 'city' && state.capturePoints) {
      var capital = null;
      for (var cp = 0; cp < state.capturePoints.length; cp++) {
        if (state.capturePoints[cp].capital) { capital = state.capturePoints[cp]; break; }
      }
      if (capital && capital.owner !== unit.side) {
        if (unit.x === capital.x && unit.y === capital.y) { unit.moved = unit.acted = true; return true; }
        var nearFoe = enemies.filter(function (e) { return core.dist(unit, e) <= range; });
        // 路上撞见敌人就近打，别闷头赶路
        if (!(nearFoe.length && core.dist(unit, capital) > 3)) {
          moveToward(state, unit, capital);
          var afterCity = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
          if (afterCity.length) core.attack(state, unit, afterCity[0], events);
          unit.moved = unit.acted = true;
          return true;
        }
      }
    }

    // 夺旗关：携旗者直奔本阵，对方则全力截杀；旗无主时抢先夺之
    if (v.type === 'flag' && state.flag) {
      var fl = state.flag;
      if (fl.carrier === unit.id && v.target) {
        if (unit.x === v.target.x && unit.y === v.target.y) { unit.moved = unit.acted = true; return true; }
        moveToward(state, unit, v.target);
        var esc = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
        if (esc.length) core.attack(state, unit, esc[0], events);
        unit.moved = unit.acted = true;
        return true;
      }
      var holder = null;
      if (fl.carrier) {
        for (var hi = 0; hi < state.units.length; hi++) {
          if (state.units[hi].id === fl.carrier) { holder = state.units[hi]; break; }
        }
      }
      if (holder && holder.alive && holder.side !== unit.side) {
        // 敌方携旗：追上去砍，夺回帅旗
        if (core.dist(unit, holder) <= range) {
          core.attack(state, unit, holder, events);
          unit.moved = unit.acted = true;
          return true;
        }
        moveToward(state, unit, holder);
        var chase = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
        if (chase.length) core.attack(state, unit, chase[0], events);
        unit.moved = unit.acted = true;
        return true;
      }
      if (!fl.carrier && core.dist(unit, fl) <= 7) {
        moveToward(state, unit, fl);
        var grab = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
        if (grab.length) core.attack(state, unit, grab[0], events);
        unit.moved = unit.acted = true;
        return true;
      }
    }

    if (v.type === 'survive' && unit.side === 'player') {
      var reachableEnemy = enemies.filter(function (e) { return core.dist(unit, e) <= range; });
      if (reachableEnemy.length) {
        if (!attackBest(state, unit, reachableEnemy)) { unit.moved = unit.acted = true; }
        return true;
      }
      // 无敌人可打：退守己方据点养伤，绝不冒进
      var own = (state.capturePoints || []).filter(function (p) { return p.owner === 'player'; });
      var shelter = own.length ? nearestOf(state, unit, own) : null;
      if (shelter && (unit.x !== shelter.x || unit.y !== shelter.y)) moveToward(state, unit, shelter);
      unit.moved = unit.acted = true;
      return true;
    }

    // 1) 主帅告急：就近的将士回援护驾
    if (level >= 2 && !unit.isLeader) {
      var lord = state.units.filter(function (u) {
        return u.side === unit.side && u.alive && u.isLeader && u.hp / u.maxHp < 0.55;
      })[0];
      if (lord && core.dist(unit, lord) <= 7 && core.dist(unit, lord) > 1) {
        var threat = enemies.filter(function (e) { return core.dist(e, lord) <= 2; }).length;
        if (threat >= 2) {
          moveToward(state, unit, lord);
          var spotTs = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
          if (spotTs.length) core.attack(state, unit, spotTs[0], events);
          unit.moved = unit.acted = true;
          return true;
        }
      }
    }

    // 2) 脆皮被贴身：先脱身再还击（风筝）
    if (level >= 2 && core.TROOPS[unit.troop].frail) {
      var touching = enemies.filter(function (e) { return core.dist(unit, e) <= 1; });
      if (touching.length && kiteAway(state, unit, enemies)) {
        var far = enemies.filter(function (e) { return core.canHitFrom(state, unit, unit.x, unit.y, e); });
        if (far.length) { core.attack(state, unit, far[0], events); return true; }
        unit.moved = unit.acted = true;
        return true;
      }
    }

    // 2) 武将技：身怀数计，逐计掂量，挑最值当的那一手
    if (level >= 2 && skills.length && !unit.skillUsed) {
      var bestSk = null, bestAct = null, bestVal = 0;
      for (var si = 0; si < skills.length; si++) {
        var sk = skills[si];
        if (!core.canUseSkill(state, unit, sk)) continue;
        var val = 0, act = null;

        if (sk.effect === 'heal') {
          var ht = healTarget(state, unit);
          if (ht) { val = 60 + (1 - ht.hp / ht.maxHp) * 70; act = { x: ht.x, y: ht.y }; }
        } else if (sk.effect === 'buff' || sk.effect === 'bluff') {
          if (level >= 3 || unit.hp / unit.maxHp < 0.5) {
            val = sk.effect === 'bluff' ? 55 : 45;
            act = { x: unit.x, y: unit.y };
          }
        } else if (sk.effect === 'weather') {
          // 天时不顺（大雨浇熄火攻、大雾遮蔽箭矢）时，求变天
          var w2 = core.weather(state);
          if ((w2.key === 'rain' || w2.key === 'fog' || w2.key === 'snow') &&
            unit.morale >= core.skillCost(state, unit, sk) + 12) {
            val = 40; act = { x: unit.x, y: unit.y };
          }
        } else if (sk.effect === 'defect') {
          // 招降：专挑兵败如山倒的敌将
          for (var di = 0; di < enemies.length; di++) {
            var dt = enemies[di];
            if (core.dist(unit, dt) > (sk.range || 1)) continue;
            if (dt.hp / dt.maxHp >= 0.42 || dt.isLeader || dt.isBoss) continue;
            val = 95; act = { x: dt.x, y: dt.y }; break;
          }
        } else if (CONTROL_FX.indexOf(sk.effect) >= 0) {
          var ct = controlTarget(state, unit, enemies, sk);
          if (ct) { val = ct.val; act = { x: ct.x, y: ct.y }; }
        } else {
          var hit = skillHitCount(state, unit, enemies, sk);
          // 用兵火候越高越舍得放计：末段 AI 覆盖 1 人便果断出手
          var threshold = level >= 4 ? 1 : level >= 3 ? 2 : 3;
          if (hit.tile && (hit.count >= threshold || (level >= 2 && hit.count >= 1 && unit.morale >= 90))) {
            // 地势合则威力倍增，能断道的计略再加一截
            val = hit.count * 40 * (hit.terrain || 1);
            if (hit.hazard) val += 28;
            act = { x: hit.tile.x, y: hit.tile.y };
          }
        }

        if (act && val > bestVal) { bestVal = val; bestSk = sk; bestAct = act; }
      }
      if (bestSk) {
        core.useSkill(state, unit, bestAct.x, bestAct.y, bestSk, events);
        return true;
      }
    }

    // 2) 攻击：挑评分最高的目标
    if (attackBest(state, unit, enemies)) return true;

    // 3) 够不着：朝最值钱的目标推进（斩将关优先压向敌将）
    var target = null, bestAdv = -Infinity;
    for (var k = 0; k < enemies.length; k++) {
      var en = enemies[k];
      var adv = -core.dist(unit, en) + (en.isEscort ? 8 : 0) + (en.isBoss ? 6 : 0) +
        ((en.troop === 'scholar' || en.troop === 'strategist') ? 3 : 0);
      if (adv > bestAdv) { bestAdv = adv; target = en; }
    }
    if (target) moveToward(state, unit, target);
    unit.moved = true;
    unit.acted = true;
    return true;
  }

  /** 敌方整个回合：逐个行动 */
  function runEnemyTurn(state) {
    var units = state.units.filter(function (u) { return u.alive && u.side === 'enemy'; });
    for (var i = 0; i < units.length; i++) {
      if (!units[i].alive) continue;
      if (state.result && state.result.over) break;
      actUnit(state, units[i]);
      core.refreshCapture(state);
      var v = core.checkVictory(state);
      if (v.over) { state.result = v; break; }
    }
    return state.result;
  }

  ai.actUnit = actUnit;
  ai.runEnemyTurn = runEnemyTurn;
  ai.scoreTarget = scoreTarget;
  ai.aiLevel = aiLevel;

  return ai;
});
