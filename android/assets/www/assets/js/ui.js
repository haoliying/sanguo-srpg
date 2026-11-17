/* ==========================================================================
 * ui.js — DOM 助手、吐司、对话框、主题
 * ========================================================================== */
(function (root) {
  'use strict';

  var SG = root.SG = root.SG || {};
  var ui = {};

  function $(sel, scope) { return (scope || document).querySelector(sel); }
  function $$(sel, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(sel)); }

  ui.$ = $;
  ui.$$ = $$;

  ui.el = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  ui.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ------------------------------- 吐司 ------------------------------- */

  var toastTimer = null;
  ui.toast = function (msg, ms) {
    var box = $('#toast') || (function () {
      var d = ui.el('div', 'toast', '');
      d.id = 'toast';
      document.body.appendChild(d);
      return d;
    })();
    box.textContent = msg;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('show'); }, ms || 1800);
  };

  /* ------------------------------ 对话框 ------------------------------ */

  ui.dialog = function (opts) {
    var mask = ui.el('div', 'mask');
    var box = ui.el('div', 'dialog');
    if (opts.title) box.appendChild(ui.el('h3', 'dialog-title', opts.title));
    if (opts.text) box.appendChild(ui.el('p', 'dialog-text', opts.text));
    if (opts.html) {
      var d = ui.el('div', 'dialog-body');
      d.innerHTML = opts.html;
      box.appendChild(d);
    }
    var row = ui.el('div', 'dialog-actions');
    (opts.buttons || [{ text: '知道了' }]).forEach(function (b) {
      var btn = ui.el('button', 'btn ' + (b.cls || 'btn-ghost'), b.text);
      btn.addEventListener('click', function () {
        close();
        if (b.onClick) b.onClick();
      });
      row.appendChild(btn);
    });
    box.appendChild(row);
    mask.appendChild(box);
    document.body.appendChild(mask);

    function close() { mask.remove(); }
    mask.addEventListener('click', function (e) {
      if (e.target === mask && opts.dismissible !== false) close();
    });
    return { close: close };
  };

  /* ------------------------------ 主题 ------------------------------ */

  var mql = null;
  function resolveTheme(mode) {
    if (mode === 'system') {
      if (!mql) mql = root.matchMedia('(prefers-color-scheme: dark)');
      return mql.matches ? 'dark' : 'light';
    }
    return mode;
  }

  ui.applyTheme = function (mode) {
    var resolved = resolveTheme(mode);
    document.documentElement.setAttribute('data-theme', resolved);
    var bg = resolved === 'dark' ? '#0f1116' : '#f5f6f8';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', bg);
    try {
      var bridge = root.SanguoBridge || root.SudokuBridge;
      if (bridge && bridge.setStatusBarColor) bridge.setStatusBarColor(bg);
    } catch (e) { /* 浏览器环境无此桥 */ }
  };

  ui.initTheme = function () {
    var mode = (SG.store && SG.store.settings().theme) || 'system';
    ui.applyTheme(mode);
    if (!mql) mql = root.matchMedia('(prefers-color-scheme: dark)');
    var handler = function () {
      if (((SG.store && SG.store.settings().theme) || 'system') === 'system') ui.applyTheme('system');
    };
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler);
  };

  /* ------------------------------ 其他 ------------------------------ */

  ui.stars = function (n) {
    var s = '';
    for (var i = 0; i < 3; i++) s += i < n ? '★' : '☆';
    return s;
  };

  ui.percent = function (v, max) {
    return Math.max(0, Math.min(100, Math.round(v / Math.max(1, max) * 100)));
  };

  SG.ui = ui;
})(typeof self !== 'undefined' ? self : this);
