/* ==========================================================================
 * store.js — 本地存档：关卡进度、武将养成、编队、设置
 * ========================================================================== */
(function (root) {
  'use strict';

  var SG = root.SG = root.SG || {};
  var store = {};

  var KEY = 'sanguo-tactics-save-v1';
  var data = null;   // 延迟取 SG.data

  function D() { return data || (data = SG.data); }

  var state = null;

  function fresh() {
    return {
      version: 1,
      progress: {},          // { "3": { stars:2, turns:11 } }
      heroes: {},            // { liubei: { exp: 120 } }
      party: ['liubei', 'guanyu', 'zhangfei'],
      troops: {},            // { liubei: 'cavalry' } 出征前选定的兵种
      gold: 0,
      settings: { theme: 'system', sound: true, animSpeed: 1, showGrid: true },
      battle: null,          // 进行中的战斗
      lastLevel: 1
    };
  }

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : fresh();
    } catch (e) {
      state = fresh();
    }
    if (!state || state.version !== 1) state = fresh();
    if (!state.heroes) state.heroes = {};
    if (!state.progress) state.progress = {};
    if (!state.settings) state.settings = fresh().settings;
    // 初始三将必定拥有
    D().STARTERS.forEach(function (id) {
      if (!state.heroes[id]) state.heroes[id] = { exp: 0 };
    });
    if (!state.party || !state.party.length) state.party = D().STARTERS.slice();
    if (!state.troops) state.troops = {};
    return state;
  }

  function save() {
    try {
      root.localStorage && root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  function get() { return state || load(); }

  /* ---------------------------- 武将养成 ---------------------------- */

  function expForLevel(level) {
    return Math.round(60 * Math.pow(Math.max(1, level - 1), 2));
  }

  function levelOf(exp) {
    var lv = 1;
    while (lv < 60 && exp >= expForLevel(lv + 1)) lv++;
    return lv;
  }

  function expProgress(heroId) {
    var rec = get().heroes[heroId] || { exp: 0 };
    var lv = levelOf(rec.exp);
    var cur = expForLevel(lv), next = expForLevel(lv + 1);
    var pct = lv >= 60 ? 1 : (rec.exp - cur) / Math.max(1, next - cur);
    return { level: lv, exp: rec.exp, need: next, pct: Math.max(0, Math.min(1, pct)) };
  }

  function owns(heroId) { return !!get().heroes[heroId]; }

  function addExp(heroId, exp) {
    var s = get();
    if (!s.heroes[heroId]) s.heroes[heroId] = { exp: 0 };
    s.heroes[heroId].exp += exp;
    save();
    return levelOf(s.heroes[heroId].exp);
  }

  function unlock(heroId) {
    if (!heroId) return false;
    var s = get();
    if (s.heroes[heroId]) return false;
    s.heroes[heroId] = { exp: 0 };
    save();
    return true;
  }

  function ownedHeroes() {
    var s = get();
    return Object.keys(s.heroes).map(function (id) {
      var h = D().hero(id);
      if (!h) return null;
      var p = expProgress(id);
      return {
        id: id, hero: h, level: p.level, exp: p.exp, need: p.need, pct: p.pct,
        inParty: s.party.indexOf(id) >= 0
      };
    }).filter(Boolean).sort(function (a, b) {
      return (b.level - a.level) || (b.hero.atk - a.hero.atk);
    });
  }

  /* ---------------------------- 编队 ---------------------------- */

  function party() { return get().party.slice(); }

  /**
   * 出阵席位：桃园三兄弟起家，随着打下的城池越多，能调遣的上将也越多。
   * 对面动辄十万大军，只带五员将佐上阵，未免太看不起人。
   */
  function partyCap() {
    var done = Object.keys(get().progress || {}).length;
    if (done >= 60) return 8;
    if (done >= 34) return 7;
    if (done >= 12) return 6;
    return 5;
  }

  function setParty(ids) {
    var s = get();
    s.party = ids.slice(0, partyCap());
    save();
  }

  function toggleParty(heroId) {
    var s = get();
    var i = s.party.indexOf(heroId);
    if (i >= 0) {
      if (s.party.length <= 1) return false;   // 至少留一人
      s.party.splice(i, 1);
    } else {
      if (s.party.length >= partyCap()) return false;
      s.party.push(heroId);
    }
    save();
    return true;
  }

  /** 出征前选定的兵种（未选则用该将的本行） */
  function troopOf(heroId) {
    var h = D().hero(heroId);
    if (!h) return 'infantry';
    var t = get().troops[heroId];
    if (t && h.troops && h.troops.indexOf(t) >= 0) return t;
    return h.troop;
  }

  function setTroop(heroId, troop) {
    var h = D().hero(heroId);
    if (!h) return false;
    if (h.troops && h.troops.indexOf(troop) < 0) return false;
    get().troops[heroId] = troop;
    save();
    return true;
  }

  /** 出战阵容（含等级与兵种） */
  function partyUnits() {
    return party().map(function (id) {
      return { heroId: id, level: expProgress(id).level, troop: troopOf(id) };
    }).filter(function (u) { return D().hero(u.heroId); });
  }

  /* ---------------------------- 关卡进度 ---------------------------- */

  function progressOf(level) {
    return get().progress[String(level)] || null;
  }

  function cleared(level) { return !!get().progress[String(level)]; }

  function highestUnlocked() {
    var s = get();
    var max = 1;
    Object.keys(s.progress).forEach(function (k) {
      var n = parseInt(k, 10);
      if (n + 1 > max) max = n + 1;
    });
    return Math.min(D().TOTAL_LEVELS, max);
  }

  function completeLevel(level, stars, exp, gold) {
    var s = get();
    var key = String(level);
    var old = s.progress[key];
    if (!old || stars > old.stars) s.progress[key] = { stars: stars };
    s.gold += gold;
    var alive = partyUnits();
    alive.forEach(function (u) { addExp(u.heroId, exp); });
    if (level + 1 <= D().TOTAL_LEVELS) s.lastLevel = level + 1;
    save();
  }

  function totalStars() {
    var s = get(), n = 0;
    Object.keys(s.progress).forEach(function (k) { n += s.progress[k].stars || 0; });
    return n;
  }

  /* ---------------------------- 金币训练 ---------------------------- */

  function train(heroId) {
    var s = get();
    var cost = trainCost(heroId);
    if (s.gold < cost) return false;
    s.gold -= cost;
    addExp(heroId, 60);
    save();
    return true;
  }

  function trainCost(heroId) {
    var lv = expProgress(heroId).level;
    return 60 + lv * 20;
  }

  /* ---------------------------- 战斗续玩 ---------------------------- */

  function saveBattle(saved) { get().battle = saved; save(); }
  function getBattle() { return get().battle; }
  function clearBattle() { get().battle = null; save(); }

  /* ---------------------------- 设置 ---------------------------- */

  function settings() { return get().settings; }
  function setSetting(k, v) { get().settings[k] = v; save(); }

  function resetAll() {
    state = fresh();
    save();
  }

  store.load = load;
  store.save = save;
  store.get = get;
  store.resetAll = resetAll;

  store.expForLevel = expForLevel;
  store.levelOf = levelOf;
  store.troopOf = troopOf;
  store.setTroop = setTroop;
  store.expProgress = expProgress;
  store.owns = owns;
  store.addExp = addExp;
  store.unlock = unlock;
  store.ownedHeroes = ownedHeroes;

  store.party = party;
  store.partyCap = partyCap;
  store.setParty = setParty;
  store.toggleParty = toggleParty;
  store.partyUnits = partyUnits;

  store.progressOf = progressOf;
  store.cleared = cleared;
  store.highestUnlocked = highestUnlocked;
  store.completeLevel = completeLevel;
  store.totalStars = totalStars;

  store.train = train;
  store.trainCost = trainCost;

  store.saveBattle = saveBattle;
  store.getBattle = getBattle;
  store.clearBattle = clearBattle;

  store.settings = settings;
  store.setSetting = setSetting;

  SG.store = store;
})(typeof self !== 'undefined' ? self : this);
