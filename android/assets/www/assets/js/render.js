/* ==========================================================================
 * render.js — 斜 45° 等距（isometric）战场渲染
 *
 * 投影：屏幕坐标 centerX = OX + (x - y) * TW/2， centerY = OY + (x + y) * TH/2
 * 逆变换：x = ((px-OX)/(TW/2) + (py-OY)/(TH/2)) / 2，y = ((py-OY)/(TH/2) - (px-OX)/(TW/2)) / 2
 *
 * 绘制顺序按 d = x + y 从远到近，保证遮挡关系正确。
 * 地形与静态高亮绘制到离屏图层缓存，每帧只重绘单位、动画与特效。
 *
 * 美术参考商业 SRPG（火纹 / 梦幻模拟战 / 曹操传）的地图语言：
 *   地块顶面 = 柔和渐变 + 逐格微抖动；崖体 = 竖向渐变 + 岩层线；
 *   相邻高地在其低处的顶面投下环境遮蔽（AO），形成山谷感；
 *   山 = 双峰锥体 + 雪线；林 = 多层松树 + 落影；路 = 按邻接连通的路带。
 * ========================================================================== */
(function (root) {
  'use strict';

  var SG = root.SG = root.SG || {};
  var core = SG.core;
  var render = {};

  /* ------------------------------------------------------------------ *
   * 配色（顶面 / 暗侧面 / 亮侧面）
   * ------------------------------------------------------------------ */

  var PAL = {
    light: {
      plain:  ['#d9c894', '#a98f5e', '#c4ad7a'],
      grass:  ['#8fca62', '#4e8a3a', '#6cab4e'],
      downs:  ['#b7c17c', '#7d8a4e', '#9aa663'],
      forest: ['#4f9a48', '#2c6a30', '#3d8139'],
      hill:   ['#c2a468', '#8a6f42', '#a58956'],
      path:   ['#cdb488', '#94795a', '#b2996e'],
      marsh:  ['#7f9a6a', '#4e6644', '#658057'],
      river:  ['#4d9fd6', '#1d6494', '#3584b4'],
      lake:   ['#3d8fc9', '#175a8a', '#2b74a6'],
      ford:   ['#7fb8d4', '#4a85a4', '#639fbc'],
      bridge: ['#c99e62', '#8f6a38', '#ac8450'],
      ship:   ['#a98457', '#6f5433', '#8c6b41'],
      city:   ['#d3c8ac', '#93876c', '#b3a789'],
      camp:   ['#a9c47c', '#6f8c4e', '#89a763'],
      road:   ['#e0d0a6', '#b3a17a', '#c9b890'],
      wall:   ['#b5ad9c', '#7a7364', '#968e7d'],
      mountain: ['#a89e88', '#6b6353', '#8d8470']
    },
    dark: {
      plain:  ['#6e6a55', '#4a4739', '#5c5847'],
      grass:  ['#4f6b42', '#33472b', '#415838'],
      downs:  ['#625d49', '#423f31', '#534e3d'],
      forest: ['#3d5c36', '#263c22', '#31492c'],
      hill:   ['#5e5a48', '#403d30', '#4e4a3b'],
      path:   ['#6a6349', '#48432f', '#59533c'],
      marsh:  ['#4a5636', '#303923', '#3d472c'],
      river:  ['#356b8c', '#1f4459', '#294f66'],
      lake:   ['#2c5d80', '#183a52', '#224b67'],
      ford:   ['#3d6d8c', '#254a63', '#315b78'],
      bridge: ['#6d5738', '#493a24', '#5a482d'],
      ship:   ['#5f4c2e', '#413420', '#4e3d26'],
      city:   ['#6a6659', '#474439', '#585446'],
      camp:   ['#587040', '#3a4c2a', '#485c35'],
      road:   ['#78725a', '#504c3b', '#615c48'],
      wall:   ['#615d52', '#413e35', '#504d43'],
      mountain: ['#5a5449', '#3c382f', '#4b463b']
    }
  };

  /** 每种地形相对高度（单位：标准块高） */
  var ELEV = {
    plain: 0, road: 0.02, grass: 0.05, bridge: 0.07, ship: 0.10,
    forest: 0.15, downs: 0.22, camp: 0.24, hill: 0.44, path: 0.34,
    city: 0.60, mountain: 0.80, wall: 0.88,
    ford: -0.20, river: -0.24, marsh: -0.07, lake: -0.34
  };

  /** 可通行小路：这些地形之间要连成一条路带 */
  var PATHY = { road: 1, bridge: 1, city: 1, camp: 1, path: 1, ford: 1 };

  /** 逐帧波动的水面（静态层里只铺底色，波光在动效层叠加） */
  var WATERKEYS = { river: 1, lake: 1, ford: 1 };

  var SIDE = {
    player: { ring: '#3b82f6', deep: '#1d4ed8', soft: 'rgba(59,130,246,.30)', flag: '#2f6fed' },
    enemy: { ring: '#e0524f', deep: '#a12724', soft: 'rgba(224,82,79,.30)', flag: '#d13b38' }
  };

  /* ------------------------------------------------------------------ *
   * 季节主题：同一套地貌，不同节令各有其色。
   * 主题只描述「各组地形往哪个色调偏」，基础色仍出自 PAL，
   * 明暗两版共用同一组偏移（暗色版幅度减半，免得糊成一团）。
   * ------------------------------------------------------------------ */
  var THEME_GROUPS = {
    veg: { grass: 1, forest: 1, marsh: 1, downs: 1 },
    ground: { plain: 1, road: 1, path: 1 },
    water: { river: 1, lake: 1, ford: 1 },
    rock: { hill: 1, mountain: 1, wall: 1 },
    built: { bridge: 1, ship: 1, camp: 1, city: 1 }
  };

  var THEMES = {
    /* 中原暮春——草长莺飞 */
    spring:      { veg: [0, 10, 6],    water: [0, 6, 10] },
    /* 两京焦土——董卓一把火烧过 */
    scorched:    { veg: [-26, 4, -16], ground: [12, -4, -12], rock: [8, 0, -8], water: [-6, -8, -4] },
    /* 中原秋——麦浪金黄 */
    autumn:      { veg: [26, 2, -20],  ground: [10, 0, -8], rock: [10, 0, -8] },
    /* 官渡深秋——草木摇落 */
    lateautumn:  { veg: [30, 4, -24],  ground: [12, -2, -10], water: [-4, -8, -6], rock: [12, 2, -12] },
    /* 河北初冬——霜色初染 */
    earlywinter: { veg: [-12, 2, 18],  ground: [8, 4, 12], water: [10, 14, 18], rock: [10, 8, 14] },
    /* 大江夏汛——水阔天低 */
    riverland:   { veg: [-8, 8, -4],   water: [-10, -6, 12] },
    /* 荆襄水乡——河湖青碧 */
    waterland:   { veg: [-4, 8, 2],    water: [6, 4, -6] },
    /* 蜀山苍翠——层峦叠障 */
    shu:         { veg: [-14, 4, 0],   ground: [-6, 2, -4], rock: [-8, 2, -6] },
    /* 汉中金秋 */
    goldautumn:  { veg: [34, 6, -24],  ground: [14, 2, -6], rock: [12, 2, -10] },
    /* 襄樊秋雨——铅云低垂 */
    autumnrain:  { veg: [-12, -6, 2],  ground: [-8, -6, 2], water: [4, 6, 10], rock: [-8, -6, 2] },
    /* 夷陵盛夏——林深似海 */
    deepforest:  { veg: [-22, -2, -8], ground: [-10, -4, -2] },
    /* 陇上萧瑟——风沙漫道 */
    desolate:    { veg: [6, -8, -14],  ground: [6, -4, -10], rock: [8, -2, -12] },
    /* 五丈原秋暮——残阳如血 */
    autumndusk:  { veg: [28, 4, -14],  ground: [16, 4, -4], water: [14, 8, 2], rock: [16, 4, -8] },
    /* 江南暮春——草长莺飞又一村 */
    jiangnan:    { veg: [4, 14, 8],    water: [8, 10, 12] },
    /* 赤壁夜战——江面映着冲天火光 */
    chibi:       { veg: [-6, 2, 0],    ground: [10, 2, -4], water: [20, 4, -10], rock: [12, 2, -6] },
    /* 将星黄昏——暮色四合 */
    dusk:        { veg: [16, 2, -8],   ground: [12, 4, -6], water: [16, 10, 4], rock: [14, 4, -8] }
  };

  /** 同一主题下的微变体：同章四关，色调各有先后阴晴 */
  var THEME_VARIANTS = [
    [0, 0, 0], [8, 0, -6], [-6, 4, 8], [4, -6, 10]
  ];

  var themeName = '', themeVariant = 0;
  var themeCache = null, themeCacheKey = '';
  render.setTheme = function (name, variant) {
    themeName = name || '';
    themeVariant = variant || 0;
  };

  function shiftHex(col, dr, dg, db) {
    if (col.charAt(0) !== '#') return col;
    var n = parseInt(col.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + dr));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + dg));
    var b = Math.max(0, Math.min(255, (n & 255) + db));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  /** 当前主题下的完整调色板（按明暗与变体缓存） */
  function themePal(dark) {
    var key = themeName + '|' + themeVariant + '|' + (dark ? 'd' : 'l');
    if (themeCacheKey === key) return themeCache;
    var base = dark ? PAL.dark : PAL.light;
    var mod = THEMES[themeName];
    if (!mod) { themeCache = base; themeCacheKey = key; return base; }
    var vd = THEME_VARIANTS[themeVariant % THEME_VARIANTS.length];
    var dim = dark ? 0.55 : 1;
    var out = {}, k;
    for (k in base) {
      var g = null;
      if (THEME_GROUPS.veg[k]) g = mod.veg;
      else if (THEME_GROUPS.ground[k]) g = mod.ground;
      else if (THEME_GROUPS.water[k]) g = mod.water;
      else if (THEME_GROUPS.rock[k]) g = mod.rock;
      else if (THEME_GROUPS.built[k]) g = mod.built || mod.ground;
      if (!g) { out[k] = base[k]; continue; }
      out[k] = base[k].map(function (c) {
        return shiftHex(c, Math.round((g[0] + vd[0]) * dim),
          Math.round((g[1] + vd[1]) * dim), Math.round((g[2] + vd[2]) * dim));
      });
    }
    themeCache = out; themeCacheKey = key;
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 图片缓存
   * ------------------------------------------------------------------ */

  var imgCache = {};
  function heroImage(id) {
    if (imgCache[id]) return imgCache[id];
    var img = new Image();
    img.src = 'assets/img/heroes/' + id + '.jpg';
    imgCache[id] = img;
    return img;
  }
  render.heroImage = heroImage;

  var sceneCache = {};
  function sceneImage(name) {
    if (!name) return null;
    if (sceneCache[name]) return sceneCache[name];
    var img = new Image();
    img.src = 'assets/img/scenes/' + name + '.jpg';
    sceneCache[name] = img;
    return img;
  }
  render.sceneImage = sceneImage;

  /* ------------------------------------------------------------------ *
   * 小工具
   * ------------------------------------------------------------------ */

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /** 稳定的伪随机（同一格每帧一致） */
  function rnd2(x, y) {
    var n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** 提亮/压暗颜色；支持 '#rrggbb' 与 'rgb(r,g,b)' 两种输入 */
  function shade(col, amt) {
    var r, g, b;
    if (col.charAt(0) === '#') {
      var n = parseInt(col.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      var m = col.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return col;
      r = +m[1]; g = +m[2]; b = +m[3];
    }
    r = Math.max(0, Math.min(255, Math.round(r + amt)));
    g = Math.max(0, Math.min(255, Math.round(g + amt)));
    b = Math.max(0, Math.min(255, Math.round(b + amt)));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ------------------------------------------------------------------ *
   * 渲染器
   * ------------------------------------------------------------------ */

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, root.devicePixelRatio || 1);

    var state0 = null;
    var tw = 30, th = 15;          // 菱形宽 / 高
    var cssW = 0, cssH = 0;        // CSS 像素尺寸
    var OX = 0, OY = 0;            // 投影原点（tile 0,0 的中心）
    var cam = { x: 0, y: 0, z: 1 };
    var dprEff = dpr;              // 实际用于画布的采样率（大图时会低于 dpr）
    var zFit = 1;                  // 整图入屏的缩放比

    var anims = [];       // 移动动画
    var floaters = [];    // 飘字
    var flashes = [];     // 范围闪光
    var lunges = [];      // 突刺
    var shakes = [];      // 受击抖动
    var skillFx = [];     // 武将技特效：一计一式，各有其形
    var speed = 1;

    var base = document.createElement('canvas');
    var bctx = base.getContext('2d');
    var baseKey = '';

    var hoverTile = null;
    var hoverIds = {};    // 指针下重叠的候选单位（用于提示可循环选择）

    /* ---------------- 坐标 ---------------- */

    function centerX(x, y) { return OX + (x - y) * tw / 2; }
    function centerY(x, y) { return OY + (x + y) * th / 2; }

    function elev(key) { return (ELEV[key] || 0) * tw * 0.5; }

    /** 该格高度图的原始势（0..0.9），供山体形态与高度浮动取用 */
    function hgtAt(x, y) {
      if (!state0 || !state0.height) return 0.5;
      var v = state0.height[core.idx(state0, x, y)];
      return v === undefined ? 0.5 : Math.max(0, v);
    }

    /**
     * 该格的实际抬升：地形基准 × 高度图浮动。
     * 只靠地形类型定高，同是丘陵便处处等高；乘上高度图后，
     * 山峦丘陵才有「高低不平」的错落感。
     */
    function tileElev(x, y, key) {
      var base = elev(key);
      if (base <= 0 || !state0 || !state0.height) return base;
      return base * (0.74 + hgtAt(x, y) * 0.52);
    }

    function keyAt(x, y) {
      if (!state0) return 'plain';
      if (!core.inBounds(state0, x, y)) return null;
      return core.TERRAIN[state0.map[core.idx(state0, x, y)]].key;
    }

    function elevAt(x, y) {
      var k = keyAt(x, y);
      return k ? tileElev(x, y, k) : 0;
    }

    /** 地块顶面中心（含高度） */
    function topXY(x, y) {
      return { cx: centerX(x, y), cy: centerY(x, y) - elevAt(x, y) };
    }

    function topY(x, y) {
      var k = keyAt(x, y);
      return centerY(x, y) - elev(k || 'plain');
    }

    function pal(key) {
      var p = themePal(isDark());
      return p[key] || p.plain;
    }

    function diamondPath(c, cx, cy, kx, ky) {
      kx = kx === undefined ? 1 : kx;
      ky = ky === undefined ? 1 : ky;
      var hw = tw / 2 * kx, hh = th / 2 * ky;
      c.beginPath();
      c.moveTo(cx, cy - hh);
      c.lineTo(cx + hw, cy);
      c.lineTo(cx, cy + hh);
      c.lineTo(cx - hw, cy);
      c.closePath();
    }

    /* ---------------- 布局 ---------------- */

    var vw = 0, vh = 0;            // 视口（画布容器）尺寸

    function layout(state, maxW, maxH) {
      var n = state.cols + state.rows;
      vw = maxW; vh = maxH;

      /*
       * 战场放大后不再把整图硬塞进一屏——那样格子会被压到二十来像素，
       * 山是山、水是水全看不出来，「重做美术」也就无从谈起。
       * 这里给一个能看清地形细节的基准格宽，地图自然大过视口，
       * 靠拖动浏览沙场；需要纵览全局时一键缩到全图（见 fitScale）。
       */
      var base2 = 52;
      if (maxW < 380) base2 = 46;          // 窄屏手机
      else if (maxW > 900) base2 = 58;     // 桌面大屏
      tw = Math.round(base2);
      th = tw / 2;

      var padTop = tw * 0.62, padBottom = tw * 0.62;
      OX = (state.rows - 1) * tw / 2 + tw / 2 + tw * 0.28;
      OY = padTop;
      cssW = Math.ceil((n) * tw / 2 + tw * 0.56);
      cssH = Math.ceil((n) * th / 2 + padTop + padBottom + tw * 0.2);

      /*
       * 分层：主画布只是视口大小的窗口（相机在其中取景），
       * 整张战场画在离屏层 base 上，按需搬进窗口。
       * 早先把主画布开成整张地图的尺寸，溢出容器的部分会被 CSS 裁掉，
       * 相机位移便全然失效——只有左上角一块可见，就是那么回事。
       *
       * 战场动辄上千万像素，离屏层超出上限就降采样：
       * 地形是远景、线条粗，肉眼几乎无感。
       */
      var eff = dpr;
      var maxPix = 9.0e6;
      var want = cssW * cssH * eff * eff;
      if (want > maxPix) eff = Math.max(1, Math.sqrt(maxPix / (cssW * cssH)));
      dprEff = eff;

      canvas.style.width = vw + 'px';
      canvas.style.height = vh + 'px';
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      base.width = Math.round(cssW * dprEff);
      base.height = Math.round(cssH * dprEff);
      baseKey = '';
      zFit = Math.min(vw / cssW, vh / cssH);
      clampCam();
    }

    /** 整张地图刚好装进视口的缩放比（「全图」用） */
    function fitScale() { return (cssW && cssH) ? Math.min(vw / cssW, vh / cssH) : 1; }

    /** 缩放：允许缩到全图（zFit），放大上限保持 2.6 */
    function zoomAt(factor, sx, sy) {
      var zmin = Math.min(1, fitScale());
      var nz = Math.max(zmin, Math.min(2.6, cam.z * factor));
      if (Math.abs(nz - cam.z) < 1e-4) return;
      var wx = (sx - cam.x) / cam.z, wy = (sy - cam.y) / cam.z;
      cam.z = nz;
      cam.x = sx - wx * nz;
      cam.y = sy - wy * nz;
      clampCam();
    }

    /** 一键纵览全局 */
    function zoomFit() {
      cam.z = fitScale();
      cam.x = (vw - cssW * cam.z) / 2;
      cam.y = (vh - cssH * cam.z) / 2;
      clampCam();
    }

    function resize(state, maxW, maxH) {
      state0 = state;
      layout(state, maxW, maxH);
    }

    function clampCam() {
      var z = cam.z;
      // 画布是整张地图，视口只是其中一窗：允许把画面推进视野。
      // 缩到全图时地图会小于视口，此时居中留白，别贴着左上角。
      var w = cssW * z, h = cssH * z;
      cam.x = (w <= vw) ? (vw - w) / 2 : Math.max(vw - w, Math.min(0, cam.x));
      cam.y = (h <= vh) ? (vh - h) / 2 : Math.max(vh - h, Math.min(0, cam.y));
    }

    function resetView() {
      cam.x = 0; cam.y = 0; cam.z = 1;
      if (state0) {
        // 开局镜头对准我方主帅
        var lead = null;
        for (var i = 0; i < state0.units.length; i++) {
          if (state0.units[i].side === 'player' && state0.units[i].isLeader) { lead = state0.units[i]; break; }
        }
        if (!lead) {
          for (var j = 0; j < state0.units.length; j++) {
            if (state0.units[j].side === 'player') { lead = state0.units[j]; break; }
          }
        }
        if (lead) centerOn(lead.x, lead.y);
      }
    }

    /** 把某个地块推到视野中央 */
    function centerOn(x, y) {
      if (!vw) return;
      var sx = centerX(x, y), sy = centerY(x, y) - tw * 0.6;
      cam.x = vw / 2 - sx * cam.z;
      cam.y = vh * 0.44 - sy * cam.z;
      clampCam();
    }

    function panBy(dx, dy) {
      cam.x += dx; cam.y += dy;
      clampCam();
    }

    /** 把某个地块挪进可视区中部（避免选中后被界面遮住看不见） */
    function ensureVisible(x, y, pad) {
      if (!vw) return;
      pad = pad === undefined ? 0.16 : pad;
      var sx = centerX(x, y) * cam.z + cam.x;
      var sy = (centerY(x, y) - tw * 0.5) * cam.z + cam.y;
      var mx = vw * pad, my = vh * pad;
      var dx = 0, dy = 0;
      if (sx < mx) dx = mx - sx;
      else if (sx > vw - mx) dx = vw - mx - sx;
      if (sy < my) dy = my - sy;
      else if (sy > vh - my) dy = vh - my - sy;
      if (dx || dy) panBy(dx, dy);
    }

    /* ---------------- 命中判定 ---------------- */

    function screenOf(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      // 主画布即视口窗口，CSS 尺寸与相机坐标系 1:1
      var sx = clientX - r.left;
      var sy = clientY - r.top;
      return { wx: (sx - cam.x) / cam.z, wy: (sy - cam.y) / cam.z };
    }

    function tokenCenter(u) {
      var p = unitPos(u);
      var gx = Math.round(p.x), gy = Math.round(p.y);
      var ground = centerY(p.x, p.y) - elevAt(gx, gy);
      var R = tw * 0.33;
      return { x: centerX(p.x, p.y), y: ground - R * 1.08 };
    }

    /** 令牌命中半径（椭圆，贴合圆形令牌） */
    function hitUnit(u, wx, wy) {
      var c = tokenCenter(u);
      var rx = tw * 0.36, ry = tw * 0.36;
      var dx = (wx - c.x) / rx, dy = (wy - c.y) / ry;
      return dx * dx + dy * dy <= 1;
    }

    /** 指针下所有单位，从前（近）到后排序，供重复点击循环切换 */
    function unitsAtScreen(clientX, clientY) {
      if (!state0) return [];
      var p = screenOf(clientX, clientY);
      var list = state0.units.filter(function (u) { return u.alive && hitUnit(u, p.wx, p.wy); });
      list.sort(function (a, b) {
        var da = Math.round(unitPos(a).x) + Math.round(unitPos(a).y);
        var db = Math.round(unitPos(b).x) + Math.round(unitPos(b).y);
        return db - da || b.y - a.y || a.id.localeCompare(b.id);
      });
      return list;
    }

    /** 屏幕像素 → 地块坐标 */
    function toTile(clientX, clientY) {
      if (!state0) return { x: -1, y: -1 };
      var p = screenOf(clientX, clientY);
      var a = (p.wx - OX) / (tw / 2);
      var b = (p.wy - OY) / (th / 2);
      var fx = (a + b) / 2, fy = (b - a) / 2;
      return { x: Math.round(fx), y: Math.round(fy) };
    }

    /* ---------------- 动画数据 ---------------- */

    function animateMove(unitId, from, path, msPerTile) {
      if (!path || !path.length) return;
      anims.push({
        id: unitId, from: from || null, path: path.slice(),
        t0: performance.now(), dur: Math.min(900, (msPerTile || 110) * path.length) / speed
      });
    }

    function addFloater(x, y, text, color) {
      floaters.push({ x: x, y: y, text: text, color: color || '#fff', t0: performance.now(), dur: 950 / speed });
    }

    function addFlash(tiles, color) {
      flashes.push({ tiles: tiles.slice(), color: color || '#ffd166', t0: performance.now(), dur: 620 / speed });
    }

    function addLunge(id, tx, ty) {
      lunges.push({ id: id, tx: tx, ty: ty, t0: performance.now(), dur: 260 / speed });
    }

    function addShake(id) {
      shakes.push({ id: id, t0: performance.now(), dur: 340 / speed });
    }

    function busy() {
      var now = performance.now();
      return anims.some(function (a) { return now - a.t0 < a.dur; });
    }

    function clearAnims() { anims = []; floaters = []; flashes = []; lunges = []; shakes = []; skillFx = []; }

    function unitPos(u) {
      var now = performance.now();
      for (var i = 0; i < anims.length; i++) {
        var a = anims[i];
        if (a.id !== u.id) continue;
        var p = Math.min(1, (now - a.t0) / a.dur);
        var all = a.path;
        if (a.from) all = [a.from].concat(a.path);
        var seg = (all.length - 1) * p;
        var i0 = Math.floor(seg), i1 = Math.min(all.length - 1, i0 + 1);
        var f = seg - i0;
        f = f * f * (3 - 2 * f);
        return { x: all[i0].x + (all[i1].x - all[i0].x) * f, y: all[i0].y + (all[i1].y - all[i0].y) * f, moving: p < 1 };
      }
      return { x: u.x, y: u.y, moving: false };
    }

    /* ------------------------------------------------------------------ *
     * 静态图层：地形 + 高亮
     * ------------------------------------------------------------------ */

    function buildBase(state, view) {
      var ver = (view.ver || 0);
      var key = [cssW, cssH, tw, isDark() ? 'd' : 'l', ver, view.selectedId || '',
        (state.capturePoints || []).map(function (p) { return p.owner; }).join('')].join('|');
      if (baseKey === key) return;
      baseKey = key;

      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.clearRect(0, 0, base.width, base.height);
      bctx.setTransform(dprEff, 0, 0, dprEff, 0, 0);

      drawTerrain(bctx, state);
      drawVeil(bctx, state, view);
      drawHighlights(bctx, state, view);
      drawPath(bctx, view);
      drawObjectiveMarks(bctx, state);
    }

    /* -------- 地形 -------- */

    function eachTileD(state, fn) {
      for (var d = 0; d <= (state.cols - 1) + (state.rows - 1); d++) {
        for (var x = 0; x < state.cols; x++) {
          var y = d - x;
          if (y < 0 || y >= state.rows) continue;
          fn(x, y, d);
        }
      }
    }

    function drawTerrain(c, state) {
      eachTileD(state, function (x, y) { drawTileBlock(c, state, x, y); });
      eachTileD(state, function (x, y) { drawTileProps(c, state, x, y); });
    }

    /** 崖体：左暗右亮 + 岩层横纹，底部一条压深的地脚线 */
    function cliffFaces(c, cx, cy, ty, col, h) {
      var lw = tw / 2, lh = th / 2;
      // 左侧面（背光）
      c.beginPath();
      c.moveTo(cx - lw, ty);
      c.lineTo(cx, ty + lh);
      c.lineTo(cx, cy + lh);
      c.lineTo(cx - lw, cy);
      c.closePath();
      var gl = c.createLinearGradient(0, ty, 0, cy + lh);
      gl.addColorStop(0, shade(col[1], 14));
      gl.addColorStop(1, shade(col[1], -18));
      c.fillStyle = gl;
      c.fill();

      // 右侧面（受光）
      c.beginPath();
      c.moveTo(cx, ty + lh);
      c.lineTo(cx + lw, ty);
      c.lineTo(cx + lw, cy);
      c.lineTo(cx, cy + lh);
      c.closePath();
      var gr = c.createLinearGradient(0, ty, 0, cy + lh);
      gr.addColorStop(0, shade(col[2], 16));
      gr.addColorStop(1, shade(col[2], -14));
      c.fillStyle = gr;
      c.fill();

      // 岩层横纹
      if (h > tw * 0.22) {
        c.save();
        c.beginPath();
        c.moveTo(cx - lw, ty);
        c.lineTo(cx, ty + lh);
        c.lineTo(cx, cy + lh);
        c.lineTo(cx - lw, cy);
        c.closePath();
        c.moveTo(cx, ty + lh);
        c.lineTo(cx + lw, ty);
        c.lineTo(cx + lw, cy);
        c.lineTo(cx, cy + lh);
        c.closePath();
        c.clip();
        c.strokeStyle = isDark() ? 'rgba(0,0,0,.22)' : 'rgba(60,44,22,.16)';
        c.lineWidth = 1;
        var step = Math.max(4, h * 0.30);
        for (var yy = ty + step; yy < cy + lh; yy += step) {
          c.beginPath();
          c.moveTo(cx - lw, yy);
          c.lineTo(cx + lw, yy + lh * 0.0);
          c.stroke();
          c.beginPath();
          c.moveTo(cx, yy + lh);
          c.lineTo(cx + lw, yy);
          c.stroke();
        }
        c.restore();
      }

      // 地脚线
      c.strokeStyle = isDark() ? 'rgba(0,0,0,.42)' : 'rgba(58,40,16,.30)';
      c.lineWidth = Math.max(1, tw * 0.028);
      c.beginPath();
      c.moveTo(cx - lw, cy);
      c.lineTo(cx, cy + lh);
      c.lineTo(cx + lw, cy);
      c.stroke();
    }

    function drawTileBlock(c, state, x, y) {
      var key = keyAt(x, y);
      if (!key || key === 'void') return;              // 图外：留白，让地图轮廓自然成形
      var col = pal(key);
      var h = elev(key);
      var cx = centerX(x, y), cy = centerY(x, y);
      var ty = cy - h;
      var j = (rnd2(x * 1.7, y * 2.3) - 0.5) * 13;      // 逐格明度抖动
      var top = shade(col[0], j);

      if (h < 0) {
        // 下沉水面：坑壁 + 水面
        diamondPath(c, cx, cy, 1, 1);
        c.fillStyle = shade(col[1], -26);
        c.fill();
        diamondPath(c, cx, cy + Math.abs(h) * 0.70, 0.93, 0.93);
        c.fillStyle = top;
        c.fill();
        return;
      }

      if (h > tw * 0.06) cliffFaces(c, cx, cy, ty, col, h);

      // 顶面
      diamondPath(c, cx, ty, 1, 1);
      var g = c.createLinearGradient(cx - tw / 2, ty - th / 2, cx + tw * 0.18, ty + th / 2);
      g.addColorStop(0, shade(top, 12));
      g.addColorStop(0.62, top);
      g.addColorStop(1, shade(top, -14));
      c.fillStyle = g;
      c.fill();

      // 环境遮蔽：相邻更高的地块，在本格顶面投下一道暗边
      c.save();
      diamondPath(c, cx, ty, 1, 1);
      c.clip();
      c.fillStyle = isDark() ? 'rgba(0,0,0,.30)' : 'rgba(40,26,8,.17)';
      var aoT = h + tw * 0.05;
      if (elevAt(x - 1, y) > aoT) {
        c.beginPath();
        c.moveTo(cx - tw / 2, ty);
        c.lineTo(cx, ty - th / 2);
        c.lineTo(cx + tw * 0.02, ty - th / 2 + th * 0.30);
        c.lineTo(cx - tw / 2 + tw * 0.16, ty + th * 0.20);
        c.closePath(); c.fill();
      }
      if (elevAt(x, y - 1) > aoT) {
        c.beginPath();
        c.moveTo(cx, ty - th / 2);
        c.lineTo(cx + tw / 2, ty);
        c.lineTo(cx + tw / 2 - tw * 0.16, ty + th * 0.20);
        c.lineTo(cx - tw * 0.02, ty - th / 2 + th * 0.30);
        c.closePath(); c.fill();
      }
      c.restore();

      // 顶棱高光 + 淡格线
      c.strokeStyle = isDark() ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.22)';
      c.lineWidth = Math.max(1, tw * 0.022);
      c.beginPath();
      c.moveTo(cx - tw / 2, ty);
      c.lineTo(cx, ty - th / 2);
      c.lineTo(cx + tw / 2, ty);
      c.stroke();

      c.strokeStyle = isDark() ? 'rgba(0,0,0,.22)' : 'rgba(78,58,26,.13)';
      c.lineWidth = 1;
      diamondPath(c, cx, ty, 1, 1);
      c.stroke();
    }

    /* -------- 地面装饰 -------- */

    function drawTileProps(c, state, x, y) {
      var key = keyAt(x, y);
      var t = topXY(x, y);
      var cx = t.cx, cy = t.cy;
      var u = tw;
      var r1 = rnd2(x, y), r2 = rnd2(x + 7.3, y - 3.1);

      switch (key) {
        case 'mountain': drawMountain(c, cx, cy, u, x, y, r1, r2); break;
        case 'hill':   drawHill(c, cx, cy, u, x, y, r1, r2); break;
        case 'downs':  drawDowns(c, cx, cy, u, x, y, r1, r2); break;
        case 'forest': drawForest(c, cx, cy, u, r1, r2); break;
        case 'grass':  drawGrassTufts(c, cx, cy, u, x, y, r1); break;
        case 'plain':  drawSandDots(c, cx, cy, u, x, y); break;
        case 'marsh':  drawMarsh(c, cx, cy, u, x, y, r1, r2); break;
        case 'ford':   drawFord(c, cx, cy, u, r1); break;
        case 'path':   drawTrail(c, cx, cy, u, x, y, r1); break;
        case 'road':   drawRoad(c, state, x, y, cx, cy, u); break;
        case 'bridge': drawBridge(c, cx, cy, u); break;
        case 'ship':   drawShip(c, cx, cy, u, r1); break;
        case 'city':   drawCity(c, cx, cy, u); break;
        case 'camp':   drawCamp(c, cx, cy, u, r1); break;
        case 'wall':   drawWall(c, cx, cy, u); break;
        case 'lake': case 'river': break;              // 水面留给逐帧的波光
      }
    }

    /**
     * 山：主峰 + 副峰，雪线，岩面纹理。
     * kind 决定山体形态——同一座「高山」不再千人一面：
     *   0 尖峰（刃脊如刀）  1 浑圆（馒头缓坡）  2 双峰（鞍部分峙）  3 巉岩（折面嶙峋）
     */
    function peak(c, cx, cy, u, w, hgt, tones, snow, kind) {
      kind = kind === undefined ? 0 : kind;
      var apex = cy - hgt;
      var rim = cy + th * 0.22;            // 山脚线
      // 落影
      c.beginPath();
      c.ellipse(cx + u * 0.02, cy + th * 0.10, w * 1.12, th * 0.34, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(40,28,10,.20)';
      c.fill();

      // 山体轮廓（按形态分岔）
      c.beginPath();
      if (kind === 1) {
        // 浑圆：两段二次曲线鼓出圆顶
        c.moveTo(cx - w, rim);
        c.quadraticCurveTo(cx - w * 0.58, apex - hgt * 0.05, cx, apex);
        c.quadraticCurveTo(cx + w * 0.58, apex - hgt * 0.05, cx + w, rim);
        c.quadraticCurveTo(cx, cy + th * 0.40, cx - w, rim);
      } else if (kind === 2) {
        // 双峰：中鞍低陷，两尖并峙
        var s = w * 0.40;
        c.moveTo(cx - w, rim);
        c.lineTo(cx - w * 0.46, apex + hgt * 0.14);
        c.lineTo(cx - s * 0.55, apex + hgt * 0.34);
        c.lineTo(cx - s * 0.18, apex);
        c.lineTo(cx + s * 0.18, apex + hgt * 0.30);
        c.lineTo(cx + s * 0.55, apex + hgt * 0.06);
        c.lineTo(cx + w * 0.48, apex + hgt * 0.20);
        c.lineTo(cx + w, rim);
        c.quadraticCurveTo(cx, cy + th * 0.40, cx - w, rim);
      } else if (kind === 3) {
        // 巉岩：折面嶙峋，明暗交错的岩壁
        c.moveTo(cx - w, rim);
        c.lineTo(cx - w * 0.66, apex + hgt * 0.36);
        c.lineTo(cx - w * 0.36, apex + hgt * 0.08);
        c.lineTo(cx - w * 0.12, apex + hgt * 0.24);
        c.lineTo(cx + w * 0.08, apex);
        c.lineTo(cx + w * 0.34, apex + hgt * 0.18);
        c.lineTo(cx + w * 0.58, apex + hgt * 0.04);
        c.lineTo(cx + w, rim);
        c.quadraticCurveTo(cx, cy + th * 0.40, cx - w, rim);
      } else {
        // 尖峰
        c.moveTo(cx, apex);
        c.lineTo(cx - w, rim);
        c.quadraticCurveTo(cx, cy + th * 0.40, cx + w, rim);
        c.closePath();
      }
      var g = c.createLinearGradient(cx - w, apex, cx + w, cy);
      g.addColorStop(0, tones[0]);
      g.addColorStop(0.5, tones[0]);
      g.addColorStop(0.52, tones[1]);
      g.addColorStop(1, tones[1]);
      c.fillStyle = g;
      c.fill();

      // 岩面棱线（左暗右亮，突出体积）
      c.strokeStyle = 'rgba(255,255,255,.30)';
      c.lineWidth = Math.max(1, u * 0.024);
      c.beginPath();
      c.moveTo(cx + w * 0.10, apex + hgt * 0.30);
      c.lineTo(cx + w * 0.52, cy + th * 0.04);
      c.stroke();
      c.strokeStyle = 'rgba(40,28,12,.30)';
      c.beginPath();
      c.moveTo(cx - w * 0.10, apex + hgt * 0.30);
      c.lineTo(cx - w * 0.52, cy + th * 0.04);
      c.stroke();

      // 中缝（尖峰才有：折面与圆顶上画中缝反而假）
      if (kind === 0 || kind === 2) {
        c.strokeStyle = 'rgba(50,38,20,.28)';
        c.lineWidth = Math.max(1, u * 0.02);
        c.beginPath();
        c.moveTo(cx, apex);
        c.lineTo(cx, cy + th * 0.32);
        c.stroke();
      }

      // 山脊线
      c.strokeStyle = 'rgba(255,255,255,.22)';
      c.lineWidth = Math.max(1, u * 0.022);
      c.beginPath();
      c.moveTo(cx, apex);
      c.lineTo(cx + w * 0.55, cy - th * 0.02);
      c.stroke();
      c.beginPath();
      c.moveTo(cx - w * 0.18, apex + hgt * 0.42);
      c.lineTo(cx - w * 0.62, cy + th * 0.10);
      c.stroke();

      if (snow) {
        // 雪帽随峰形走：双峰给两瓣，巉岩给锯齿边
        c.beginPath();
        if (kind === 2) {
          var s2 = w * 0.40;
          c.moveTo(cx - s2 * 0.18, apex);
          c.lineTo(cx - w * 0.34, apex + hgt * 0.26);
          c.lineTo(cx - s2 * 0.55, apex + hgt * 0.20);
          c.lineTo(cx + s2 * 0.18, apex + hgt * 0.34);
          c.lineTo(cx + s2 * 0.55, apex + hgt * 0.14);
          c.lineTo(cx + w * 0.34, apex + hgt * 0.22);
          c.lineTo(cx + s2 * 0.18, apex + hgt * 0.12);
          c.closePath();
        } else if (kind === 3) {
          c.moveTo(cx + w * 0.08, apex);
          c.lineTo(cx - w * 0.36, apex + hgt * 0.24);
          c.lineTo(cx - w * 0.12, apex + hgt * 0.36);
          c.lineTo(cx + w * 0.08, apex + hgt * 0.22);
          c.lineTo(cx + w * 0.34, apex + hgt * 0.34);
          c.lineTo(cx + w * 0.58, apex + hgt * 0.18);
          c.closePath();
        } else {
          c.moveTo(cx, apex);
          c.lineTo(cx - w * 0.30, apex + hgt * 0.26);
          c.lineTo(cx - w * 0.12, apex + hgt * 0.19);
          c.lineTo(cx + w * 0.10, apex + hgt * 0.28);
          c.lineTo(cx + w * 0.32, apex + hgt * 0.20);
          c.closePath();
        }
        c.fillStyle = isDark() ? 'rgba(226,236,246,.80)' : 'rgba(255,255,255,.92)';
        c.fill();
      }
    }

    function drawHill(c, cx, cy, u, x, y, r1, r2) {
      var dk = isDark();
      // 丘陵从三种缓和形态里挑一种，再让高度图压一压个头——
      // 连绵的坡地就有了此起彼伏的节奏
      var kind = Math.floor(rnd2(x * 1.9, y * 1.1) * 3);
      var hScale = 0.78 + hgtAt(x, y) * 0.55;
      // 副峰
      peak(c, cx - u * 0.16, cy - th * 0.06, u,
        u * (0.20 + r2 * 0.04), u * (0.34 + r1 * 0.10) * hScale,
        dk ? ['#4a4638', '#5b5646'] : ['#6f6244', '#b3a077'], false, (kind + 1) % 3);
      // 主峰
      peak(c, cx + u * 0.03, cy + th * 0.02, u,
        u * (0.28 + r1 * 0.05), u * (0.50 + r2 * 0.14) * hScale,
        dk ? ['#4f4a3a', '#6e6951'] : ['#756744', '#c2b28a'], kind === 0, kind);
      // 山脚碎石
      c.fillStyle = dk ? 'rgba(0,0,0,.20)' : 'rgba(96,78,46,.30)';
      for (var i = 0; i < 3; i++) {
        var ox = (rnd2(x2s(i, r1), r2 * 2.7) - 0.5) * u * 0.52;
        var oy = (rnd2(r1 * 3.1, i * 1.9) - 0.3) * th * 0.3;
        c.beginPath();
        c.ellipse(cx + ox, cy + th * 0.24 + oy, u * 0.035, u * 0.018, 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    function x2s(i, r) { return i * 2.7 + r * 5.1; }

    /* -------- 新增地形：高山 / 丘陵 / 山道 / 沼泽 / 浅滩 / 战船 -------- */

    /** 高山：不可逾越的岩峰。形态四选一，高低由高度图定——群峰才各有各的相貌 */
    function drawMountain(c, cx, cy, u, x, y, r1, r2) {
      var dk = isDark();
      var kind = Math.floor(rnd2(x * 1.3, y * 2.1) * 4);
      var hScale = 0.76 + hgtAt(x, y) * 0.55;
      // 后排峰
      peak(c, cx - u * 0.20, cy - th * 0.14, u,
        u * (0.19 + r2 * 0.04), u * (0.60 + r1 * 0.20) * hScale * 0.9,
        dk ? ['#484334', '#5c5642'] : ['#6f6753', '#938a6f'], false, (kind + 1) % 4);
      peak(c, cx + u * 0.24, cy - th * 0.06, u,
        u * (0.16 + r1 * 0.04), u * (0.46 + r2 * 0.16) * hScale * 0.85,
        dk ? ['#504a3a', '#6a6450'] : ['#7a7159', '#a1977a'], false, (kind + 2) % 4);
      // 主峰（略窄于格宽，峰与峰之间露出岩地，山脊才连而不堵）
      peak(c, cx + u * 0.02, cy + th * 0.04, u,
        u * (0.30 + r1 * 0.05), u * (0.86 + r2 * 0.22) * hScale,
        dk ? ['#57513f', '#7a7460'] : ['#847a63', '#b3a890'], true, kind);
      // 山脚崩落的碎石
      c.fillStyle = dk ? 'rgba(0,0,0,.24)' : 'rgba(78,66,44,.34)';
      for (var i = 0; i < 4; i++) {
        var ox = (rnd2(i * 3.3, r1 * 7.7) - 0.5) * u * 0.62;
        var oy = (rnd2(r2 * 2.9, i * 2.3) - 0.3) * th * 0.34;
        c.beginPath();
        c.ellipse(cx + ox, cy + th * 0.26 + oy, u * (0.03 + rnd2(i, r1) * 0.02), u * 0.017, 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    /** 丘陵：缓起伏的草坡，几丛灌木点缀其间 */
    function drawDowns(c, cx, cy, u, x, y, r1, r2) {
      var dk = isDark();
      for (var i = 0; i < 3; i++) {
        var rx = (rnd2(x + i * 2.1, y - i * 1.7) - 0.5) * u * 0.46;
        var ry = (rnd2(y + i * 3.3, x + i * 0.9) - 0.5) * th * 0.34;
        var w = u * (0.17 + rnd2(i, r1) * 0.07);
        var px = cx + rx, py = cy + ry;
        // 草丘本体
        c.beginPath();
        c.ellipse(px, py, w, w * 0.42, 0, Math.PI, Math.PI * 2);
        c.fillStyle = shade(dk ? '#4f6b42' : '#86b45f', i * 5 - 4);
        c.fill();
        // 阴面
        c.beginPath();
        c.ellipse(px, py, w, w * 0.42, 0, Math.PI * 1.15, Math.PI * 2);
        c.fillStyle = dk ? 'rgba(0,0,0,.16)' : 'rgba(58,72,34,.20)';
        c.fill();
      }
      // 零星灌木
      if (r2 > 0.45) {
        c.fillStyle = dk ? '#2f4d2c' : '#4b8a3c';
        var bx = cx + (r1 - 0.5) * u * 0.4, by = cy + th * 0.1;
        c.beginPath();
        c.ellipse(bx, by - th * 0.10, u * 0.07, u * 0.055, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.ellipse(bx + u * 0.05, by - th * 0.05, u * 0.045, u * 0.04, 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    /** 沼泽：一洼死水与几丛芦苇，看着就不好走 */
    function drawMarsh(c, cx, cy, u, x, y, r1, r2) {
      var dk = isDark();
      // 水洼
      c.beginPath();
      c.ellipse(cx, cy + th * 0.06, u * 0.30, th * 0.34, 0, 0, Math.PI * 2);
      c.fillStyle = dk ? 'rgba(24,40,44,.55)' : 'rgba(58,82,68,.42)';
      c.fill();
      c.beginPath();
      c.ellipse(cx + u * 0.06, cy + th * 0.02, u * 0.16, th * 0.18, 0, 0, Math.PI * 2);
      c.fillStyle = dk ? 'rgba(38,58,58,.5)' : 'rgba(84,108,84,.40)';
      c.fill();
      // 水面浮萍反光
      c.strokeStyle = dk ? 'rgba(150,190,170,.30)' : 'rgba(196,226,190,.55)';
      c.lineWidth = Math.max(1, u * 0.018);
      for (var i = 0; i < 2; i++) {
        var px = cx + (rnd2(x + i, y * 1.3) - 0.5) * u * 0.36;
        var py = cy + th * 0.06 + (rnd2(y + i, x) - 0.5) * th * 0.3;
        c.beginPath();
        c.ellipse(px, py, u * 0.05, u * 0.022, 0, 0, Math.PI * 2);
        c.stroke();
      }
      // 芦苇丛
      for (var k = 0; k < 3; k++) {
        var ax = cx + (rnd2(x * 1.7 + k, y) - 0.5) * u * 0.62;
        var ay = cy + (rnd2(y * 2.1 + k, x) - 0.4) * th * 0.44;
        var ht = u * (0.16 + rnd2(k, r2) * 0.10);
        c.strokeStyle = dk ? '#5a6a3c' : '#8a9a4e';
        c.lineWidth = Math.max(1, u * 0.022);
        c.beginPath();
        c.moveTo(ax, ay);
        c.quadraticCurveTo(ax + u * 0.02, ay - ht * 0.6, ax + u * 0.05, ay - ht);
        c.stroke();
        // 穗
        if (r1 > 0.4) {
          c.fillStyle = dk ? '#6b5a30' : '#a08b48';
          c.beginPath();
          c.ellipse(ax + u * 0.05, ay - ht, u * 0.022, u * 0.05, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }

    /** 浅滩：露出水面的踏脚石，全军皆可涉渡 */
    function drawFord(c, cx, cy, u, r1) {
      var dk = isDark();
      for (var i = 0; i < 4; i++) {
        var a = (i / 4) * Math.PI * 2 + r1 * 1.4;
        var px = cx + Math.cos(a) * u * 0.24;
        var py = cy + Math.sin(a) * th * 0.30;
        c.beginPath();
        c.ellipse(px, py, u * 0.085, u * 0.05, 0, 0, Math.PI * 2);
        c.fillStyle = dk ? '#4d4c40' : '#8d8271';
        c.fill();
        c.beginPath();
        c.ellipse(px - u * 0.015, py - u * 0.014, u * 0.055, u * 0.028, 0, 0, Math.PI * 2);
        c.fillStyle = dk ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.35)';
        c.fill();
      }
    }

    /** 山道：碎石铺就的一线窄路 */
    function drawTrail(c, cx, cy, u, x, y, r1) {
      var dk = isDark();
      c.fillStyle = dk ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.26)';
      c.beginPath();
      c.ellipse(cx, cy, u * 0.22, th * 0.30, 0, 0, Math.PI * 2);
      c.fill();
      for (var i = 0; i < 4; i++) {
        var px = cx + (rnd2(x * 3.1 + i, y * 1.9) - 0.5) * u * 0.44;
        var py = cy + (rnd2(y * 2.7 + i, x * 1.3) - 0.5) * th * 0.44;
        c.beginPath();
        c.ellipse(px, py, u * 0.032, u * 0.019, 0, 0, Math.PI * 2);
        c.fillStyle = dk ? 'rgba(0,0,0,.22)' : 'rgba(92,80,58,.32)';
        c.fill();
      }
    }

    /** 连环楼船：船体 + 楼台 + 桅帆，赤壁一把火全成灰 */
    function drawShip(c, cx, cy, u, r1) {
      var dk = isDark();
      var hull = dk ? ['#4a3a22', '#6b5330'] : ['#8a6636', '#b08a4e'];
      // 倒影
      c.beginPath();
      c.ellipse(cx, cy + th * 0.20, u * 0.34, th * 0.22, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(20,30,40,.24)';
      c.fill();
      // 船体（梯形）
      c.beginPath();
      c.moveTo(cx - u * 0.30, cy - th * 0.14);
      c.lineTo(cx + u * 0.30, cy - th * 0.14);
      c.lineTo(cx + u * 0.22, cy + th * 0.22);
      c.lineTo(cx - u * 0.22, cy + th * 0.22);
      c.closePath();
      var gh = c.createLinearGradient(cx - u * 0.3, cy - th * 0.14, cx + u * 0.3, cy + th * 0.22);
      gh.addColorStop(0, hull[0]);
      gh.addColorStop(1, hull[1]);
      c.fillStyle = gh;
      c.fill();
      c.strokeStyle = dk ? 'rgba(0,0,0,.45)' : 'rgba(58,38,14,.45)';
      c.lineWidth = Math.max(1, u * 0.022);
      c.stroke();
      // 船板纹
      c.strokeStyle = dk ? 'rgba(0,0,0,.28)' : 'rgba(70,46,18,.26)';
      c.lineWidth = 1;
      for (var b = 1; b <= 2; b++) {
        var yy = cy - th * 0.14 + th * 0.12 * b;
        c.beginPath();
        c.moveTo(cx - u * 0.30 + u * 0.02 * b, yy);
        c.lineTo(cx + u * 0.30 - u * 0.02 * b, yy);
        c.stroke();
      }
      // 甲板楼台
      c.fillStyle = dk ? '#6a5330' : '#a9834c';
      c.fillRect(cx - u * 0.13, cy - th * 0.46, u * 0.26, th * 0.34);
      c.fillStyle = dk ? '#8a6c3c' : '#c69b5a';
      c.fillRect(cx - u * 0.13, cy - th * 0.46, u * 0.26, th * 0.08);
      // 屋顶
      c.beginPath();
      c.moveTo(cx - u * 0.17, cy - th * 0.46);
      c.lineTo(cx, cy - th * 0.62);
      c.lineTo(cx + u * 0.17, cy - th * 0.46);
      c.closePath();
      c.fillStyle = dk ? '#7a3a32' : '#b8544a';
      c.fill();
      // 桅杆与帆
      c.strokeStyle = dk ? '#4a3a22' : '#6b4a26';
      c.lineWidth = Math.max(1, u * 0.028);
      c.beginPath();
      c.moveTo(cx + u * 0.02, cy - th * 0.52);
      c.lineTo(cx + u * 0.02, cy - th * 1.15);
      c.stroke();
      c.beginPath();
      c.moveTo(cx + u * 0.02, cy - th * 1.12);
      c.quadraticCurveTo(cx + u * 0.20 + r1 * u * 0.06, cy - th * 0.90, cx + u * 0.03, cy - th * 0.68);
      c.closePath();
      c.fillStyle = dk ? 'rgba(216,208,186,.80)' : 'rgba(246,240,220,.92)';
      c.fill();
      c.strokeStyle = dk ? 'rgba(0,0,0,.26)' : 'rgba(90,72,40,.30)';
      c.lineWidth = 1;
      c.stroke();
    }

    /** 松树 */
    function pine(c, tx, ty, hgt, wid, seed, dk) {
      // 落影
      c.beginPath();
      c.ellipse(tx + wid * 0.16, ty + hgt * 0.03, wid * 0.92, wid * 0.34, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(30,40,16,.22)';
      c.fill();
      // 树干
      c.fillStyle = dk ? '#3b2d1d' : '#6b4a26';
      c.fillRect(tx - wid * 0.09, ty - hgt * 0.34, wid * 0.18, hgt * 0.36);
      // 三层树冠
      var tones = dk ? ['#274d2a', '#356337', '#3d7038']
        : ['#2f6b36', '#3f8a42', '#54a352'];
      for (var k = 0; k < 3; k++) {
        var f = 1 - k * 0.26;
        var w = wid * (0.55 + k * 0.24);
        var baseY = ty - hgt * (0.18 + k * 0.26);
        var apexY = baseY - hgt * (0.44 + k * 0.06) * f;
        // 左暗
        c.beginPath();
        c.moveTo(tx, apexY);
        c.lineTo(tx - w, baseY);
        c.lineTo(tx, baseY + wid * 0.14);
        c.closePath();
        c.fillStyle = tones[0];
        c.fill();
        // 右亮
        c.beginPath();
        c.moveTo(tx, apexY);
        c.lineTo(tx + w, baseY);
        c.lineTo(tx, baseY + wid * 0.14);
        c.closePath();
        c.fillStyle = tones[k === 2 ? 2 : 1];
        c.fill();
      }
      // 针叶高光
      c.strokeStyle = 'rgba(255,255,255,.28)';
      c.lineWidth = Math.max(0.8, wid * 0.06);
      c.beginPath();
      c.moveTo(tx + wid * 0.10, ty - hgt * 0.86);
      c.lineTo(tx + wid * 0.44, ty - hgt * 0.40);
      c.stroke();
      if (seed > 0.6) {                          // 少数挂雪 / 亮芽
        c.fillStyle = dk ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.34)';
        c.beginPath();
        c.moveTo(tx, ty - hgt * 1.02);
        c.lineTo(tx - wid * 0.20, ty - hgt * 0.74);
        c.lineTo(tx + wid * 0.20, ty - hgt * 0.74);
        c.closePath();
        c.fill();
      }
    }

    function drawForest(c, cx, cy, u, r1, r2) {
      var dk = isDark();
      // 地被
      c.beginPath();
      c.ellipse(cx, cy + th * 0.16, u * 0.40, th * 0.26, 0, 0, Math.PI * 2);
      c.fillStyle = dk ? 'rgba(0,0,0,.24)' : 'rgba(52,86,40,.24)';
      c.fill();
      var n = 3 + Math.floor(r1 * 2);
      for (var i = 0; i < n; i++) {
        var seed = rnd2(i * 3.1, r1 * 9.7);
        var ox = (seed - 0.5) * u * 0.50;
        var oy = (rnd2(r2 * 5.5, i * 2.3) - 0.5) * th * 0.50;
        var front = oy > 0 ? 1 : 0;
        pine(c, cx + ox, cy + oy + th * 0.10, u * (0.40 + seed * 0.16 + front * 0.05),
          u * (0.15 + seed * 0.045), seed, dk);
      }
      // 灌木
      c.fillStyle = dk ? '#2c4a2c' : '#4e8a44';
      c.beginPath();
      c.ellipse(cx - u * 0.22, cy + th * 0.22, u * 0.09, u * 0.05, 0, 0, Math.PI * 2);
      c.fill();
    }

    function drawGrassTufts(c, cx, cy, u, x, y, r1) {
      var dk = isDark();
      c.strokeStyle = dk ? 'rgba(168,208,140,.42)' : 'rgba(58,102,44,.55)';
      c.lineWidth = Math.max(1, u * 0.028);
      c.lineCap = 'round';
      for (var g = 0; g < 4; g++) {
        var ox = (rnd2(x + g * 2.1, y - g) - 0.5) * u * 0.56;
        var oy = (rnd2(x - g, y + g * 1.7) - 0.5) * th * 0.56;
        var bh = u * (0.07 + rnd2(g, r1) * 0.05);
        c.beginPath();
        c.moveTo(cx + ox, cy + oy);
        c.lineTo(cx + ox - u * 0.022, cy + oy - bh);
        c.moveTo(cx + ox, cy + oy);
        c.lineTo(cx + ox + u * 0.026, cy + oy - bh * 0.86);
        c.stroke();
      }
      // 小花
      if (r1 > 0.55) {
        c.fillStyle = dk ? 'rgba(226,226,236,.55)' : 'rgba(255,253,236,.92)';
        var fx = cx + (rnd2(x + 3, y - 2) - 0.5) * u * 0.44;
        var fy = cy + (rnd2(x - 2, y + 5) - 0.4) * th * 0.44;
        c.beginPath();
        c.arc(fx, fy, Math.max(1.1, u * 0.032), 0, Math.PI * 2);
        c.fill();
      }
    }

    function drawSandDots(c, cx, cy, u, x, y) {
      c.fillStyle = isDark() ? 'rgba(0,0,0,.18)' : 'rgba(120,98,58,.30)';
      for (var i = 0; i < 3; i++) {
        var ox = (rnd2(x + i * 1.9, y - i) - 0.5) * u * 0.5;
        var oy = (rnd2(x - i, y + i * 2.3) - 0.5) * th * 0.5;
        c.beginPath();
        c.ellipse(cx + ox, cy + oy, Math.max(1, u * 0.026), Math.max(0.7, u * 0.014), 0, 0, Math.PI * 2);
        c.fill();
      }
    }

    /** 路：与相邻道路/桥/城/营连成路带 */
    function drawRoad(c, state, x, y, cx, cy, u) {
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      var links = dirs.filter(function (d) { return PATHY[keyAt(x + d[0], y + d[1])]; });
      c.save();
      c.lineCap = 'round';
      if (!links.length) {
        c.strokeStyle = isDark() ? '#8a8368' : '#e6dcb9';
        c.lineWidth = u * 0.26;
        c.beginPath();
        c.moveTo(cx - u * 0.16, cy);
        c.lineTo(cx + u * 0.16, cy);
        c.stroke();
      } else {
        links.forEach(function (d) {
          var mx = cx + (centerX(x + d[0], y + d[1]) - cx) / 2;
          var my = cy + (centerY(x + d[0], y + d[1]) - cy) / 2;
          // 路肩
          c.strokeStyle = isDark() ? 'rgba(0,0,0,.28)' : 'rgba(140,116,72,.35)';
          c.lineWidth = u * 0.30;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(mx, my); c.stroke();
          // 路面
          c.strokeStyle = isDark() ? '#8d876d' : '#ecdfba';
          c.lineWidth = u * 0.22;
          c.beginPath(); c.moveTo(cx, cy); c.lineTo(mx, my); c.stroke();
        });
      }
      // 车辙
      c.strokeStyle = isDark() ? 'rgba(0,0,0,.20)' : 'rgba(150,126,82,.42)';
      c.lineWidth = Math.max(0.9, u * 0.022);
      c.beginPath();
      c.moveTo(cx - u * 0.13, cy + th * 0.08);
      c.lineTo(cx + u * 0.13, cy - th * 0.08);
      c.stroke();
      c.restore();
    }

    function drawBridge(c, cx, cy, u) {
      var dk = isDark();
      var w = u * 0.50, h = u * 0.30;
      // 桥面
      c.fillStyle = dk ? '#7a613d' : '#d9ac6e';
      c.beginPath();
      c.moveTo(cx - w / 2, cy - h * 0.34);
      c.lineTo(cx + w / 2, cy - h * 0.34);
      c.lineTo(cx + w / 2, cy + h * 0.34);
      c.lineTo(cx - w / 2, cy + h * 0.34);
      c.closePath();
      c.fill();
      // 木板
      c.strokeStyle = dk ? 'rgba(0,0,0,.30)' : 'rgba(122,84,38,.45)';
      c.lineWidth = Math.max(1, u * 0.028);
      for (var i = 1; i < 6; i++) {
        var px = cx - w / 2 + (w / 6) * i;
        c.beginPath(); c.moveTo(px, cy - h * 0.34); c.lineTo(px, cy + h * 0.34); c.stroke();
      }
      // 栏杆
      c.strokeStyle = dk ? '#5d4a2e' : '#8a5f31';
      c.lineWidth = Math.max(1.4, u * 0.045);
      c.beginPath();
      c.moveTo(cx - w / 2, cy - h * 0.42);
      c.lineTo(cx + w / 2, cy - h * 0.42);
      c.moveTo(cx - w / 2, cy + h * 0.42);
      c.lineTo(cx + w / 2, cy + h * 0.42);
      c.stroke();
    }

    /** 城：等距城墙体 + 城楼 + 旗 */
    function drawCity(c, cx, cy, u) {
      var dk = isDark();
      var W = u * 0.62, H = u * 0.30, HH = u * 0.30;
      var topY0 = cy - HH;
      // 左面
      c.fillStyle = dk ? '#8a8271' : '#b8ae95';
      c.beginPath();
      c.moveTo(cx - W / 2, topY0 + th * 0.16);
      c.lineTo(cx, topY0 + th * 0.32);
      c.lineTo(cx, cy + th * 0.32);
      c.lineTo(cx - W / 2, cy + th * 0.16);
      c.closePath(); c.fill();
      // 右面
      c.fillStyle = dk ? '#6f6857' : '#9c927b';
      c.beginPath();
      c.moveTo(cx, topY0 + th * 0.32);
      c.lineTo(cx + W / 2, topY0 + th * 0.16);
      c.lineTo(cx + W / 2, cy + th * 0.16);
      c.lineTo(cx, cy + th * 0.32);
      c.closePath(); c.fill();
      // 顶面
      c.fillStyle = dk ? '#a49b86' : '#d3cbb3';
      c.beginPath();
      c.moveTo(cx, topY0);
      c.lineTo(cx + W / 2, topY0 + th * 0.16);
      c.lineTo(cx, topY0 + th * 0.32);
      c.lineTo(cx - W / 2, topY0 + th * 0.16);
      c.closePath(); c.fill();
      // 城垛
      c.fillStyle = dk ? '#b3aa93' : '#e2dbc4';
      for (var i = -1; i <= 1; i += 2) {
        c.fillRect(cx + i * W * 0.20 - W * 0.055, topY0 + th * 0.16 * (i > 0 ? 1 : 1) - u * 0.07,
          W * 0.11, u * 0.09);
      }
      // 城楼（红顶）
      var tw2 = W * 0.34, thh = u * 0.20;
      c.fillStyle = dk ? '#8c7f68' : '#c6b89b';
      c.fillRect(cx - tw2 / 2, topY0 - thh - u * 0.06, tw2, thh + u * 0.06);
      c.fillStyle = dk ? '#7d3a34' : '#b8503f';
      c.beginPath();
      c.moveTo(cx - tw2 * 0.78, topY0 - thh - u * 0.06);
      c.lineTo(cx, topY0 - thh - u * 0.20);
      c.lineTo(cx + tw2 * 0.78, topY0 - thh - u * 0.06);
      c.closePath(); c.fill();
      // 城门
      c.fillStyle = dk ? '#2e2920' : '#5c4525';
      c.beginPath();
      c.moveTo(cx - W * 0.10, cy + th * 0.24);
      c.lineTo(cx - W * 0.10, cy + th * 0.08);
      c.lineTo(cx + W * 0.10, cy + th * 0.16);
      c.lineTo(cx + W * 0.10, cy + th * 0.32);
      c.closePath(); c.fill();
      // 轮廓
      c.strokeStyle = dk ? 'rgba(0,0,0,.38)' : 'rgba(78,58,26,.32)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(cx - W / 2, cy + th * 0.16);
      c.lineTo(cx - W / 2, topY0 + th * 0.16);
      c.lineTo(cx, topY0);
      c.lineTo(cx + W / 2, topY0 + th * 0.16);
      c.lineTo(cx + W / 2, cy + th * 0.16);
      c.stroke();
    }

    /** 营寨：两顶军帐 + 栅栏 + 篝火 */
    function drawCamp(c, cx, cy, u, r1) {
      var dk = isDark();
      function tent(ox, oy, s) {
        var w = u * 0.24 * s, h = u * 0.22 * s;
        c.beginPath();
        c.ellipse(ox + w * 0.12, oy + h * 0.10, w * 0.72, h * 0.26, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(40,30,12,.20)';
        c.fill();
        // 帐面
        c.beginPath();
        c.moveTo(ox, oy - h);
        c.lineTo(ox + w / 2, oy);
        c.lineTo(ox - w / 2, oy);
        c.closePath();
        c.fillStyle = dk ? '#6e6a55' : '#dfd2b0';
        c.fill();
        c.beginPath();
        c.moveTo(ox, oy - h);
        c.lineTo(ox - w / 2, oy);
        c.lineTo(ox - w * 0.16, oy);
        c.closePath();
        c.fillStyle = dk ? 'rgba(0,0,0,.28)' : 'rgba(126,108,72,.42)';
        c.fill();
        // 门帘
        c.fillStyle = dk ? '#2f2a20' : '#6b5636';
        c.beginPath();
        c.moveTo(ox, oy - h * 0.42);
        c.lineTo(ox + w * 0.15, oy);
        c.lineTo(ox - w * 0.15, oy);
        c.closePath(); c.fill();
      }
      tent(cx - u * 0.14, cy + th * 0.06, 1);
      tent(cx + u * 0.16, cy + th * 0.22, 0.74 + r1 * 0.2);
      // 栅栏
      c.strokeStyle = dk ? '#5c4c33' : '#9a7b4b';
      c.lineWidth = Math.max(1, u * 0.030);
      c.beginPath();
      c.moveTo(cx - u * 0.36, cy + th * 0.34);
      c.lineTo(cx - u * 0.34, cy - th * 0.02);
      c.moveTo(cx - u * 0.34, cy - th * 0.02);
      c.lineTo(cx - u * 0.24, cy - th * 0.14);
      c.stroke();
      // 篝火
      c.fillStyle = dk ? '#c8762f' : '#e08a2e';
      c.beginPath();
      c.arc(cx + u * 0.30, cy + th * 0.06, Math.max(1.4, u * 0.045), 0, Math.PI * 2);
      c.fill();
    }

    function drawWall(c, cx, cy, u) {
      var dk = isDark();
      var W = u * 0.66, H = u * 0.26, HH = u * 0.34;
      var ty = cy - HH;
      c.fillStyle = dk ? '#787162' : '#a89e88';
      c.beginPath();
      c.moveTo(cx - W / 2, ty + th * 0.14);
      c.lineTo(cx, ty + th * 0.28);
      c.lineTo(cx, cy + th * 0.28);
      c.lineTo(cx - W / 2, cy + th * 0.14);
      c.closePath(); c.fill();
      c.fillStyle = dk ? '#8b8474' : '#c0b7a1';
      c.beginPath();
      c.moveTo(cx, ty + th * 0.28);
      c.lineTo(cx + W / 2, ty + th * 0.14);
      c.lineTo(cx + W / 2, cy + th * 0.14);
      c.lineTo(cx, cy + th * 0.28);
      c.closePath(); c.fill();
      c.fillStyle = dk ? '#9d9683' : '#d6ceb8';
      c.beginPath();
      c.moveTo(cx, ty);
      c.lineTo(cx + W / 2, ty + th * 0.14);
      c.lineTo(cx, ty + th * 0.28);
      c.lineTo(cx - W / 2, ty + th * 0.14);
      c.closePath(); c.fill();
      // 垛口
      c.fillStyle = dk ? '#b0a894' : '#e4dcc6';
      for (var i = -2; i <= 2; i++) {
        c.fillRect(cx + i * W * 0.17 - W * 0.045, ty + th * 0.14 * (i > 0 ? 1 : 1) - u * 0.05,
          W * 0.09, u * 0.07);
      }
      // 砖缝
      c.strokeStyle = dk ? 'rgba(0,0,0,.28)' : 'rgba(74,58,30,.24)';
      c.lineWidth = 1;
      for (var k = 1; k < 3; k++) {
        var yy = ty + th * 0.28 * k * 0.5 + u * 0.06 * k;
        c.beginPath();
        c.moveTo(cx - W / 2, yy + th * 0.14 * k * 0.5);
        c.lineTo(cx, yy + th * 0.14 * k);
        c.lineTo(cx + W / 2, yy + th * 0.14 * k * 0.5);
        c.stroke();
      }
    }

    /* -------- 范围外压暗 + 高亮 -------- */

    function eachTile(state, fn) {
      eachTileD(state, fn);
    }

    function keyList(map) {
      var out = [];
      if (!map) return out;
      for (var k in map) {
        if (!map[k]) continue;
        var p = k.split(',');
        out.push({ x: +p[0], y: +p[1] });
      }
      return out;
    }

    function drawVeil(c, state, view) {
      if (!view.moveMap && !view.skillMap) return;
      var moveSet = view.moveMap || {};
      c.fillStyle = isDark() ? 'rgba(4,6,10,.42)' : 'rgba(26,18,6,.28)';
      eachTile(state, function (x, y) {
        if (moveSet[x + ',' + y]) return;
        if (view.attackMap && view.attackMap[x + ',' + y]) return;
        if (view.skillMap && view.skillMap[x + ',' + y]) return;
        var p = topXY(x, y);
        diamondPath(c, p.cx, p.cy, 1, 1);
        c.fill();
      });
    }

    function outlineRegion(c, map, color, width) {
      var mv = keyList(map);
      c.strokeStyle = color;
      c.lineWidth = width;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      mv.forEach(function (t) {
        var p = topXY(t.x, t.y);
        var hw = tw / 2, hh = th / 2;
        if (!map[(t.x - 1) + ',' + t.y]) { c.beginPath(); c.moveTo(p.cx - hw, p.cy); c.lineTo(p.cx, p.cy - hh); c.stroke(); }
        if (!map[t.x + ',' + (t.y - 1)]) { c.beginPath(); c.moveTo(p.cx, p.cy - hh); c.lineTo(p.cx + hw, p.cy); c.stroke(); }
        if (!map[t.x + ',' + (t.y + 1)]) { c.beginPath(); c.moveTo(p.cx - hw, p.cy); c.lineTo(p.cx, p.cy + hh); c.stroke(); }
        if (!map[(t.x + 1) + ',' + t.y]) { c.beginPath(); c.moveTo(p.cx, p.cy + hh); c.lineTo(p.cx + hw, p.cy); c.stroke(); }
      });
      return dirs;
    }

    function drawHighlights(c, state, view) {
      // 攻击范围：暖红半透 + 细边
      if (view.attackMap) {
        keyList(view.attackMap).forEach(function (t) {
          if (!core.inBounds(state, t.x, t.y)) return;
          var p = topXY(t.x, t.y);
          diamondPath(c, p.cx, p.cy, 1, 1);
          c.fillStyle = 'rgba(226,74,64,.20)';
          c.fill();
        });
        c.save();
        c.setLineDash([Math.max(3, tw * 0.14), Math.max(2, tw * 0.10)]);
        outlineRegion(c, view.attackMap, 'rgba(226,74,64,.85)', Math.max(1.6, tw * 0.055));
        c.restore();
      }

      // 施法范围：紫
      if (view.skillMap) {
        keyList(view.skillMap).forEach(function (t) {
          if (!core.inBounds(state, t.x, t.y)) return;
          var p = topXY(t.x, t.y);
          diamondPath(c, p.cx, p.cy, 1, 1);
          c.fillStyle = 'rgba(142,96,246,.26)';
          c.fill();
        });
        c.save();
        c.setLineDash([Math.max(3, tw * 0.14), Math.max(2, tw * 0.10)]);
        outlineRegion(c, view.skillMap, 'rgba(160,120,255,.9)', Math.max(1.6, tw * 0.055));
        c.restore();
      }

      // 可移动范围：冷蓝半透 + 实心轮廓（去掉密集白点，避免像贴纸）
      if (view.moveMap) {
        var mv = keyList(view.moveMap);
        mv.forEach(function (t) {
          if (!core.inBounds(state, t.x, t.y)) return;
          var p = topXY(t.x, t.y);
          diamondPath(c, p.cx, p.cy, 1, 1);
          var g = c.createLinearGradient(p.cx, p.cy - th / 2, p.cx, p.cy + th / 2);
          g.addColorStop(0, 'rgba(120,196,255,.30)');
          g.addColorStop(1, 'rgba(46,120,226,.34)');
          c.fillStyle = g;
          c.fill();
        });
        // 内描白边 + 外描蓝边，形成清爽的“范围光边”
        outlineRegion(c, view.moveMap, 'rgba(226,244,255,.85)', Math.max(1, tw * 0.035));
        outlineRegion(c, view.moveMap, '#2f7de0', Math.max(2, tw * 0.075));
      }
    }

    function drawPath(c, view) {
      if (!view.path || !view.path.length) return;
      var pts = view.path;
      var from = view.pathFrom;
      c.save();
      c.lineWidth = Math.max(2.5, tw * 0.11);
      c.strokeStyle = 'rgba(255,214,102,.95)';
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      var startP = from ? topXY(from.x, from.y) : topXY(pts[0].x, pts[0].y);
      c.moveTo(startP.cx, startP.cy);
      for (var i = 0; i < pts.length; i++) {
        var p = topXY(pts[i].x, pts[i].y);
        c.lineTo(p.cx, p.cy);
      }
      c.stroke();
      for (var k = 0; k < pts.length; k++) {
        var q = topXY(pts[k].x, pts[k].y);
        c.beginPath();
        c.arc(q.cx, q.cy, Math.max(2, tw * 0.07), 0, Math.PI * 2);
        c.fillStyle = '#ffd166';
        c.fill();
      }
      var last = topXY(pts[pts.length - 1].x, pts[pts.length - 1].y);
      diamondPath(c, last.cx, last.cy, 0.94, 0.94);
      c.strokeStyle = '#fff';
      c.lineWidth = Math.max(2, tw * 0.08);
      c.stroke();
      c.restore();
    }

    /** 燃烧地块：跳动的火苗，让「火攻点燃地形」看得见 */
    function drawFires(state, now) {
      if (!state || !state.burning) return;
      for (var k = 0; k < state.burning.length; k++) {
        if (!state.burning[k]) continue;
        var x = k % state.cols, y = (k / state.cols) | 0;
        var t = topXY(x, y);
        var pulse = 0.5 + 0.5 * Math.sin(now / 200 + x * 1.7 + y * 2.3);

        ctx.save();
        diamondPath(ctx, t.cx, t.cy, 1, 1);
        ctx.fillStyle = 'rgba(210,60,20,' + (0.22 + 0.16 * pulse).toFixed(3) + ')';
        ctx.fill();

        var fh = th * (1.15 + 0.5 * pulse);
        var g = ctx.createRadialGradient(t.cx, t.cy - th * 0.25, 0, t.cx, t.cy - th * 0.25, fh * 1.25);
        g.addColorStop(0, 'rgba(255,236,150,' + (0.70 * pulse + 0.15).toFixed(3) + ')');
        g.addColorStop(0.45, 'rgba(255,140,40,' + (0.42 * pulse + 0.12).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(180,30,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(t.cx, t.cy - th * 0.4, tw * 0.32, fh * 0.66, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    function drawObjectiveMarks(c, state) {
      (state.capturePoints || []).forEach(function (p) {
        var t = topXY(p.x, p.y);
        var col = SIDE[p.owner === 'player' ? 'player' : 'enemy'];
        diamondPath(c, t.cx, t.cy, 0.96, 0.96);
        c.strokeStyle = col.ring;
        c.lineWidth = Math.max(2, tw * 0.075);
        c.stroke();
      });
      if (state.victory && state.victory.type === 'escort' && state.victory.target) {
        var tg = state.victory.target;
        var t2 = topXY(tg.x, tg.y);
        c.save();
        c.setLineDash([Math.max(3, tw * 0.16), Math.max(3, tw * 0.12)]);
        diamondPath(c, t2.cx, t2.cy, 0.94, 0.94);
        c.strokeStyle = '#22c55e';
        c.lineWidth = Math.max(2, tw * 0.08);
        c.stroke();
        c.restore();
      }
    }

    /* ------------------------------------------------------------------ *
     * 每帧层：背景 / 水面 / 单位 / 特效
     * ------------------------------------------------------------------ */

    /** 宣纸底色 + 水墨场景：铺满视口窗口（不随镜头滚动，如同画轴的衬底） */
    function paintBackdrop(state) {
      var g = ctx.createLinearGradient(0, 0, 0, vh);
      if (isDark()) { g.addColorStop(0, '#191c22'); g.addColorStop(1, '#0d1015'); }
      else { g.addColorStop(0, '#efe6d2'); g.addColorStop(1, '#ddcfb2'); }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);

      var scene = state.config && state.config.scene;
      var sImg = sceneImage(scene);
      if (sImg && sImg.complete && sImg.naturalWidth) {
        ctx.save();
        ctx.globalAlpha = isDark() ? 0.18 : 0.26;
        var scale = Math.max(vw / sImg.naturalWidth, vh / sImg.naturalHeight);
        var dw = sImg.naturalWidth * scale, dh = sImg.naturalHeight * scale;
        ctx.drawImage(sImg, (vw - dw) / 2, (vh - dh) / 2, dw, dh);
        ctx.restore();
      }

      var rg = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.22,
        vw / 2, vh / 2, Math.max(vw, vh) * 0.72);
      rg.addColorStop(0, 'rgba(0,0,0,0)');
      rg.addColorStop(1, isDark() ? 'rgba(0,0,0,.5)' : 'rgba(70,48,22,.24)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, vw, vh);
    }

    /** 水面：下沉水色 + 流动波光 */
    /**
     * 水面：江河奔流、湖泊微澜、浅滩湍急。
     * 三种水面各有自己的节奏，而不是同一套波形到处贴。
     */
    function drawWater(state, now) {
      var cols = state.cols, rows = state.rows;
      var dark = isDark();
      ctx.save();
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var key = keyAt(x, y);
          if (!WATERKEYS[key]) continue;
          var p = topXY(x, y);
          var flow = key === 'river' ? 1 : key === 'ford' ? 1.5 : 0.45;   // 河快、湖慢、滩最急
          var deep = key === 'lake' ? 1.6 : key === 'ford' ? 0.35 : 1;    // 湖最深、滩最浅
          var phase = now / (620 / flow) + (x + y) * 0.7;

          ctx.save();
          diamondPath(ctx, p.cx, p.cy, 0.93, 0.93);
          ctx.clip();

          // 深浅水色
          var g = ctx.createLinearGradient(p.cx - tw / 2, p.cy - th / 2, p.cx + tw / 2, p.cy + th / 2);
          g.addColorStop(0, dark ? 'rgba(120,190,224,' + (0.20 * deep).toFixed(3) + ')'
            : 'rgba(180,226,245,' + (0.34 * deep).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(20,80,120,' + (0.22 * deep).toFixed(3) + ')');
          ctx.fillStyle = g;
          ctx.fillRect(p.cx - tw, p.cy - th, tw * 2, th * 2);

          // 波纹：湖泊画横向宽纹，河流画顺着方向的长纹
          ctx.strokeStyle = 'rgba(255,255,255,' + (key === 'lake' ? 0.32 : 0.50).toFixed(2) + ')';
          ctx.lineWidth = Math.max(1, tw * (key === 'ford' ? 0.05 : 0.035));
          for (var k = 0; k < 2; k++) {
            var off = Math.sin(phase + k * 1.7) * th * 0.18;
            ctx.beginPath();
            ctx.moveTo(p.cx - tw * 0.36, p.cy + th * 0.22 * (k - 0.5) + off);
            ctx.quadraticCurveTo(p.cx, p.cy + th * 0.22 * (k - 0.5) + off - th * 0.18,
              p.cx + tw * 0.36, p.cy + th * 0.22 * (k - 0.5) + off);
            ctx.stroke();
          }

          // 水面碎光
          var sp = Math.sin(now / (380 / flow) + x * 2.1 + y * 1.3);
          if (sp > 0.72) {
            ctx.fillStyle = 'rgba(255,255,255,' + ((sp - 0.72) * 2.4).toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(p.cx + (sp - 0.8) * tw * 0.6, p.cy + th * 0.12, Math.max(1, tw * 0.03), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }

    /** 水面逐帧摇晃的战船：让江上的连环船看起来是浮着的 */
    function shipBob(x, y, now) {
      return Math.sin(now / 900 + x * 1.7 + y * 2.3) * 1.2;
    }

    /**
     * 天时：雨、雪、雾、风各自有画面表情。
     * 覆盖全屏而非逐格，天气一变整个战场的氛围立刻不同。
     */
    function drawWeather(state, now) {
      var key = core.weather(state).key;
      if (key === 'clear' || key === 'cloudy') return;
      var W = vw, H = vh;   // 天时覆盖视口窗口
      ctx.save();
      if (key === 'fog') {
        // 大雾迷江：横向漂移的雾团 + 整体压低对比
        ctx.fillStyle = isDark() ? 'rgba(190,205,220,.16)' : 'rgba(238,244,250,.30)';
        ctx.fillRect(0, 0, W, H);
        for (var f = 0; f < 7; f++) {
          var fx = ((now / (60 + f * 22) + f * W / 5) % (W + 420)) - 210;
          var fy = H * (0.10 + f * 0.13) + Math.sin(now / 1400 + f) * 8;
          var gr = ctx.createRadialGradient(fx, fy, 0, fx, fy, 130 + f * 22);
          gr.addColorStop(0, isDark() ? 'rgba(200,214,230,.22)' : 'rgba(255,255,255,.42)');
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.ellipse(fx, fy, 150 + f * 26, 46 + f * 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (key === 'rain') {
        ctx.strokeStyle = 'rgba(174,214,241,.55)';
        ctx.lineWidth = 1.2;
        var drops = Math.round(W * H / 2400);
        for (var i = 0; i < drops; i++) {
          var seed = i * 37.7;
          var sx = (seed * 13.1 + now / 5.5) % (W + 60) - 30;
          var sy = (seed * 7.7 + now * 0.62) % (H + 60) - 30;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 4, sy + 12);
          ctx.stroke();
        }
        // 雨幕：整体压暗偏蓝
        ctx.fillStyle = 'rgba(40,70,110,.16)';
        ctx.fillRect(0, 0, W, H);
      } else if (key === 'snow') {
        var flakes = Math.round(W * H / 4200);
        for (var s = 0; s < flakes; s++) {
          var sd = s * 29.3;
          var snx = (sd * 11.7 + Math.sin(now / 1200 + s) * 26 + now / 22) % (W + 40) - 20;
          var sny = (sd * 5.3 + now * 0.14) % (H + 40) - 20;
          var rr = 1.2 + (s % 3) * 0.7;
          ctx.fillStyle = 'rgba(255,255,255,.80)';
          ctx.beginPath();
          ctx.arc(snx, sny, rr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(198,214,232,.14)';
        ctx.fillRect(0, 0, W, H);
      } else if (key === 'wind') {
        // 狂风：横向掠过的气流线 + 卷起的沙尘
        ctx.strokeStyle = 'rgba(226,206,168,.42)';
        ctx.lineWidth = 1.4;
        for (var w2 = 0; w2 < 26; w2++) {
          var wx = ((w2 * 61.3 + now * 0.42) % (W + 260)) - 130;
          var wy = H * ((w2 * 0.137) % 1) + Math.sin(now / 420 + w2) * 10;
          var len = 30 + (w2 % 5) * 16;
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.quadraticCurveTo(wx + len / 2, wy - 6, wx + len, wy);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(200,170,110,.07)';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    }

    /** 据点旗帜（归属会变，逐帧绘制） */
    function drawFlags(state, now) {
      (state.capturePoints || []).forEach(function (p) {
        var t = topXY(p.x, p.y);
        var side = SIDE[p.owner === 'player' ? 'player' : 'enemy'];
        var poleH = tw * 0.52;
        ctx.strokeStyle = 'rgba(60,45,25,.75)';
        ctx.lineWidth = Math.max(1.2, tw * 0.035);
        ctx.beginPath();
        ctx.moveTo(t.cx, t.cy);
        ctx.lineTo(t.cx, t.cy - poleH);
        ctx.stroke();
        var wave = Math.sin(now / 320 + p.x) * tw * 0.03;
        ctx.beginPath();
        ctx.moveTo(t.cx, t.cy - poleH);
        ctx.lineTo(t.cx + tw * 0.22 + wave, t.cy - poleH + tw * 0.07);
        ctx.lineTo(t.cx, t.cy - poleH + tw * 0.15);
        ctx.closePath();
        ctx.fillStyle = side.flag;
        ctx.fill();
      });

      if (state.victory && state.victory.type === 'escort' && state.victory.target) {
        var tg = state.victory.target;
        var t2 = topXY(tg.x, tg.y);
        var bob = Math.sin(now / 300) * tw * 0.06;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(t2.cx, t2.cy - tw * 0.42 + bob);
        ctx.lineTo(t2.cx - tw * 0.13, t2.cy - tw * 0.66 + bob);
        ctx.lineTo(t2.cx + tw * 0.13, t2.cy - tw * 0.66 + bob);
        ctx.closePath();
        ctx.fill();
      }

      // 敌城：攻城关的核心目标，金环加冕以示「此处即是破敌之处」
      (state.capturePoints || []).forEach(function (p) {
        if (!p.capital) return;
        var t = topXY(p.x, p.y);
        var pulse = 0.55 + 0.45 * Math.sin(now / 280);
        ctx.save();
        ctx.setLineDash([Math.max(4, tw * 0.16), Math.max(3, tw * 0.10)]);
        diamondPath(ctx, t.cx, t.cy, 1.06, 1.06);
        ctx.strokeStyle = 'rgba(255,209,102,' + (0.45 + pulse * 0.5) + ')';
        ctx.lineWidth = Math.max(1.8, tw * 0.05);
        ctx.stroke();
        ctx.restore();
      });

      // 敌军帅旗：夺旗关的胜负手，谁夺得便染谁的颜色
      if (state.flag) {
        var f = state.flag;
        var ft = topXY(f.x, f.y);
        var poleH = tw * (f.carrier ? 0.62 : 0.78);
        var wave = Math.sin(now / 260) * tw * 0.05;
        ctx.save();
        // 旗杆
        ctx.strokeStyle = '#5a4630';
        ctx.lineWidth = Math.max(1.4, tw * 0.045);
        ctx.beginPath();
        ctx.moveTo(ft.cx, ft.cy);
        ctx.lineTo(ft.cx, ft.cy - poleH);
        ctx.stroke();
        // 光晕：无主之旗格外醒目，催人去夺
        if (!f.carrier) {
          var gp = 0.5 + 0.5 * Math.sin(now / 300);
          var gg = ctx.createRadialGradient(ft.cx, ft.cy - poleH * 0.6, 0, ft.cx, ft.cy - poleH * 0.6, tw * 0.6);
          gg.addColorStop(0, 'rgba(255,220,120,' + (0.45 * gp) + ')');
          gg.addColorStop(1, 'rgba(255,180,60,0)');
          ctx.fillStyle = gg;
          ctx.beginPath(); ctx.arc(ft.cx, ft.cy - poleH * 0.6, tw * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        var col = f.owner === 'player' ? '#ffd166' : (f.owner ? '#e04b4b' : '#b8bcc4');
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ft.cx, ft.cy - poleH);
        ctx.lineTo(ft.cx + tw * 0.30 + wave, ft.cy - poleH + tw * 0.10);
        ctx.quadraticCurveTo(ft.cx + tw * 0.17, ft.cy - poleH + tw * 0.21, ft.cx, ft.cy - poleH + tw * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,15,.55)';
        ctx.lineWidth = Math.max(1, tw * 0.022);
        ctx.stroke();
        ctx.restore();
      }

      // 夺旗接应点：把帅旗送到此处才算功成
      if (state.victory && state.victory.type === 'flag' && state.victory.target) {
        var hg = state.victory.target;
        var ht2 = topXY(hg.x, hg.y);
        var bob = Math.sin(now / 300) * tw * 0.06;
        ctx.save();
        ctx.fillStyle = 'rgba(90,209,139,.9)';
        ctx.beginPath();
        ctx.moveTo(ht2.cx, ht2.cy - tw * 0.38 + bob);
        ctx.lineTo(ht2.cx - tw * 0.15, ht2.cy - tw * 0.64 + bob);
        ctx.lineTo(ht2.cx + tw * 0.15, ht2.cy - tw * 0.64 + bob);
        ctx.closePath();
        ctx.fill();
        ctx.setLineDash([Math.max(4, tw * 0.16), Math.max(3, tw * 0.10)]);
        diamondPath(ctx, ht2.cx, ht2.cy, 1.04, 1.04);
        ctx.strokeStyle = 'rgba(90,209,139,.75)';
        ctx.lineWidth = Math.max(1.6, tw * 0.04);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* -------- 选中 / 查看动画 -------- */

    function drawTileRing(id, color, width, dash) {
      var u = null;
      for (var i = 0; i < state0.units.length; i++) {
        if (state0.units[i].id === id) { u = state0.units[i]; break; }
      }
      if (!u || !u.alive) return;
      var p = topXY(u.x, u.y);
      var pulse = 0.55 + 0.45 * Math.sin(performance.now() / 240);
      ctx.save();
      if (dash) ctx.setLineDash([Math.max(3, tw * 0.14), Math.max(3, tw * 0.10)]);
      diamondPath(ctx, p.cx, p.cy, 1, 1);
      ctx.strokeStyle = rgba(color, 0.5 + pulse * 0.5);
      ctx.lineWidth = width;
      ctx.stroke();
      ctx.restore();
    }

    function drawSelection(state, view, now) {
      if (view.selectedId) drawTileRing(view.selectedId, '#ffd166', Math.max(2, tw * 0.09), false);
      if (view.inspectId && view.inspectId !== view.selectedId) {
        drawTileRing(view.inspectId, '#ffffff', Math.max(1.6, tw * 0.06), true);
      }
    }

    /* -------- 单位 -------- */

    function lungeOffset(u, now) {
      for (var i = 0; i < lunges.length; i++) {
        var l = lunges[i];
        if (l.id !== u.id) continue;
        var p = (now - l.t0) / l.dur;
        if (p >= 1) return null;
        var k = Math.sin(Math.PI * Math.min(1, p * 1.6));
        var p0 = unitPos(u);
        var dx = l.tx - p0.x, dy = l.ty - p0.y;
        var len = Math.max(1, Math.abs(dx) + Math.abs(dy));
        return { dx: dx / len * k * 0.34, dy: dy / len * k * 0.34 };
      }
      return null;
    }

    function shakeOffset(u, now) {
      for (var i = 0; i < shakes.length; i++) {
        var s = shakes[i];
        if (s.id !== u.id) continue;
        var p = (now - s.t0) / s.dur;
        if (p >= 1) return null;
        var amp = (1 - p) * tw * 0.14;
        return { dx: Math.sin(now / 22) * amp, dy: Math.cos(now / 17) * amp * 0.5 };
      }
      return null;
    }

    function drawUnit(state, u, view, now, sel) {
      var pos = unitPos(u);
      var gx = Math.max(0, Math.min(state.cols - 1, Math.round(pos.x)));
      var gy = Math.max(0, Math.min(state.rows - 1, Math.round(pos.y)));
      var key = keyAt(gx, gy);
      var cx = centerX(pos.x, pos.y);
      var ground = centerY(pos.x, pos.y) - elev(key);

      var lu = lungeOffset(u, now);
      if (lu) { cx += lu.dx * tw; ground += lu.dy * th; }
      var sh = shakeOffset(u, now);
      if (sh) { cx += sh.dx; ground += sh.dy; }

      var R = tw * 0.33;
      var hover = Math.sin(now / 480 + pos.x) * tw * 0.02;
      var cyUnit = ground - R * 1.08 + hover;

      var side = SIDE[u.side];
      var acted = u.side === 'player' && u.acted;
      var isSel = view.selectedId === u.id;

      // 遮挡缓解：选中单位时，紧邻的其它单位半透明，避免挡住操作目标
      var alpha = acted ? 0.62 : 1;
      if (sel && !isSel) {
        var d = Math.abs(u.x - sel.x) + Math.abs(u.y - sel.y);
        if (d <= 1) alpha *= 0.42;
        else if (d <= 2) alpha *= 0.72;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // 地面阴影
      ctx.beginPath();
      ctx.ellipse(cx, ground + th * 0.1, R * 0.86, R * 0.44, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.fill();

      // 选中底盘光环
      if (isSel) {
        ctx.beginPath();
        ctx.arc(cx, cyUnit, R * 1.18, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,209,102,.85)';
        ctx.lineWidth = Math.max(1.6, tw * 0.05);
        ctx.stroke();
      }

      // 令牌底盘
      ctx.beginPath();
      ctx.arc(cx, cyUnit, R, 0, Math.PI * 2);
      ctx.fillStyle = isDark() ? side.deep : '#fffdf8';
      ctx.fill();

      // 头像
      var img = heroImage(u.heroId);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cyUnit, R * 0.9, 0, Math.PI * 2);
      ctx.clip();
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, cx - R * 0.9, cyUnit - R * 0.9, R * 1.8, R * 1.8);
      } else {
        ctx.fillStyle = side.soft;
        ctx.fillRect(cx - R, cyUnit - R, R * 2, R * 2);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(R * 0.9) + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        // 无名营伍以兵种字为记，与名将的姓名尾字区分开
        var label = (u.hero && u.hero.levy)
          ? (core.TROOPS[u.troop] || core.TROOPS.infantry).short
          : u.name.charAt(u.name.length - 1);
        ctx.fillText(label, cx, cyUnit);
      }
      if (acted) {
        ctx.fillStyle = 'rgba(20,20,24,.42)';
        ctx.fillRect(cx - R, cyUnit - R, R * 2, R * 2);
      }
      ctx.restore();

      // 阵营描边（外描一层深色，让令牌在花哨地形上依然清晰）
      ctx.beginPath();
      ctx.arc(cx, cyUnit, R * 1.02, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(24,18,10,.45)';
      ctx.lineWidth = Math.max(2.4, tw * 0.10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cyUnit, R * 0.96, 0, Math.PI * 2);
      ctx.strokeStyle = side.ring;
      ctx.lineWidth = Math.max(1.8, tw * 0.07);
      ctx.stroke();

      // 兵种角标：贴令牌下缘，不再压住头像
      var troop = core.TROOPS[u.troop];
      var bs = R * 0.76;
      var by = cyUnit + R * 0.80;
      ctx.beginPath();
      roundRect(ctx, cx - bs / 2, by - bs * 0.34, bs, bs * 0.72, bs * 0.26);
      ctx.fillStyle = isDark() ? 'rgba(16,16,22,.92)' : 'rgba(30,24,16,.90)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold ' + Math.round(bs * 0.50) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(troop.name.charAt(0), cx, by + bs * 0.02);

      // 身份徽记（缩小，避免互相遮挡）
      var br = R * 0.30;
      if (u.isLeader) badge(cx + R * 0.90, cyUnit - R * 0.90, '#ffd166', '帅', br);
      if (u.isEscort) badge(cx + R * 0.90, cyUnit + R * 0.30, '#22c55e', '护', br);
      if (u.isBoss) badge(cx - R * 0.90, cyUnit - R * 0.90, '#ffd166', '将', br);

      // 状态
      if (u.buffs && (u.buffs.atkUp || u.buffs.defUp || u.buffs.burn)) {
        var mark = u.buffs.burn ? '火' : u.buffs.atkUp ? '攻' : '守';
        badge(cx - R * 0.90, cyUnit + R * 0.30, u.buffs.burn ? '#ef6d63' : '#7c5cff', mark, br);
      }

      // 血条 / 士气条：紧凑贴顶，减少对上方格子的遮挡
      var barW = R * 1.85, barH = Math.max(3, tw * 0.085);
      var bx = cx - barW / 2, byY = cyUnit - R * 1.30 - barH;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      roundRect(ctx, bx - 1, byY - 1, barW + 2, barH + 2, barH);
      ctx.fill();
      var ratio = Math.max(0, u.hp / u.maxHp);
      ctx.fillStyle = ratio > 0.6 ? '#4cc27a' : ratio > 0.3 ? '#e8a33a' : '#e0524f';
      roundRect(ctx, bx, byY, Math.max(1, barW * ratio), barH, barH / 2);
      ctx.fill();

      var mh = Math.max(2, tw * 0.055);
      var my = byY - mh - 1;
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      roundRect(ctx, bx, my, barW, mh, mh / 2);
      ctx.fill();
      ctx.fillStyle = u.morale >= 100 ? '#ffd166' : '#f0a63c';
      roundRect(ctx, bx, my, Math.max(1, barW * (u.morale / 100)), mh, mh / 2);
      ctx.fill();

      // 技能就绪提示
      var sk = u.hero.skillDef;
      if (u.side === 'player' && !acted && sk && u.morale >= sk.cost && !u.skillUsed) {
        var glow = 0.5 + 0.5 * Math.sin(now / 200);
        ctx.beginPath();
        ctx.arc(cx, cyUnit, R * 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,209,102,' + (0.25 + glow * 0.4) + ')';
        ctx.lineWidth = Math.max(1.2, tw * 0.05);
        ctx.stroke();
      }

      // 重叠候选提示：指针下有多个单位时，虚线环提示可连点切换
      if (hoverIds[u.id] && !isSel) {
        ctx.beginPath();
        ctx.arc(cx, cyUnit, R * 1.34, 0, Math.PI * 2);
        ctx.setLineDash([Math.max(2, tw * 0.10), Math.max(2, tw * 0.08)]);
        ctx.strokeStyle = hoverIds[u.id] === 2 ? '#ffffff' : 'rgba(255,255,255,.62)';
        ctx.lineWidth = Math.max(1.4, tw * 0.05);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    function badge(cx, cy, color, text, r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,20,0,.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#3a2a00';
      ctx.font = 'bold ' + Math.round(r * 1.25) + 'px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy + 0.5);
    }

    /* -------- 悬停 / 瞄准预览 -------- */

    function drawHover(state, view, now) {
      var t = hoverTile;
      /*
       * 施计之前先铺一层「地势宜忌」：宜用之处泛青光，不宜之处灰暗。
       * 火攻该往林里放、水攻该往洼地放——看得见，才谈得上因地制宜。
       */
      if (view.aimFit) {
        ctx.save();
        for (var fk in view.aimFit) {
          var fp = fk.split(',');
          var fx = parseInt(fp[0], 10), fy = parseInt(fp[1], 10);
          if (!core.inBounds(state, fx, fy)) continue;
          var q0 = topXY(fx, fy);
          var good = view.aimFit[fk] === 1;
          diamondPath(ctx, q0.cx, q0.cy, 0.88, 0.88);
          ctx.fillStyle = good ? 'rgba(110,225,150,.26)' : 'rgba(130,130,130,.16)';
          ctx.fill();
          ctx.setLineDash(good ? [] : [Math.max(3, tw * 0.10), Math.max(3, tw * 0.08)]);
          diamondPath(ctx, q0.cx, q0.cy, 0.88, 0.88);
          ctx.strokeStyle = good ? 'rgba(110,225,150,.80)' : 'rgba(170,170,170,.45)';
          ctx.lineWidth = Math.max(1, tw * 0.032);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (view.aimTiles && view.aimTiles.length) {
        view.aimTiles.forEach(function (p) {
          if (!core.inBounds(state, p.x, p.y)) return;
          var q = topXY(p.x, p.y);
          diamondPath(ctx, q.cx, q.cy, 1, 1);
          ctx.fillStyle = 'rgba(255,209,102,.34)';
          ctx.fill();
          diamondPath(ctx, q.cx, q.cy, 1, 1);
          ctx.strokeStyle = '#ffd166';
          ctx.lineWidth = Math.max(1.6, tw * 0.06);
          ctx.stroke();
        });
        return;
      }
      if (!t || !core.inBounds(state, t.x, t.y)) return;
      var p = topXY(t.x, t.y);
      diamondPath(ctx, p.cx, p.cy, 1, 1);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = Math.max(1.6, tw * 0.06);
      ctx.stroke();
    }

    /* -------- 武将技特效：一计一式，各有其形 -------- */

    var FX_COLOR = {
      fire: '#ff7a18', water: '#3fa9f5', thunder: '#c9a4ff', rock: '#b09a76',
      arcane: '#a86bff', heal: '#5ad18b', buff: '#ffd166', array: '#8fd0ff',
      mind: '#9a5bd6', blade: '#ffe8b0', ambush: '#d8b06a', beast: '#c98b4b',
      weather: '#9fd6ff'
    };

    function addSkillFx(tiles, opts) {
      opts = opts || {};
      skillFx.push({
        tiles: (tiles || []).slice(),
        kind: opts.kind || 'damage',
        element: opts.element || null,
        magic: !!opts.magic,
        t0: performance.now(),
        dur: (opts.dur || 900) / speed,
        seed: opts.seed === undefined ? Math.random() * 1000 : opts.seed
      });
      // 范围底色：不同计略染不同的色，一眼分得出是火是水
      addFlash(tiles, FX_COLOR[fxStyleOf({ kind: opts.kind, element: opts.element, magic: opts.magic })] || '#ffd166');
    }

    /** 依据元素与效果判定该画哪一种特效 */
    function fxStyleOf(fx) {
      var el = fx.element;
      if (el === 'fire') return 'fire';
      if (el === 'water') return 'water';
      if (el === 'thunder') return 'thunder';
      if (el === 'rock') return 'rock';
      if (el === 'arcane') return 'arcane';
      if (el === 'beast') return 'beast';
      var k = fx.kind;
      if (k === 'heal') return 'heal';
      if (k === 'buff' || k === 'bluff') return 'buff';
      if (k === 'stun') return 'array';
      if (k === 'panic' || k === 'chaos' || k === 'bewitch' ||
        k === 'feint' || k === 'debuff' || k === 'defect') return 'mind';
      if (k === 'ambush') return 'ambush';
      if (k === 'weather') return 'weather';
      return fx.magic ? 'arcane' : 'blade';
    }

    /** 伪随机（同一技能同一格每帧结果一致，画面才不抖） */
    function fxr(seed, i) {
      var v = Math.sin((seed + i * 12.9898) * 43758.5453);
      return v - Math.floor(v);
    }

    /** 火苗：底部圆润、顶部尖细 */
    function flame(c, x, yb, h, w) {
      c.beginPath();
      c.moveTo(x - w, yb);
      c.quadraticCurveTo(x - w * 0.75, yb - h * 0.55, x, yb - h);
      c.quadraticCurveTo(x + w * 0.75, yb - h * 0.55, x + w, yb);
      c.closePath();
      c.fill();
    }

    /** 画一格的技能特效。p 为进度 0..1，u 为格宽 */
    function drawOneFx(c, style, cx, cy, p, u, seed) {
      var hh = u * 0.25;                       // 菱形半高
      c.save();

      if (style === 'fire') {
        for (var i = 0; i < 5; i++) {
          var ph = (p * 1.5 + i * 0.27) % 1;   // 火苗此起彼伏
          var fx0 = (fxr(seed, i) - 0.5) * u * 0.55;
          var fy0 = cy + (fxr(seed, i + 9) - 0.5) * hh * 0.7;
          var hgt = u * (0.85 + fxr(seed, i + 3) * 0.65) * (1 - ph * 0.45);
          var wid = u * 0.21 * (1 - ph * 0.35);
          var g = c.createLinearGradient(cx + fx0, fy0, cx + fx0, fy0 - hgt);
          g.addColorStop(0, 'rgba(255,70,10,' + (0.98 * (1 - ph)) + ')');
          g.addColorStop(0.45, 'rgba(255,165,25,' + (0.92 * (1 - ph * 0.7)) + ')');
          g.addColorStop(1, 'rgba(255,245,180,0)');
          c.fillStyle = g;
          flame(c, cx + fx0, fy0, hgt, wid);
        }
        // 腾起的浓烟
        c.globalAlpha = 0.30 * (1 - p);
        c.fillStyle = '#5a4a44';
        c.beginPath();
        c.arc(cx + Math.sin(p * 6 + seed) * u * 0.1, cy - u * (0.5 + p * 0.5), u * 0.22 * (0.6 + p * 0.7), 0, Math.PI * 2);
        c.fill();

      } else if (style === 'water') {
        // 三层同心波纹由内向外推开
        for (var w1 = 0; w1 < 3; w1++) {
          var wp = (p * 1.6 - w1 * 0.22);
          if (wp < 0 || wp > 1) continue;
          c.globalAlpha = 0.75 * (1 - wp);
          c.strokeStyle = w1 === 0 ? '#bfe9ff' : '#3fa9f5';
          c.lineWidth = Math.max(1.4, u * 0.07 * (1 - wp * 0.5));
          c.beginPath();
          c.ellipse(cx, cy, u * 0.48 * wp + u * 0.08, hh * 0.48 * wp + hh * 0.08, 0, 0, Math.PI * 2);
          c.stroke();
        }
        // 上涨的水面
        c.globalAlpha = 0.42;
        var wg = c.createLinearGradient(cx, cy - hh * 1.2, cx, cy + hh);
        wg.addColorStop(0, 'rgba(160,220,255,.15)');
        wg.addColorStop(1, 'rgba(40,120,200,.75)');
        c.fillStyle = wg;
        diamondPath(c, cx, cy, 1, 1);
        c.fill();
        c.globalAlpha = 1;
        // 溅起的水花
        c.fillStyle = '#e8f8ff';
        for (var s = 0; s < 5; s++) {
          var sp = (p * 1.8 + s * 0.2) % 1;
          var ang = fxr(seed, s) * Math.PI * 2;
          var rr = u * 0.42 * sp;
          c.globalAlpha = 1 - sp;
          c.beginPath();
          c.arc(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr * 0.5 - sp * u * 0.35, u * 0.045, 0, Math.PI * 2);
          c.fill();
        }

      } else if (style === 'thunder') {
        // 锯齿闪电自天而降
        var segs = 7, top = cy - u * 1.6;
        c.strokeStyle = 'rgba(255,255,255,' + (0.95 * (1 - p * 0.6)) + ')';
        c.lineWidth = Math.max(1.8, u * 0.075);
        c.shadowColor = '#c9a4ff'; c.shadowBlur = u * 0.35;
        c.beginPath();
        c.moveTo(cx, top);
        for (var t2 = 1; t2 <= segs; t2++) {
          var ty = top + (cy + hh * 0.4 - top) * (t2 / segs);
          var jx = cx + (fxr(seed, t2) - 0.5) * u * 0.5 * (1 - t2 / (segs + 2));
          c.lineTo(jx, ty);
        }
        c.stroke();
        c.shadowBlur = 0;
        // 落雷炸开的紫白光晕
        c.globalAlpha = (1 - p) * 0.85;
        var tg = c.createRadialGradient(cx, cy, 0, cx, cy, u * 0.7);
        tg.addColorStop(0, 'rgba(240,230,255,.95)');
        tg.addColorStop(0.4, 'rgba(170,130,255,.55)');
        tg.addColorStop(1, 'rgba(120,80,220,0)');
        c.fillStyle = tg;
        c.beginPath(); c.arc(cx, cy, u * 0.7, 0, Math.PI * 2); c.fill();

      } else if (style === 'rock') {
        // 巨石自上方砸落，着地扬起尘土
        var fall = Math.min(1, p * 2.2);
        for (var r2 = 0; r2 < 3; r2++) {
          var rx = cx + (fxr(seed, r2) - 0.5) * u * 0.45;
          var ry = cy - u * 1.5 * (1 - fall) + (fxr(seed, r2 + 5) - 0.5) * hh * 0.6;
          var rad = u * (0.13 + fxr(seed, r2 + 2) * 0.09);
          c.globalAlpha = 0.95;
          c.fillStyle = r2 % 2 ? '#8d7a5e' : '#a89476';
          c.beginPath();
          for (var v2 = 0; v2 < 6; v2++) {
            var a2 = v2 / 6 * Math.PI * 2 + fxr(seed, r2 + v2);
            var vr = rad * (0.75 + fxr(seed, r2 + v2 + 3) * 0.5);
            var px = rx + Math.cos(a2) * vr, py = ry + Math.sin(a2) * vr * 0.75;
            if (v2 === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath(); c.fill();
          c.fillStyle = 'rgba(255,255,255,.18)';
          c.beginPath(); c.arc(rx - rad * 0.3, ry - rad * 0.3, rad * 0.35, 0, Math.PI * 2); c.fill();
        }
        if (p > 0.45) {
          var dp = (p - 0.45) / 0.55;
          c.globalAlpha = 0.5 * (1 - dp);
          c.strokeStyle = '#d8c8a8'; c.lineWidth = Math.max(1.2, u * 0.05);
          c.beginPath(); c.ellipse(cx, cy, u * 0.5 * dp, hh * 0.5 * dp, 0, 0, Math.PI * 2); c.stroke();
        }

      } else if (style === 'arcane') {
        // 旋转符文阵
        var rot = p * Math.PI * 1.6;
        c.strokeStyle = 'rgba(180,120,255,' + (0.9 * (1 - p * 0.5)) + ')';
        c.lineWidth = Math.max(1.3, u * 0.045);
        c.beginPath(); c.ellipse(cx, cy, u * 0.42, hh * 0.46, rot, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.ellipse(cx, cy, u * 0.30, hh * 0.33, -rot * 1.3, 0, Math.PI * 2); c.stroke();
        for (var g2 = 0; g2 < 6; g2++) {
          var ga = rot + g2 / 6 * Math.PI * 2;
          c.globalAlpha = 0.9 * (1 - p * 0.4);
          c.fillStyle = '#e0c8ff';
          c.beginPath();
          c.arc(cx + Math.cos(ga) * u * 0.42, cy + Math.sin(ga) * hh * 0.46, u * 0.045, 0, Math.PI * 2);
          c.fill();
        }
        c.globalAlpha = 0.55 * (1 - p * 0.5);
        var ag = c.createRadialGradient(cx, cy, 0, cx, cy, u * 0.55);
        ag.addColorStop(0, 'rgba(200,150,255,.6)');
        ag.addColorStop(1, 'rgba(120,60,220,0)');
        c.fillStyle = ag;
        c.beginPath(); c.arc(cx, cy, u * 0.55, 0, Math.PI * 2); c.fill();

      } else if (style === 'heal') {
        // 金色光柱 + 上升的星点
        var hg = c.createLinearGradient(cx, cy + hh, cx, cy - u * 1.3);
        hg.addColorStop(0, 'rgba(120,230,170,.85)');
        hg.addColorStop(0.5, 'rgba(160,255,200,.45)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = hg;
        c.beginPath();
        c.moveTo(cx - u * 0.30, cy + hh * 0.5);
        c.lineTo(cx - u * 0.16, cy - u * 1.25);
        c.lineTo(cx + u * 0.16, cy - u * 1.25);
        c.lineTo(cx + u * 0.30, cy + hh * 0.5);
        c.closePath(); c.fill();
        for (var h2 = 0; h2 < 5; h2++) {
          var hp = (p * 1.4 + h2 * 0.2) % 1;
          var hx = cx + (fxr(seed, h2) - 0.5) * u * 0.5;
          c.globalAlpha = 1 - hp;
          c.fillStyle = '#eaffef';
          c.beginPath();
          c.arc(hx, cy + hh * 0.4 - hp * u * 1.1, u * 0.05, 0, Math.PI * 2);
          c.fill();
        }

      } else if (style === 'buff') {
        // 上升的金色箭头与光环
        var br = u * (0.18 + p * 0.42);
        c.globalAlpha = 0.85 * (1 - p * 0.5);
        c.strokeStyle = '#ffd166'; c.lineWidth = Math.max(1.6, u * 0.06);
        c.beginPath(); c.ellipse(cx, cy, br, br * 0.55, 0, 0, Math.PI * 2); c.stroke();
        var by = cy - p * u * 0.8;
        c.fillStyle = 'rgba(255,214,110,' + (1 - p) + ')';
        c.beginPath();
        c.moveTo(cx, by - u * 0.20);
        c.lineTo(cx + u * 0.13, by + u * 0.04);
        c.lineTo(cx - u * 0.13, by + u * 0.04);
        c.closePath(); c.fill();

      } else if (style === 'array') {
        // 八卦阵纹：外圈 + 阴阳双鱼，缓缓旋转
        var ar = p * Math.PI * 1.2;
        c.globalAlpha = 0.9 * (1 - p * 0.35);
        c.strokeStyle = '#8fd0ff'; c.lineWidth = Math.max(1.4, u * 0.05);
        c.beginPath(); c.ellipse(cx, cy, u * 0.46, hh * 0.48, 0, 0, Math.PI * 2); c.stroke();
        c.save();
        c.translate(cx, cy); c.rotate(ar);
        c.fillStyle = 'rgba(143,208,255,.55)';
        c.beginPath();
        c.ellipse(0, -hh * 0.16, u * 0.17, hh * 0.17, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(30,60,90,.75)';
        c.beginPath();
        c.ellipse(0, hh * 0.16, u * 0.17, hh * 0.17, 0, 0, Math.PI * 2); c.fill();
        c.restore();

      } else if (style === 'mind') {
        // 心战：黑紫旋涡 + 裂纹，攻心之术
        c.strokeStyle = 'rgba(160,90,220,' + (0.9 * (1 - p * 0.4)) + ')';
        c.lineWidth = Math.max(1.3, u * 0.045);
        c.beginPath();
        for (var m2 = 0; m2 <= 40; m2++) {
          var mp = m2 / 40;
          var ma = mp * Math.PI * 3.2 + p * 2.4;
          var mr = u * 0.45 * (1 - mp * 0.85);
          var mx2 = cx + Math.cos(ma) * mr, my2 = cy + Math.sin(ma) * mr * 0.5;
          if (m2 === 0) c.moveTo(mx2, my2); else c.lineTo(mx2, my2);
        }
        c.stroke();
        c.globalAlpha = 0.5 * (1 - p * 0.6);
        var mg = c.createRadialGradient(cx, cy, 0, cx, cy, u * 0.5);
        mg.addColorStop(0, 'rgba(90,20,140,.75)');
        mg.addColorStop(1, 'rgba(60,10,100,0)');
        c.fillStyle = mg;
        c.beginPath(); c.arc(cx, cy, u * 0.5, 0, Math.PI * 2); c.fill();

      } else if (style === 'ambush') {
        // 伏兵四起：枪尖自地面刺出
        for (var b2 = 0; b2 < 5; b2++) {
          var bp = Math.min(1, p * 2.6 - b2 * 0.12);
          if (bp <= 0) continue;
          var bx = cx + (fxr(seed, b2) - 0.5) * u * 0.62;
          var by2 = cy + (fxr(seed, b2 + 6) - 0.5) * hh * 0.7;
          var len = u * 0.42 * bp;
          c.globalAlpha = 0.95;
          c.strokeStyle = '#e8dcc0'; c.lineWidth = Math.max(1.4, u * 0.05);
          c.beginPath(); c.moveTo(bx, by2 + len * 0.4); c.lineTo(bx + u * 0.06, by2 - len); c.stroke();
          c.fillStyle = '#d8b06a';
          c.beginPath();
          c.moveTo(bx + u * 0.06, by2 - len);
          c.lineTo(bx + u * 0.13, by2 - len + u * 0.13);
          c.lineTo(bx - u * 0.01, by2 - len + u * 0.13);
          c.closePath(); c.fill();
        }

      } else if (style === 'beast') {
        // 兽群奔突：三道爪痕
        c.globalAlpha = 0.9 * (1 - p * 0.5);
        c.strokeStyle = '#c98b4b'; c.lineWidth = Math.max(1.6, u * 0.06);
        for (var c2 = 0; c2 < 3; c2++) {
          var cx2 = cx + (c2 - 1) * u * 0.17;
          c.beginPath();
          c.moveTo(cx2 - u * 0.10, cy - hh * 0.7);
          c.quadraticCurveTo(cx2, cy + hh * 0.1, cx2 + u * 0.10, cy + hh * 0.85);
          c.stroke();
        }

      } else if (style === 'weather') {
        // 天时变幻：云气盘旋
        c.globalAlpha = 0.8 * (1 - p * 0.4);
        c.strokeStyle = '#9fd6ff'; c.lineWidth = Math.max(1.4, u * 0.05);
        for (var q2 = 0; q2 < 3; q2++) {
          var qa = p * 2.2 + q2 * 2.1;
          c.beginPath();
          c.ellipse(cx + Math.cos(qa) * u * 0.3, cy + Math.sin(qa) * hh * 0.4,
            u * 0.26, hh * 0.3, qa, 0, Math.PI * 2);
          c.stroke();
        }

      } else {
        // 兵刃：交错的刀光
        c.globalAlpha = 0.95 * (1 - p * 0.55);
        c.strokeStyle = '#fff6dc'; c.lineWidth = Math.max(1.8, u * 0.07);
        for (var k2 = 0; k2 < 2; k2++) {
          var ka = (k2 ? 0.9 : -0.9) + p * 0.6;
          c.beginPath();
          c.ellipse(cx, cy, u * 0.46, hh * 0.5, ka, -0.7, 0.7);
          c.stroke();
        }
        c.globalAlpha = 0.5 * (1 - p);
        c.strokeStyle = '#ffd166'; c.lineWidth = Math.max(1, u * 0.03);
        c.beginPath(); c.ellipse(cx, cy, u * 0.58, hh * 0.62, 0, 0, Math.PI * 2); c.stroke();
      }
      c.restore();
    }

    function drawSkillFx(now) {
      if (!skillFx.length) return;
      skillFx = skillFx.filter(function (f) { return now - f.t0 < f.dur; });
      for (var i = 0; i < skillFx.length; i++) {
        var f = skillFx[i];
        var p = (now - f.t0) / f.dur;
        if (p < 0 || p > 1) continue;
        var style = fxStyleOf(f);
        for (var j = 0; j < f.tiles.length; j++) {
          var t = f.tiles[j];
          if (!state0 || !core.inBounds(state0, t.x, t.y)) continue;
          var q = topXY(t.x, t.y);
          drawOneFx(ctx, style, q.cx, q.cy, p, tw, f.seed + j * 7.3);
        }
      }
    }

    /** 战场遗留物：火场、洪水、乱石、阵法 */
    function drawHazards(state, now) {
      if (!state.hazard) return;
      var cols = state.cols;
      for (var i = 0; i < state.hazard.length; i++) {
        var v = state.hazard[i];
        if (!v) continue;
        var x = i % cols, y = (i / cols) | 0;
        var p = topXY(x, y);
        var cx = p.cx, cy = p.cy, hh = tw * 0.25;
        ctx.save();
        if (v === core.HAZ.FLOOD) {
          var wob = Math.sin(now / 520 + x * 0.7 + y * 0.5) * 0.05;
          ctx.globalAlpha = 0.62;
          var fg = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
          fg.addColorStop(0, 'rgba(120,190,240,.55)');
          fg.addColorStop(1, 'rgba(30,90,160,.85)');
          ctx.fillStyle = fg;
          diamondPath(ctx, cx, cy, 1 + wob, 1 + wob);
          ctx.fill();
          ctx.globalAlpha = 0.5;
          ctx.strokeStyle = '#cfeaff'; ctx.lineWidth = Math.max(1, tw * 0.035);
          ctx.beginPath();
          ctx.ellipse(cx, cy, tw * 0.28, hh * 0.28, 0, 0, Math.PI * 2);
          ctx.stroke();
        } else if (v === core.HAZ.ROCK) {
          ctx.globalAlpha = 0.95;
          for (var r = 0; r < 3; r++) {
            var rr = tw * (0.14 + (r % 2) * 0.06);
            var ox = (r - 1) * tw * 0.22, oy = (r === 1 ? -1 : 1) * hh * 0.18;
            ctx.fillStyle = r % 2 ? '#7d6c52' : '#9c8a6c';
            ctx.beginPath();
            for (var k = 0; k < 6; k++) {
              var a = k / 6 * Math.PI * 2 + r;
              var vr = rr * (0.7 + ((k * 37 + r * 11) % 10) / 30);
              var px = cx + ox + Math.cos(a) * vr, py = cy + oy + Math.sin(a) * vr * 0.7;
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill();
          }
        } else if (v === core.HAZ.ARRAY) {
          ctx.globalAlpha = 0.55;
          ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = Math.max(1, tw * 0.035);
          var rot = now / 1400;
          ctx.beginPath(); ctx.ellipse(cx, cy, tw * 0.4, hh * 0.42, rot, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.ellipse(cx, cy, tw * 0.24, hh * 0.26, -rot, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
      }
    }

    /* -------- 特效 -------- */

    function drawEffects(now) {
      flashes = flashes.filter(function (f) { return now - f.t0 < f.dur; });
      flashes.forEach(function (f) {
        var p = (now - f.t0) / f.dur;
        ctx.globalAlpha = 0.55 * (1 - p);
        ctx.fillStyle = f.color;
        f.tiles.forEach(function (t) {
          var q;
          try { q = topXY(t.x, t.y); } catch (e) { return; }
          diamondPath(ctx, q.cx, q.cy, 1, 1);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      });

      floaters = floaters.filter(function (f) { return now - f.t0 < f.dur; });
      floaters.forEach(function (f) {
        var p = (now - f.t0) / f.dur;
        ctx.globalAlpha = 1 - p * p;
        var size = Math.max(12, tw * 0.46);
        ctx.font = 'bold ' + Math.round(size) + 'px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(2, size * 0.18);
        ctx.strokeStyle = 'rgba(0,0,0,.7)';
        var tx = centerX(f.x, f.y);
        var ty = centerY(f.x, f.y) - tw * 0.5 - p * tw * 0.9;
        ctx.strokeText(f.text, tx, ty);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, tx, ty);
        ctx.globalAlpha = 1;
      });

      if (lunges.length) lunges = lunges.filter(function (l) { return now - l.t0 < l.dur; });
      if (shakes.length) shakes = shakes.filter(function (s) { return now - s.t0 < s.dur; });
      if (anims.length) anims = anims.filter(function (a) { return now - a.t0 < a.dur + 60; });
      if (skillFx.length) drawSkillFx(now);
    }

    /* ------------------------------------------------------------------ *
     * 主绘制
     * ------------------------------------------------------------------ */

    function draw(state, view) {
      if (!state) return;
      state0 = state;
      view = view || {};
      var now = performance.now();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, vw, vh);
      paintBackdrop(state);

      buildBase(state, view);

      ctx.save();
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.z, cam.z);
      ctx.drawImage(base, 0, 0, cssW, cssH);

      drawWater(state, now);
      drawFires(state, now);
      drawHazards(state, now);
      drawSelection(state, view, now);
      drawHover(state, view, now);

      var sel = null, insp = null;
      if (view.selectedId) {
        for (var i = 0; i < state.units.length; i++) {
          if (state.units[i].id === view.selectedId) { sel = state.units[i]; break; }
        }
      }
      if (view.inspectId && view.inspectId !== view.selectedId) {
        for (var j = 0; j < state.units.length; j++) {
          if (state.units[j].id === view.inspectId) { insp = state.units[j]; break; }
        }
      }

      var units = state.units.filter(function (u) { return u.alive; });
      units.sort(function (a, b) { return (a.x + a.y) - (b.x + b.y) || (a.x - b.x); });
      // 查看的敌将 → 选中的单位最后画（永远压在最上层），避免被别的单位盖住
      units.forEach(function (u) {
        if (sel && u.id === sel.id) return;
        if (insp && u.id === insp.id) return;
        drawUnit(state, u, view, now, sel);
      });
      if (insp && insp.alive) drawUnit(state, insp, view, now, sel);
      if (sel && sel.alive) drawUnit(state, sel, view, now, sel);

      drawFlags(state, now);
      drawEffects(now);
      ctx.restore();

      // 天时覆盖整个战场，不受镜头位移影响
      drawWeather(state, now);
    }

    return {
      canvas: canvas,
      resize: resize,
      draw: draw,
      toTile: toTile,
      unitsAtScreen: unitsAtScreen,
      ensureVisible: ensureVisible,
      setHoverIds: function (map) { hoverIds = map || {}; },
      animateMove: animateMove,
      addFloater: addFloater,
      addFlash: addFlash,
      addSkillFx: addSkillFx,
      addLunge: addLunge,
      addShake: addShake,
      busy: busy,
      clearAnims: clearAnims,
      resetView: resetView,
      centerOn: centerOn,
      zoomAt: zoomAt,
      zoomFit: zoomFit,
      fitScale: fitScale,
      panBy: panBy,
      setHover: function (t) { hoverTile = t; },
      get tile() { return tw; },
      get camZ() { return cam.z; },
      setSpeed: function (s) { speed = s || 1; }
    };
  }

  render.create = create;
  SG.render = render;
})(typeof self !== 'undefined' ? self : this);
