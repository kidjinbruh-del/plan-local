/* ПЛАН: панель оформления (тема, акцент, масштаб). Работает без сборки и без Node. */
(function () {
  'use strict';

  var KEY = 'plan-theme-v2';
  var DEFAULTS = { mode: 'dark', accent: '#4c78f4', scale: 100 };
  var ACCENTS = ['#4c78f4', '#6a5cff', '#2fa37a', '#e0803a', '#d9534f', '#0ea5b7', '#b06ab3', '#64748b'];

  var state = Object.assign({}, DEFAULTS);
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) state = Object.assign(state, JSON.parse(raw));
  } catch (e) {
    console.warn('[theme] localStorage недоступен:', e && e.message);
  }

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function resolvedMode() {
    if (state.mode === 'system') return mq && mq.matches ? 'dark' : 'light';
    return state.mode === 'light' ? 'light' : 'dark';
  }

  function apply() {
    var mode = resolvedMode();
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.style.setProperty('--plan-accent', state.accent);
    document.documentElement.style.setProperty('color-scheme', mode === 'dark' ? 'dark' : 'light');
    if (window.planDesktop && window.planDesktop.setZoom) {
      window.planDesktop.setZoom((state.scale || 100) / 100).catch(function (e) {
        console.warn('[theme] масштаб не применён:', e && e.message);
      });
    }
    syncUI();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[theme] не удалось сохранить:', e && e.message);
    }
  }

  function set(key, value) {
    state[key] = value;
    apply();
    save();
  }

  var ui = {};

  function syncUI() {
    if (!ui.panel) return;
    Array.prototype.forEach.call(ui.mode.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-v') === state.mode);
    });
    Array.prototype.forEach.call(ui.swatches.querySelectorAll('button'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-v').toLowerCase() === String(state.accent).toLowerCase());
    });
    ui.range.value = state.scale;
    ui.scaleLabel.textContent = state.scale + '%';
  }

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') n.textContent = attrs[k];
        else if (k === 'class') n.className = attrs[k];
        else n.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  function build() {
    var wrap = el('div', { class: 'pt-root' });

    var fab = el('button', { class: 'pt-fab', type: 'button', title: 'Оформление', 'aria-label': 'Оформление' });
    fab.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="9.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="9.5" cy="15" r="1.1" fill="currentColor" stroke="none"/><path d="M15 15.2c1.2.2 2.2.9 2.2 1.9 0 .9-.9 1.4-2.2 1.4h-4"/></svg>';
    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      ui.panel.hidden = !ui.panel.hidden;
    });

    var panel = el('div', { class: 'pt-panel', hidden: 'hidden' });

    var close = el('button', { class: 'pt-close', type: 'button', 'aria-label': 'Закрыть' });
    close.textContent = '\u00d7';
    close.addEventListener('click', function () { panel.hidden = true; });
    var head = el('div', { class: 'pt-head' }, [el('strong', { text: 'Оформление' }), close]);

    // тема
    var modeSeg = el('div', { class: 'pt-seg' });
    [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Системная']].forEach(function (p) {
      var b = el('button', { type: 'button', 'data-v': p[0], text: p[1] });
      b.addEventListener('click', function () { set('mode', p[0]); });
      modeSeg.appendChild(b);
    });
    var modeRow = el('div', { class: 'pt-row' }, [el('span', { text: 'Тема' }), modeSeg]);

    // акцент
    var sw = el('div', { class: 'pt-swatches' });
    ACCENTS.forEach(function (c) {
      var b = el('button', { type: 'button', class: 'pt-swatch', 'data-v': c, title: c });
      b.style.background = c;
      b.addEventListener('click', function () { set('accent', c); });
      sw.appendChild(b);
    });
    var picker = el('input', { type: 'color', value: state.accent, title: 'Свой цвет' });
    picker.style.width = '38px';
    picker.style.height = '26px';
    picker.style.padding = '0';
    picker.style.border = '0';
    picker.style.background = 'transparent';
    picker.addEventListener('change', function () { set('accent', picker.value); });
    sw.appendChild(picker);
    var accentRow = el('div', { class: 'pt-row' }, [el('span', { text: 'Акцент' }), sw]);

    // масштаб
    var range = el('input', { type: 'range', min: '90', max: '125', step: '5', value: String(state.scale) });
    var scaleLabel = el('b', { text: state.scale + '%' });
    range.addEventListener('input', function () { set('scale', Number(range.value)); });
    var scaleRow = el('div', { class: 'pt-row' }, [
      el('span', { text: 'Масштаб' }),
      el('div', { class: 'pt-scale' }, [range, scaleLabel])
    ]);

    var reset = el('button', { class: 'pt-reset', type: 'button', text: 'Сбросить оформление' });
    reset.addEventListener('click', function () {
      state = Object.assign({}, DEFAULTS);
      picker.value = DEFAULTS.accent;
      apply();
      save();
    });

    var note = el('div', { class: 'pt-note', text: 'Настройки сохраняются на этом компьютере.' });

    [head, modeRow, accentRow, scaleRow, note, reset].forEach(function (n) { panel.appendChild(n); });
    panel.hidden = true;
    wrap.appendChild(fab);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    ui = { fab: fab, panel: panel, mode: modeSeg, swatches: sw, range: range, scaleLabel: scaleLabel };
    syncUI();
    console.log('[theme] панель готова, режим:', state.mode);
  }

  function start() {
    build();
    apply();
    // показываем всю карту целиком; повторяем после измерения карточек,
    // но только если пользователь ещё не трогал карту
    var touched = false;
    var mark = function (e) {
      if (e.target && e.target.closest && e.target.closest('.react-flow')) touched = true;
    };
    document.addEventListener('pointerdown', mark, true);
    document.addEventListener('wheel', mark, { capture: true, passive: true });
    [900, 2000, 3200].forEach(function (ms) {
      setTimeout(function () {
        if (touched) return;
        var fit = document.querySelector('.react-flow__controls-fitview');
        if (fit) fit.click();
      }, ms);
    });
    document.addEventListener('click', function (e) {
      if (!ui.panel || ui.panel.hidden) return;
      if (ui.panel.contains(e.target) || ui.fab.contains(e.target)) return;
      ui.panel.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ui.panel) ui.panel.hidden = true;
    });
    // страховка: если карта не измерилась при старте (все узлы скрыты) — перерисовать её
    setTimeout(function () {
      var nodes = document.querySelectorAll('.react-flow__node');
      if (!nodes.length) return;
      var allHidden = Array.prototype.every.call(nodes, function (n) {
        return getComputedStyle(n).visibility === 'hidden';
      });
      if (!allHidden) return;
      var tabs = document.querySelectorAll('.tabs button');
      var road = Array.prototype.find.call(tabs, function (b) { return b.textContent.indexOf('Дорожная') >= 0; });
      var both = Array.prototype.find.call(tabs, function (b) { return b.textContent.indexOf('Совмещённый') >= 0; });
      if (!road || !both) return;
      road.click();
      setTimeout(function () { both.click(); }, 250);
      console.warn('[theme] карта не измерилась при старте — принудительная перерисовка');
    }, 4200);
    if (mq) {
      var onChange = function () { if (state.mode === 'system') apply(); };
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
