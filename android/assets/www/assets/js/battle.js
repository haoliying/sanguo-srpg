/* ==========================================================================
 * battle.js — 战斗界面：等距棋盘交互、动画播放、回合推进
 * ========================================================================== */
(function (root) {
  'use strict';

  var SG = root.SG = root.SG || {};
  var core = SG.core, data = SG.data, game = SG.game;
  var ui = SG.ui, store = SG.store, render = SG.render;
  var B = SG.battle = {};

  var state = null;
  var renderer = null;
  var canvas = null;
  var rafId = null;
  var onFinish = null;

  var selected = null;
  var moveMap = null;
  var attackMap = null;
  var skillMap = null;
  var aimTiles = null;
  var aimFitMap = null;    // 施法范围内的地势宜忌：宜用/不宜
  var path = null;
  var pathFrom = null;
  var aiming = false;
  var activeSkill = 0;     // 当前点选的那一计（一将身怀数技）
  var inspect = null;      // 正在查看的敌方单位
  var locked = false;      // 动画/敌方回合中，禁止操作
  var hoverTile = null;    // 指针悬停的格子（用于显示地形信息）
  var eventCursor = 0;
  var speedFactor = 1;
  var viewVer = 0;          // 高亮层版本号（渲染缓存据此重建）

  /* ------------------------------ 启动 ------------------------------ */

  B.start = function (levelIndex, party, done) {
    state = game.createBattle(levelIndex, party);
    eventCursor = 0;
    selected = null; aiming = false; locked = false; inspect = null;
    onFinish = done;
    speedFactor = store.settings().animSpeed || 1;

    canvas = ui.$('#bt-canvas');
    renderer = createRenderer();
    bindCanvas();
    bindShell();
    resize();
    renderer.resetView();
    root.addEventListener('resize', resize);
    root.addEventListener('orientationchange', function () { setTimeout(resize, 260); });

    renderTop();
    renderCard();
    renderRoster();
    setSheet(false);
    setRoster(false);
    loop();
    store.saveBattle(game.serialize(state));
    return state;
  };

  B.resume = function (saved, done) {
    state = game.restore(saved);
    eventCursor = 0;
    selected = null; aiming = false; locked = false; inspect = null;
    onFinish = done;
    speedFactor = store.settings().animSpeed || 1;

    canvas = ui.$('#bt-canvas');
    renderer = createRenderer();
    bindCanvas();
    bindShell();
    resize();
    renderer.resetView();
    root.addEventListener('resize', resize);
    renderTop(); renderCard(); renderRoster();
    setSheet(false);
    setRoster(false);
    loop();
    return state;
  };

  function createRenderer() {
    renderer = render.create(canvas);
    renderer.setSpeed(speedFactor);
    return renderer;
  }

  B.stop = function () {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    root.removeEventListener('resize', resize);
    if (renderer) renderer.clearAnims();
    state = null;
  };

  B.getState = function () { return state; };
  B.renderer = function () { return renderer; };   // 诊断/测试用

  /* ------------------------------ 绘制循环 ------------------------------ */

  function loop() {
    if (!state) return;
    renderer.draw(state, {
      selectedId: selected ? selected.id : null,
      inspectId: inspect ? inspect.id : null,
      moveMap: moveMap,
      attackMap: attackMap,
      skillMap: aiming ? skillMap : null,
      aimTiles: aiming ? aimTiles : null,
      aimFit: aiming ? aimFitMap : null,
      path: path,
      pathFrom: pathFrom,
      ver: viewVer
    });
    rafId = requestAnimationFrame(loop);
  }

  /**
   * 地图尺寸：整屏都归沙场。
   * 手机竖屏时给底部抽屉留出一点余量；平板横屏时直接铺满。
   */
  function resize() {
    if (!state || !renderer) return;
    var wrap = canvas.parentNode;
    var w = Math.max(240, wrap.clientWidth);
    var h = Math.max(240, wrap.clientHeight);
    var wide = isWideScreen();
    var maxW = wide ? w : w;
    var maxH = wide ? h - 56 : h - Math.min(150, h * 0.22);
    renderer.resize(state, maxW, Math.max(220, maxH));
  }

  /** 大屏（平板 / 横屏）：界面停靠两侧，不再挤占画面 */
  function isWideScreen() {
    var w = root.innerWidth || 0, h = root.innerHeight || 0;
    return w >= 820 || (w >= 700 && h < w);
  }

  /* ------------------------------ 浮层开合 ------------------------------ */

  function setSheet(open) {
    var el = ui.$('#bt-sheet');
    if (!el) return;
    el.classList.toggle('open', !!open);
  }

  function setRoster(open) {
    var el = ui.$('#bt-roster');
    if (!el) return;
    el.classList.toggle('open', !!open);
    var btn = ui.$('[data-act="roster"]');
    if (btn) btn.classList.toggle('on', !!open);
  }

  /** 是否值得把底部面板升起来：有选中、有敌情、或正在施法 */
  function sheetShouldShow() {
    return !!(selected || inspect || aiming);
  }

  function bindShell() {
    var collapse = ui.$('#bt-collapse');
    if (collapse) collapse.addEventListener('click', function () {
      ui.$('#bt-top').classList.toggle('hidden');
    });
    var weather = ui.$('#bt-weather');
    if (weather) weather.addEventListener('click', function () {
      var w = core.weather(state);
      var nx = state.weatherNext && core.WEATHER[state.weatherNext];
      ui.toast(w.name + '：' + w.desc +
        (nx && nx.key !== w.key ? '　｜　下一轮：' + nx.name + '，' + nx.desc : '　｜　下一轮仍是' + w.name));
    });
    var grip = ui.$('#bt-grip');
    if (grip) grip.addEventListener('click', function () { setSheet(false); });
    ui.$$('[data-act="roster"]').forEach(function (b) {
      b.addEventListener('click', function () {
        setRoster(!ui.$('#bt-roster').classList.contains('open'));
      });
    });
  }


  /** 天时：一排小标签，随时可点开看影响 */
  function renderWeather() {
    var el = ui.$('#bt-weather');
    if (!el || !state) return;
    var w = core.weather(state);
    var nx = state.weatherNext && core.WEATHER[state.weatherNext];
    // 天象可卜：把下一轮的天时一并标出，好让人提前布局火攻水攻
    el.innerHTML = '<i>' + w.icon + '</i>' + ui.esc(w.name) +
      (nx ? '<em title="下一轮天象">' + nx.icon + '</em>' : '');
    el.title = w.name + '：' + w.desc +
      (nx ? '\n下一轮天象：' + nx.name + '（' + nx.desc + '）' : '');
    if (nx && nx.key !== w.key) el.classList.add('bt-weather-shift');
    else el.classList.remove('bt-weather-shift');
  }

  function bumpView() { viewVer++; }

  /* ------------------------------ 交互 ------------------------------ */

  var pointers = {};       // 活动指针
  var dragging = false;
  var pinchDist = 0;
  var downInfo = null;

  function bindCanvas() {
    if (canvas.__bound) return;
    canvas.__bound = true;

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        pinchDist = pointerDist();
        dragging = true;
      } else if (ids.length === 1) {
        downInfo = { x: e.clientX, y: e.clientY, t: Date.now(), moved: false };
        dragging = false;
      }
    });

    canvas.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);

      if (ids.length === 2) {
        var d = pointerDist();
        if (pinchDist > 0 && Math.abs(d - pinchDist) > 1) {
          var mid = pointerMid();
          var local = toLocal(mid.x, mid.y);
          renderer.zoomAt(d / pinchDist, local.x, local.y);
        }
        pinchDist = d;
        return;
      }

      if (downInfo && !dragging) {
        var dx = e.clientX - downInfo.x, dy = e.clientY - downInfo.y;
        if (dx * dx + dy * dy > 36) dragging = true;   // 超过 6px 视为拖动
      }
      if (dragging && downInfo) {
        renderer.panBy(e.clientX - downInfo.x, e.clientY - downInfo.y);
        downInfo.x = e.clientX; downInfo.y = e.clientY;
        return;
      }

      // 悬停：路径预览 / 技能落点预览
      if (locked || !state) return;
      var t = renderer.toTile(e.clientX, e.clientY);
      renderer.setHover(core.inBounds(state, t.x, t.y) ? t : null);
      // 指针下重叠的候选单位：虚线环提示可连点切换
      var cands = locked ? [] : renderer.unitsAtScreen(e.clientX, e.clientY);
      var hmap = {};
      cands.forEach(function (u, i) { hmap[u.id] = i === 0 ? 2 : 1; });
      renderer.setHoverIds(hmap);
      var prev = hoverTile;
      hoverTile = core.inBounds(state, t.x, t.y) ? t : null;
      // 面板已升起时才随指针刷新地形，避免为了看地形而常驻占屏
      if ((selected || inspect) && (!prev || !hoverTile || prev.x !== hoverTile.x || prev.y !== hoverTile.y)) {
        renderCard();
      }
      if (aiming && selected) updateAimPreview(t.x, t.y);
      else if (selected && moveMap && moveMap[t.x + ',' + t.y]) {
        var reach = core.reachable(state, selected);
        path = reach.pathOf(t.x, t.y);
        pathFrom = { x: selected.x, y: selected.y };
      } else { path = null; }
    });

    function endPointer(e) {
      var ids0 = Object.keys(pointers).length;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length === 0) pinchDist = 0;

      if (ids0 === 1 && downInfo && !dragging && Date.now() - downInfo.t < 800) {
        onTap(e);
      }
      if (Object.keys(pointers).length === 0) { dragging = false; downInfo = null; }
    }
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('pointerleave', function (e) {
      delete pointers[e.pointerId];
      renderer.setHover(null);
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var local = toLocal(e.clientX, e.clientY);
      renderer.zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, local.x, local.y);
    }, { passive: false });
  }

  function pointerDist() {
    var ids = Object.keys(pointers);
    if (ids.length < 2) return 0;
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function pointerMid() {
    var ids = Object.keys(pointers);
    var a = pointers[ids[0]], b = pointers[ids[1]];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function toLocal(clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function onTap(e) {
    if (locked || !state) return;

    // 施法瞄准：始终以地块为落点
    if (aiming && selected) {
      var tt = renderer.toTile(e.clientX, e.clientY);
      if (!core.inBounds(state, tt.x, tt.y)) return;
      // 触屏：先预览落点，确认后再落子
      if (!aimTiles) { updateAimPreview(tt.x, tt.y); return; }
      castAt(tt.x, tt.y);
      return;
    }

    // 先按令牌命中判定：多个单位重叠时，连续点击可循环切换
    var list = renderer.unitsAtScreen(e.clientX, e.clientY);
    if (list.length) {
      handleUnitTap(pickFrom(list));
      return;
    }

    var t = renderer.toTile(e.clientX, e.clientY);
    if (!core.inBounds(state, t.x, t.y)) return;
    handleTile(t.x, t.y);
  }

  /** 重叠单位中挑一个：默认最靠前，已选中则切到下一个（循环） */
  function pickFrom(list) {
    if (list.length === 1) return list[0];
    var idx = -1;
    if (selected) idx = indexOfId(list, selected.id);
    if (idx < 0 && inspect) idx = indexOfId(list, inspect.id);
    return list[(idx + 1) % list.length];
  }

  function indexOfId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }

  /** 点击单位令牌 */
  function handleUnitTap(u) {
    // 己方未行动 → 选中
    if (u.side === 'player' && !u.acted) { selectUnit(u); return; }

    if (selected && u.side === 'enemy') {
      if (canReachAttack(selected, u.x, u.y)) { doAttack(selected, u); return; }
      // 打不到但也别把已选单位丢掉：改为查看敌情
      inspect = u; renderCard(); return;
    }
    if (selected && u.id === selected.id) { return; }   // 点自己：保持选中

    // 已行动己方 / 其它情况 → 查看
    inspect = u;
    renderCard();
  }

  function handleTile(x, y) {
    var u = core.unitAt(state, x, y);

    // 点己方未行动单位 → 选中
    if (u && u.side === 'player' && !u.acted) { selectUnit(u); return; }

    if (selected) {
      // 点敌人 → 若能打到就打
      if (u && u.side === 'enemy' && canReachAttack(selected, x, y)) {
        doAttack(selected, u);
        return;
      }
      // 点可移动格 → 移动
      if (!u && moveMap && moveMap[x + ',' + y]) {
        doMove(selected, x, y);
        return;
      }
    }

    if (u) { inspect = u; renderCard(); return; }
    deselect();
  }

  function canReachAttack(unit, x, y) {
    return core.attackPositions(state, unit, { x: x, y: y }).length > 0;
  }

  /* ------------------------------ 选中 ------------------------------ */

  function selectUnit(u) {
    selected = u;
    inspect = null;
    aiming = false;
    aimTiles = null;
    skillMap = null;
    path = null;
    // 选中后把单位滚到视野中部，避免被边缘或界面挡住
    renderer.ensureVisible(u.x, u.y);

    // 已移动但未行动的单位只允许原地攻击/施法
    if (!u.moved) {
      var reach = core.reachable(state, u);
      moveMap = {};
      var positions = [{ x: u.x, y: u.y }];
      reach.forEach(function (p) {
        moveMap[p.x + ',' + p.y] = true;
        positions.push(p);
      });
      attackMap = {};
      positions.forEach(function (p) {
        core.attackTiles(state, u, p.x, p.y).forEach(function (t) {
          attackMap[t.x + ',' + t.y] = true;
        });
      });
    } else {
      moveMap = null;
      attackMap = {};
      core.attackTiles(state, u, u.x, u.y).forEach(function (t) {
        attackMap[t.x + ',' + t.y] = true;
      });
    }
    bumpView();
    renderCard();
  }

  function deselect() {
    selected = null;
    inspect = null;
    moveMap = null;
    attackMap = null;
    skillMap = null;
    aimTiles = null;
    path = null;
    aiming = false;
    bumpView();
    renderCard();
  }

  /* ------------------------------ 行动 ------------------------------ */

  function doMove(u, x, y) {
    var reach = core.reachable(state, u);
    var p = reach.pathOf(x, y);
    if (!p) return;
    locked = true;
    game.moveUnit(state, u, p);
    path = null;
    moveMap = null;
    attackMap = {};
    core.attackTiles(state, u, u.x, u.y).forEach(function (t) { attackMap[t.x + ',' + t.y] = true; });
    bumpView();
    playNew(function () {
      locked = false;
      renderTop(); renderCard(); renderRoster();
      persist();
      checkAutoEnd();
    });
  }

  function doAttack(u, target) {
    locked = true;
    var events = game.attack(state, u, target);
    if (!events) { locked = false; return; }
    deselectKeep();
    playNew(function () {
      locked = false;
      renderTop(); renderCard(); renderRoster();
      persist();
      if (state.result && state.result.over) return finish();
      checkAutoEnd();
    });
  }

  /* ------------------------------ 武将技 ------------------------------ */

  /** 一将身怀数计：返回其全部武将技（旧档只有一技时也能兜住） */
  function skillListOf(u) {
    if (!u || !u.hero) return [];
    if (u.hero.skillDefs && u.hero.skillDefs.length) return u.hero.skillDefs;
    return u.hero.skillDef ? [u.hero.skillDef] : [];
  }

  /** 当前点选的那一计 */
  function curSkill(u) {
    var l = skillListOf(u);
    if (!l.length) return null;
    return l[Math.min(activeSkill, l.length - 1)] || l[0];
  }

  /** 该将是否还有能用的计（任一技能士气够、且本回合未施放） */
  function hasUsableSkill(u) {
    var l = skillListOf(u);
    for (var i = 0; i < l.length; i++) {
      if (u.morale >= core.skillCost(state, u, l[i]) && !u.skillUsed) return true;
    }
    return false;
  }

  function buildSkillMap(u) {
    var sk = curSkill(u);
    if (!sk) return null;
    var m = {};
    if (sk.shape === 'self') { m[u.x + ',' + u.y] = true; return m; }
    var r = Math.max(1, sk.range || 1);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        var x = u.x + dx, y = u.y + dy;
        if (core.inBounds(state, x, y)) m[x + ',' + y] = true;
      }
    }
    return m;
  }

  function enterAim() {
    aiming = true;
    skillMap = buildSkillMap(selected);
    aimTiles = null;
    aimFitMap = buildAimFitMap();
    moveMap = null;
    attackMap = null;
    bumpView();
    renderCard();
  }

  /**
   * 施法范围内的「地势宜忌」：把每一格标成宜用（1）或不宜（0）。
   * 火攻该往林里放、水攻该往洼地放——标出来，玩家才知道该往哪儿点。
   */
  function buildAimFitMap() {
    var u = selected, sk = curSkill(u);
    if (!u || !sk || !sk.need) return null;
    var out = {};
    var r = Math.max(1, sk.range || 1);
    for (var dy = -r; dy <= r; dy++) {
      for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > r) continue;
        var x = u.x + dx, y = u.y + dy;
        if (!core.inBounds(state, x, y)) continue;
        var f = core.terrainFit(state, x, y, sk);
        out[x + ',' + y] = f.hazard ? 1 : (f.miss ? -1 : 0);
      }
    }
    return out;
  }

  function exitAim() {
    aiming = false;
    skillMap = null;
    aimTiles = null;
    if (selected) {
      if (!selected.moved) {
        var reach = core.reachable(state, selected);
        moveMap = {};
        reach.forEach(function (p) { moveMap[p.x + ',' + p.y] = true; });
      }
      attackMap = {};
      core.attackTiles(state, selected, selected.x, selected.y).forEach(function (t) {
        attackMap[t.x + ',' + t.y] = true;
      });
    }
    bumpView();
    renderCard();
  }

  /** 受本次技能影响的格子 */
  function tilesFor(u, x, y) {
    return core.skillTiles(state, u, x, y, curSkill(u));
  }

  function updateAimPreview(x, y) {
    if (!selected) return;
    var sk = curSkill(selected);
    if (!sk) return;
    if (sk.shape !== 'self' && (skillMap && !skillMap[x + ',' + y])) { aimTiles = null; return; }
    aimTiles = tilesFor(selected, x, y);
  }

  /** 目标是否合法（至少要有一个受影响单位） */
  function validTargets(tiles) {
    var sk = curSkill(selected);
    var friendly = sk.effect === 'heal' || sk.effect === 'buff' || sk.effect === 'bluff';
    for (var i = 0; i < tiles.length; i++) {
      var u = core.unitAt(state, tiles[i].x, tiles[i].y);
      if (!u || !u.alive) continue;
      if (friendly ? (u.side === selected.side) : (u.side !== selected.side)) return true;
    }
    return false;
  }

  function castAt(x, y) {
    var u = selected;
    var skill = curSkill(u);
    if (!skillMap || !skillMap[x + ',' + y]) {
      ui.toast('超出「' + skill.name + '」的施法距离');
      return;
    }
    if (u.morale < skill.cost) { ui.toast('士气不足'); return; }
    var tiles = tilesFor(u, x, y);
    if (!validTargets(tiles)) {
      ui.toast(skill.effect === 'heal' || skill.effect === 'buff'
        ? '此处没有可增益的友军'
        : '此处没有敌军');
      return;
    }
    locked = true;
    var events = game.castSkill(state, u, x, y, skill);
    if (!events) { locked = false; ui.toast('无法施放'); return; }
    aiming = false;
    aimTiles = null;
    skillMap = null;
    deselectKeep();
    playNew(function () {
      locked = false;
      renderTop(); renderCard(); renderRoster();
      persist();
      if (state.result && state.result.over) return finish();
      checkAutoEnd();
    });
  }

  function deselectKeep() {
    selected = null;
    moveMap = null;
    attackMap = null;
    skillMap = null;
    aimTiles = null;
    path = null;
    bumpView();
  }

  /** 玩家单位结束本回合行动 */
  function waitUnit() {
    if (!selected) return;
    if (aiming) { exitAim(); return; }
    selected.acted = true;
    selected.moved = true;
    deselect();
    renderRoster();
    persist();
    checkAutoEnd();
  }

  function checkAutoEnd() {
    var alive = core.aliveOf(state, 'player');
    var allDone = alive.every(function (u) { return u.acted; });
    if (allDone && !locked) setTimeout(endTurn, 400);
  }

  function endTurn() {
    if (locked) return;
    locked = true;
    deselect();
    game.endPlayerTurn(state);
    playNew(function () {
      locked = false;
      renderTop(); renderCard(); renderRoster();
      persist();
      if (state.result && state.result.over) finish();
    });
  }

  function finish() {
    var res = game.settle(state);
    store.clearBattle();
    if (onFinish) onFinish(res, state);
  }

  function persist() {
    if (state && !(state.result && state.result.over)) {
      store.saveBattle(game.serialize(state));
    }
  }

  /* ------------------------------ 动画播放 ------------------------------ */

  function playNew(done) {
    var events = state.events.slice(eventCursor);
    eventCursor = state.events.length;
    playSeq(events, 0, done);
  }

  function unitById(id) {
    for (var i = 0; i < state.units.length; i++) {
      if (state.units[i].id === id) return state.units[i];
    }
    return null;
  }

  function playSeq(events, i, done) {
    if (i >= events.length) { if (done) done(); return; }
    var e = events[i];
    var delay = 0;
    switch (e.t) {
      case 'move':
        renderer.animateMove(e.id, e.from, e.path, 105);
        delay = Math.min(560, 105 * e.path.length);
        break;
      case 'attack': {
        var tgt = unitById(e.target);
        if (tgt) renderer.addLunge(e.id, tgt.x, tgt.y);
        delay = 220;
        break;
      }
      case 'counter': {
        var t2 = unitById(e.target);
        if (t2) renderer.addLunge(e.id, t2.x, t2.y);
        delay = 200;
        break;
      }
      case 'damage':
        renderer.addFloater(e.x, e.y, '-' + e.amount,
          e.crit ? '#ffd166' : (e.burn ? '#ff9f43' : '#ff6b6b'));
        renderer.addShake(e.id);
        delay = 260;
        break;
      case 'heal':
        renderer.addFloater(e.x, e.y, '+' + e.amount, '#5ad18b');
        delay = 220;
        break;
      case 'die':
        renderer.addFloater(e.x, e.y, '败走', '#ffffff');
        delay = 260;
        break;
      case 'skill':
        // 一计一式：按元素与效果分派专属特效，让人一眼看出放的哪一计
        renderer.addSkillFx(e.tiles, {
          kind: e.kind, element: e.element, magic: e.magic,
          dur: e.tiles.length > 5 ? 1000 : 820
        });
        if (e.tiles.length) {
          var c0 = e.tiles[Math.floor(e.tiles.length / 2)];
          renderer.addFloater(c0.x, c0.y, e.skill,
            e.element === 'fire' ? '#ff9a3c' :
            e.element === 'water' ? '#6fc7ff' :
            e.element === 'thunder' ? '#c9a4ff' :
            e.kind === 'heal' ? '#5ad18b' : '#ffd166');
          // 地势不合时给个明示，让「因地制宜」看得见
          if (e.fit && e.fit.miss) {
            renderer.addFloater(c0.x, c0.y, e.fit.label || '地势不合', '#9aa4b0');
          }
        }
        delay = 620;
        break;
      case 'hazard':
        delay = 0;
        break;
      case 'hazardEnd':
        delay = 0;
        break;
      case 'weather': {
        var wx = core.WEATHER[e.weather];
        if (wx) ui.toast('天时变幻：' + wx.name + '——' + wx.desc);
        bumpView();
        delay = 420;
        break;
      }
      case 'buff':
        delay = 220;
        break;
      default:
        delay = 0;
    }
    setTimeout(function () { playSeq(events, i + 1, done); }, delay / speedFactor);
  }

  /* ------------------------------ 界面渲染 ------------------------------ */

  function victoryText() {
    var v = state.victory || {};
    switch (v.type) {
      case 'annihilate': return '歼灭全部敌军';
      case 'boss': return '击败敌军主将';
      case 'capture': return '占领全部据点';
      case 'city': return '攻入敌城并守住一整轮';
      case 'flag': return '夺得敌军帅旗，送回本阵';
      case 'survive': return '坚守 ' + (v.turns || 10) + ' 回合';
      case 'escort': return '护送部队抵达目的地';
      default: return '击败敌军';
    }
  }

  /** 关卡目标的当前进展，让人知道还差几步 */
  function goalProgress() {
    var v = state.victory || {};
    if (v.type === 'flag' && state.flag) {
      var f = state.flag;
      if (f.owner === 'player') return '帅旗在手，速送回本阵（' +
        (v.target ? '标旗处' : '我军后方') + '）';
      return '尚无帅旗：先夺得敌方帅旗';
    }
    if (v.type === 'city') {
      var cap = null;
      for (var i = 0; i < state.capturePoints.length; i++) {
        if (state.capturePoints[i].capital) { cap = state.capturePoints[i]; break; }
      }
      if (!cap) return '敌城已平';
      if (cap.owner !== 'player') return '尚未攻入敌城';
      var held = state.turn - (state.cityHeldSince === null ? state.turn : state.cityHeldSince);
      return held >= 1 ? '敌城已定' : '已入敌城，须再守一轮';
    }
    if (v.type === 'capture') {
      var got = state.capturePoints.filter(function (p) { return p.owner === 'player'; }).length;
      return '据点 ' + got + '/' + state.capturePoints.length;
    }
    return '';
  }

  var lastWeather = null;

  function renderTop() {
    var cfg = state.config;
    ui.$('#bt-name').textContent = '第 ' + cfg.index + ' 关 · ' + cfg.name;
    var turnTxt = '回合 ' + state.turn + '/' + state.turnLimit;
    if (state.victory.type === 'survive') turnTxt = '回合 ' + state.turn + '/' + state.victory.turns;
    var prog = goalProgress();
    ui.$('#bt-sub').innerHTML = '<span class="bt-goal">' + ui.esc(victoryText()) +
      (prog ? '<em class="bt-prog">' + ui.esc(prog) + '</em>' : '') + '</span>' +
      '<span class="bt-turn">' + ui.esc(turnTxt) + '</span>';
    var w = core.weather(state);
    if (lastWeather && lastWeather !== w.key) {
      ui.toast('天时已变：' + w.name + ' —— ' + w.desc);
    }
    lastWeather = w.key;
    renderWeather();
  }

  /** 地形信息条：让玩家一眼看出这块地有什么用 */
  function terrainHTML(x, y) {
    if (!state || !core.inBounds(state, x, y)) return '';
    var t = core.tileAt(state, x, y);
    var owner = core.ownerAt(state, x, y);
    var burning = state.burning && state.burning[core.idx(state, x, y)] > 0;
    var tags = [];
    if (t.elev >= 2) tags.push('<span class="tt tt-good">高地</span>');
    else if (t.elev === 1) tags.push('<span class="tt">缓坡</span>');
    else if (t.elev < 0) tags.push('<span class="tt">洼地</span>');
    if (t.def >= 10) tags.push('<span class="tt tt-good">防御+' + t.def + '%</span>');
    if (t.hide >= 20) tags.push('<span class="tt tt-good">隐蔽-' + t.hide + '%</span>');
    if (t.blocks) tags.push('<span class="tt tt-warn">阻断远程</span>');
    if (t.water) tags.push('<span class="tt tt-warn">仅水军可渡</span>');
    if (t.capture) {
      tags.push('<span class="tt ' + (owner === 'player' ? 'tt-good' : owner === 'enemy' ? 'tt-bad' : '') + '">据点·' +
        (owner === 'player' ? '我方' : owner === 'enemy' ? '敌方' : '无归属') + '</span>');
    }
    if (t.burn) tags.push('<span class="tt tt-warn">可燃</span>');
    if (t.cav) tags.push('<span class="tt">骑兵消耗+' + t.cav + '</span>');
    if (burning) tags.push('<span class="tt tt-bad">燃烧中</span>');
    if (core.zocAt(state, x, y, 'player')) tags.push('<span class="tt tt-bad">敌军控制区</span>');
    return '<div class="uc-terr">' +
      '<div class="uc-terr-head"><b>' + ui.esc(t.name) + '</b>' +
      '<span class="uc-terr-pos">' + (x + 1) + ' 列 ' + (y + 1) + ' 行</span></div>' +
      '<div class="uc-terr-tags">' + (tags.length ? tags.join('') : '<span class="tt">无特殊效果</span>') + '</div>' +
      '<div class="uc-terr-tip">' + ui.esc(t.tip || '') + '</div>' +
      '</div>';
  }

  /**
   * 伤害预览：算出这一刀能砍多少，并列出每一条加成来源。
   * 这是让「地形与战术」变得可感知的关键。
   */
  function previewHTML(attacker, defender) {
    if (!attacker || !defender || attacker.side === defender.side) return '';
    var reachableNow = core.canHitFrom(state, attacker, attacker.x, attacker.y, defender);
    var canHit = reachableNow || !!core.bestAttackPosition(state, attacker, defender);
    if (!canHit) {
      return '<div class="uc-prev uc-prev-none">射程之外，需先移动接近</div>';
    }
    // 预演到最佳站位再估算，这样地形、高地、夹击都会计入
    var sx = attacker.x, sy = attacker.y, steps = attacker.movedSteps;
    if (!reachableNow) {
      var pos = core.bestAttackPosition(state, attacker, defender);
      if (pos) {
        attacker.x = pos.x; attacker.y = pos.y;
        attacker.movedSteps = Math.max(steps, pos.cost || 0);
      }
    }
    var res = core.computeDamage(state, attacker, defender, {});
    attacker.x = sx; attacker.y = sy; attacker.movedSteps = steps;

    var pct = Math.min(100, Math.round(res.damage / defender.hp * 100));
    var kill = res.damage >= defender.hp;
    var mods = res.mods.filter(function (m) { return Math.abs(m.factor - 1) > 0.02; });
    var rows = mods.map(function (m) {
      var good = m.factor > 1;
      return '<span class="pm ' + (good ? 'pm-good' : 'pm-bad') + '">' +
        ui.esc(m.name) + ' <b>' + (good ? '+' : '') + Math.round((m.factor - 1) * 100) + '%</b></span>';
    }).join('');

    return '<div class="uc-prev">' +
      '<div class="uc-prev-head">预计伤害 <b>' + res.damage + '</b>' +
      '<span class="uc-prev-pct">' + pct + '%</span>' +
      (kill ? '<span class="tag tag-boss">可击杀</span>' : '') +
      (reachableNow ? '' : '<span class="uc-prev-move">移动后</span>') + '</div>' +
      (rows ? '<div class="uc-prev-mods">' + rows + '</div>' : '<div class="uc-prev-mods"><span class="pm">无额外加成</span></div>') +
      '</div>';
  }

  /** 头像：名将用画像，无名的营伍则以兵种字为记 */
  function avatarHTML(u, cls) {
    if (u.hero && u.hero.levy) {
      var tp = core.TROOPS[u.troop] || core.TROOPS.infantry;
      return '<div class="' + cls + ' av-levy">' + tp.short + '</div>';
    }
    return '<div class="' + cls + '"><img src="assets/img/heroes/' + u.heroId +
      '.jpg" alt="" onerror="this.style.display=\'none\'"></div>';
  }

  /** 兵马数以千分位计：「12,400」比「12400」更像一支军队 */
  function fmtSoldiers(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 一条武将技：名列、士气消耗、效用，可点选 */
  /** 计略的类别与地势偏好：标出来，才看得出这一计和那一计有何不同 */
  function skillTags(s) {
    var out = '';
    var kind = null, cls = '';
    if (s.element === 'fire' || s.effect === 'burn') { kind = '火'; cls = 'sk-fire'; }
    else if (s.element === 'water' || s.effect === 'flood') { kind = '水'; cls = 'sk-water'; }
    else if (s.element === 'thunder') { kind = '雷'; cls = 'sk-thunder'; }
    else if (s.element === 'rock' || s.effect === 'rock') { kind = '石'; cls = 'sk-rock'; }
    else if (s.effect === 'heal') { kind = '治'; cls = 'sk-heal'; }
    else if (s.effect === 'buff' || s.effect === 'bluff') { kind = '励'; cls = 'sk-buff'; }
    else if (s.effect === 'stun') { kind = '阵'; cls = 'sk-array'; }
    else if (s.effect === 'panic' || s.effect === 'chaos' || s.effect === 'bewitch' ||
      s.effect === 'feint' || s.effect === 'debuff' || s.effect === 'defect') { kind = '心'; cls = 'sk-mind'; }
    else if (s.effect === 'ambush') { kind = '伏'; cls = 'sk-rock'; }
    else if (s.effect === 'weather') { kind = '天'; cls = 'sk-thunder'; }
    else if (s.type === 'magic') { kind = '谋'; cls = 'sk-mind'; }
    else { kind = '武'; cls = 'sk-blade'; }
    out += '<i class="sktag ' + cls + '">' + kind + '</i>';

    var need = null;
    if (s.need === 'burnable') need = '宜林·草·寨';
    else if (s.need === 'floodable') need = '宜低洼水泽';
    else if (s.need === 'rockable') need = '宜依山';
    else if (s.need === 'open') need = '宜开阔';
    if (need) out += '<i class="sktag sk-need">' + need + '</i>';
    return out;
  }

  function skillRowHTML(u, s, i) {
    var c = core.skillCost(state, u, s);
    var usable = u.side === 'player' && !u.acted && !u.skillUsed && u.morale >= c;
    var on = (i === Math.min(activeSkill, skillListOf(u).length - 1));
    return '<div class="usr' + (on ? ' on' : '') + (usable ? '' : ' off') + '" data-skill="' + i + '">' +
      '<div class="usr-head"><b>' + ui.esc(s.name) + '</b>' +
      '<span class="usr-tags">' + skillTags(s) + '</span>' +
      '<span class="uc-morale">士气 ' + c + '</span></div>' +
      '<div class="usr-desc">' + ui.esc(s.desc) + '</div>' +
      '</div>';
  }

  /** 点选武将技：士气够就直接进入施法瞄准 */
  function pickSkill(i) {
    var u = selected;
    if (!u || u.side !== 'player') return;
    var l = skillListOf(u);
    if (i < 0 || i >= l.length) return;
    if (u.skillUsed) { ui.toast('本回合已施放过计'); return; }
    if (u.acted) { ui.toast('此将已行动'); return; }
    if (u.morale < core.skillCost(state, u, l[i])) { ui.toast('士气不足'); renderCard(); return; }
    activeSkill = i;
    enterAim();
  }

  function renderCard() {
    var box = ui.$('#bt-card');
    // 正在查看敌人时优先展示敌情（此时 selected 仍是己方武将，用于伤害预览）
    var u = (inspect && !aiming) ? inspect : (selected || inspect);
    var skillBtn = ui.$('#bt-skill');

    if (aiming && selected) {
      var sk = curSkill(selected);
      box.innerHTML = '<div class="uc-aiming">' +
        '<div class="uc-aim-title">施放「' + ui.esc(sk.name) + '」</div>' +
        '<div class="uc-aim-desc">' + ui.esc(sk.desc) + '</div>' +
        '<div class="uc-aim-tip">' + (root.matchMedia && root.matchMedia('(hover: none)').matches
          ? '点击紫色范围内的格子落地' : '点击紫色范围内的格子施放') +
        ' · 士气消耗 ' + core.skillCost(state, selected, sk) + '</div>' +
        '</div>';
      skillBtn.disabled = false;
      skillBtn.textContent = '取消施法';
      skillBtn.classList.add('is-cancel');
      ui.$('#bt-wait').disabled = true;
      return;
    }

    skillBtn.textContent = '武将技';
    skillBtn.classList.remove('is-cancel');

    if (!u) {
      // 没选单位时展示地形，鼓励玩家研究地图
      var hx = hoverTile ? hoverTile.x : -1, hy = hoverTile ? hoverTile.y : -1;
      box.innerHTML = '<div class="card-empty">点击己方武将下令，点击敌方查看敌情<br>' +
        '<span class="card-tip">单指拖动平移 · 双指缩放 · 左下角可调出全军一览</span></div>';
      ui.$('#bt-skill').disabled = true;
      ui.$('#bt-wait').disabled = true;
      setSheet(false);
      return;
    }
    var skills = skillListOf(u);
    var skill = curSkill(u);
    var cost = skill ? core.skillCost(state, u, skill) : 0;
    var canSkill = u.side === 'player' && !u.acted && hasUsableSkill(u);
    var hpPct = ui.percent(u.hp, u.maxHp);
    var troop = core.TROOPS[u.troop];

    box.innerHTML =
      '<div class="uc-head">' +
      avatarHTML(u, 'uc-av') +
      '<div class="uc-main">' +
      '<div class="uc-name">' + ui.esc(u.name) +
      '<span class="uc-lv">Lv' + u.level + '</span>' +
      (u.isBoss ? '<span class="tag tag-boss">敌将</span>' : '') +
      (u.isEscort ? '<span class="tag tag-escort">护送</span>' : '') +
      (u.side === 'player' && u.acted ? '<span class="tag">已行动</span>' : '') +
      '</div>' +
      '<div class="uc-meta">' + ui.esc(troop.name) + ' · 武 ' + u.hero.atk + ' 统 ' + u.hero.def + ' 智 ' + u.hero.int + '</div>' +
      '<div class="uc-bar"><i style="width:' + hpPct + '%"></i></div>' +
      '<div class="uc-hp">兵 ' + fmtSoldiers(u.hp) + ' / ' + fmtSoldiers(u.maxHp) + '</div>' +
      '</div>' +
      '</div>' +
      (u.hero.traitDef
        ? '<div class="uc-trait"><span class="uc-trait-name">' + ui.esc(u.hero.traitDef.name) + '</span>' +
          '<span class="uc-trait-desc">' + ui.esc(u.hero.traitDef.desc) + '</span></div>'
        : '') +
      '<div class="uc-skill">' +
      '<div class="uc-mbar"><i style="width:' + Math.floor(u.morale) + '%"></i></div>' +
      (skills.length
        ? skills.map(function (s, i) { return skillRowHTML(u, s, i); }).join('')
        : '<div class="usr-desc">此将别无长技</div>') +
      '</div>' +
      terrainHTML(u.x, u.y) +
      (selected && selected.side === 'player' && u.side === 'enemy' && u.alive
        ? previewHTML(selected, u) : '');
    ui.$$('.usr', box).forEach(function (el) {
      el.addEventListener('click', function () {
        pickSkill(parseInt(el.getAttribute('data-skill'), 10));
      });
    });
    setActions(canSkill, u);
    setSheet(sheetShouldShow());
  }

  function setActions(canSkill, u) {
    var skillBtn = ui.$('#bt-skill');
    var waitBtn = ui.$('#bt-wait');
    if (!u || u.side !== 'player') {
      skillBtn.disabled = true;
      waitBtn.disabled = true;
      return;
    }
    skillBtn.disabled = !canSkill;
    waitBtn.disabled = !!u.acted;
  }

  function renderRoster() {
    var box = ui.$('#bt-roster');
    if (!box) return;
    var mine = state.units.filter(function (x) { return x.side === 'player'; });
    var foes = state.units.filter(function (x) { return x.side === 'enemy'; });
    function chip(u) {
      var pct = ui.percent(u.hp, u.maxHp);
      var ready = u.side === 'player' && hasUsableSkill(u);
      return '<div class="rchip' + (u.alive ? '' : ' dead') + (u.acted && u.side === 'player' ? ' done' : '') +
        (ready && u.side === 'player' ? ' ready' : '') + '" data-uid="' + u.id + '">' +
        avatarHTML(u, 'rchip-av') +
        '<div class="rchip-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="rchip-name">' + ui.esc(u.name.slice(-2)) + '</div>' +
        '</div>';
    }
    var weather = core.weather(state);
    box.innerHTML =
      '<div class="rpanel-head"><b>全军一览</b>' +
      '<button class="icon-btn" id="bt-roster-close">×</button></div>' +
      '<div class="rweather"><i>' + weather.icon + '</i>' + ui.esc(weather.name) +
      '<span>' + ui.esc(weather.desc) + '</span></div>' +
      '<div class="rrow"><span class="rlabel rlabel-me">我军</span>' + mine.map(chip).join('') + '</div>' +
      '<div class="rrow"><span class="rlabel rlabel-foe">敌军</span>' + foes.map(chip).join('') + '</div>' +
      '<div class="rpanel-tip">点将牌可调遣该将（已行动者除外）</div>';

    var close = ui.$('#bt-roster-close', box);
    if (close) close.addEventListener('click', function () { setRoster(false); });
    ui.$$('.rchip', box).forEach(function (c) {
      c.addEventListener('click', function () {
        var id = c.getAttribute('data-uid');
        var u = state.units.filter(function (x) { return x.id === id; })[0];
        if (!u || !u.alive) return;
        if (u.side === 'player' && !u.acted) { selectUnit(u); setRoster(false); }
        else { inspect = u; renderCard(); setSheet(true); }
      });
    });
  }

  /* ------------------------------ 外部按钮 ------------------------------ */

  B.onAction = function (act) {
    if (!state) return;
    if (act === 'zoomin') { renderer.zoomAt(1.25, renderer.canvas.clientWidth / 2, renderer.canvas.clientHeight / 2); return; }
    if (act === 'zoomout') { renderer.zoomAt(1 / 1.25, renderer.canvas.clientWidth / 2, renderer.canvas.clientHeight / 2); return; }
    // 战场远大于屏幕，纵览全局成了刚需；「复位」则回到跟随主帅的标准视野
    if (act === 'zoomfit') { renderer.zoomFit(); return; }
    if (act === 'zoomreset') { renderer.resetView(); return; }
    if (act === 'endturn') { if (aiming) exitAim(); endTurn(); return; }
    if (act === 'wait') { waitUnit(); return; }
    if (act === 'skill') {
      if (aiming) { exitAim(); return; }
      if (!selected) { ui.toast('先选择一位武将'); return; }
      var list = skillListOf(selected);
      var sk = curSkill(selected);
      if (!sk) { ui.toast('该武将没有武将技'); return; }
      // 身怀数技：这一计士气不够，就换一计还使得出的
      if (selected.morale < core.skillCost(state, selected, sk)) {
        var alt = -1;
        for (var si = 0; si < list.length; si++) {
          if (selected.morale >= core.skillCost(state, selected, list[si])) { alt = si; break; }
        }
        if (alt < 0) { ui.toast('士气不足（需 ' + core.skillCost(state, selected, sk) + '）'); return; }
        activeSkill = alt; sk = list[alt];
      }
      if (selected.skillUsed) { ui.toast('本回合已施放过'); return; }
      enterAim();
      ui.toast(list.length > 1
        ? '「' + sk.name + '」· 点卡片上的其他计可更换'
        : '选择「' + sk.name + '」的落点');
      return;
    }
    if (act === 'cancel') { if (aiming) exitAim(); else deselect(); return; }
  };

  B.isLocked = function () { return locked; };
  B.isAiming = function () { return aiming; };

  /** 直接对某格下达指令（自动化测试与键盘操作用） */
  B.clickTile = function (x, y) {
    if (!state || locked) return false;
    if (!core.inBounds(state, x, y)) return false;
    if (aiming && selected) { castAt(x, y); return true; }
    handleTile(x, y);
    return true;
  };

  B.getSelected = function () { return selected; };

  return B;
})(typeof self !== 'undefined' ? self : this);
