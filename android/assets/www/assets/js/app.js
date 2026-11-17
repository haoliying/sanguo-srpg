/* ==========================================================================
 * app.js — 路由与页面：主菜单 / 关卡 / 编队 / 结算 / 武将 / 设置
 * ========================================================================== */
(function (root) {
  'use strict';

  var SG = root.SG = root.SG || {};
  var core = SG.core, data = SG.data, game = SG.game;
  var ui = SG.ui, store = SG.store, battle = SG.battle;
  var app = SG.app = {};

  var lastResult = null;
  var currentLevel = 1;

  /* ------------------------------ 路由 ------------------------------ */

  function route() {
    var hash = (location.hash || '#/home').replace(/^#/, '');
    var parts = hash.split('/').filter(Boolean);
    var page = parts[0] || 'home';
    var arg = parts[1];

    hideAll();
    if (page === 'battle') {
      show('battle');
      var lv = parseInt(arg, 10);
      if (arg === 'resume') {
        var saved = store.getBattle();
        if (saved) { currentLevel = saved.level; enterBattle(saved.level, true); }
        else app.go('/levels');
      } else if (lv) {
        currentLevel = lv;
        enterBattle(lv, false);
      }
      return;
    }

    battle.stop();
    if (page === 'levels') { show('levels'); renderLevels(); }
    else if (page === 'party') { show('party'); renderParty(parseInt(arg, 10) || 1); }
    else if (page === 'result') { show('result'); renderResult(); }
    else if (page === 'heroes') { show('heroes'); renderHeroes(); }
    else if (page === 'settings') { show('settings'); renderSettings(); }
    else { show('home'); renderHome(); }
  }

  function hideAll() {
    ui.$$('.page').forEach(function (p) { p.classList.remove('active'); });
  }

  function show(id) {
    var el = ui.$('#page-' + id);
    if (el) el.classList.add('active');
    root.scrollTo(0, 0);
  }

  app.go = function (path) {
    location.hash = '#' + (path.charAt(0) === '/' ? path : '/' + path);
  };

  /* ------------------------------ 首页 ------------------------------ */

  function renderHome() {
    var s = store.get();
    var cleared = Object.keys(s.progress).length;
    var stars = store.totalStars();
    var next = store.highestUnlocked();
    var saved = store.getBattle();

    var html =
      '<div class="home-hero">' +
      '<img class="home-cover" src="assets/img/scenes/cover.jpg" alt="" onerror="this.style.display=\'none\'">' +
      '<div class="home-mask"></div>' +
      '<div class="home-title">三国战棋</div>' +
      '<div class="home-sub">黄巾烽火起，群英定三分</div>' +
      '</div>' +
      '<div class="home-stats">' +
      '<div><b>' + cleared + '</b><span>已过关</span></div>' +
      '<div><b>' + stars + '</b><span>星数</span></div>' +
      '<div><b>' + Object.keys(s.heroes).length + '</b><span>武将</span></div>' +
      '<div><b>' + s.gold + '</b><span>金</span></div>' +
      '</div>' +
      '<div class="home-actions">' +
      (saved ? '<button class="btn btn-warn" data-go="/battle/resume">继续上次战斗（第 ' + saved.level + ' 关）</button>' : '') +
      '<button class="btn btn-primary" data-lv="' + next + '">' + (cleared ? '出征 · 第 ' + next + ' 关' : '开始征战') + '</button>' +
      '<button class="btn btn-ghost" data-go="/levels">关卡选择</button>' +
      '<button class="btn btn-ghost" data-go="/heroes">武将 · 编队</button>' +
      '<button class="btn btn-ghost" data-go="/settings">设置</button>' +
      '</div>';

    var el = ui.$('#page-home');
    el.innerHTML = html;

    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
    var startBtn = ui.$('[data-lv]', el);
    if (startBtn) {
      startBtn.addEventListener('click', function () {
        app.go('/party/' + startBtn.getAttribute('data-lv'));
      });
    }
  }

  /* ------------------------------ 关卡选择 ------------------------------ */

  function renderLevels() {
    var unlocked = store.highestUnlocked();
    var html = '<header class="sub-top">' +
      '<button class="icon-btn" data-go="/home">←</button>' +
      '<h2>关卡 · 共 100 关</h2><span></span></header>';

    data.CHAPTERS.forEach(function (ch) {
      var cells = '';
      for (var i = ch.from; i <= ch.to; i++) {
        var p = store.progressOf(i);
        var open = i <= unlocked;
        var cls = 'lvcell' + (open ? '' : ' locked') + (p ? ' done' : '');
        var stars = p ? '<i>' + ui.stars(p.stars) + '</i>' : '';
        cells += '<button class="' + cls + '"' + (open ? ' data-lv="' + i + '"' : ' disabled') + '>' +
          '<b>' + i + '</b>' + stars + '</button>';
      }
      html += '<section class="chapter">' +
        '<h3><span class="ch-idx">第' + ch.id + '章</span>' + ui.esc(ch.name) + '</h3>' +
        '<p class="ch-story">' + ui.esc(ch.story) + '</p>' +
        '<div class="lvgrid">' + cells + '</div></section>';
    });

    var el = ui.$('#page-levels');
    el.innerHTML = html;
    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
    ui.$$('[data-lv]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        app.go('/party/' + b.getAttribute('data-lv'));
      });
    });
  }

  /* ------------------------------ 编队 ------------------------------ */

  /** 一眼看清这仗打的是什么地形：该带骑兵还是水军，先看这里 */
  function terrainBrief(cfg) {
    var m = core.generateMap(cfg.map || cfg);
    var cnt = {};
    for (var i = 0; i < m.map.length; i++) {
      var t = core.TERRAIN[m.map[i]];
      if (t.outside) continue;
      cnt[t.name] = (cnt[t.name] || 0) + 1;
    }
    var names = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })
      .filter(function (k) { return k !== '平原' && k !== '草地' && k !== '道路'; })
      .slice(0, 5);
    if (!names.length) names = ['平原'];
    return names.map(function (k) { return '<i class="terr-tag">' + ui.esc(k) + '</i>'; }).join('');
  }

  function renderParty(level) {
    level = Math.max(1, Math.min(data.TOTAL_LEVELS, level));
    var cfg = data.levelConfig(level);
    var troops = core.TROOPS;

    var foeHtml = cfg.enemies.map(function (e) {
      var h = data.hero(e.heroId);
      return '<div class="foe-chip">' +
        '<img src="assets/img/heroes/' + h.id + '.jpg" alt="" onerror="this.style.display=\'none\'">' +
        '<div><b>' + ui.esc(h.name) + '</b>' +
        '<span>Lv' + e.level + ' · ' + troops[h.troop].name +
        (h.traitDef ? ' · ' + ui.esc(h.traitDef.name) : '') +
        (e.isBoss ? ' · <em class="boss">主将</em>' : '') + '</span></div></div>';
    }).join('');

    var owned = store.ownedHeroes();
    var partyIds = store.party();
    var cap = store.partyCap ? store.partyCap() : 5;

    // 出征前换兵种：攻防、射程、移动力立刻随之而变
    var slotHtml = partyIds.map(function (id) {
      var h = data.hero(id);
      var p = store.expProgress(id);
      var cur = store.troopOf(id);
      var opts = (h.troops || ['infantry']).map(function (t) {
        var tp = troops[t];
        var isOn = t === cur;
        return '<button class="troop-opt' + (isOn ? ' on' : '') + '" data-troop="' + t +
          '" data-hero2="' + id + '" title="' + ui.esc(tp.desc) + '">' + tp.short + '</button>';
      }).join('');
      var tp = troops[cur];
      return '<div class="slot" data-hero="' + id + '">' +
        '<img src="assets/img/heroes/' + id + '.jpg" alt="" onerror="this.style.display=\'none\'">' +
        '<div class="slot-main"><b>' + ui.esc(h.name) + '</b>' +
        '<span>Lv' + p.level + ' · ' + tp.name + '</span>' +
        '<div class="troop-bar">' + opts + '</div></div>' +
        '<div class="slot-stat">攻' + Math.round(100 * tp.atk) +
        ' 防' + Math.round(100 * tp.def) + ' 移' + tp.move + ' 程' + tp.range + '</div></div>';
    }).join('');

    var pickHtml = owned.map(function (o) {
      var on = partyIds.indexOf(o.id) >= 0;
      var tr = o.hero.traitDef;
      return '<button class="pick' + (on ? ' on' : '') + '" data-hero="' + o.id + '">' +
        '<img src="assets/img/heroes/' + o.id + '.jpg" alt="" onerror="this.style.display=\'none\'">' +
        '<div><b>' + ui.esc(o.hero.name) + '</b><span>Lv' + o.level + ' · ' + troops[o.hero.troop].name + '</span>' +
        (tr ? '<i class="pick-trait">' + ui.esc(tr.name) + '</i>' : '') + '</div>' +
        '<em>' + (on ? '出阵' : '') + '</em></button>';
    }).join('');

    var goalText = {
      annihilate: '歼灭全部敌军', boss: '击败敌军主将', capture: '占领全部据点',
      survive: '坚守 ' + (cfg.victory.turns || 10) + ' 回合', escort: '护送部队抵达目的地'
    }[cfg.victory.type] || '击败敌军';

    var html =
      '<header class="sub-top">' +
      '<button class="icon-btn" data-go="/levels">←</button>' +
      '<h2>' + ui.esc(cfg.title) + '</h2><span></span></header>' +
      '<div class="brief">' +
      '<div class="brief-line">目标：<b>' + ui.esc(goalText) + '</b> · 限 ' + cfg.turnLimit + ' 回合</div>' +
      '<p class="brief-story">' + ui.esc(cfg.story) + '</p>' +
      '<div class="tactic-tip">' +
      '<b>战场地形</b><span class="terrain-line">' + terrainBrief(cfg) + '</span>' +
      '<b>战术要点</b>' +
      '<span>· 抢占<b>山地与城池</b>居高临下，远程还能打得更远</span>' +
      '<span>· 骑兵<b>山道沼泽寸步难行</b>，辎重队更是无法进入</span>' +
      '<span>· 江河湖泊<b>唯有水军可渡</b>，其余兵种须走桥梁浅滩或登船</span>' +
      '<span>· 天气每轮一变：<b>狂风助火、大雨灭火、大雾压射程、大雪迟行军</b></span>' +
      '</div>' +
      '<h4>敌军阵容</h4><div class="foe-list">' + foeHtml + '</div>' +
      '<h4>我军出阵（最多 ' + cap + ' 位）</h4><div class="slots">' + slotHtml + '</div>' +
      '<h4>点选武将调整阵容</h4><div class="picks">' + pickHtml + '</div>' +
      '</div>' +
      '<div class="party-actions">' +
      '<button class="btn btn-primary" id="btn-go">出战</button>' +
      '<button class="btn btn-ghost" data-go="/levels">返回</button>' +
      '</div>';

    var el = ui.$('#page-party');
    el.innerHTML = html;

    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
    ui.$$('.pick', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-hero');
        if (!store.toggleParty(id)) {
          ui.toast(partyIds.length >= cap && store.party().indexOf(id) < 0
            ? '最多 ' + cap + ' 位出阵' : '至少保留 1 位');
        }
        renderParty(level);
      });
    });
    ui.$$('.troop-opt', el).forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.getAttribute('data-hero2');
        var t = b.getAttribute('data-troop');
        store.setTroop(id, t);
        ui.toast(data.hero(id).name + '改统' + troops[t].name + '：' + troops[t].desc);
        renderParty(level);
      });
    });
    ui.$('#btn-go', el).addEventListener('click', function () {
      currentLevel = level;
      app.go('/battle/' + level);
    });
  }

  /* ------------------------------ 战斗 ------------------------------ */

  function enterBattle(level, resume) {
    var party = store.partyUnits();
    if (!party.length) { ui.toast('请先编队'); app.go('/party/' + level); return; }

    battle.stop();
    if (resume) {
      var saved = store.getBattle();
      if (saved) battle.resume(saved, onBattleFinish);
    } else {
      battle.start(level, party, onBattleFinish);
    }
    bindBattleButtons();
    bindZoomButtons();
    bindDockButtons();
  }

  function bindDockButtons() {
    var bar = ui.$('#bt-dock');
    if (!bar || bar.__bound) return;
    bar.__bound = true;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'roster') return;          // 由战斗模块自己处理开合
      battle.onAction(act);
    });
  }

  function bindZoomButtons() {
    var bar = ui.$('.bt-zoom');
    if (!bar || bar.__bound) return;
    bar.__bound = true;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      battle.onAction(b.getAttribute('data-act'));
    });
  }

  function bindBattleButtons() {
    var bar = ui.$('#bt-actions');
    if (!bar || bar.__bound) return;
    bar.__bound = true;
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      battle.onAction(b.getAttribute('data-act'));
    });
    var back = ui.$('#bt-back');
    if (back && !back.__bound) {
      back.__bound = true;
      back.addEventListener('click', function () {
        ui.dialog({
          title: '撤离战场',
          text: '撤退将放弃本关进度，确定返回吗？',
          buttons: [
            { text: '取消' },
            {
              text: '确定撤退', cls: 'btn-danger', onClick: function () {
                store.clearBattle();
                battle.stop();
                app.go('/levels');
              }
            }
          ]
        });
      });
    }
  }

  function onBattleFinish(res, state) {
    var level = state.level;
    if (res.win) {
      store.completeLevel(level, res.stars, res.exp, res.gold);
      var unlockedId = res.unlock;
      var isNew = unlockedId ? store.unlock(unlockedId) : false;
      lastResult = { res: res, level: level, newHero: isNew ? data.hero(unlockedId) : null };
    } else {
      lastResult = { res: res, level: level, newHero: null };
    }
    app.go('/result');
  }

  /* ------------------------------ 结算 ------------------------------ */

  function renderResult() {
    var r = lastResult;
    var el = ui.$('#page-result');
    if (!r) { app.go('/home'); return; }
    var res = r.res;
    var next = Math.min(data.TOTAL_LEVELS, r.level + 1);

    el.innerHTML =
      '<div class="result-card ' + (res.win ? 'win' : 'lose') + '">' +
      '<div class="rs-title">' + (res.win ? '大获全胜' : '败走麦城') + '</div>' +
      '<div class="rs-stars">' + (res.win ? ui.stars(res.stars) : '☆☆☆') + '</div>' +
      '<div class="rs-reason">' + ui.esc(res.reason || '') + '</div>' +
      '<div class="rs-list">' +
      '<div><span>用时</span><b>' + res.turns + ' 回合</b></div>' +
      '<div><span>经验</span><b>+' + res.exp + '</b></div>' +
      '<div><span>金币</span><b>+' + res.gold + '</b></div>' +
      '</div>' +
      (r.newHero ? '<div class="rs-unlock">招致名将 · <b>' + ui.esc(r.newHero.name) + '</b>' +
        '<img src="assets/img/heroes/' + r.newHero.id + '.jpg" alt="" onerror="this.style.display=\'none\'"></div>' : '') +
      '<div class="rs-actions">' +
      (res.win && r.level < data.TOTAL_LEVELS ? '<button class="btn btn-primary" data-go="/party/' + next + '">下一关</button>' : '') +
      '<button class="btn btn-ghost" data-go="/party/' + r.level + '">再战一次</button>' +
      '<button class="btn btn-ghost" data-go="/levels">关卡列表</button>' +
      '<button class="btn btn-ghost" data-go="/home">返回主菜单</button>' +
      '</div></div>';

    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
  }

  /* ------------------------------ 武将与养成 ------------------------------ */

  function renderHeroes() {
    var owned = store.ownedHeroes();
    var s = store.get();
    var troops = core.TROOPS;

    var cards = owned.map(function (o) {
      var h = o.hero;
      var skList = (h.skillDefs && h.skillDefs.length) ? h.skillDefs : (h.skillDef ? [h.skillDef] : []);
      var cost = store.trainCost(o.id);
      return '<div class="hero-card' + (o.inParty ? ' in-party' : '') + '">' +
        '<div class="hc-av"><img src="assets/img/heroes/' + o.id + '.jpg" alt="" onerror="this.style.display=\'none\'"></div>' +
        '<div class="hc-body">' +
        '<div class="hc-name">' + ui.esc(h.name) + '<span class="hc-lv">Lv' + o.level + '</span>' +
        (o.inParty ? '<span class="tag tag-party">出阵</span>' : '') + '</div>' +
        '<div class="hc-meta">' + troops[h.troop].name + ' · 武 ' + h.atk + ' 统 ' + h.def + ' 智 ' + h.int + '</div>' +
        '<div class="hc-trait"><b>' + ui.esc(h.traitDef ? h.traitDef.name : '—') + '</b> ' +
        ui.esc(h.traitDef ? h.traitDef.desc : '') + '</div>' +
        '<div class="hc-skill">' + skList.map(function (k) {
          var kind = null, cls = '';
          if (k.element === 'fire' || k.effect === 'burn') { kind = '火'; cls = 'sk-fire'; }
          else if (k.element === 'water' || k.effect === 'flood') { kind = '水'; cls = 'sk-water'; }
          else if (k.element === 'thunder') { kind = '雷'; cls = 'sk-thunder'; }
          else if (k.element === 'rock' || k.effect === 'rock') { kind = '石'; cls = 'sk-rock'; }
          else if (k.effect === 'heal') { kind = '治'; cls = 'sk-heal'; }
          else if (k.effect === 'buff' || k.effect === 'bluff') { kind = '励'; cls = 'sk-buff'; }
          else if (k.effect === 'stun') { kind = '阵'; cls = 'sk-array'; }
          else if (k.effect === 'panic' || k.effect === 'chaos' || k.effect === 'bewitch' ||
            k.effect === 'feint' || k.effect === 'debuff' || k.effect === 'defect') { kind = '心'; cls = 'sk-mind'; }
          else if (k.effect === 'weather') { kind = '天'; cls = 'sk-thunder'; }
          else if (k.type === 'magic') { kind = '谋'; cls = 'sk-mind'; }
          else { kind = '武'; cls = 'sk-blade'; }
          return '<div class="hcs"><i class="sktag ' + cls + '">' + kind + '</i><b>' +
            ui.esc(k.name) + '</b> ' + ui.esc(k.desc) + '</div>';
        }).join('') + '</div>' +
        '<div class="hc-exp"><i style="width:' + Math.round(o.pct * 100) + '%"></i></div>' +
        '<div class="hc-expnum">' + o.exp + ' / ' + o.need + '</div>' +
        '<div class="hc-acts">' +
        '<button class="btn btn-mini" data-train="' + o.id + '"' + (s.gold < cost ? ' disabled' : '') + '>训练 ' + cost + ' 金</button>' +
        '<button class="btn btn-mini" data-toggle="' + o.id + '">' + (o.inParty ? '撤下' : '上阵') + '</button>' +
        '</div></div></div>';
    }).join('');

    var el = ui.$('#page-heroes');
    el.innerHTML =
      '<header class="sub-top">' +
      '<button class="icon-btn" data-go="/home">←</button>' +
      '<h2>武将 · ' + owned.length + ' 位</h2><span class="gold">金 ' + s.gold + '</span></header>' +
      '<p class="tip">训练消耗金币换经验；阵容最多 5 位出战。</p>' +
      '<div class="hero-list">' + cards + '</div>';

    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
    ui.$$('[data-train]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-train');
        if (store.train(id)) { ui.toast(data.hero(id).name + ' 经验 +60'); renderHeroes(); }
        else ui.toast('金币不足');
      });
    });
    ui.$$('[data-toggle]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-toggle');
        if (!store.toggleParty(id)) {
          var cp = store.partyCap ? store.partyCap() : 5;
          ui.toast(store.party().indexOf(id) < 0 ? '最多 ' + cp + ' 位出阵' : '至少保留 1 位');
        }
        renderHeroes();
      });
    });
  }

  /* ------------------------------ 设置 ------------------------------ */

  function renderSettings() {
    var s = store.settings();
    var el = ui.$('#page-settings');
    el.innerHTML =
      '<header class="sub-top">' +
      '<button class="icon-btn" data-go="/home">←</button>' +
      '<h2>设置</h2><span></span></header>' +
      '<div class="set-list">' +
      row('外观', ['系统', '浅色', '深色'], ['system', 'light', 'dark'], s.theme, 'theme') +
      row('战斗动画', ['正常', '快速', '极快'], [1, 1.6, 2.4], s.animSpeed, 'animSpeed') +
      row('显示网格', ['开', '关'], [true, false], s.showGrid, 'showGrid') +
      '</div>' +
      '<div class="set-danger"><button class="btn btn-danger" id="btn-reset">清除全部存档</button></div>' +
      '<p class="tip">存档保存在本机浏览器中；手机安装 APK 后数据独立保存，卸载会丢失。</p>';

    ui.$$('[data-go]', el).forEach(function (b) {
      b.addEventListener('click', function () { app.go(b.getAttribute('data-go')); });
    });
    ui.$$('[data-set]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-set');
        var val = b.getAttribute('data-val');
        var v = val === 'true' ? true : val === 'false' ? false : (isNaN(+val) ? val : +val);
        store.setSetting(key, v);
        if (key === 'theme') ui.applyTheme(v);
        renderSettings();
      });
    });
    ui.$('#btn-reset', el).addEventListener('click', function () {
      ui.dialog({
        title: '清除存档',
        text: '将清空关卡进度、武将养成与金币，且无法恢复。',
        buttons: [
          { text: '取消' },
          {
            text: '确认清除', cls: 'btn-danger', onClick: function () {
              store.resetAll();
              ui.toast('存档已清除');
              app.go('/home');
            }
          }
        ]
      });
    });
  }

  function row(label, labels, values, cur, key) {
    var btns = labels.map(function (l, i) {
      return '<button class="seg' + (values[i] === cur ? ' on' : '') + '" data-set="' + key +
        '" data-val="' + values[i] + '">' + l + '</button>';
    }).join('');
    return '<div class="set-row"><span>' + label + '</span><div class="segs">' + btns + '</div></div>';
  }

  /* ------------------------------ 启动 ------------------------------ */

  app.boot = function () {
    store.load();
    ui.initTheme();
    route();
    root.addEventListener('hashchange', route);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* 本地文件协议下忽略 */ });
    }
  };

  return app;
})(typeof self !== 'undefined' ? self : this);
