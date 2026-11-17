/* ==========================================================================
 * data.js — 武将、兵种、技能、100 关战役数据
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else {
    root.SG = root.SG || {};
    root.SG.data = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var data = {};

  // 特性实现需要用到引擎的查询函数
  var core = (typeof module === 'object' && module.exports)
    ? require('./core.js')
    : ((typeof self !== 'undefined' ? self : this).SG || {}).core;

  /* ------------------------------------------------------------------ *
   * 武将技
   * ------------------------------------------------------------------ */

  var SKILLS = {
    qinglong: { name: '青龙偃月', shape: 'single', range: 1, power: 2.10, type: 'phys', effect: 'damage', cost: 40, desc: '势大力沉的致命一击' },
    shuanggu: { name: '双股剑', shape: 'single', range: 1, power: 1.95, type: 'phys', effect: 'damage', cost: 36, desc: '剑走轻灵，连绵不绝' },
    zhangba: { name: '丈八蛇矛', shape: 'single', range: 1, power: 2.05, type: 'phys', effect: 'damage', cost: 40, desc: '一矛透甲，震慑敌阵' },
    longdan: { name: '龙胆突阵', shape: 'line', range: 2, length: 2, power: 1.75, type: 'phys', effect: 'damage', cost: 42, desc: '长驱直入，穿透敌列' },
    tieqi: { name: '铁骑突击', shape: 'line', range: 2, length: 2, power: 1.70, type: 'phys', effect: 'damage', cost: 42, desc: '铁骑奔袭，锐不可当' },
    // ---- 三大战场谋略：火、水、兽 ----
    // need 标明这一计「吃」什么地势：对上了威力倍增并留下战场遗留物，对不上大打折扣
    huogong: { name: '火攻', shape: 'square', range: 3, radius: 1, power: 1.35, type: 'magic', effect: 'burn', element: 'fire', need: 'burnable', cost: 45, desc: '烈焰焚营：须择林地、草莽、营寨、舟船而施，燃起火场断绝通路，持续灼烧数回合' },
    shuaiyan: { name: '水淹', shape: 'square', range: 3, radius: 1, power: 1.32, type: 'magic', effect: 'flood', element: 'water', need: 'floodable', cost: 48, desc: '决水灌城：须择低洼水泽而施，泛滥成灾阻断行军，并可浇灭烈焰' },
    yeshou: { name: '驱兽', shape: 'line', range: 2, length: 3, power: 1.45, type: 'phys', effect: 'damage', element: 'beast', cost: 44, desc: '驱虎豹狮象冲阵：直贯敌列，无视地形之利' },
    luoshi: { name: '落石', shape: 'square', range: 2, radius: 1, power: 1.50, type: 'phys', effect: 'rock', element: 'rock', need: 'rockable', cost: 44, desc: '据高临下推下擂石：须依山势而施，巨石堆积彻底堵死山道' },
    duanlu: { name: '断路', shape: 'single', range: 3, power: 0.85, type: 'phys', effect: 'rock', element: 'rock', need: 'rockable', cost: 34, desc: '掘道堆石：于一处截断要道，敌军不得不绕行他途' },
    wulei: { name: '五雷正法', shape: 'square', range: 4, radius: 1, power: 1.35, type: 'magic', effect: 'damage', element: 'thunder', cost: 50, desc: '引天雷轰击：风雨大作之际雷霆威力倍增，晴空则平平无奇' },
    bingfeng: { name: '冰封', shape: 'square', range: 3, radius: 1, power: 0.88, type: 'magic', effect: 'debuff', debuff: 'slow', element: 'water', cost: 36, desc: '寒冰封路：敌军行军迟滞，雨雪之天更甚' },
    // ---- 心战与环境之谋 ----
    yibing: { name: '疑兵', shape: 'cross', range: 3, power: 0.55, type: 'magic', effect: 'panic', cost: 40, desc: '虚张声势：中计者士气崩挫，下一回合无法行动' },
    tianbian: { name: '夜观天象', shape: 'self', range: 0, effect: 'weather', online: true, cost: 30, desc: '借天时：扭转风雨云雾，为火攻水攻铺路' },
    huanzhen: { name: '火牛阵', shape: 'line', range: 2, length: 3, power: 1.40, type: 'phys', effect: 'burn', element: 'fire', need: 'burnable', cost: 46, desc: '牛角缚刃、尾系火炬：冲阵踏营，所过之处尽成火海' },
    shoulie: { name: '万箭齐发', shape: 'square', range: 4, radius: 2, power: 1.25, type: 'phys', effect: 'damage', need: 'open', cost: 52, desc: '铺天盖地的箭雨，覆盖大片敌军（林间山地则威力受制）' },
    qilin: { name: '奇门遁甲', shape: 'square', range: 3, radius: 1, power: 1.38, type: 'magic', effect: 'damage', element: 'arcane', cost: 46, desc: '遁甲之术，变幻莫测，无视守备地形' },
    jianyu: { name: '箭雨', shape: 'cross', range: 3, power: 1.50, type: 'phys', effect: 'damage', need: 'open', cost: 42, desc: '万箭齐发，覆盖敌阵；开阔地更展得开' },
    baibu: { name: '百步穿杨', shape: 'single', range: 3, power: 2.20, type: 'phys', effect: 'damage', cost: 40, desc: '一箭定乾坤' },
    wushuang: { name: '无双乱舞', shape: 'square', range: 1, radius: 1, power: 1.95, type: 'phys', effect: 'damage', cost: 48, desc: '人中吕布，马中赤兔' },
    rende: { name: '仁德', shape: 'square', range: 2, radius: 1, power: 0.32, effect: 'heal', cost: 35, desc: '以德服人，安抚三军' },
    guwu: { name: '魏武挥鞭', shape: 'square', range: 2, radius: 1, effect: 'buff', buff: 'atkUp', cost: 32, desc: '鼓舞士气，全军奋进' },
    wangzuo: { name: '王佐之才', shape: 'square', range: 2, radius: 1, effect: 'buff', buff: 'defUp', cost: 32, desc: '稳固阵脚，坚不可摧' },
    tiebi: { name: '铁壁据守', shape: 'self', range: 0, effect: 'buff', buff: 'defUp', cost: 28, desc: '据险而守，固若金汤' },
    guimou: { name: '鬼谋', shape: 'square', range: 3, radius: 1, power: 1.42, type: 'magic', effect: 'damage', cost: 45, desc: '算无遗策，出其不意' },
    jieying: { name: '劫营', shape: 'single', range: 1, power: 2.00, type: 'phys', effect: 'damage', cost: 40, desc: '夜袭敌寨，一击破胆' },
    feidao: { name: '飞刀绝技', shape: 'cross', range: 2, power: 1.45, type: 'phys', effect: 'damage', cost: 40, desc: '飞刀连环，防不胜防' },
    manhou: { name: '蛮族战吼', shape: 'square', range: 1, radius: 1, effect: 'buff', buff: 'atkUp', cost: 32, desc: '南中勇士，士气如虹' },
    yaoshu: { name: '太平妖术', shape: 'square', range: 3, radius: 1, power: 1.30, type: 'magic', effect: 'burn', element: 'fire', need: 'burnable', cost: 44, desc: '符水咒术，惑乱人心；火势亦随妖风而起' },
    juesha: { name: '绝杀', shape: 'single', range: 1, power: 2.15, type: 'phys', effect: 'damage', cost: 40, desc: '毕其功于一役' },

    /* ---- 诡道十二计：不靠刀枪，靠人心 ---- */
    zhabai: { name: '诈败', shape: 'square', range: 1, radius: 1, power: 0.30, type: 'magic', effect: 'feint', cost: 34, desc: '佯输诈走：敌军贪功追击、阵脚自乱，施计者得以脱身再战' },
    fanjian: { name: '反间', shape: 'single', range: 3, power: 0.32, type: 'magic', effect: 'chaos', cost: 42, desc: '离间敌将与其主公：中计者阵前神智昏乱，下一回合敌我不分、挥刀砍向身边人' },
    guhuo: { name: '蛊惑', shape: 'square', range: 3, radius: 1, power: 0.42, type: 'magic', effect: 'bewitch', cost: 38, desc: '妖言惑众：敌军士气崩挫，两回合内受谋略攻心之伤更重' },
    zhaoxiang: { name: '招降', shape: 'single', range: 2, power: 0.18, type: 'magic', effect: 'defect', cost: 46, desc: '阵前劝降：兵力不足四成的败军可能倒戈来投，主帅与名将不为所动' },
    weibao: { name: '伪报', shape: 'cross', range: 4, power: 0.48, type: 'magic', effect: 'panic', cost: 36, desc: '谎传军情：中计者进退失据，下一回合无法行动' },
    raoluan: { name: '扰乱', shape: 'square', range: 3, radius: 1, power: 0.50, type: 'magic', effect: 'debuff', debuff: 'atkDown', cost: 34, desc: '乱其阵脚：两回合内敌军攻势大减' },
    xuruoshou: { name: '攻心', shape: 'square', range: 3, radius: 1, power: 0.46, type: 'magic', effect: 'debuff', debuff: 'defDown', cost: 36, desc: '攻心为上：两回合内敌军守备虚空，任我宰割' },
    kongcheng: { name: '空城', shape: 'self', range: 0, effect: 'bluff', cost: 30, desc: '大开城门故作从容：自身守备大增，四周来敌反生疑惧' },
    jijiang: { name: '激将', shape: 'square', range: 2, radius: 1, effect: 'buff', buff: 'atkUp', cost: 30, desc: '阵前激将：三军奋进，士气大振' },
    fubing: { name: '伏兵', shape: 'single', range: 4, power: 1.55, type: 'phys', effect: 'ambush', cost: 40, desc: '出其不意：林莽山坳间伏兵四起，猝不及防者伤亡近半' },
    bazhentu: { name: '八阵图', shape: 'square', range: 2, radius: 1, power: 1.15, type: 'magic', effect: 'stun', element: 'arcane', cost: 48, desc: '奇门八阵：陷于阵中者动弹不得，任人宰割' },
    liaoyuan: { name: '燎原', shape: 'square', range: 4, radius: 2, power: 1.12, type: 'magic', effect: 'burn', element: 'fire', need: 'burnable', cost: 58, desc: '烈焰燎原：大片地带尽成火海，风助则势不可挡' },
    huojian: { name: '火箭', shape: 'single', range: 3, power: 1.58, type: 'phys', effect: 'burn', element: 'fire', need: 'burnable', cost: 38, desc: '箭簇裹油：一箭中的，火随风长' },
    jueshui: { name: '决水', shape: 'line', range: 3, length: 4, power: 1.28, type: 'magic', effect: 'flood', element: 'water', need: 'floodable', cost: 50, desc: '决堤放水：洪流沿低处奔涌，冲垮一线之敌并断其归路' },
    tiesuo: { name: '铁索连环', shape: 'square', range: 3, radius: 1, power: 1.18, type: 'magic', effect: 'burn', element: 'fire', need: 'burnable', cost: 44, desc: '铁索钉连环：一处着火，满江同焚' },
    shendao: { name: '神刀', shape: 'line', range: 1, length: 3, power: 1.78, type: 'phys', effect: 'damage', cost: 44, desc: '一刀撩三骑，锋刃所过无人得全' },
    pojun: { name: '破军', shape: 'single', range: 1, power: 2.05, type: 'phys', effect: 'damage', cost: 42, desc: '摧锋破阵，所向披靡' },
    guishen: { name: '鬼神之勇', shape: 'square', range: 1, radius: 1, power: 1.82, type: 'phys', effect: 'damage', cost: 50, desc: '一夫拚命，万夫难当' },
    xuantian: { name: '玄天护佑', shape: 'square', range: 2, radius: 1, effect: 'buff', buff: 'defUp', cost: 34, desc: '道法护佑三军：范围内友军守备大增' },
    tuogu: { name: '脱兔', shape: 'self', range: 0, effect: 'buff', buff: 'haste', cost: 24, desc: '疾走如脱兔：两回合内移动力大增' },
    liaodi: { name: '料敌', shape: 'self', range: 0, effect: 'buff', buff: 'atkUp', cost: 26, desc: '料敌机先：两回合内出手更狠' }
  };

  /* ------------------------------------------------------------------ *
   * 武将特性（被动）
   *
   * 特性决定「这个将该怎么用」，而不只是数值高低：
   *   dmg / taken   出手与承伤修正      range / move / moveCost  射程与机动
   *   aura          光环影响周围单位    onTurn / onKill / onAttack 触发效果
   *   skillPower / skillRadius / skillIgnite / skillCost  强化武将技
   *   breakthrough / mountaineer / riverwalk / counter     规则豁免开关
   * ------------------------------------------------------------------ */

  var TRAITS = {
    /* ===== 名将专属 ===== */
    wusheng: {
      name: '武圣', desc: '对武力低于自己的敌将伤害 +18%；贴身单挑时暴击率 +15%',
      dmg: function (s, u, t) { return core.statOf(t, 'atk') < core.statOf(u, 'atk') ? 1.18 : 1; },
      crit: function (s, u, t) { return core.dist(u, t) === 1 ? 0.15 : 0; }
    },
    paoxiao: {
      name: '咆哮', desc: '对弓兵与谋士伤害 +20%；攻击震慑目标及其相邻同袍，士气 -12',
      dmg: function (s, u, t) { return core.TROOPS[t.troop].range > 1 ? 1.20 : 1; },
      onAttack: function (s, u, t, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side === t.side && core.dist(x, t) <= 1) core.gainMorale(x, -12);
        });
        ev.push({ t: 'trait', id: u.id, name: '咆哮' });
      }
    },
    danshen: {
      name: '一身是胆', desc: '无视敌军控制区自由穿插；兵力过半以下时受到伤害 -25%',
      breakthrough: true,
      taken: function (s, u) { return u.hp / u.maxHp < 0.5 ? 0.75 : 1; }
    },
    xiliang: {
      name: '西凉铁骑', desc: '平原草地道路移动 +2；冲锋威力再 +15%',
      move: function (s, u, base) {
        var t = core.tileAt(s, u.x, u.y);
        return (t.key === 'plain' || t.key === 'grass' || t.key === 'road') ? base + 2 : base;
      },
      dmg: function (s, u) {
        return (core.TROOPS[u.troop].charge && (u.movedSteps || 0) >= 3) ? 1.15 : 1;
      }
    },
    shenjian: {
      name: '百步穿杨', desc: '射程 +1；占据高地时伤害 +20%',
      range: function (s, u, r) { return r + 1; },
      dmg: function (s, u) { return core.elevAt(s, u.x, u.y) >= 2 ? 1.20 : 1; }
    },
    wolong: {
      name: '卧龙', desc: '火攻伤害 +15%、范围 +1；每回合为相邻友军恢复 15 士气',
      skillPower: function (s, u, sk, p) { return sk.effect === 'burn' ? p * 1.15 : p; },
      skillRadius: function (s, u, sk) { return sk.effect === 'burn' ? 1 : 0; },
      onTurn: function (s, u, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 1) core.gainMorale(x, 15);
        });
        ev.push({ t: 'trait', id: u.id, name: '卧龙' });
      }
    },
    fengchu: {
      name: '凤雏', desc: '谋略伤害 +18%；击杀敌将后士气回满',
      dmg: function (s, u, t, o) { return o && o.magic ? 1.18 : 1; },
      onKill: function (s, u, ev) { u.morale = 100; ev.push({ t: 'trait', id: u.id, name: '凤雏' }); }
    },
    jiufa: {
      name: '九伐中原', desc: '每击杀一名敌将，士气 +35',
      onKill: function (s, u, ev) { core.gainMorale(u, 35); ev.push({ t: 'trait', id: u.id, name: '九伐中原' }); }
    },
    rende: {
      name: '仁德', desc: '周围 2 格友军防御提升，且每回合恢复 5% 兵力',
      aura: function () { return { radius: 2, allies: { def: 0.92 } }; },
      onTurn: function (s, u, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 2 && x.hp < x.maxHp) {
            var h = Math.round(x.maxHp * 0.05);
            x.hp = Math.min(x.maxHp, x.hp + h);
            ev.push({ t: 'heal', id: x.id, amount: h, x: x.x, y: x.y, trait: true });
          }
        });
      }
    },
    jianxiong: {
      name: '奸雄', desc: '周围 2 格友军攻击 +12%；自身谋略伤害 +15%',
      aura: function () { return { radius: 2, allies: { atk: 1.12 } }; },
      dmg: function (s, u, t, o) { return o && o.magic ? 1.15 : 1; }
    },
    huchi: {
      name: '虎痴', desc: '受到伤害 -18%；兵力越低出手越重（最高 +25%）',
      taken: function () { return 0.82; },
      dmg: function (s, u) { return 1 + (1 - u.hp / u.maxHp) * 0.25; }
    },
    yifu: {
      name: '一夫当关', desc: '相邻友军受到伤害 -15%；自身受到伤害 -10%',
      taken: function () { return 0.90; },
      aura: function () { return { radius: 1, allies: { def: 0.85 } }; }
    },
    xiaoyao: {
      name: '威震逍遥津', desc: '击杀敌将后可立即再行动一次',
      onKill: function (s, u, ev) {
        u.acted = false; u.moved = false;
        ev.push({ t: 'trait', id: u.id, name: '威震逍遥津' });
      }
    },
    zhijun: {
      name: '治军严整', desc: '受到远程与谋略伤害 -25%',
      taken: function (s, u, a) { return core.TROOPS[a.troop].range > 1 ? 0.75 : 1; }
    },
    qiaobian: {
      name: '临阵巧变', desc: '无视敌军控制区穿插，移动力 +1',
      breakthrough: true,
      move: function (s, u, b) { return b + 1; }
    },
    jushou: {
      name: '据守坚城', desc: '身处城池或营寨时受到伤害 -30%',
      taken: function (s, u) {
        var k = core.tileAt(s, u.x, u.y).key;
        return (k === 'city' || k === 'camp') ? 0.70 : 1;
      }
    },
    guicai: {
      name: '鬼才', desc: '谋略伤害 +20%；武将技士气消耗 -8',
      dmg: function (s, u, t, o) { return o && o.magic ? 1.20 : 1; },
      skillCost: function (s, u, c) { return Math.max(10, c - 8); }
    },
    wangzuo: {
      name: '王佐之才', desc: '周围 2 格友军受到伤害 -12%',
      aura: function () { return { radius: 2, allies: { def: 0.88 } }; }
    },
    langgu: {
      name: '鹰视狼顾', desc: '受到谋略伤害 -35%，且免疫一切谋略暴击',
      taken: function (s, u, a, o) { return o && o.magic ? 0.65 : 1; },
      crit: function () { return 0; }
    },
    dushi: {
      name: '毒士', desc: '谋略伤害 +15%；攻击使目标陷入灼烧',
      dmg: function (s, u, t, o) { return o && o.magic ? 1.15 : 1; },
      onAttack: function (s, u, t, ev) {
        t.buffs = t.buffs || {}; t.buffs.burn = 2;
        ev.push({ t: 'trait', id: u.id, name: '毒士' });
      }
    },
    wushuang: {
      name: '无双', desc: '伤害 +15%（若反被兵种克制则 +35%）；攻击溅射目标相邻敌军 35% 伤害',
      dmg: function (s, u, t) {
        return core.counterRate(core.TROOPS[t.troop].key, core.TROOPS[u.troop].key) > 1 ? 1.35 : 1.15;
      },
      onAttack: function (s, u, t, ev, dmg) {
        var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]], hit = 0;
        for (var d = 0; d < 4; d++) {
          var n = core.unitAt(s, t.x + dirs[d][0], t.y + dirs[d][1]);
          if (!n || !n.alive || n.side === u.side || n.id === t.id) continue;
          var sp = Math.max(1, Math.round((dmg || 0) * 0.35));
          n.hp -= sp;
          ev.push({ t: 'damage', id: n.id, amount: sp, x: n.x, y: n.y });
          if (n.hp <= 0) { n.hp = 0; n.alive = false; ev.push({ t: 'die', id: n.id, x: n.x, y: n.y }); }
          hit++;
        }
        if (hit) ev.push({ t: 'trait', id: u.id, name: '无双' });
      }
    },
    meiren: {
      name: '美人计', desc: '相邻敌军攻击力 -20%',
      aura: function () { return { radius: 1, enemies: { atk: 0.80 } }; }
    },
    huoshen: {
      name: '火烧赤壁', desc: '火攻伤害 +45%、范围 +1；受到谋略伤害 -20%',
      skillPower: function (s, u, sk, p) { return sk.effect === 'burn' ? p * 1.45 : p; },
      skillRadius: function (s, u, sk) { return sk.effect === 'burn' ? 1 : 0; },
      taken: function (s, u, a, o) { return o && o.magic ? 0.80 : 1; }
    },
    lianhuan: {
      name: '连环火计', desc: '火攻伤害 +30%，点燃范围 +1 且火势持续 +1 回合',
      skillPower: function (s, u, sk, p) { return sk.effect === 'burn' ? p * 1.30 : p; },
      skillRadius: function (s, u, sk) { return sk.effect === 'burn' ? 1 : 0; },
      skillIgnite: function (s, u, sk, t) { return sk.effect === 'burn' ? t + 1 : t; }
    },
    baiyi: {
      name: '白衣渡江', desc: '无需水军即可渡河；水域中攻防 +20%',
      riverwalk: true,
      dmg: function (s, u) { return core.tileAt(s, u.x, u.y).water ? 1.20 : 1; },
      taken: function (s, u) { return core.tileAt(s, u.x, u.y).water ? 0.85 : 1; }
    },
    jinfan: {
      name: '锦帆', desc: '水域中伤害 +25%、受到伤害 -20%',
      dmg: function (s, u) { return core.tileAt(s, u.x, u.y).water ? 1.25 : 1; },
      taken: function (s, u) { return core.tileAt(s, u.x, u.y).water ? 0.80 : 1; }
    },
    kurou: {
      name: '苦肉计', desc: '兵力越低伤害越高（最高 +30%）；火攻伤害 +30%',
      dmg: function (s, u) { return 1 + (1 - u.hp / u.maxHp) * 0.30; },
      skillPower: function (s, u, sk, p) { return sk.effect === 'burn' ? p * 1.30 : p; }
    },
    gongshen: {
      name: '弓神', desc: '远程伤害 +12%；被贴身时仍能还击（远程单位罕见）',
      counter: true,
      dmg: function (s, u) { return core.TROOPS[u.troop].range > 1 ? 1.12 : 1; }
    },
    huzhu: {
      name: '护主', desc: '相邻友军受到伤害 -20%，但自身受到伤害 +10%',
      aura: function () { return { radius: 1, allies: { def: 0.80 } }; },
      taken: function () { return 1.10; }
    },
    xiaobawang: {
      name: '小霸王', desc: '周围 2 格内每有一名友军，伤害 +6%（上限 +24%）',
      dmg: function (s, u) {
        var n = 0;
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 2) n++;
        });
        return 1 + Math.min(0.24, n * 0.06);
      }
    },
    taiping: {
      name: '太平道', desc: '谋略伤害 +12%；每回合惑乱相邻敌军，士气 -15',
      dmg: function (s, u, t, o) { return o && o.magic ? 1.12 : 1; },
      onTurn: function (s, u, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side !== u.side && core.dist(x, u) <= 1) core.gainMorale(x, -15);
        });
        ev.push({ t: 'trait', id: u.id, name: '太平道' });
      }
    },
    manwang: {
      name: '蛮王', desc: '山地林地行动无碍，且在山林中伤害 +20%',
      mountaineer: true,
      dmg: function (s, u) {
        var k = core.tileAt(s, u.x, u.y).key;
        return (k === 'hill' || k === 'forest') ? 1.20 : 1;
      }
    },
    feidao: {
      name: '飞刀绝技', desc: '远程命中后追加一次 50% 伤害',
      onAttack: function (s, u, t, ev, dmg) {
        if (core.TROOPS[u.troop].range <= 1 || !dmg) return;
        var sp = Math.max(1, Math.round(dmg * 0.5));
        t.hp -= sp;
        ev.push({ t: 'damage', id: t.id, amount: sp, x: t.x, y: t.y });
        if (t.hp <= 0) { t.hp = 0; t.alive = false; ev.push({ t: 'die', id: t.id, x: t.x, y: t.y }); }
        ev.push({ t: 'trait', id: u.id, name: '飞刀' });
      }
    },
    beidiqiang: {
      name: '北地枪王', desc: '对骑兵伤害 +20%，受到骑兵攻击时受伤 -20%',
      dmg: function (s, u, t) { return t.troop === 'cavalry' ? 1.20 : 1; },
      taken: function (s, u, a) { return a.troop === 'cavalry' ? 0.80 : 1; }
    },
    baima: {
      name: '白马义从', desc: '冲锋威力 +10%；首回合移动力 +2',
      dmg: function (s, u) {
        return (core.TROOPS[u.troop].charge && (u.movedSteps || 0) >= 3) ? 1.10 : 1;
      },
      move: function (s, u, b) { return s.turn <= 1 ? b + 2 : b; }
    },
    qixi: {
      name: '偷渡阴平', desc: '山地林地如履平地（消耗恒为 1），移动力 +1',
      mountaineer: true,
      moveCost: function (s, u, t, c) { return (t.key === 'hill' || t.key === 'forest') ? 1 : c; },
      move: function (s, u, b) { return b + 1; }
    },
    jianyan: {
      name: '忠谏', desc: '周围 2 格友军防御提升，每回合士气 +10',
      aura: function () { return { radius: 2, allies: { def: 0.94 } }; },
      onTurn: function (s, u, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 2) core.gainMorale(x, 10);
        });
      }
    },

    /* ===== 通用特性（次要将领） ===== */
    xianfeng: {
      name: '先登', desc: '首回合移动力 +3、伤害 +15%',
      move: function (s, u, b) { return s.turn <= 1 ? b + 3 : b; },
      dmg: function (s, u) { return s.turn <= 1 ? 1.15 : 1; }
    },
    duzhan: {
      name: '独战', desc: '周围没有友军时，伤害 +22%',
      dmg: function (s, u) {
        var n = 0;
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 1) n++;
        });
        return n === 0 ? 1.22 : 1;
      }
    },
    jianshou: {
      name: '坚守', desc: '受到远程与谋略伤害 -20%',
      taken: function (s, u, a) { return core.TROOPS[a.troop].range > 1 ? 0.80 : 1; }
    },
    laojiang: {
      name: '老当益壮', desc: '兵力越低，伤害越高（最高 +25%）',
      dmg: function (s, u) { return 1 + (1 - u.hp / u.maxHp) * 0.25; }
    },
    shoufa: {
      name: '守法持重', desc: '身处城池或营寨时受到伤害 -25%',
      taken: function (s, u) {
        var k = core.tileAt(s, u.x, u.y).key;
        return (k === 'city' || k === 'camp') ? 0.75 : 1;
      }
    },
    qimou: {
      name: '奇谋', desc: '谋略伤害 +15%',
      dmg: function (s, u, t, o) { return o && o.magic ? 1.15 : 1; }
    },
    tiewei: {
      name: '铁卫', desc: '相邻友军受到伤害 -12%',
      aura: function () { return { radius: 1, allies: { def: 0.88 } }; }
    },
    yongguan: {
      name: '勇冠三军', desc: '物理伤害 +12%',
      dmg: function (s, u, t, o) { return o && o.magic ? 1 : 1.12; }
    },
    buliang: {
      name: '督粮', desc: '每回合为相邻友军恢复 4% 兵力',
      onTurn: function (s, u, ev) {
        s.units.forEach(function (x) {
          if (x.alive && x.side === u.side && x.id !== u.id && core.dist(x, u) <= 1 && x.hp < x.maxHp) {
            var h = Math.round(x.maxHp * 0.04);
            x.hp = Math.min(x.maxHp, x.hp + h);
            ev.push({ t: 'heal', id: x.id, amount: h, x: x.x, y: x.y, trait: true });
          }
        });
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * 武将表：id, 姓名, 势力, 武力, 统率(防御), 智力, 兵力, 兵种, 技能, 特性
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * 武将可统率的兵种
   *
   * 不是谁都能带骑兵、不是谁都会用兵。依演义里该将的本事来定：
   * 猛将能统铁骑，智士能掌谋略，江东子弟善舟楫，稳重之臣可督粮草。
   * 出征前换兵种，直接改变攻防、射程与移动力，是排兵布阵的关键一手。
   * ------------------------------------------------------------------ */

  /** 熟悉水战的将领（江东诸将与水军都督、北方督水军者） */
  var NAVY_MEN = ['zhouyu', 'lusu', 'lvmeng', 'luxun', 'ganning', 'huanggai', 'handang',
    'zhoutai', 'chengpu', 'zhuran', 'taishici', 'sunce', 'sunquan', 'sunshangxiang',
    'lukang', 'quancong', 'zhugejin', 'huangzu', 'sujian', 'caocao', 'yujin',
    'caimao', 'zhangyun', 'yuanshao', 'guanyu', 'zhangfei', 'liaohua', 'zhangbaoshi'];

  function defaultTroops(h) {
    var list = ['infantry'];                       // 凡为将者，皆能带步卒
    var m = h.atk, i = h.int, d = h.def;
    // 铁骑：冲锋陷阵之才
    if (h.troop === 'cavalry' || (m >= 86 && d >= 74)) list.push('cavalry');
    // 弓弩：善射者与兼备谋勇者
    if (h.troop === 'archer' || (m >= 74 && i >= 55) || (i >= 66 && m >= 70)) list.push('archer');
    // 舟师：江东子弟与水战宿将
    if (h.faction === 'wu' || NAVY_MEN.indexOf(h.id) >= 0) list.push('navy');
    // 谋略：智计过人者方能运筹
    if (h.troop === 'scholar' || h.troop === 'strategist' || i >= 80) list.push('scholar');
    // 辎重：治军有方、能督粮草攻械者
    if (i >= 62 || h.troop === 'wagon' || (d >= 80 && m >= 76)) list.push('wagon');
    return list;
  }

  /*
   * 武将技能：一人最少两技（一武一谋），至多三技。
   * 光会砍人的将军太单薄 —— 真正的名将既能冲锋陷阵，也能用计。
   * 主技取自演义本传，其余依文武禀赋补足，同一武将永远配到同样的一身本事。
   */
  function buildSkills(h, extra) {
    var list = [h.skill];
    function add(k) {
      if (!k || !SKILLS[k] || list.indexOf(k) >= 0 || list.length >= 3) return;
      list.push(k);
    }
    (extra || []).forEach(add);

    var m = h.atk, i = h.int, d = h.def;
    var seed = 0;
    for (var s = 0; s < h.id.length; s++) seed = (seed * 31 + h.id.charCodeAt(s)) >>> 0;

    // 运筹之士：计愈多愈妙，智绝者兼通奇门与攻心
    if (i >= 94) { add('bazhentu'); add('fanjian'); add('guhuo'); }
    else if (i >= 86) { add('zhabai'); add('guhuo'); add('raoluan'); }
    else if (i >= 78) { add('weibao'); add('raoluan'); }
    else if (i >= 68) { add('yibing'); }
    // 万人敌：沙场之上自有杀招
    if (m >= 94) { add('guishen'); add('pojun'); }
    else if (m >= 88) { add(seed % 2 ? 'pojun' : 'shendao'); }
    else if (m >= 82) { add('fubing'); }
    // 方面之任：能镇抚三军、能使将士用命
    if (d >= 84) { add('jijiang'); }
    else if (d >= 78) { add('tiebi'); }
    // 弓马娴熟者：远射的狠招
    if ((h.troop === 'archer' || h.troop === 'navy') && list.length < 3) add('huojian');
    // 水战宿将：惯用火攻破连环
    if (h.troop === 'navy' && list.length < 3 && i >= 55) add('tiesuo');
    // 奇门之士：能引天雷轰敌（最吃天时的一计）
    if (i >= 96 && list.length < 3) add('wulei');
    else if (i >= 80 && list.length < 3) add('bingfeng');
    // 久镇边州者：惯于掘道堆石、断敌归路
    if (d >= 80 && list.length < 3 && seed % 3 === 0) add('duanlu');
    // 兜底：总得有第二手
    if (list.length < 2) add(i >= m ? 'raoluan' : 'fubing');
    return list;
  }

  /** 名将专属的第二、三技：演义里用过的那一手 */
  var SKILL_EXTRA = {
    zhugeliang: ['bazhentu', 'fanjian'], pangtong: ['tiesuo', 'fanjian'],
    simayi: ['zhabai', 'fanjian'], zhouyu: ['liaoyuan', 'zhabai'],
    luxun: ['liaoyuan', 'fubing'], guojia: ['guhuo', 'zhaoxiang'],
    jiaxu: ['fanjian', 'guhuo'], xunyu: ['zhaoxiang', 'jijiang'],
    dengai: ['fubing', 'zhabai'], simayan: ['zhaoxiang'],
    lvbu: ['guishen', 'pojun'], guanyu: ['jueshui', 'pojun'],   // 水淹七军
    zhangfei: ['guishen'], zhaoyun: ['pojun'], maichao: ['shendao'],
    huangzhong: ['huojian'], taishici: ['huojian'], zhangren: ['fubing'],
    caocao: ['zhabai', 'fanjian'], liubei: ['zhaoxiang', 'jijiang'],
    sunquan: ['kongcheng'], menghuo: ['yeshou'], zhangjiao: ['guhuo', 'yaoshu'],
    diaochan: ['fanjian', 'guhuo'], huanggai: ['tiesuo', 'zhabai'],
    zhugejin: ['raoluan'], chengyu: ['zhabai'], lusun: ['weibao']
  };

  function H(id, name, faction, atk, def, int, hp, troop, skill, quote, trait) {
    var h = {
      id: id, name: name, faction: faction,
      atk: atk, def: def, int: int, hp: hp,
      troop: troop === 'strategist' ? 'scholar' : troop,
      skill: skill, quote: quote || '',
      trait: trait || null
    };
    h.troops = defaultTroops(h);
    h.skills = buildSkills(h, SKILL_EXTRA[id]);
    return h;
  }

  var HEROES = [
    /* --- 蜀汉 --- */
    H('liubei', '刘备', 'shu', 78, 76, 82, 1060, 'infantry', 'shuanggu', '汉室之胄，仁德布于天下', 'rende'),
    H('guanyu', '关羽', 'shu', 98, 88, 72, 1180, 'cavalry', 'qinglong', '义薄云天，威震华夏', 'wusheng'),
    H('zhangfei', '张飞', 'shu', 97, 85, 45, 1150, 'spear', 'zhangba', '万人敌，声若巨雷', 'paoxiao'),
    H('zhaoyun', '赵云', 'shu', 96, 84, 74, 1120, 'cavalry', 'longdan', '一身是胆，七进七出', 'danshen'),
    H('maichao', '马超', 'shu', 95, 80, 58, 1080, 'cavalry', 'tieqi', '锦马超，西凉雄狮', 'xiliang'),
    H('huangzhong', '黄忠', 'shu', 93, 78, 65, 1020, 'archer', 'baibu', '老当益壮，百步穿杨', 'shenjian'),
    H('zhugeliang', '诸葛亮', 'shu', 62, 60, 100, 980, 'strategist', 'huogong', '鞠躬尽瘁，死而后已', 'wolong'),
    H('pangtong', '庞统', 'shu', 60, 58, 96, 950, 'strategist', 'guimou', '凤雏展翅，谋定西川', 'fengchu'),
    H('jiangwei', '姜维', 'shu', 88, 80, 86, 1060, 'infantry', 'juesha', '继丞相之志，九伐中原', 'jiufa'),
    H('weiyan', '魏延', 'shu', 90, 78, 55, 1050, 'infantry', 'jieying', '勇冠三军，性矜高', 'duzhan'),
    H('huangyueying', '黄月英', 'shu', 55, 54, 92, 920, 'strategist', 'wangzuo', '巧思机变，工械之才', 'qimou'),
    H('sunshangxiang', '孙尚香', 'shu', 82, 70, 66, 1000, 'archer', 'jianyu', '巾帼不让须眉', 'shenjian'),
    H('guanping', '关平', 'shu', 84, 76, 60, 1010, 'cavalry', 'jieying', '随父征战，忠勇可嘉', 'duzhan'),
    H('zhangbaoshu', '张苞', 'shu', 85, 76, 52, 1020, 'infantry', 'juesha', '将门虎子，锐气正盛', 'xianfeng'),
    H('madai', '马岱', 'shu', 85, 76, 60, 1020, 'cavalry', 'tieqi', '西凉俊杰，从兄征战', 'xiliang'),
    H('wangping', '王平', 'shu', 82, 80, 68, 1020, 'infantry', 'tiebi', '守法持重，稳如磐石', 'shoufa'),
    H('liaohua', '廖化', 'shu', 80, 74, 56, 990, 'infantry', 'jieying', '经历沧桑，老而弥坚', 'laojiang'),
    H('zhangyi', '张翼', 'shu', 78, 74, 62, 980, 'infantry', 'tiebi', '执法严明，坚守不移', 'jianshou'),
    H('yanyan', '严颜', 'shu', 86, 84, 58, 1050, 'infantry', 'juesha', '老将断头，义不受辱', 'laojiang'),
    H('fazheng', '法正', 'shu', 56, 54, 95, 950, 'strategist', 'guimou', '奇谋画策，蜀之羽翼', 'qimou'),
    H('huangquan', '黄权', 'shu', 78, 76, 74, 1000, 'infantry', 'wangzuo', '忠谏之士，进退有度', 'jianyan'),
    H('liyan', '李严', 'shu', 82, 78, 70, 1020, 'infantry', 'rende', '托孤重臣，督运粮草', 'buliang'),

    /* --- 曹魏 --- */
    H('caocao', '曹操', 'wei', 88, 82, 92, 1150, 'infantry', 'guwu', '乱世奸雄，唯才是举', 'jianxiong'),
    H('xiahoudun', '夏侯惇', 'wei', 92, 84, 58, 1100, 'cavalry', 'tieqi', '拔矢啖睛，刚烈无双', 'laojiang'),
    H('xiahousyuan', '夏侯渊', 'wei', 90, 80, 60, 1060, 'archer', 'jianyu', '三日五百，六日一千', 'xianfeng'),
    H('xuchu', '许褚', 'wei', 95, 86, 40, 1150, 'infantry', 'juesha', '虎痴护主，力能扛鼎', 'huchi'),
    H('dianwei', '典韦', 'wei', 96, 82, 38, 1120, 'infantry', 'juesha', '一夫当关，万夫莫开', 'yifu'),
    H('zhangliao', '张辽', 'wei', 93, 84, 72, 1100, 'cavalry', 'jieying', '威震逍遥津', 'xiaoyao'),
    H('xuhuang', '徐晃', 'wei', 89, 84, 62, 1080, 'infantry', 'tiebi', '治军严整，长驱直入', 'zhijun'),
    H('zhanghe', '张郃', 'wei', 88, 82, 64, 1060, 'infantry', 'jieying', '临阵巧变，善处营阵', 'qiaobian'),
    H('yujin', '于禁', 'wei', 84, 82, 60, 1020, 'infantry', 'tiebi', '持军严整，五子良将', 'jianshou'),
    H('yuejin', '乐进', 'wei', 85, 78, 55, 1010, 'cavalry', 'tieqi', '骁果敢战，每先登陷阵', 'xianfeng'),
    H('caoren', '曹仁', 'wei', 86, 90, 62, 1100, 'infantry', 'tiebi', '据守坚城，岿然不动', 'jushou'),
    H('caohong', '曹洪', 'wei', 82, 78, 52, 1000, 'cavalry', 'jieying', '舍命护主，忠勇可嘉', 'tiewei'),
    H('lidian', '李典', 'wei', 80, 76, 68, 980, 'archer', 'jianyu', '好学问，尚儒雅', 'jianshou'),
    H('guojia', '郭嘉', 'wei', 52, 50, 98, 920, 'strategist', 'guimou', '鬼才善谋，算无遗策', 'guicai'),
    H('xunyu', '荀彧', 'wei', 48, 52, 96, 900, 'strategist', 'wangzuo', '王佐之才，举贤任能', 'wangzuo'),
    H('simayi', '司马懿', 'wei', 66, 72, 99, 1020, 'strategist', 'huogong', '鹰视狼顾，隐忍待时', 'langgu'),
    H('jiaxu', '贾诩', 'wei', 50, 54, 97, 930, 'strategist', 'guimou', '毒士之谋，乱武天下', 'dushi'),
    H('chengyu', '程昱', 'wei', 46, 50, 94, 900, 'strategist', 'guimou', '性刚戾，善谋略', 'qimou'),
    H('dengai', '邓艾', 'wei', 88, 82, 78, 1080, 'infantry', 'juesha', '偷渡阴平，奇袭成都', 'qixi'),
    H('zhonghui', '钟会', 'wei', 84, 76, 90, 1040, 'strategist', 'guimou', '才略过人，志大心高', 'qimou'),
    H('guohuai', '郭淮', 'wei', 82, 78, 66, 1020, 'infantry', 'tiebi', '镇守陇右，屡拒蜀军', 'shoufa'),
    H('caozhen', '曹真', 'wei', 84, 80, 68, 1040, 'cavalry', 'tieqi', '虎豹骑统领，力拒北伐', 'baima'),
    H('pangde', '庞德', 'wei', 90, 82, 52, 1060, 'cavalry', 'juesha', '抬棺死战，宁死不降', 'duzhan'),
    H('simayan', '司马炎', 'jin', 80, 76, 88, 1100, 'infantry', 'wangzuo', '代魏称帝，三分归晋', 'wangzuo'),

    /* --- 东吴 --- */
    H('sunquan', '孙权', 'wu', 80, 78, 84, 1080, 'infantry', 'wangzuo', '生子当如孙仲谋', 'jianyan'),
    H('sunce', '孙策', 'wu', 94, 80, 66, 1100, 'cavalry', 'tieqi', '江东小霸王', 'xiaobawang'),
    H('zhouyu', '周瑜', 'wu', 72, 70, 98, 1020, 'strategist', 'huogong', '雄姿英发，羽扇纶巾', 'huoshen'),
    H('lusun', '鲁肃', 'wu', 58, 62, 92, 980, 'strategist', 'rende', '榻上策，联刘抗曹', 'jianyan'),
    H('lvmeng', '吕蒙', 'wu', 86, 80, 80, 1060, 'navy', 'jieying', '士别三日，刮目相看', 'baiyi'),
    H('luxun', '陆逊', 'wu', 70, 72, 97, 1040, 'strategist', 'huogong', '火烧连营，书生拜将', 'lianhuan'),
    H('ganning', '甘宁', 'wu', 91, 76, 58, 1060, 'navy', 'jieying', '锦帆贼，勇冠江东', 'jinfan'),
    H('huanggai', '黄盖', 'wu', 88, 84, 60, 1080, 'navy', 'huogong', '苦肉诈降，火攻赤壁', 'kurou'),
    H('taishici', '太史慈', 'wu', 92, 80, 60, 1060, 'archer', 'baibu', '弦不虚发，义守信诺', 'gongshen'),
    H('chengpu', '程普', 'wu', 85, 82, 62, 1040, 'navy', 'jianyu', '江东宿将，三世元勋', 'jianshou'),
    H('handang', '韩当', 'wu', 84, 78, 55, 1010, 'navy', 'jieying', '便弓马，有膂力', 'yongguan'),
    H('zhoutai', '周泰', 'wu', 87, 88, 48, 1080, 'infantry', 'tiebi', '护主负伤，身如刻画的', 'huzhu'),
    H('zhuran', '朱然', 'wu', 82, 76, 62, 1010, 'navy', 'jianyu', '临危不乱，名震敌国', 'tiewei'),
    H('lukang', '陆抗', 'wu', 82, 78, 85, 1030, 'strategist', 'guimou', '羊陆之交，吴之长城', 'qimou'),

    /* --- 群雄与割据 --- */
    H('lvbu', '吕布', 'qun', 100, 88, 30, 1250, 'cavalry', 'wushuang', '人中吕布，马中赤兔', 'wushuang'),
    H('diaochan', '貂蝉', 'qun', 60, 56, 88, 950, 'strategist', 'rende', '闭月之貌，连环之计', 'meiren'),
    H('dongzhuo', '董卓', 'qun', 88, 86, 60, 1150, 'infantry', 'juesha', '残暴不仁，汉室之贼', 'yongguan'),
    H('yuanshao', '袁绍', 'qun', 78, 74, 80, 1100, 'infantry', 'wangzuo', '四世三公，雄踞河北', 'jianyan'),
    H('yanliang', '颜良', 'qun', 93, 78, 45, 1080, 'cavalry', 'tieqi', '河北上将，勇冠三军', 'duzhan'),
    H('wenchou', '文丑', 'qun', 92, 76, 48, 1070, 'cavalry', 'jieying', '河北名将，有万夫之勇', 'duzhan'),
    H('gaolan', '高览', 'qun', 85, 78, 55, 1020, 'infantry', 'jieying', '河北四庭柱之一', 'yongguan'),
    H('chunyuqiong', '淳于琼', 'qun', 78, 70, 42, 980, 'infantry', 'juesha', '守乌巢，醉酒误事', 'jianshou'),
    H('zhangxiu', '张绣', 'qun', 86, 78, 62, 1030, 'cavalry', 'jieying', '北地枪王，宛城之变', 'beidiqiang'),
    H('jiling', '纪灵', 'qun', 85, 78, 52, 1020, 'infantry', 'juesha', '袁术大将，善使三尖刀', 'duzhan'),
    H('gongsunzan', '公孙瓒', 'qun', 85, 76, 62, 1050, 'cavalry', 'tieqi', '白马义从，威震塞外', 'baima'),
    H('zhangjiao', '张角', 'qun', 55, 60, 96, 1050, 'strategist', 'yaoshu', '苍天已死，黄天当立', 'taiping'),
    H('zhangbao', '张宝', 'qun', 78, 70, 80, 1000, 'infantry', 'yaoshu', '地公将军', 'qimou'),
    H('zhangliang', '张梁', 'qun', 80, 72, 76, 1010, 'infantry', 'yaoshu', '人公将军', 'yongguan'),
    H('bocai', '波才', 'qun', 80, 72, 70, 990, 'infantry', 'jieying', '黄巾骁将', 'yongguan'),
    H('guanhai', '管亥', 'qun', 86, 78, 45, 1030, 'infantry', 'juesha', '黄巾猛士，力战太史慈', 'duzhan'),
    H('huaxiong', '华雄', 'qun', 91, 80, 45, 1060, 'infantry', 'juesha', '温酒斩华雄', 'duzhan'),
    H('liru', '李儒', 'qun', 50, 52, 94, 950, 'strategist', 'guimou', '董卓谋士，心狠手辣', 'dushi'),
    H('xurong', '徐荣', 'qun', 84, 78, 62, 1020, 'archer', 'jianyu', '玄菟勇士，善战有谋', 'jianshou'),
    H('lijue', '李傕', 'qun', 82, 74, 52, 1010, 'cavalry', 'tieqi', '西凉飞熊，挟天子乱朝', 'baima'),
    H('guosi', '郭汜', 'qun', 82, 72, 50, 1000, 'cavalry', 'jieying', '西凉悍将', 'yongguan'),
    H('zhangji', '张济', 'qun', 80, 74, 55, 990, 'infantry', 'juesha', '西凉军阀', 'laojiang'),
    H('fanchou', '樊稠', 'qun', 79, 72, 50, 980, 'infantry', 'jieying', '西凉诸将之一', 'jianshou'),
    H('liuzhang', '刘璋', 'qun', 60, 66, 70, 980, 'infantry', 'wangzuo', '暗弱之主，坐守益州', 'shoufa'),
    H('zhangren', '张任', 'qun', 88, 80, 72, 1050, 'archer', 'baibu', '忠义死节，射落落凤坡', 'shenjian'),
    H('menghuo', '孟获', 'qun', 94, 86, 45, 1120, 'infantry', 'manhou', '南中蛮王，七擒七纵', 'manwang'),
    H('zhurong', '祝融夫人', 'qun', 88, 74, 58, 1050, 'archer', 'feidao', '火神后裔，飞刀无敌', 'feidao')
  ];

  var HERO_MAP = {};
  HEROES.forEach(function (h) {
    h.skillDefs = h.skills.map(function (k) { return SKILLS[k]; }).filter(Boolean);
    h.skillDef = h.skillDefs[0] || null;      // 旧接口：主技
    h.traitDef = TRAITS[h.trait] || null;
    HERO_MAP[h.id] = h;
  });

  /* ------------------------------------------------------------------ *
   * 无名的兵
   *
   * 名将终究有限，兵马却可以无穷。演义里跟着将旗冲杀的，
   * 多半是这些没有姓名的营伍：有的悍不畏死，有的善射远取，
   * 有的只堪搬运粮草。战力与带兵数一律低于名将，用作大军的骨架 ——
   * 「名将带大军」的层次感由此而来：斩将易，破军难。
   * ------------------------------------------------------------------ */
  function S(id, name, faction, troop, atk, def, int, hp, skills, trait) {
    return {
      id: id, name: name, faction: faction,
      atk: atk, def: def, int: int, hp: hp,
      troop: troop, skills: skills, skill: skills[0],
      quote: '', trait: trait || null,
      levy: true,                       // 非名将：不进图鉴、不可招募
      troops: [troop]
    };
  }

  var LEVIES = [
    /* 曹魏与中原 */
    S('s_hubaoji', '虎豹骑', 'wei', 'cavalry', 74, 68, 34, 4600, ['tieqi', 'pojun'], 'baima'),
    S('s_qingzhou', '青州兵', 'wei', 'infantry', 62, 64, 28, 3600, ['juesha'], null),
    S('s_huben', '虎贲卫', 'wei', 'infantry', 68, 74, 36, 4200, ['juesha', 'tiebi'], null),
    S('s_qiangnu', '强弩手', 'wei', 'archer', 64, 56, 40, 3400, ['jianyu'], null),
    S('s_tuntian', '屯田兵', 'wei', 'wagon', 44, 58, 30, 3000, ['tiebi'], null),
    /* 蜀汉 */
    S('s_baier', '白毦兵', 'shu', 'infantry', 70, 72, 38, 4400, ['juesha'], null),
    S('s_wudang', '无当飞军', 'shu', 'archer', 66, 64, 46, 3800, ['fubing', 'jianyu'], null),
    S('s_xiliang', '西凉铁骑', 'shu', 'cavalry', 72, 64, 30, 4400, ['tieqi'], 'xiliang'),
    S('s_daodun', '刀盾兵', 'shu', 'infantry', 58, 70, 26, 3600, ['tiebi'], null),
    /* 东吴 */
    S('s_danyang', '丹阳兵', 'wu', 'infantry', 68, 66, 34, 4200, ['pojun'], null),
    S('s_louchuan', '楼船士', 'wu', 'navy', 64, 66, 38, 4000, ['shuaiyan'], null),
    S('s_jiefan', '解烦兵', 'wu', 'infantry', 66, 68, 32, 4000, ['juesha'], null),
    S('s_gongnu', '弓弩营', 'wu', 'archer', 62, 54, 42, 3400, ['jianyu', 'huojian'], null),
    /* 群雄与边地 */
    S('s_xianzhen', '陷阵营', 'qun', 'infantry', 76, 74, 36, 4800, ['guishen', 'juesha'], null),
    S('s_baima', '白马义从', 'qun', 'cavalry', 70, 60, 44, 4200, ['jianyu', 'tieqi'], 'baima'),
    S('s_tengjia', '藤甲兵', 'qun', 'infantry', 66, 82, 24, 3800, ['tiebi'], null),
    S('s_huangjin', '黄巾力士', 'qun', 'infantry', 60, 58, 44, 3600, ['yaoshu'], null),
    S('s_manbing', '南中蛮兵', 'qun', 'infantry', 68, 62, 26, 3800, ['manhou'], 'manwang'),
    S('s_shanyue', '山越猎手', 'qun', 'archer', 60, 58, 34, 3200, ['fubing'], null),
    S('s_changqiang', '长枪兵', 'qun', 'infantry', 60, 68, 30, 3600, ['juesha'], null),
    S('s_moushi', '幕府谋士', 'qun', 'scholar', 46, 48, 76, 2800, ['weibao', 'raoluan'], null),
    S('s_junyi', '随军医官', 'qun', 'scholar', 40, 52, 70, 2600, ['rende'], null),
    S('s_zizhong', '辎重营', 'qun', 'wagon', 42, 62, 34, 3400, ['tiebi'], null),
    S('s_xinmu', '新募之兵', 'qun', 'infantry', 48, 52, 24, 2400, ['juesha'], null)
  ];

  LEVIES.forEach(function (h) {
    h.skillDefs = h.skills.map(function (k) { return SKILLS[k]; }).filter(Boolean);
    h.skillDef = h.skillDefs[0] || null;
    h.traitDef = TRAITS[h.trait] || null;
    HERO_MAP[h.id] = h;
  });

  // 交给规则引擎，让特性真正参与战斗计算
  if (core && core.registerTraits) core.registerTraits(TRAITS);

  data.TRAITS = TRAITS;
  data.traitOf = function (heroId) {
    var h = HERO_MAP[heroId];
    return h && h.trait ? TRAITS[h.trait] : null;
  };

  /* ------------------------------------------------------------------ *
   * 章节与 100 关（按三国演义时间线）
   * ------------------------------------------------------------------ */

  var CHAPTERS = [
    {
      id: 1, name: '黄巾之乱', scene: 'plains', from: 1, to: 7, fort: false,
      story: '东汉末年，朝纲败坏，张角兄弟以太平道聚众数十万，黄巾遍野。刘关张于涿郡桃园结义，誓讨黄巾。',
      names: ['涿郡起兵', '广宗围城', '长社火攻', '颍川平乱', '南阳攻略', '冀州扫荡', '黄巾覆灭'],
      pool: ['zhangbao', 'zhangliang', 'bocai', 'guanhai', 'zhangjiao'], boss: 'zhangjiao'
    },
    {
      id: 2, name: '讨董联军', scene: 'city', from: 8, to: 14, fort: true,
      story: '董卓乱政，焚毁洛阳。关东诸侯结成联军讨董，汜水关前华雄逞威，虎牢关下三英战吕布。',
      names: ['汜水关', '虎牢关', '荥阳追击', '洛阳焚城', '汴水截击', '阳人之战', '联军瓦解'],
      pool: ['huaxiong', 'xurong', 'lijue', 'guosi', 'zhangji', 'fanchou', 'liru'], boss: 'dongzhuo'
    },
    {
      id: 3, name: '群雄割据', scene: 'plains', from: 15, to: 21, fort: true,
      story: '联军瓦解，诸侯各据一方。界桥之上公孙瓒白马折戟，下邳城中吕布殒命白门楼。',
      names: ['界桥之战', '徐州救援', '濮阳之战', '宛城之变', '下邳围城', '白门楼', '小沛争夺'],
      pool: ['yanliang', 'wenchou', 'gaolan', 'zhangxiu', 'jiling', 'gongsunzan', 'chunyuqiong'], boss: 'lvbu'
    },
    {
      id: 4, name: '官渡决战', scene: 'water', from: 22, to: 28, fort: true,
      story: '袁绍拥兵十万南下，曹操以寡敌众。白马延津挫敌锋，乌巢一把火，烧尽河北粮草。',
      names: ['白马之围', '延津诱敌', '乌巢劫粮', '官渡对峙', '仓亭之战', '黎阳之战', '袁营崩溃'],
      pool: ['yanliang', 'wenchou', 'gaolan', 'chunyuqiong', 'zhanghe', 'yuanshao'], boss: 'yuanshao'
    },
    {
      id: 5, name: '定鼎河北', scene: 'plains', from: 29, to: 35, fort: true,
      story: '袁氏兄弟阋墙，曹操北征。邺城、南皮相继而下，白狼山斩蹋顿，河北遂定。',
      names: ['邺城攻坚', '南皮之战', '壶关之战', '白狼山', '柳城追击', '河北平定', '铜雀台'],
      pool: ['yanliang', 'wenchou', 'gaolan', 'gongsunzan', 'chunyuqiong', 'yuanshao'], boss: 'gongsunzan'
    },
    {
      id: 6, name: '赤壁鏖兵', scene: 'water', from: 36, to: 42, fort: false,
      story: '曹操南下，荆州望风而降。孙刘联盟于赤壁，周瑜一把火，樯橹灰飞烟灭。',
      names: ['博望坡', '长坂坡', '江东决策', '三江口', '赤壁火攻', '乌林追击', '华容道'],
      pool: ['xiahoudun', 'xuchu', 'zhangliao', 'xuhuang', 'caoren', 'yujin', 'lidian', 'chengyu'], boss: 'caocao'
    },
    {
      id: 7, name: '荆襄争锋', scene: 'water', from: 43, to: 49, fort: true,
      story: '赤壁之后，孙刘各取荆襄。南郡、江陵几度易手，荆南四郡望风归附。',
      names: ['南郡争夺', '江陵攻防', '夷陵争夺', '公安之战', '襄阳对峙', '长沙平定', '荆南四郡'],
      pool: ['zhouyu', 'lusun', 'lvmeng', 'ganning', 'huanggai', 'handang', 'chengpu'], boss: 'zhouyu'
    },
    {
      id: 8, name: '西川入蜀', scene: 'mountain', from: 50, to: 56, fort: true,
      story: '刘璋暗弱，请刘备入川御敌。葭萌关反目，落凤坡凤雏折翼，雒城血战，成都受降。',
      names: ['葭萌关', '涪水关', '雒城之战', '绵竹关', '成都受降', '巴西之战', '汉中门户'],
      pool: ['zhangren', 'yanyan', 'huangquan', 'liyan', 'fazheng', 'liuzhang'], boss: 'liuzhang'
    },
    {
      id: 9, name: '汉中争锋', scene: 'mountain', from: 57, to: 63, fort: true,
      story: '曹操西征张鲁，刘备进图汉中。定军山黄忠斩夏侯渊，汉水赵云空营退敌。',
      names: ['定军山', '汉水对峙', '阳平关', '米仓山', '南郑攻防', '斜谷之战', '汉中称王'],
      pool: ['xiahousyuan', 'zhanghe', 'xuhuang', 'caohong', 'guohuai', 'caozhen', 'yujin'], boss: 'xiahousyuan'
    },
    {
      id: 10, name: '襄樊水淹', scene: 'water', from: 64, to: 70, fort: true,
      story: '关羽北伐，水淹七军，威震华夏。然吕蒙白衣渡江，麦城路上英雄末路。',
      names: ['樊城围攻', '水淹七军', '偃城之战', '麦城悲歌', '襄阳解围', '荆州易主', '夷陵前夜'],
      pool: ['caoren', 'yujin', 'pangde', 'xuhuang', 'zhanghe', 'lvmeng', 'luxun'], boss: 'caoren'
    },
    {
      id: 11, name: '夷陵烽火', scene: 'mountain', from: 71, to: 77, fort: false,
      story: '先主东征为报弟仇，深入吴境六七百里。陆逊火烧连营，蜀军几乎全军覆没。',
      names: ['秭归进军', '猇亭对峙', '火烧连营', '马鞍山', '退守白帝', '永安托孤', '蜀吴复盟'],
      pool: ['luxun', 'ganning', 'handang', 'zhoutai', 'zhuran', 'lvmeng', 'chengpu'], boss: 'luxun'
    },
    {
      id: 12, name: '北伐中原', scene: 'mountain', from: 78, to: 84, fort: true,
      story: '诸葛武侯六出祁山，街亭一失痛失良机，陈仓坚城难下，木门道张郃殒身。',
      names: ['祁山出师', '街亭之失', '陈仓攻防', '卤城之战', '木门道', '渭南对峙', '五丈原'],
      pool: ['simayi', 'zhanghe', 'guohuai', 'caozhen', 'dengai', 'zhonghui', 'xuhuang'], boss: 'simayi'
    },
    {
      id: 13, name: '五丈原', scene: 'mountain', from: 85, to: 91, fort: true,
      story: '上方谷一场骤雨浇灭烈火，五丈原上将星陨落。死诸葛吓走生仲达，蜀军全身而退。',
      names: ['武功水', '北原之战', '上方谷', '星落五丈原', '蜀军撤退', '沓中之战', '剑阁备战'],
      pool: ['simayi', 'dengai', 'zhonghui', 'guohuai', 'caozhen'], boss: 'zhonghui'
    },
    {
      id: 14, name: '三分归晋', scene: 'city', from: 92, to: 100, fort: true,
      story: '邓艾偷渡阴平，刘禅出降；王濬楼船下益州，金陵王气黯然收。六十年纷争，终归于一。',
      names: ['汉中失守', '绵竹血战', '成都归降', '西陵之战', '建业水战', '石头城', '晋灭吴', '天下归晋', '山河一统'],
      pool: ['dengai', 'zhonghui', 'simayan', 'lukang', 'zhoutai', 'zhuran', 'guohuai'], boss: 'simayan'
    }
  ];

  var TOTAL_LEVELS = 100;

  function chapterOf(level) {
    for (var i = 0; i < CHAPTERS.length; i++) {
      if (level >= CHAPTERS[i].from && level <= CHAPTERS[i].to) return CHAPTERS[i];
    }
    return CHAPTERS[CHAPTERS.length - 1];
  }

  /* ------------------------------------------------------------------ *
   * 解锁：过关可招致的武将
   * ------------------------------------------------------------------ */

  var UNLOCKS = [
    { lv: 2, id: 'zhaoyun' }, { lv: 5, id: 'zhugeliang' }, { lv: 8, id: 'maichao' },
    { lv: 11, id: 'huangzhong' }, { lv: 14, id: 'jiangwei' }, { lv: 17, id: 'weiyan' },
    { lv: 20, id: 'pangtong' }, { lv: 23, id: 'huangyueying' }, { lv: 26, id: 'sunshangxiang' },
    { lv: 29, id: 'madai' }, { lv: 32, id: 'guanping' }, { lv: 35, id: 'zhangbao' },
    { lv: 38, id: 'wangping' }, { lv: 41, id: 'liaohua' }, { lv: 44, id: 'zhangyi' },
    { lv: 47, id: 'yanyan' }, { lv: 50, id: 'fazheng' }, { lv: 53, id: 'huangquan' },
    { lv: 56, id: 'liyan' }, { lv: 59, id: 'menghuo' }, { lv: 62, id: 'zhurong' },
    { lv: 65, id: 'zhangliao' }, { lv: 68, id: 'xiahoudun' }, { lv: 71, id: 'ganning' },
    { lv: 74, id: 'taishici' }, { lv: 77, id: 'luxun' }, { lv: 80, id: 'lvmeng' },
    { lv: 83, id: 'xuchu' }, { lv: 86, id: 'zhanghe' }, { lv: 89, id: 'xuhuang' },
    { lv: 92, id: 'dengai' }, { lv: 95, id: 'guojia' }, { lv: 98, id: 'lvbu' }
  ];

  var STARTERS = ['liubei', 'guanyu', 'zhangfei'];

  /* ------------------------------------------------------------------ *
   * 关卡配置（难度 1→100 递增）
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
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // 敌军缺员时的补充：优先拉同一势力的其他将领，避免一水儿的杂兵
  var FILLER = ['bocai', 'guanhai', 'gaolan', 'chunyuqiong', 'zhangji', 'fanchou',
    'zhangbao', 'zhangliang', 'jiling', 'handang', 'zhangxiu', 'lijue'];

  /** 从同一阵营中抽调援军，让敌阵始终是「有名有姓」的对手 */
  function sameFaction(bossId, exclude) {
    var boss = HERO_MAP[bossId];
    if (!boss) return [];
    return HEROES.filter(function (h) {
      return h.faction === boss.faction && h.id !== bossId && exclude.indexOf(h.id) < 0;
    }).map(function (h) { return h.id; });
  }

  function pickEnemies(rnd, pool, count, bossId, useBoss) {
    var out = [];
    if (useBoss && bossId) out.push(bossId);
    var bag = pool.filter(function (x) { return x !== bossId; });
    var guard = 0;
    while (out.length < count && guard++ < 80) {
      if (bag.length) {
        out.push(bag.splice(Math.floor(rnd() * bag.length), 1)[0]);
        continue;
      }
      // 本关菁英已尽，从同阵营调兵
      var pool_ = sameFaction(bossId, out);
      if (pool_.length) {
        out.push(pool_[Math.floor(rnd() * pool_.length)]);
        continue;
      }
      var f = FILLER[Math.floor(rnd() * FILLER.length)];
      if (out.indexOf(f) < 0) out.push(f);
    }
    return out;
  }

  /**
   * 随军营伍：依战场环境择兵，水战调楼船，山地调飞军，旷野调铁骑。
   * 同一营伍最多出两队，免得满眼都是一模一样的番号。
   */
  function levyPoolFor(scene) {
    switch (scene) {
      case 'water':
        return ['s_louchuan', 's_gongnu', 's_danyang', 's_jiefan', 's_qiangnu',
          's_moushi', 's_zizhong', 's_xinmu'];
      case 'mountain':
        return ['s_wudang', 's_shanyue', 's_daodun', 's_changqiang', 's_manbing',
          's_tuntian', 's_xinmu', 's_junyi'];
      case 'city':
        return ['s_huben', 's_changqiang', 's_qiangnu', 's_daodun', 's_zizhong',
          's_tuntian', 's_xinmu', 's_moushi'];
      default:
        return ['s_hubaoji', 's_xiliang', 's_baima', 's_changqiang', 's_qingzhou',
          's_baier', 's_danyang', 's_xianzhen', 's_qiangnu', 's_zizhong',
          's_moushi', 's_xinmu'];
    }
  }

  function pickLevies(rnd, ch, count) {
    var pool = levyPoolFor(ch.scene);
    var used = {}, out = [];
    var guard = 0;
    while (out.length < count && guard++ < 120) {
      var id = pool[Math.floor(rnd() * pool.length)];
      if ((used[id] || 0) >= 2) continue;
      used[id] = (used[id] || 0) + 1;
      out.push(id);
    }
    return out;
  }

  /**
   * 敌军兵种编成：主将用演义设定，其余按战场环境混编
   *   water    —— 舟师为主，辅以弓弩压船
   *   mountain —— 山地难行骑兵，多为步卒与弓手
   *   city     —— 攻守皆赖重甲与攻城辎重
   */
  function enemyTroopFor(ch, hero, k, rnd) {
    if (k === 0) return hero.troop;              // 主将依演义设定
    if (hero.troop === 'scholar' || hero.troop === 'strategist') return hero.troop;
    var mix;
    switch (ch.scene) {
      case 'water': mix = ['navy', 'navy', 'archer', 'infantry', 'navy', 'scholar', 'cavalry']; break;
      case 'mountain': mix = ['infantry', 'archer', 'infantry', 'scholar', 'wagon', 'archer']; break;
      case 'city': mix = ['infantry', 'wagon', 'archer', 'infantry', 'cavalry', 'scholar']; break;
      default: mix = ['cavalry', 'infantry', 'archer', 'cavalry', 'wagon', 'scholar'];
    }
    var base = mix[(k - 1 + Math.floor(rnd() * mix.length)) % mix.length];
    // 武将若不具备该兵种资质，退回其本行
    if (core.troopsFor(hero).indexOf(base) < 0) return hero.troop;
    return base;
  }

  /**
   * 生成第 level 关（1..100）的完整配置。确定性：同一关永远一样。
   */
  /* ------------------------------------------------------------------ *
   * 战役地图配方
   *
   * 每一章节对应演义里的一片真实战场：
   *   中原——沃野千里，偶有丘陵疏林
   *   河北——黄河济水横贯，两岸连营
   *   荆襄——长江天堑，湖沼星罗，楼船列阵
   *   川陕——群山闭锁，唯余栈道一线可通
   *
   * 地图并非规整矩形：外缘依地形雕出自然轮廓，
   * 山群之间一定留有羊肠小道，深水之上必有桥、渡或连环战船。
   * ------------------------------------------------------------------ */

  /**
   * 地图放大后的配方适配。
   * 配方里的 wave / amp / width 是按「二十来格的小图」调出来的绝对值，
   * 原样搬到五十格的大图上，河会细成一条线、弯也看不出起伏。
   * 这里按地图相对基准边长（20 格）的倍率整体放大；
   * at / x / y / r 都是比例量，天生自适应，无需处理。
   */
  function scaleSpec(s) {
    var k = (s.cols || 20) / 20;
    if (k <= 1.15) return;
    var kw = Math.pow(k, 0.72);   // 宽度次线性放大，否则河会宽得离谱
    function sc(o) {
      if (!o) return;
      if (o.wave) o.wave = o.wave * k;
      if (o.amp) o.amp = o.amp * k;
      if (o.width) o.width = Math.max(1, Math.round(o.width * kw));
    }
    var i;
    for (i = 0; i < (s.rivers || []).length; i++) sc(s.rivers[i]);
    for (i = 0; i < (s.ranges || []).length; i++) {
      sc(s.ranges[i]);
      // 单格宽的山脊在大图上活像一道栅栏，至少给两格厚度
      if (s.ranges[i].width < 2) s.ranges[i].width = 2;
    }
    // 山大了，穿山小道也得相应多开几条，否则大军绕不过来
    if (s.trails) s.trails = Math.round(s.trails * 1.8);
  }

  /* ------------------------------------------------------------------ *
   * 名战役剧本：天气与地形皆按演义情节定制
   *
   * 普通关卡的地图配方只认「章节战场」，同章各关难免雷同；
   * 这些演义名局则各有各的天时地利：
   *   长社的夜风、三江口的大雾、赤壁的东南风、华容道的泥泞、
   *   樊城的连绵秋雨、连营的冲天火风、上方谷那场浇灭汉室的骤雨。
   * ------------------------------------------------------------------ */
  var SCENARIOS = {
    3: {
      tag: '火攻长社', note: '贼军依草结营，夜风正紧——一把火可燎原',
      weather: { first: 'wind', pool: ['wind', 'clear', 'cloudy', 'wind'] },
      spec: { grass: 0.42, forest: 0.10, downs: 0.10 }
    },
    24: {
      tag: '夜袭乌巢', note: '月黑风高，正宜纵火焚粮——烧尽袁军粮草，十万大军自溃',
      weather: {
        first: 'cloudy', pool: ['cloudy', 'wind', 'clear'],
        script: { 4: 'wind' }, notes: { 4: '夜风骤起，火借风势——乌巢粮营烈焰冲天！' }
      },
      vtype: 'annihilate',
      camps: [{ x: 0.24, y: 0.24, owner: 'enemy' }, { x: 0.33, y: 0.31, owner: 'enemy' }]
    },
    39: {
      tag: '草船借箭', note: '大雾漫江，三尺之外不辨人马——弓弩尽失其准',
      weather: { first: 'fog', pool: ['fog', 'fog', 'cloudy', 'clear'] }
    },
    40: {
      tag: '赤壁火攻', note: '连环战船锁住大江——只等东南风起，一把火烧尽曹军楼船！',
      weather: {
        first: 'clear', pool: ['clear', 'cloudy', 'clear'],
        script: { 3: 'wind' }, notes: { 3: '东南风大起！火借风势，樯橹灰飞烟灭！' }
      },
      vtype: 'annihilate', theme: 'chibi'
    },
    41: {
      tag: '乌林追击', note: '烈火焚余，泽国泥泞——曹军人困马乏，正好穷追',
      weather: { first: 'cloudy', pool: ['rain', 'cloudy', 'rain', 'clear'] },
      spec: { marsh: 0.18 }
    },
    42: {
      tag: '华容道', note: '道路泥泞，人马皆陷——关羽横刀立马，只为义释曹操',
      weather: { first: 'rain', pool: ['rain', 'rain', 'cloudy', 'wind'] },
      spec: { marsh: 0.26, trails: 3 }
    },
    65: {
      tag: '水淹七军', note: '秋雨连绵，汉水暴涨——七军困于泽国，于禁乞降，庞德殒身',
      weather: { first: 'rain', pool: ['rain', 'rain', 'cloudy', 'rain', 'clear'] },
      vtype: 'annihilate',
      hazards: [
        { x: 0.42, y: 0.38, r: 0.13, kind: 'flood' },
        { x: 0.63, y: 0.33, r: 0.10, kind: 'flood' },
        { x: 0.5, y: 0.56, r: 0.09, kind: 'flood' }
      ]
    },
    73: {
      tag: '火烧连营', note: '七百里连营皆在林间——风起时，一点星火可燎遍吴营',
      weather: { first: 'wind', pool: ['wind', 'clear', 'wind', 'cloudy'] },
      vtype: 'annihilate',
      spec: { forest: 0.38 }
    },
    79: {
      tag: '街亭之失', note: '当道下寨已迟，山上无水——死守孤山，等待大军回援',
      weather: { first: 'fog', pool: ['fog', 'cloudy', 'clear', 'cloudy'] },
      vtype: 'survive'
    },
    87: {
      tag: '上方谷', note: '葫芦谷口已布好干柴——引魏军入谷，火起之日便是司马懿的死期。然而天意……',
      weather: { first: 'clear', pool: ['clear', 'cloudy', 'clear', 'wind'] },
      vtype: 'boss',
      flags: { rainDouse: true }
    },
    88: {
      tag: '星落五丈原', note: '秋风萧瑟，五丈原上将星摇摇欲坠',
      weather: { first: 'wind', pool: ['wind', 'cloudy', 'wind', 'clear'] },
      theme: 'dusk'
    }
  };

  /** 章节战场各有各的节令，调色与常见天象皆由此定 */
  var CHAPTER_THEME = {
    1: 'spring', 2: 'scorched', 3: 'autumn', 4: 'lateautumn', 5: 'earlywinter',
    6: 'riverland', 7: 'waterland', 8: 'shu', 9: 'goldautumn', 10: 'autumnrain',
    11: 'deepforest', 12: 'desolate', 13: 'autumndusk', 14: 'jiangnan'
  };

  /** 各战场的天象池：北方多风雪，江东多雨雾，蜀地常雾 */
  var SCENE_WEATHER = {
    plains: ['clear', 'clear', 'cloudy', 'wind', 'rain', 'clear', 'snow'],
    city: ['clear', 'cloudy', 'wind', 'rain', 'clear', 'fog'],
    water: ['clear', 'wind', 'rain', 'fog', 'clear', 'wind', 'rain'],
    mountain: ['clear', 'fog', 'cloudy', 'snow', 'clear', 'rain']
  };

  function buildMapSpec(level, ch, rnd) {
    var t = (level - 1) / (TOTAL_LEVELS - 1);
    var idx = (level - ch.from) % ch.names.length;
    var battle = ch.names[idx];
    var scenario = SCENARIOS[level] || null;
    // 战场放大到约 48×42 ~ 56×50（面积约为原先的 4.5~6 倍）。
    // 图一大，山河才铺得开：长江能画出宽窄与九曲，山峦能连绵起伏，
    // 各处地形也不必再挤作一团。
    var cols = Math.round(48 + t * 8);        // 48 → 56
    var rows = Math.round(42 + t * 8);        // 42 → 50

    var spec = {
      seed: 1000 + level * 37,
      cols: cols, rows: rows,
      shape: 'irregular',
      base: 'plain',
      downs: 0.14, hill: 0.08, forest: 0.14, marsh: 0, grass: 0.24,
      rivers: [], lakes: [], ranges: [], peaks: [], walls: [], ships: [],
      cities: [], camps: [], trails: 0
    };

    // 一眼就能看出「这是哪场仗」的地标
    function has(word) { return battle.indexOf(word) >= 0; }
    function sgn(pick) { return rnd() < 0.5 ? pick : -pick; }

    switch (ch.id) {
      case 1: // 黄巾之乱 —— 中原旷野，丘壑疏林
        spec.downs = 0.12; spec.hill = 0.06; spec.forest = 0.16; spec.grass = 0.28;
        spec.shape = 'irregular';
        if (idx % 3 === 1) spec.rivers.push({ axis: 'v', at: 0.55 + sgn(0.05), amp: 1.2, wave: 10, width: 1, bridges: [Math.floor(rows * 0.45)], fords: [Math.floor(rows * 0.75)] });
        if (has('长社')) spec.camps.push({ x: 0.5, y: 0.35, owner: 'enemy' });
        break;

      case 2: // 讨董联军 —— 汜水虎牢，关隘重重
        spec.downs = 0.16; spec.hill = 0.12; spec.forest = 0.12; spec.grass = 0.2;
        if (has('汜水') || has('虎牢') || has('荥阳')) {
          spec.walls.push({ axis: 'h', at: 0.36, from: 0.08, to: 0.92, gap: 0.5 });
          spec.camps.push({ x: 0.5, y: 0.28, owner: 'enemy' });
          spec.peaks.push({ x: 0.14, y: 0.3, r: 0.09 });
          spec.peaks.push({ x: 0.86, y: 0.32, r: 0.08 });
        } else if (has('洛阳')) {
          spec.cities.push({ x: 0.5, y: 0.22, owner: 'enemy' });
          spec.rivers.push({ axis: 'v', at: 0.68, width: 1, bridges: [Math.floor(rows * 0.6)], fords: [Math.floor(rows * 0.3)] });
        } else {
          spec.rivers.push({ axis: 'h', at: 0.58, width: 2, bridges: [Math.floor(cols * 0.3), Math.floor(cols * 0.72)], fords: [Math.floor(cols * 0.5)] });
        }
        break;

      case 3: // 群雄割据 —— 界桥、下邳、濮阳
        spec.downs = 0.15; spec.hill = 0.09; spec.forest = 0.13; spec.grass = 0.26;
        spec.shape = idx % 2 ? 'oval' : 'irregular';
        if (has('界桥')) {
          spec.rivers.push({ axis: 'h', at: 0.5, width: 2, bridges: [Math.floor(cols * 0.28), Math.floor(cols * 0.68)], fords: [Math.floor(cols * 0.5)] });
        } else if (has('下邳') || has('白门楼')) {
          spec.cities.push({ x: 0.5, y: 0.24, owner: 'enemy' });
          spec.lakes.push({ x: 0.3, y: 0.62, r: 0.13 });
          spec.rivers.push({ axis: 'v', at: 0.62, width: 1, bridges: [Math.floor(rows * 0.42)], fords: [Math.floor(rows * 0.7)] });
        } else {
          spec.camps.push({ x: 0.42, y: 0.3, owner: 'enemy' });
        }
        break;

      case 4: // 官渡 —— 黄河天堑，乌巢粮仓
        spec.downs = 0.13; spec.hill = 0.07; spec.grass = 0.3; spec.forest = 0.1;
        spec.rivers.push({ axis: 'h', at: 0.46, width: 2, amp: 1.6, wave: 12, bridges: [Math.floor(cols * 0.32), Math.floor(cols * 0.7)], fords: [Math.floor(cols * 0.5)] });
        if (has('乌巢')) spec.camps.push({ x: 0.22, y: 0.26, owner: 'enemy' });
        else if (has('白马') || has('延津')) spec.camps.push({ x: 0.7, y: 0.3, owner: 'enemy' });
        else spec.camps.push({ x: 0.5, y: 0.26, owner: 'enemy' });
        if (has('仓亭')) spec.lakes.push({ x: 0.62, y: 0.6, r: 0.12 });
        break;

      case 5: // 定鼎河北 —— 邺城坚壁，白狼山险
        spec.downs = 0.16; spec.hill = 0.12; spec.forest = 0.12; spec.grass = 0.24;
        if (has('白狼') || has('柳城')) {
          spec.peaks.push({ x: 0.3, y: 0.4, r: 0.13 });
          spec.peaks.push({ x: 0.72, y: 0.36, r: 0.11 });
          spec.trails = 2;
        } else {
          spec.cities.push({ x: 0.5, y: 0.2, owner: 'enemy' });
          spec.walls.push({ axis: 'h', at: 0.28, from: 0.2, to: 0.8, gap: 0.5 });
        }
        spec.rivers.push({ axis: 'v', at: 0.76, width: 1, bridges: [Math.floor(rows * 0.5)], fords: [Math.floor(rows * 0.8)] });
        break;

      case 6: // 赤壁 —— 长江横绝，连环楼船铺江
        spec.shape = 'coast'; spec.coastAt = 0.84;
        spec.downs = 0.1; spec.hill = 0.06; spec.forest = 0.16; spec.marsh = 0.06; spec.grass = 0.28;
        // 一道宽江把战场劈成南北两岸
        spec.rivers.push({ axis: 'h', at: 0.5, width: 3, amp: 1.0, wave: 14, bridges: [], fords: [Math.floor(cols * 0.14)] });
        spec.ships.push({ x: 0.44, y: 0.5, w: Math.round(cols * 0.32), h: 1 });
        if (has('赤壁') || has('三江口') || has('乌林')) {
          spec.camps.push({ x: 0.28, y: 0.3, owner: 'enemy' });
          spec.camps.push({ x: 0.68, y: 0.32, owner: 'enemy' });
        } else if (has('华容')) {
          spec.marsh = 0.16;
          spec.ranges.push({ axis: 'v', at: 0.3, width: 1, amp: 1.4, wave: 12 });
          spec.trails = 2;
          spec.peaks.push({ x: 0.72, y: 0.42, r: 0.1 });
        } else if (has('长坂')) {
          spec.rivers.push({ axis: 'v', at: 0.34, width: 1, bridges: [Math.floor(rows * 0.55)], fords: [Math.floor(rows * 0.28)] });
        } else {
          spec.camps.push({ x: 0.5, y: 0.28, owner: 'enemy' });
        }
        break;

      case 7: // 荆襄 —— 江陵水网，湖沼环绕
        spec.shape = idx % 2 ? 'coast' : 'irregular'; spec.coastAt = 0.8;
        spec.downs = 0.12; spec.hill = 0.07; spec.forest = 0.16; spec.marsh = 0.08; spec.grass = 0.26;
        spec.lakes.push({ x: 0.26, y: 0.55, r: 0.13 });
        spec.lakes.push({ x: 0.74, y: 0.44, r: 0.1 });
        spec.rivers.push({ axis: 'v', at: 0.5, width: 2, bridges: [Math.floor(rows * 0.34), Math.floor(rows * 0.66)], fords: [Math.floor(rows * 0.5)] });
        spec.cities.push({ x: 0.5, y: 0.2, owner: 'enemy' });
        if (has('江陵') || has('南郡')) spec.walls.push({ axis: 'h', at: 0.26, from: 0.24, to: 0.76, gap: 0.5 });
        break;

      case 8: // 西川 —— 剑门栈道，一夫当关
        spec.shape = 'irregular';
        spec.downs = 0.18; spec.hill = 0.18; spec.forest = 0.18; spec.grass = 0.18;
        spec.ranges.push({ axis: 'h', at: 0.34 + (idx % 3) * 0.05, amp: 1.6, wave: 11, width: 2 });
        spec.trails = 2;
        spec.peaks.push({ x: 0.18, y: 0.6, r: 0.09 });
        spec.rivers.push({ axis: 'v', at: 0.66, width: 1, bridges: [Math.floor(rows * 0.7)], fords: [Math.floor(rows * 0.42)] });
        if (has('葭萌') || has('涪水') || has('绵竹') || has('剑阁')) {
          spec.camps.push({ x: 0.5, y: 0.22, owner: 'enemy' });
        } else if (has('成都')) {
          spec.cities.push({ x: 0.5, y: 0.18, owner: 'enemy' });
        }
        break;

      case 9: // 汉中 —— 定军山下，汉水之滨
        spec.shape = idx % 3 === 0 ? 'oval' : 'irregular';
        spec.downs = 0.16; spec.hill = 0.2; spec.forest = 0.16; spec.grass = 0.18;
        if (has('定军')) {
          spec.peaks.push({ x: 0.34, y: 0.36, r: 0.16 });
          spec.peaks.push({ x: 0.7, y: 0.5, r: 0.1 });
        } else {
          spec.ranges.push({ axis: 'h', at: 0.42, amp: 1.5, wave: 12, width: 2 });
          spec.trails = 2;
        }
        spec.rivers.push({ axis: 'v', at: 0.6, width: 2, bridges: [Math.floor(rows * 0.46)], fords: [Math.floor(rows * 0.72)] });
        if (has('阳平') || has('南郑')) spec.camps.push({ x: 0.5, y: 0.2, owner: 'enemy' });
        break;

      case 10: // 襄樊 —— 汉水暴涨，水淹七军
        spec.shape = 'coast'; spec.coastAt = 0.78;
        spec.downs = 0.1; spec.hill = 0.05; spec.forest = 0.1; spec.marsh = 0.12; spec.grass = 0.3;
        spec.rivers.push({ axis: 'h', at: 0.52, width: 3, amp: 1.4, wave: 12, bridges: [Math.floor(cols * 0.2)], fords: [Math.floor(cols * 0.62), Math.floor(cols * 0.4)] });
        spec.lakes.push({ x: 0.4, y: 0.68, r: 0.15 });
        spec.ships.push({ x: 0.6, y: 0.52, w: Math.round(cols * 0.2), h: 1 });
        spec.cities.push({ x: 0.5, y: 0.18, owner: 'enemy' });
        if (has('麦城')) spec.camps.push({ x: 0.74, y: 0.62, owner: 'enemy' });
        break;

      case 11: // 夷陵 —— 连营七百里，山林尽可燃
        spec.downs = 0.14; spec.hill = 0.16; spec.forest = 0.28; spec.grass = 0.16;
        spec.ranges.push({ axis: 'v', at: 0.34, amp: 1.2, wave: 13, width: 1 });
        spec.ranges.push({ axis: 'v', at: 0.7, amp: 1.2, wave: 13, width: 1 });
        spec.trails = 2; spec.trailAxis = 'h';
        spec.rivers.push({ axis: 'h', at: 0.6, width: 2, bridges: [Math.floor(cols * 0.45)], fords: [Math.floor(cols * 0.78)] });
        if (has('连营') || has('猇亭') || has('马鞍')) {
          spec.camps.push({ x: 0.34, y: 0.3, owner: 'enemy' });
          spec.camps.push({ x: 0.62, y: 0.34, owner: 'enemy' });
        }
        break;

      case 12: // 北伐 —— 祁山栈道，渭水之畔
        spec.shape = idx % 2 ? 'oval' : 'irregular';
        spec.downs = 0.18; spec.hill = 0.2; spec.forest = 0.16; spec.grass = 0.16;
        spec.ranges.push({ axis: 'h', at: 0.4, amp: 1.8, wave: 10, width: 2 });
        spec.trails = 2;
        spec.rivers.push({ axis: 'v', at: 0.72, width: 2, bridges: [Math.floor(rows * 0.5)], fords: [Math.floor(rows * 0.3)] });
        if (has('街亭')) spec.peaks.push({ x: 0.56, y: 0.5, r: 0.14 });
        if (has('陈仓')) spec.cities.push({ x: 0.44, y: 0.2, owner: 'enemy' });
        if (has('五丈原') || has('渭南')) spec.camps.push({ x: 0.62, y: 0.62, owner: 'enemy' });
        break;

      case 13: // 五丈原 —— 上方谷葫芦口，武功水蜿蜒
        spec.downs = 0.16; spec.hill = 0.22; spec.forest = 0.18; spec.grass = 0.14;
        spec.ranges.push({ axis: 'h', at: 0.28, amp: 1.4, wave: 9, width: 2 });
        spec.ranges.push({ axis: 'h', at: 0.66, amp: 1.4, wave: 9, width: 2 });
        spec.trails = 3;
        spec.rivers.push({ axis: 'v', at: 0.5, width: 1, bridges: [Math.floor(rows * 0.48)], fords: [Math.floor(rows * 0.72)] });
        if (has('上方谷')) {
          // 葫芦口：两侧绝壁夹一道窄口
          spec.peaks.push({ x: 0.28, y: 0.48, r: 0.11 });
          spec.peaks.push({ x: 0.7, y: 0.48, r: 0.11 });
          spec.camps.push({ x: 0.5, y: 0.48, owner: 'enemy' });
        }
        if (has('剑阁') || has('沓中')) spec.camps.push({ x: 0.5, y: 0.18, owner: 'enemy' });
        break;

      case 14: // 三分归晋 —— 楼船下益州，金陵王气收
        spec.shape = idx % 2 ? 'coast' : 'irregular'; spec.coastAt = 0.82;
        spec.downs = 0.12; spec.hill = 0.08; spec.forest = 0.14; spec.marsh = 0.06; spec.grass = 0.26;
        spec.rivers.push({ axis: 'h', at: 0.54, width: 3, amp: 1.2, wave: 14, bridges: [Math.floor(cols * 0.24)], fords: [Math.floor(cols * 0.52)] });
        spec.ships.push({ x: 0.66, y: 0.54, w: Math.round(cols * 0.26), h: 1 });
        if (has('建业') || has('石头') || has('西陵') || has('晋灭吴')) {
          spec.cities.push({ x: 0.5, y: 0.16, owner: 'enemy' });
          spec.walls.push({ axis: 'h', at: 0.24, from: 0.22, to: 0.78, gap: 0.5 });
        } else if (has('绵竹') || has('成都') || has('汉中')) {
          spec.camps.push({ x: 0.44, y: 0.24, owner: 'enemy' });
          spec.ranges.push({ axis: 'h', at: 0.4, width: 1, amp: 1.4, wave: 11 });
          spec.trails = 2;
        }
        break;

      default:
        break;
    }

    /* ---- 剧本关卡：地形与天时按演义情节覆盖 ---- */
    if (scenario) {
      var so = scenario.spec || {}, sk;
      for (sk in so) spec[sk] = so[sk];
      if (scenario.camps) {
        for (var sc = 0; sc < scenario.camps.length; sc++) spec.camps.push(scenario.camps[sc]);
      }
      if (scenario.theme) spec.theme = scenario.theme;
    }

    /* ---- 天时：每关开局各不相同 ---- */
    var wpool = SCENE_WEATHER[ch.scene] || SCENE_WEATHER.plains;
    spec.weather = {
      first: wpool[idx % wpool.length],
      pool: wpool
    };
    if (scenario && scenario.weather) {
      spec.weather.first = scenario.weather.first;
      if (scenario.weather.pool) spec.weather.pool = scenario.weather.pool;
      if (scenario.weather.script) spec.weather.script = scenario.weather.script;
      if (scenario.weather.notes) spec.weather.notes = scenario.weather.notes;
    }

    /* ---- 章节节令：同一片战场，不同关卡也有早晚阴晴之别 ---- */
    if (!spec.theme) spec.theme = CHAPTER_THEME[ch.id] || 'spring';

    /* ---- 左右镜像：同章相邻两关，山河走向相反，一眼便知换了战场 ---- */
    if (idx % 2 === 1) mirrorSpec(spec);

    scaleSpec(spec);
    return spec;
  }

  /** 东西镜像一份地图配方：山川湖泊营垒全部左右翻转，关卡外观不再千篇一律 */
  function mirrorSpec(spec) {
    spec.mirrored = true;
    var i;
    for (i = 0; i < (spec.rivers || []).length; i++) {
      var r = spec.rivers[i];
      if (r.axis === 'v') {
        r.at = 1 - r.at;
      } else if (r.bridges) {
        // 东西镜像后，桥所在的列也要跟着翻过去
        r.bridges = r.bridges.map(function (b) { return (spec.cols - 1) - b; });
      }
      if (r.axis === 'h' && r.fords) {
        r.fords = r.fords.map(function (b) { return (spec.cols - 1) - b; });
      }
    }
    for (i = 0; i < (spec.ranges || []).length; i++) {
      if (spec.ranges[i].axis === 'v') spec.ranges[i].at = 1 - spec.ranges[i].at;
    }
    function fx(p) { if (p && p.x !== undefined) p.x = 1 - p.x; }
    (spec.lakes || []).forEach(fx);
    (spec.peaks || []).forEach(fx);
    (spec.cities || []).forEach(fx);
    (spec.camps || []).forEach(fx);
    (spec.ships || []).forEach(fx);
    (spec.flag) && fx(spec.flag);
    for (i = 0; i < (spec.walls || []).length; i++) {
      var w = spec.walls[i];
      if (w.axis === 'h') {
        var from = w.from, to = w.to;
        w.from = 1 - to; w.to = 1 - from;
      } else {
        w.at = 1 - w.at;
      }
    }
  }

  /** 按胜利条件补上据点：夺旗关需要数处敌寨，斩将关只需一座中军大营 */
  function placeObjectives(spec, victory, level, ch, rnd) {
    function free(x, y) {
      for (var i = 0; i < spec.cities.length; i++) if (spec.cities[i].x === x) return false;
      for (var j = 0; j < spec.camps.length; j++) if (spec.camps[j].x === x) return false;
      return true;
    }
    function addCamp(x, y, owner) { spec.camps.push({ x: x, y: y, owner: owner }); }

    var need = victory.type === 'capture' ? 3 + (level > 70 ? 1 : 0) : 0;
    var tries = 0;
    while (spec.cities.length + spec.camps.length < need && tries++ < 200) {
      var x = 0.12 + rnd() * 0.76, y = 0.16 + rnd() * 0.42;
      if (!free(x, y)) continue;
      addCamp(x, y, y > 0.62 ? 'player' : 'enemy');
    }
    // 每关至少给敌军一座中军营，作为 visual 的进攻目标
    if (!spec.camps.length && !spec.cities.length) {
      addCamp(0.5, 0.24, 'enemy');
    }

    // 攻城关：敌阵腹地一座坚城，攻入并守住方算破城
    if (victory.type === 'city') {
      spec.cities.push({ x: 0.34 + rnd() * 0.32, y: 0.15, owner: 'enemy', capital: true });
      // 城下另有两座营寨拱卫，硬攻正面得不偿失
      addCamp(0.22 + rnd() * 0.1, 0.30, 'enemy');
      addCamp(0.68 + rnd() * 0.1, 0.30, 'enemy');
      addCamp(0.5, 0.86, 'player');
    }
    // 夺旗关：敌军帅旗插在中军，夺得后须送回本阵
    if (victory.type === 'flag') {
      spec.flag = { x: 0.38 + rnd() * 0.24, y: 0.22 };
      spec.camps.push({ x: 0.5, y: 0.84, owner: 'player', home: true });
    }
    return spec;
  }

  function levelConfig(level) {
    var ch = chapterOf(level);
    var rnd = mulberry32(hashSeed('sanguo-level|' + level));
    var isLast = (level === ch.to);
    var t = (level - 1) / (TOTAL_LEVELS - 1);          // 全局进度 0..1

    var nameIdx = (level - ch.from) % ch.names.length;
    var battleName = ch.names[nameIdx];

    // 敌方规模与强度：让对手配得上演义里的分量
    // 对照「一路向前 + 适度练兵」的玩家练度（Lv9@30关 / Lv14@50关 / Lv26@100关）
    //
    // 演义里从没有三五个将佐对砍的仗：官渡十万、赤壁数十万。
    // 这里把敌军拆成两层骨架 —— 有名有姓的将领，加上跟着将旗冲杀的营伍。
    // 兵马战力远逊名将，负责把战线撑起来；斩将易，破军难。
    // 指数取 >1：前段温和（新手能站稳），后段陡升（老手也得出一身汗）
    var heroCount = Math.max(2, Math.round(3 + Math.pow(t, 1.2) * 6));     // 3 → 9 员名将
    var levyCount = Math.max(1, Math.round(2 + Math.pow(t, 1.15) * 8));    // 2 → 10 队兵马
    var enemyLevel = Math.max(2, Math.round(2 + Math.pow(t, 1.25) * 26));  // 2 → 28
    var hpScale = 1 + Math.pow(t, 1.3) * 0.45;                             // 1.0 → 1.45
    var useBoss = isLast || (level >= 20 && (level - ch.from) % 4 === 3);

    // 胜利条件：随进度递进——先学会砍人，再学会用计与调兵
    //   歼灭 → 斩将 → 攻城 → 夺旗 → 坚守/护送 → 混合硬仗
    var vtype;
    if (level <= 18) vtype = 'annihilate';
    else if (level <= 38) vtype = (level % 2 === 0) ? 'boss' : 'annihilate';
    else if (level <= 58) vtype = ['city', 'boss', 'capture', 'annihilate'][level % 4];
    else if (level <= 78) vtype = ['flag', 'survive', 'boss', 'city', 'escort', 'capture'][level % 6];
    else vtype = ['boss', 'flag', 'city', 'capture'][level % 4];
    if (isLast) vtype = 'boss';
    // 名战役按演义定制胜负：赤壁要焚尽曹军，水淹七军要全歼于禁七军
    var scenario = SCENARIOS[level] || null;
    if (scenario && scenario.vtype) vtype = scenario.vtype;
    // 斩将关必须真有一位主将可斩，否则全军杀尽也判不了胜 —— 只能耗到回合尽头
    if (vtype === 'boss') useBoss = true;

    /*
     * 同一关号的「坚守八回合」与「攻入敌城」根本不是一回事：
     * 守住一隅只须缩成一团，攻城夺旗却要穿透整条战线。
     * 因此按目标类型反调敌军强度，整条难度曲线才平滑递增——
     * 不会出现「第 65 关比第 90 关还难」的倒挂。
     */
    var VTUNE = {
      annihilate: { hero: 1.00, levy: 1.00, lvl: 1.00, hp: 1.00 },
      boss: { hero: 0.82, levy: 0.88, lvl: 0.95, hp: 0.92 },
      capture: { hero: 1.25, levy: 1.30, lvl: 1.06, hp: 1.12 },
      city: { hero: 0.78, levy: 0.84, lvl: 0.93, hp: 0.90 },
      flag: { hero: 0.76, levy: 0.82, lvl: 0.92, hp: 0.88 },
      survive: { hero: 1.95, levy: 1.95, lvl: 1.18, hp: 1.24 },
      escort: { hero: 1.60, levy: 1.60, lvl: 1.12, hp: 1.18 }
    };
    var tune = VTUNE[vtype] || VTUNE.annihilate;
    heroCount = Math.max(2, Math.round(heroCount * tune.hero));
    levyCount = Math.max(1, Math.round(levyCount * tune.levy));
    enemyLevel = Math.max(2, Math.round(enemyLevel * tune.lvl));
    hpScale = hpScale * tune.hp;

    // 地图：按演义战场地形定制
    var victory = { type: vtype };
    var mapSpec = buildMapSpec(level, ch, rnd);
    placeObjectives(mapSpec, victory, level, ch, rnd);

    // 坚守关要撑得更久些：缩成一团就能过的关，算不上难关
    if (vtype === 'survive') victory.turns = 10 + Math.floor(t * 8);
    // 回合上限要在 victory.turns 定下来之后才算，
    // 否则坚守关读到的是 undefined，算出来是个 NaN 上限。
    // 战场放大后行军更费时，整体上调，别让玩家输在跑路上。
    var turnLimit = vtype === 'survive' ? (victory.turns + 2)
      : Math.max(46, 74 - Math.floor(t * 20));
    // 攻城与夺旗要穿透整条战线、还要调兵护旗，得多给些回合才谈得上「用计」
    if (vtype === 'city' || vtype === 'flag') turnLimit += 14;
    if (vtype === 'escort') {
      // 护送目的地选在敌方腹地一处可站立的格子上，进入关卡后由 game 校准
      victory.target = { x: mapSpec.cols - 2, y: 1 };
    }

    var ids = pickEnemies(rnd, ch.pool, heroCount, ch.boss, useBoss);
    var enemies = ids.map(function (id, k) {
      var hero = HERO_MAP[id];
      return {
        heroId: id,
        level: enemyLevel,
        // 主将比从将高一级待遇：血量与技能全面强化
        hot: (useBoss && k === 0),
        isBoss: (useBoss && k === 0),
        troop: enemyTroopFor(ch, hero, k, rnd)
      };
    });

    // 兵马：随主将同征，按战场环境择营伍
    var levies = pickLevies(rnd, ch, levyCount);
    levies.forEach(function (id) {
      enemies.push({
        heroId: id, level: enemyLevel, levy: true,
        troop: HERO_MAP[id].troop, isBoss: false
      });
    });

    return {
      index: level,
      chapter: ch.id,
      chapterName: ch.name,
      name: battleName,
      title: '第 ' + level + ' 关 · ' + battleName,
      story: ch.story,
      scene: ch.scene,
      scenario: scenario,
      seed: 1000 + level * 37,
      cols: mapSpec.cols, rows: mapSpec.rows,
      map: mapSpec,                    // 交给 core.generateMap 的地形配方
      terrain: ch.scene,
      fort: ch.fort,
      victory: victory,
      turnLimit: turnLimit,
      enemies: enemies,
      enemyLevel: enemyLevel,
      hpScale: hpScale,
      rewards: {
        exp: 20 + level * 7,
        gold: 30 + level * 9,
        unlock: unlockAt(level)
      }
    };
  }

  function unlockAt(level) {
    for (var i = 0; i < UNLOCKS.length; i++) {
      if (UNLOCKS[i].lv === level) return UNLOCKS[i].id;
    }
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 导出
   * ------------------------------------------------------------------ */

  data.SKILLS = SKILLS;
  data.HEROES = HEROES;
  data.HERO_MAP = HERO_MAP;
  data.CHAPTERS = CHAPTERS;
  data.SCENARIOS = SCENARIOS;
  data.UNLOCKS = UNLOCKS;
  data.STARTERS = STARTERS;
  data.TOTAL_LEVELS = TOTAL_LEVELS;
  data.chapterOf = chapterOf;
  data.levelConfig = levelConfig;
  data.unlockAt = unlockAt;
  data.hero = function (id) { return HERO_MAP[id]; };

  return data;
});
