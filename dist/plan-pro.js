/* ПЛАН ПРО — функции уровня XMind/Pixso внутри приложения.
   Поиск, таблица-дерево, таймлайн, презентация, импорт/экспорт, история, заметки. */
(function () {
  'use strict';
  if (window.__planPro) return;
  window.__planPro = true;

  var META_KEY = 'plan-pro-meta-v1';
  var SNAP_KEY = 'plan-pro-snapshots-v1';
  var TAB_KEY = 'plan-pro-tab';
  var OPEN_KEY = 'plan-pro-open';
  var JUMP_KEY = 'plan-pro-jump';
  var C = 220, J = 100, L = 90;

  var S = {
    data: null,
    loading: false,
    tab: 'search',
    q: '',
    status: 'all',
    kind: 'all',
    assignee: 'all',
    edit: {},
    dirty: false,
    tblCollapsed: null,
    pendingImport: null,
    importParent: null,
    importAsTasks: true,
    tlScale: 9,
    presFrom: null,
    presTasks: false,
    slide: 0,
    slides: [],
    snaps: [],
    refs: {}
  };

  var META = loadMeta();

  function loadMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function metaSave() {
    try { localStorage.setItem(META_KEY, JSON.stringify(META)); }
    catch (e) { toast('Не удалось сохранить заметки: ' + e.message); }
  }

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  function E(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  var STATUS = { planned: 'Запланировано', in_progress: 'В работе', done: 'Готово' };
  var PRIO = { '': '—', low: 'Низкий', medium: 'Средний', high: 'Высокий' };

  function fmtDay(s) {
    if (!s) return '';
    var p = s.split('-');
    return p[2] + '.' + p[1] + '.' + p[0];
  }
  function dayNum(s) {
    var p = s.split('-').map(Number);
    return Date.UTC(p[0], p[1] - 1, p[2]) / 86400000;
  }
  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- модель ----------
  function indexOf(d) {
    d = d || S.data;
    var map = {}, kids = {}, root = null;
    (d.items || []).forEach(function (i) {
      map[i.id] = i;
      (kids[i.parentId] = kids[i.parentId] || []).push(i);
      if (i.kind === 'root' || i.parentId === null) root = i;
    });
    Object.keys(kids).forEach(function (k) {
      kids[k].sort(function (a, b) { return a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)); });
    });
    return { map: map, kids: kids, root: root };
  }

  function walk(ix, id, cb, depth) {
    (ix.kids[id] || []).forEach(function (c) {
      cb(c, depth);
      walk(ix, c.id, cb, depth + 1);
    });
  }

  function breadcrumb(ix, id) {
    var out = [], x = ix.map[id], guard = 0;
    while (x && guard++ < 120) {
      out.unshift(x.title);
      x = x.parentId ? ix.map[x.parentId] : null;
    }
    return out.join(' / ');
  }

  function tagsOf(id) {
    var out = (META.tags && META.tags[id]) || [];
    return out.slice();
  }
  function hashTags(it) {
    var m = String(it.title || '').match(/#[\wа-яёА-ЯЁ-]+/g) || [];
    var n = String(it.description || '').match(/#[\wа-яёА-ЯЁ-]+/g) || [];
    return m.concat(n).map(function (t) { return t.slice(1); });
  }

  function subtreeStats(ix, id) {
    var it = ix.map[id], total = 0, done = 0;
    function rec(nid) {
      var n = ix.map[nid];
      if (!n) return;
      if (n.isTask) { total++; if (n.status === 'done') done++; }
      (ix.kids[nid] || []).forEach(function (c) { rec(c.id); });
    }
    rec(id);
    var pct = total ? Math.round(done * 100 / total) : (it && it.status === 'done' ? 100 : 0);
    if (META.progress && typeof META.progress[id] === 'number') pct = META.progress[id];
    return { total: total, done: done, pct: pct };
  }

  function effectiveColor(ix, id) {
    var x = ix.map[id], guard = 0;
    while (x && guard++ < 120) {
      if (x.color) return x.color;
      x = x.parentId ? ix.map[x.parentId] : null;
    }
    return '#7186a4';
  }

  function allItems(ix) {
    var out = [];
    var root = ix.root;
    if (!root) return out;
    out.push({ item: root, depth: 0 });
    walk(ix, root.id, function (it, depth) { out.push({ item: it, depth: depth + 1 }); }, 0);
    return out;
  }

  // ---------- данные ----------
  async function ensureData(force) {
    if (!window.planDesktop) { toast('Приложение запущено без доступа к данным.'); return null; }
    if (S.data && !force) return S.data;
    if (S.loading) return S.data;
    S.loading = true;
    try {
      var r = await window.planDesktop.load();
      if (!r || r.error) {
        toast((r && r.error) || 'Не удалось прочитать план.');
        S.loading = false;
        return null;
      }
      S.data = r.data;
      var ix = indexOf(S.data);
      if (!S.importParent || !ix.map[S.importParent]) S.importParent = ix.root ? ix.root.id : null;
      S.tblCollapsed = new Set();
      S.loading = false;
      return S.data;
    } catch (e) {
      S.loading = false;
      toast('Ошибка чтения плана: ' + e.message);
      return null;
    }
  }

  function validateDraft(d) {
    if (!d || !Array.isArray(d.items) || !d.items.length) return 'План пуст.';
    var ids = {}, roots = 0;
    d.items.forEach(function (i) { ids[i.id] = i; });
    for (var k = 0; k < d.items.length; k++) {
      var it = d.items[k];
      if (!it.title || !String(it.title).trim()) return 'У узла не может быть пустого названия.';
      if (it.kind === 'root') roots++;
      if (it.parentId && !ids[it.parentId]) return 'Потерян родитель узла «' + it.title + '».';
      for (var dk in { startDate: 1, endDate: 1 }) {
        var dv = it[dk];
        if (dv != null && !/^\d{4}-\d{2}-\d{2}$/.test(dv)) return 'У «' + it.title + '» дата должна быть в виде ГГГГ-ММ-ДД.';
      }
      if (it.startDate && it.endDate && it.endDate < it.startDate) return 'У «' + it.title + '» конец раньше начала.';
    }
    if (roots !== 1) return 'В плане должен быть ровно один корень.';
    return null;
  }

  async function commit(next, reload, msg) {
    try {
      var bad = validateDraft(next);
      if (bad) { toast(bad); return false; }
      var json = JSON.stringify(Object.assign({ version: 2, exportedAt: new Date().toISOString() }, next), null, 2);
      if (window.planDesktop.backup) {
        try { await window.planDesktop.backup(json); } catch (e) { /* бэкап не критичен */ }
      }
      var r = await window.planDesktop.save(json);
      if (!r || !r.ok) { toast((r && r.error) || 'Не удалось сохранить.'); return false; }
      S.data = next;
      S.edit = {};
      S.dirty = false;
      if (reload) {
        try {
          sessionStorage.setItem(OPEN_KEY, '1');
          sessionStorage.setItem(TAB_KEY, S.tab);
        } catch (e) { /* ignore */ }
        location.reload();
      } else {
        toast(msg || 'Сохранено');
        renderBody();
        renderFoot();
      }
      return true;
    } catch (e) {
      toast('Ошибка сохранения: ' + e.message);
      return false;
    }
  }

  function syncDirtyUI() {
    if (S.refs.tableSave) S.refs.tableSave.disabled = !S.dirty;
    if (S.refs.tableReset) S.refs.tableReset.disabled = !S.dirty;
  }

  function markDirty() {
    S.dirty = true;
    syncDirtyUI();
    renderFoot();
  }

  function getVal(it, field) {
    var e = S.edit[it.id];
    return e && Object.prototype.hasOwnProperty.call(e, field) ? e[field] : it[field];
  }
  function setVal(id, field, value) {
    (S.edit[id] = S.edit[id] || {})[field] = value;
    markDirty();
  }

  function saveEdits() {
    if (!S.dirty) return;
    var d = clone(S.data), ix = indexOf(d), bad = false;
    Object.keys(S.edit).forEach(function (id) {
      var it = ix.map[id];
      if (!it) return;
      var e = S.edit[id];
      Object.keys(e).forEach(function (k) {
        if (k === 'title') it.title = String(e[k]).trim();
        else if (k === 'assignee') it.assignee = e[k] ? String(e[k]) : null;
        else if (k === 'startDate' || k === 'endDate') it[k] = e[k] || null;
        else it[k] = e[k];
      });
      if (it.startDate && it.endDate && it.endDate < it.startDate) bad = true;
    });
    if (bad) { toast('Конец не может быть раньше начала.'); return; }
    commit(d, true);
  }

  function addNode(parentId, title, kind) {
    if (!title || !title.trim()) { toast('Введите название.'); return; }
    var d = clone(S.data), ix = indexOf(d);
    var parent = ix.map[parentId];
    if (!parent) { toast('Не найден родитель.'); return; }
    var order = 0;
    (ix.kids[parentId] || []).forEach(function (k) { order = Math.max(order, k.sortOrder + 1); });
    var it = {
      id: uid(), parentId: parentId, kind: kind === 'task' ? 'task' : 'group',
      isTask: kind === 'task', title: title.trim(), status: 'planned', description: '',
      startDate: null, endDate: null, assignee: null, sortOrder: order
    };
    d.items.push(it);
    expandPath(d, parentId);
    var maxX = parentPosMax(d);
    var py = (d.positionsById[parentId] && d.positionsById[parentId].y) || 0;
    d.positionsById[it.id] = { x: maxX + 320, y: py };
    d.roadmapOrder = (d.roadmapOrder || []).concat([it.id]);
    commit(d, true);
  }

  function expandPath(d, id) {
    var map = indexOf(d).map, p = map[id] && map[id].parentId, guard = 0;
    while (p && guard++ < 120) {
      d.collapsed = (d.collapsed || []).filter(function (x) { return x !== p; });
      p = map[p] ? map[p].parentId : null;
    }
  }

  function parentPosMax(d) {
    var maxX = 0;
    Object.keys(d.positionsById || {}).forEach(function (k) {
      var p = d.positionsById[k];
      if (p && p.x > maxX) maxX = p.x;
    });
    return maxX;
  }

  function deleteNode(id) {
    var ix = indexOf();
    var it = ix.map[id];
    if (!it) return;
    if (it.kind === 'root') { toast('Корень удалить нельзя.'); return; }
    if (!confirm('Удалить «' + it.title + '» со всеми вложенными узлами?')) return;
    var d = clone(S.data), del = new Set([id]);
    var changed = true;
    while (changed) {
      changed = false;
      d.items.forEach(function (x) {
        if (x.parentId && del.has(x.parentId) && !del.has(x.id)) { del.add(x.id); changed = true; }
      });
    }
    d.items = d.items.filter(function (x) { return !del.has(x.id); });
    Object.keys(d.positionsById || {}).forEach(function (k) { if (del.has(k)) delete d.positionsById[k]; });
    d.roadmapOrder = (d.roadmapOrder || []).filter(function (k) { return !del.has(k); });
    d.collapsed = (d.collapsed || []).filter(function (k) { return !del.has(k); });
    Object.keys(S.edit).forEach(function (k) { if (del.has(k)) delete S.edit[k]; });
    commit(d, true);
  }

  // ---------- раскладка (порт раскладки карты) ----------
  function layoutTree(items, rootId, dir) {
    var kids = {}, dirs = {};
    items.forEach(function (i) { (kids[i.parentId] = kids[i.parentId] || []).push(i); });
    Object.keys(kids).forEach(function (k) {
      kids[k].sort(function (a, b) { return a.sortOrder - b.sortOrder || String(a.id).localeCompare(String(b.id)); });
    });
    function assign(pid, d) {
      (kids[pid] || []).forEach(function (c, i) {
        var cd = c.branchDirection || d;
        if (cd === 'both') cd = (i % 2 ? 'left' : 'right');
        dirs[c.id] = cd;
        assign(c.id, cd);
      });
    }
    dirs[rootId] = dir;
    assign(rootId, dir);

    function build(pid) {
      var pts = {};
      pts[pid] = { x: 0, y: 0 };
      var groups = {};
      (kids[pid] || []).forEach(function (c) {
        var sub = build(c.id);
        var gd = dirs[c.id];
        (groups[gd] = groups[gd] || []).push(sub);
      });
      ['right', 'left', 'down', 'up'].forEach(function (d) {
        var list = groups[d] || [];
        if (!list.length) return;
        var horiz = d === 'right' || d === 'left';
        var total = list.reduce(function (s, b) { return s + (horiz ? b.box.h : b.box.w); }, 0) + Math.max(0, list.length - 1) * L;
        var cursor = (horiz ? J : C) / 2 - total / 2;
        var ys = Object.keys(pts).map(function (k) { return pts[k].y; });
        var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys.map(function (v) { return v + J; }));
        list.forEach(function (b) {
          var dx, dy;
          if (d === 'right') { dx = C + L - b.box.x; dy = cursor - b.box.y; }
          else if (d === 'left') { dx = -L - b.box.w - b.box.x; dy = cursor - b.box.y; }
          else if (d === 'down') { dx = cursor - b.box.x; dy = maxY + L - b.box.y; }
          else { dx = cursor - b.box.x; dy = minY - L - b.box.h - b.box.y; }
          Object.keys(b.points).forEach(function (k) {
            pts[k] = { x: b.points[k].x + dx, y: b.points[k].y + dy };
          });
          cursor += (horiz ? b.box.h : b.box.w) + L;
        });
      });
      var vals = Object.keys(pts).map(function (k) { return pts[k]; });
      var minX = Math.min.apply(null, vals.map(function (p) { return p.x; }));
      var minY2 = Math.min.apply(null, vals.map(function (p) { return p.y; }));
      var box = {
        x: minX, y: minY2,
        w: Math.max.apply(null, vals.map(function (p) { return p.x + C; })) - minX,
        h: Math.max.apply(null, vals.map(function (p) { return p.y + J; })) - minY2
      };
      return { points: pts, box: box };
    }
    return build(rootId);
  }

  function importRoots(parentId, roots) {
    if (!roots || !roots.length) { toast('Нет данных для импорта.'); return; }
    var d = clone(S.data), ix = indexOf(d);
    var parent = ix.map[parentId];
    if (!parent) { toast('Выберите ветку для импорта.'); return; }
    var flat = [];
    var order = 0;
    (ix.kids[parentId] || []).forEach(function (k) { order = Math.max(order, k.sortOrder + 1); });

    function add(node, pid, idx) {
      var it = {
        id: uid(), parentId: pid, kind: node.kind === 'task' ? 'task' : 'group',
        isTask: node.kind === 'task', title: String(node.title || '').trim() || 'Без названия',
        status: ['planned', 'in_progress', 'done'].indexOf(node.status) >= 0 ? node.status : 'planned',
        description: node.description || '',
        startDate: node.startDate || null, endDate: node.endDate || null,
        assignee: node.assignee || null, sortOrder: idx
      };
      if (node.color && /^#[0-9a-f]{6}$/i.test(node.color)) it.color = node.color;
      flat.push(it);
      (node.children || []).forEach(function (ch, i) { add(ch, it.id, i); });
      return it;
    }
    roots.forEach(function (r, i) { add(r, parentId, order + i); });
    d.items = d.items.concat(flat);

    var baseX = parentPosMax(d) + 320;
    var baseY = (d.positionsById[parentId] && d.positionsById[parentId].y) || 0;
    var cursorY = baseY;
    var flatRoots = flat.filter(function (x) { return x.parentId === parentId; });
    flatRoots.forEach(function (r) {
      var res = layoutTree(flat, r.id, 'right');
      var dx = baseX - res.box.x, dy = cursorY - res.box.y;
      Object.keys(res.points).forEach(function (k) {
        d.positionsById[k] = { x: Math.round(res.points[k].x + dx), y: Math.round(res.points[k].y + dy) };
      });
      cursorY += res.box.h + 40;
    });
    expandPath(d, parentId);
    d.roadmapOrder = (d.roadmapOrder || []).concat(flat.map(function (x) { return x.id; }));
    commit(d, true);
  }

  // ---------- поиск ----------
  function filteredItems() {
    if (!S.data) return [];
    var ix = indexOf(), q = S.q.trim().toLowerCase();
    if (!q && S.status === 'all' && S.kind === 'all' && S.assignee === 'all') return [];
    var out = [];
    allItems(ix).forEach(function (rec) {
      var it = rec.item;
      if (it.kind === 'root' && !q) { /* корень показываем только при поиске */ }
      if (S.status !== 'all' && it.status !== S.status) return;
      if (S.kind === 'task' && !it.isTask) return;
      if (S.kind === 'group' && it.isTask) return;
      if (S.assignee !== 'all' && (it.assignee || '') !== S.assignee) return;
      if (q) {
        var hay = (it.title + ' ' + (it.description || '') + ' ' + tagsOf(it.id).join(' ') + ' ' + hashTags(it).join(' ') + ' ' + (it.assignee || '')).toLowerCase();
        if (hay.indexOf(q) < 0) return;
      }
      out.push(rec);
    });
    return out;
  }

  function highlight(text, q) {
    var frag = document.createDocumentFragment();
    text = String(text || '');
    if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
    var low = text.toLowerCase(), pos = 0, idx;
    q = q.toLowerCase();
    while ((idx = low.indexOf(q, pos)) >= 0) {
      if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
      var m = E('mark', null, text.slice(idx, idx + q.length));
      frag.appendChild(m);
      pos = idx + q.length;
    }
    if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
    return frag;
  }

  function renderResults() {
    var box = S.refs.results;
    if (!box) return;
    box.textContent = '';
    var ix = indexOf(), list = filteredItems();
    var active = S.q || S.status !== 'all' || S.kind !== 'all' || S.assignee !== 'all';
    if (!active) return;
    if (!list.length) {
      box.appendChild(E('div', 'pp-empty', 'Ничего не найдено.'));
      return;
    }
    var head = E('div', 'pp-hint');
    head.textContent = 'Найдено: ' + list.length + ' · показано ' + Math.min(list.length, 400);
    box.appendChild(head);
    list.slice(0, 400).forEach(function (rec) {
      var it = rec.item;
      var b = E('button', 'pp-result');
      b.type = 'button';
      var title = E('div', 'pp-rt');
      title.appendChild(highlight(it.title, S.q.trim()));
      b.appendChild(title);
      var p = E('div', 'pp-rp');
      p.textContent = breadcrumb(ix, it.id) + ' · ' + (it.isTask ? 'задача' : 'ветка') + ' · ' + STATUS[it.status];
      b.appendChild(p);
      if (it.description) {
        var d = E('div', 'pp-rp');
        d.textContent = it.description.replace(/\s+/g, ' ').slice(0, 140);
        b.appendChild(d);
      }
      b.addEventListener('click', function () { jumpTo(it.id); });
      box.appendChild(b);
    });
  }

  // ---------- переход к узлу ----------
  function centerNode(id) {
    var node = document.querySelector('.react-flow__node[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!node) return false;
    var m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(node.style.transform || '');
    if (!m) return false;
    var x = parseFloat(m[1]), y = parseFloat(m[2]);
    var vp = document.querySelector('.react-flow__viewport');
    var flow = document.querySelector('.react-flow');
    if (!vp || !flow) return false;
    var zoom = 1;
    try {
      var mt = new DOMMatrixReadOnly(getComputedStyle(vp).transform);
      zoom = mt.a || 1;
    } catch (e) {
      zoom = 1;
    }
    if (zoom < 0.7) zoom = 0.8;
    var r = flow.getBoundingClientRect();
    var panel = S.refs.panel;
    var left = panel && !panel.hidden ? Math.max(0, panel.getBoundingClientRect().right - r.left) : 0;
    var tx = left + (r.width - left) / 2 - (x + 110) * zoom;
    var ty = r.height / 2 - (y + 50) * zoom;
    var apply = function () {
      vp.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + zoom + ')';
    };
    apply();
    [40, 140, 360, 800].forEach(function (ms) { setTimeout(apply, ms); });
    node.classList.remove('pp-flash');
    void node.offsetWidth;
    node.classList.add('pp-flash');
    setTimeout(function () { node.classList.remove('pp-flash'); }, 1700);
    return true;
  }

  function jumpTo(id) {
    if (centerNode(id)) { toast('Узел найден'); return; }
    var ix = indexOf();
    if (!ix.map[id]) { toast('Узел не найден в плане'); return; }
    var anc = [], p = ix.map[id].parentId, guard = 0;
    while (p && guard++ < 120) {
      if ((S.data.collapsed || []).indexOf(p) >= 0) anc.push(p);
      p = ix.map[p] ? ix.map[p].parentId : null;
    }
    if (anc.length) {
      var d = clone(S.data);
      d.collapsed = (d.collapsed || []).filter(function (x) { return anc.indexOf(x) < 0; });
      try { sessionStorage.setItem(JUMP_KEY, id); } catch (e) { /* ignore */ }
      commit(d, true);
      return;
    }
    toast('Узел скрыт или карта ещё не отрисована');
  }

  // ---------- таблица ----------
  function renderTable() {
    var ix = indexOf(), wrap = E('div');
    S.dirty = Object.keys(S.edit).length > 0;

    var bar = E('div', 'pp-row');
    bar.style.marginBottom = '8px';
    var save = E('button', 'pp-btn primary', 'Сохранить изменения');
    save.type = 'button';
    save.disabled = !S.dirty;
    save.addEventListener('click', saveEdits);
    var reset = E('button', 'pp-btn', 'Отменить правки');
    reset.type = 'button';
    reset.disabled = !S.dirty;
    reset.addEventListener('click', function () { S.edit = {}; S.dirty = false; renderBody(); renderFoot(); });
    S.refs.tableSave = save;
    S.refs.tableReset = reset;
    var add = E('button', 'pp-btn', '＋ Узел');
    add.type = 'button';
    add.addEventListener('click', function () { S.refs.addform.hidden = !S.refs.addform.hidden; });
    bar.appendChild(add);
    bar.appendChild(save);
    bar.appendChild(reset);
    bar.appendChild(E('span', 'pp-grow'));
    bar.appendChild(E('span', 'pp-hint', 'Правки видны в карте только после сохранения'));
    wrap.appendChild(bar);

    var form = E('div', 'pp-card');
    form.hidden = true;
    S.refs.addform = form;
    form.style.marginBottom = '8px';
    var frow = E('div', 'pp-row');
    var psel = E('select', 'pp-select');
    allItems(ix).forEach(function (rec) {
      var o = E('option', null, new Array(Math.min(rec.depth, 6) + 1).join('· ') + rec.item.title);
      o.value = rec.item.id;
      if (rec.item.id === S.importParent) o.selected = true;
      psel.appendChild(o);
    });
    var tsel = E('select', 'pp-select');
    tsel.innerHTML = '<option value="task">Задача</option><option value="group">Ветка</option>';
    var tin = E('input', 'pp-input');
    tin.placeholder = 'Название';
    tin.style.flex = '1';
    var go = E('button', 'pp-btn primary', 'Добавить');
    go.type = 'button';
    go.addEventListener('click', function () {
      addNode(psel.value, tin.value, tsel.value);
    });
    frow.appendChild(psel); frow.appendChild(tsel); frow.appendChild(tin); frow.appendChild(go);
    form.appendChild(frow);
    wrap.appendChild(form);

    var tw = E('div', 'pp-tablewrap');
    var table = E('table', 'pp-table');
    var thead = E('thead');
    var htr = E('tr');
    ['Узел', 'Тип', 'Статус', 'Начало', 'Конец', 'Ответственный', 'Приоритет', 'Теги', 'Прогресс', ''].forEach(function (h) {
      htr.appendChild(E('th', null, h));
    });
    thead.appendChild(htr);
    table.appendChild(thead);
    var tbody = E('tbody');

    if (!S.tblCollapsed) S.tblCollapsed = new Set();

    function row(it, depth) {
      var tr = E('tr');
      var tdName = E('td');
      var name = E('div', 'pp-name');
      var cs = S.tblCollapsed;
      var hasKids = (ix.kids[it.id] || []).length > 0;
      if (hasKids) {
        var caret = E('button', 'pp-caret', cs.has(it.id) ? '▸' : '▾');
        caret.type = 'button';
        caret.title = cs.has(it.id) ? 'Развернуть' : 'Свернуть';
        caret.addEventListener('click', function () {
          if (cs.has(it.id)) cs.delete(it.id); else cs.add(it.id);
          renderTable();
        });
        name.appendChild(caret);
      } else {
        name.appendChild(E('span', 'pp-caret'));
      }
      var ind = E('span', 'pp-indent');
      ind.style.width = Math.min(depth, 10) * 11 + 'px';
      name.appendChild(ind);
      var dot = E('span', 'pp-dot');
      dot.style.background = effectiveColor(ix, it.id);
      name.appendChild(dot);
      var inp = E('input');
      inp.value = getVal(it, 'title');
      inp.title = it.title;
      inp.addEventListener('input', function () { setVal(it.id, 'title', inp.value); });
      name.appendChild(inp);
      tdName.appendChild(name);
      tr.appendChild(tdName);

      tr.appendChild(E('td', 'pp-typetag', it.kind === 'root' ? 'корень' : (it.isTask ? 'задача' : 'ветка')));

      var tdS = E('td');
      var sel = E('select');
      ['planned', 'in_progress', 'done'].forEach(function (v) {
        var o = E('option', null, STATUS[v]); o.value = v;
        if (getVal(it, 'status') === v) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { setVal(it.id, 'status', sel.value); });
      tdS.appendChild(sel);
      tr.appendChild(tdS);

      ['startDate', 'endDate'].forEach(function (f) {
        var td = E('td');
        var di = E('input');
        di.type = 'text';
        di.placeholder = '2026-11-01';
        di.setAttribute('inputmode', 'numeric');
        di.value = getVal(it, f) || '';
        di.addEventListener('change', function () { setVal(it.id, f, di.value.trim() || null); });
        td.appendChild(di);
        tr.appendChild(td);
      });

      var tdA = E('td');
      var ai = E('input');
      ai.value = getVal(it, 'assignee') || '';
      ai.placeholder = '—';
      ai.addEventListener('input', function () { setVal(it.id, 'assignee', ai.value); });
      tdA.appendChild(ai);
      tr.appendChild(tdA);

      var tdP = E('td');
      var ps = E('select');
      Object.keys(PRIO).forEach(function (v) {
        var o = E('option', null, PRIO[v]); o.value = v;
        if (((META.priority || {})[it.id] || '') === v) o.selected = true;
        ps.appendChild(o);
      });
      ps.addEventListener('change', function () {
        META.priority = META.priority || {};
        if (ps.value) META.priority[it.id] = ps.value; else delete META.priority[it.id];
        metaSave();
      });
      tdP.appendChild(ps);
      tr.appendChild(tdP);

      var tdT = E('td');
      var ti = E('input');
      ti.value = tagsOf(it.id).join(', ');
      ti.placeholder = 'теги';
      ti.addEventListener('change', function () {
        META.tags = META.tags || {};
        var arr = ti.value.split(',').map(function (s) { return s.trim().replace(/^#/, ''); }).filter(Boolean);
        arr = Array.from(new Set(arr));
        if (arr.length) META.tags[it.id] = arr; else delete META.tags[it.id];
        metaSave();
        if (S.tab === 'search') renderResults();
      });
      tdT.appendChild(ti);
      tr.appendChild(tdT);

      var tdPr = E('td');
      var st = subtreeStats(ix, it.id);
      var prog = E('div', 'pp-prog');
      var barw = E('div', 'pp-bar');
      var fill = E('i');
      fill.style.width = st.pct + '%';
      barw.appendChild(fill);
      prog.appendChild(barw);
      prog.appendChild(E('b', null, st.total ? st.done + '/' + st.total : st.pct + '%'));
      tdPr.appendChild(prog);
      tr.appendChild(tdPr);

      var tdAct = E('td');
      tdAct.style.whiteSpace = 'nowrap';
      var cbtn = E('button', 'pp-iconbtn pp-commentbtn', '💬');
      cbtn.type = 'button';
      cbtn.title = 'Комментарии к узлу';
      var cn = ((META.comments || {})[it.id] || []).length;
      if (cn) {
        var sup = E('sup', null, cn);
        cbtn.appendChild(sup);
      }
      cbtn.addEventListener('click', function (e) { e.stopPropagation(); openComments(it.id); });
      tdAct.appendChild(cbtn);
      if (it.kind !== 'root') {
        var del = E('button', 'pp-iconbtn', '×');
        del.type = 'button';
        del.title = 'Удалить узел';
        del.addEventListener('click', function (e) { e.stopPropagation(); deleteNode(it.id); });
        tdAct.appendChild(del);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);

      if (!S.tblCollapsed.has(it.id)) {
        (ix.kids[it.id] || []).forEach(function (c) { row(c, depth + 1); });
      }
    }

    if (ix.root) row(ix.root, 0);
    table.appendChild(tbody);
    tw.appendChild(table);
    wrap.appendChild(tw);

    // сводка
    var st = subtreeStats(ix, ix.root.id);
    var sum = E('div', 'pp-hint');
    sum.style.marginTop = '8px';
    sum.textContent = 'Задач: ' + st.total + ' · готово: ' + st.done + ' · прогресс: ' + st.pct + '%';
    wrap.appendChild(sum);
    return wrap;
  }

  // ---------- таймлайн ----------
  function dateRanges() {
    var ix = indexOf(), memo = {};
    function rec(id) {
      if (memo[id] !== undefined) return memo[id];
      var it = ix.map[id], s = it.startDate || null, e = it.endDate || null;
      (ix.kids[id] || []).forEach(function (c) {
        var r = rec(c.id);
        if (r) {
          if (!s || r.s < s) s = r.s;
          if (!e || r.e > e) e = r.e;
        }
      });
      var v = s || e ? { s: s || e, e: e || s } : null;
      memo[id] = v;
      return v;
    }
    Object.keys(ix.map).forEach(function (id) { rec(id); });
    return { memo: memo, ix: ix };
  }

  function renderTimeline() {
    var wrap = E('div');
    var dr = dateRanges(), ix = dr.ix;
    if (!ix.root) return E('div', 'pp-empty', 'План не загружен.');

    var rows = allItems(ix);
    var min = null, max = null;
    rows.forEach(function (rec) {
      var r = dr.memo[rec.item.id];
      if (!r) return;
      if (!min || r.s < min) min = r.s;
      if (!max || r.e > max) max = r.e;
    });
    var today = todayISO();
    if (!min) { min = today; max = today; }
    if (today < min) min = today;
    if (today > max) max = today;
    var dmin = dayNum(min) - 3, dmax = dayNum(max) + 3;
    if (dmax - dmin < 30) dmax = dmin + 30;
    var days = dmax - dmin + 1;
    var px = S.tlScale;

    var barTop = E('div', 'pp-tl-toolbar');
    barTop.appendChild(E('span', 'pp-hint', 'Масштаб:'));
    [[4, 'Месяц'], [9, 'Неделя'], [26, 'День']].forEach(function (p) {
      var b = E('button', 'pp-btn' + (S.tlScale === p[0] ? ' primary' : ''), p[1]);
      b.type = 'button';
      b.addEventListener('click', function () { S.tlScale = p[0]; renderBody(); });
      barTop.appendChild(b);
    });
    barTop.appendChild(E('span', 'pp-grow'));
    var dates = rows.filter(function (r) { return !!dr.memo[r.item.id]; }).length;
    barTop.appendChild(E('span', 'pp-hint', 'с датами: ' + dates + ' из ' + rows.length));
    wrap.appendChild(barTop);

    var tl = E('div', 'pp-tl');
    var sc = E('div', 'pp-tl-scroll');
    var inner = E('div', 'pp-tl-inner');
    inner.style.width = 190 + days * px + 'px';

    var head = E('div', 'pp-tl-head');
    head.appendChild(E('div', 'pp-tl-gutter', 'Ветка / задача'));
    var months = E('div', 'pp-tl-months');
    months.style.width = days * px + 'px';
    // месяцы
    var cur = new Date(Date.UTC(min.slice(0, 4), Number(min.slice(5, 7)) - 1, 1));
    var guard = 0;
    while (guard++ < 400) {
      var mStart = Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1) / 86400000;
      if (mStart > dmax) break;
      var left = (mStart - dmin) * px;
      var m = E('div', 'pp-tl-month');
      m.style.left = Math.max(0, left) + 'px';
      m.style.width = (new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1)) / 86400000 - Math.max(dmin, mStart)) * px + 'px';
      m.textContent = cur.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
      months.appendChild(m);
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
    head.appendChild(months);
    inner.appendChild(head);

    rows.forEach(function (rec) {
      var it = rec.item, r = dr.memo[it.id];
      var rowEl = E('div', 'pp-tl-row');
      var label = E('div', 'pp-tl-label');
      label.appendChild(E('b', null, it.title));
      label.appendChild(E('span', null, (it.isTask ? 'задача' : 'ветка') + ' · ' + STATUS[it.status] + (it.assignee ? ' · ' + it.assignee : '')));
      rowEl.appendChild(label);
      var track = E('div', 'pp-tl-track');
      track.style.width = days * px + 'px';
      // месячные линии
      for (var g = 0; g < months.children.length; g++) {
        var gl = E('div', 'pp-gridline');
        gl.style.left = months.children[g].style.left;
        track.appendChild(gl);
      }
      var td = E('div', 'pp-today');
      td.style.left = (dayNum(today) - dmin) * px + 'px';
      track.appendChild(td);
      if (r) {
        var bar = E('button', 'pp-tl-bar');
        bar.type = 'button';
        bar.style.left = (dayNum(r.s) - dmin) * px + 'px';
        bar.style.width = Math.max(6, (dayNum(r.e) - dayNum(r.s) + 1) * px - 2) + 'px';
        if (!it.isTask) bar.classList.add('rollup');
        if (it.status === 'done' && it.isTask) bar.classList.add('done');
        else if (it.status === 'in_progress' && it.isTask) bar.classList.add('wip');
        if (it.isTask && it.status !== 'done' && it.endDate && it.endDate < today) bar.classList.add('late');
        var barPx = Math.max(6, (dayNum(r.e) - dayNum(r.s) + 1) * px - 2);
        bar.textContent = barPx > 84 ? (fmtDay(r.s) + ' — ' + fmtDay(r.e)) : '';
        bar.title = it.title + '\n' + fmtDay(r.s) + ' — ' + fmtDay(r.e) + '\n' + STATUS[it.status];
        bar.addEventListener('click', function () { jumpTo(it.id); });
        track.appendChild(bar);
      }
      rowEl.appendChild(track);
      inner.appendChild(rowEl);
    });
    sc.appendChild(inner);
    tl.appendChild(sc);
    wrap.appendChild(tl);

    var noDates = rows.filter(function (r) { return r.item.isTask && !dr.memo[r.item.id]; });
    if (noDates.length) {
      var nd = E('div', 'pp-tl-nodate');
      nd.appendChild(E('b', null, 'Без сроков (' + noDates.length + '): '));
      noDates.slice(0, 40).forEach(function (rec) {
        var b = E('button', 'pp-btn', rec.item.title);
        b.type = 'button';
        b.title = breadcrumb(ix, rec.item.id);
        b.addEventListener('click', function () { jumpTo(rec.item.id); });
        nd.appendChild(b);
      });
      wrap.appendChild(nd);
    }
    if (!dates) {
      var hint = E('div', 'pp-hint');
      hint.style.marginTop = '8px';
      hint.textContent = 'Ни у одной задачи не заданы даты. Проставьте их в таблице или в свойствах узла — полосы появятся здесь.';
      wrap.appendChild(hint);
    }
    return wrap;
  }

  // ---------- презентация ----------
  function slidesFor(fromId, onlyTasks) {
    var ix = indexOf(), out = [];
    function rec(id) {
      var it = ix.map[id];
      if (!it) return;
      if (!onlyTasks || it.isTask) out.push(it);
      (ix.kids[id] || []).forEach(function (c) { rec(c.id); });
    }
    rec(fromId || (ix.root && ix.root.id));
    return out;
  }

  function openPres(fromId, onlyTasks) {
    S.slides = slidesFor(fromId, onlyTasks);
    if (!S.slides.length) { toast('Нет узлов для показа.'); return; }
    S.slide = 0;
    S.refs.pres.hidden = false;
    renderSlide();
  }

  function renderSlide() {
    var it = S.slides[S.slide];
    if (!it) return;
    var ix = indexOf();
    S.refs.presCrumb.textContent = breadcrumb(ix, it.id);
    S.refs.presTitle.textContent = it.title;
    S.refs.presCount.textContent = (S.slide + 1) + ' / ' + S.slides.length;
    S.refs.presBar.style.width = ((S.slide + 1) * 100 / S.slides.length) + '%';
    var meta = S.refs.presMeta;
    meta.textContent = '';
    function chip(text, cls) { meta.appendChild(E('span', 'pp-chip ' + (cls || ''), text)); }
    chip(it.isTask ? 'Задача' : (it.kind === 'root' ? 'План' : 'Ветка'), 'mut');
    chip(STATUS[it.status], it.status === 'done' ? 'ok' : it.status === 'in_progress' ? 'warn' : 'mut');
    if (it.startDate || it.endDate) chip(fmtDay(it.startDate) + ' — ' + fmtDay(it.endDate));
    if (it.assignee) chip('@' + it.assignee, 'info');
    var st = subtreeStats(ix, it.id);
    if (st.total) chip('прогресс ' + st.done + '/' + st.total, st.pct === 100 ? 'ok' : '');
    tagsOf(it.id).forEach(function (t) { chip('#' + t); });
    var comments = (META.comments || {})[it.id] || [];
    if (comments.length) chip('💬 ' + comments.length);

    S.refs.presDesc.textContent = it.description || '';
    var prev = S.refs.presPrev, next = S.refs.presNext;
    prev.disabled = S.slide === 0;
    next.disabled = S.slide >= S.slides.length - 1;
  }

  function stepSlide(delta) {
    var n = S.slide + delta;
    if (n < 0 || n >= S.slides.length) return;
    S.slide = n;
    renderSlide();
  }

  function renderPresTab() {
    var ix = indexOf(), wrap = E('div');
    var card = E('div', 'pp-card');
    card.appendChild(E('h4', null, 'Режим презентации'));
    card.appendChild(E('p', null, 'Пошаговый показ плана: текущий узел крупно, остальное затемнено. Стрелки ← → переключают, Esc закрывает.'));
    var row = E('div', 'pp-actions');
    var start = E('button', 'pp-btn primary', 'С начала');
    start.type = 'button';
    start.addEventListener('click', function () { openPres(ix.root.id, S.presTasks); });
    var only = E('label', 'pp-hint');
    only.style.display = 'flex';
    only.style.alignItems = 'center';
    only.style.gap = '5px';
    var cb = E('input');
    cb.type = 'checkbox';
    cb.checked = S.presTasks;
    cb.addEventListener('change', function () { S.presTasks = cb.checked; });
    only.appendChild(cb);
    only.appendChild(document.createTextNode('только задачи'));
    row.appendChild(start);
    row.appendChild(only);
    card.appendChild(row);
    wrap.appendChild(card);

    var list = E('div', 'pp-card');
    list.style.marginTop = '8px';
    list.appendChild(E('h4', null, 'Начать с ветки'));
    var grid = E('div', 'pp-actions');
    (ix.kids[ix.root.id] || []).forEach(function (g) {
      var b = E('button', 'pp-btn', g.title);
      b.type = 'button';
      b.title = g.title;
      b.addEventListener('click', function () { openPres(g.id, S.presTasks); });
      grid.appendChild(b);
    });
    if (!grid.children.length) grid.appendChild(E('span', 'pp-hint', 'Нет веток.'));
    list.appendChild(grid);
    wrap.appendChild(list);

    var hint = E('div', 'pp-hint');
    hint.style.marginTop = '8px';
    hint.textContent = 'Презентация идёт по всем узлам выбранной ветки в порядке плана. Описание узла показывается целиком.';
    wrap.appendChild(hint);
    return wrap;
  }

  // ---------- комментарии ----------
  function openComments(id) {
    var ix = indexOf(), it = ix.map[id];
    if (!it) return;
    var modal = E('div', 'pp-modal');
    var card = E('div', 'pp-modal-card');
    var head = E('div', 'pp-modal-head');
    head.appendChild(E('b', null, '💬 ' + it.title));
    var x = E('button', 'pp-iconbtn', '×');
    x.type = 'button';
    x.addEventListener('click', function () { modal.remove(); });
    head.appendChild(x);
    card.appendChild(head);

    var body = E('div', 'pp-modal-body');
    var listBox = E('div', 'pp-comments');
    function renderList() {
      listBox.textContent = '';
      var arr = (META.comments || {})[id] || [];
      if (!arr.length) listBox.appendChild(E('div', 'pp-hint', 'Комментариев пока нет.'));
      arr.forEach(function (c, i) {
        var box = E('div', 'pp-comment');
        box.appendChild(E('time', null, fmtTime(c.at)));
        box.appendChild(E('div', null, c.text));
        var del = E('button', 'pp-iconbtn', '×');
        del.type = 'button';
        del.title = 'Удалить';
        del.style.float = 'right';
        del.addEventListener('click', function () {
          arr.splice(i, 1);
          if (!arr.length) delete META.comments[id];
          metaSave();
          renderList();
        });
        box.appendChild(del);
        listBox.appendChild(box);
      });
    }
    renderList();
    body.appendChild(listBox);
    var ta = E('textarea', 'pp-area');
    ta.placeholder = 'Написать комментарий…';
    body.appendChild(ta);
    card.appendChild(body);

    var foot = E('div', 'pp-modal-foot');
    foot.appendChild(E('span', 'pp-grow'));
    var send = E('button', 'pp-btn primary', 'Добавить');
    send.type = 'button';
    send.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) return;
      META.comments = META.comments || {};
      (META.comments[id] = META.comments[id] || []).push({ at: new Date().toISOString(), text: text });
      metaSave();
      ta.value = '';
      renderList();
    });
    foot.appendChild(send);
    card.appendChild(foot);
    modal.appendChild(card);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
    ta.focus();
  }

  // ---------- импорт ----------
  function parseMarkdown(text, asTasks) {
    var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
    var root = { title: '', children: [] };
    var stack = [], cur = null, code = false, plain = 0;
    var count = 0;
    lines.forEach(function (line) {
      if (/^\s*(```|~~~)/.test(line)) { code = !code; return; }
      if (code) return;
      var h = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
      var li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
      var bq = /^\s*>\s?(.*)$/.exec(line);
      if (bq && cur) {
        cur.description = (cur.description ? cur.description + '\n' : '') + bq[1];
        return;
      }
      var node = null, level = 0, title = null;
      if (h) {
        level = h[1].length;
        title = h[2].replace(/\s+#+\s*$/, '').trim();
        node = { title: title, description: '', kind: 'group', children: [] };
      } else if (li) {
        var indent = li[1].replace(/\t/g, '  ').length;
        level = Math.floor(indent / 2) + 2;
        var body = li[3];
        var task = /^\[([ xX])\]\s*(.*)$/.exec(body);
        var isTask = task ? true : !!asTasks;
        var status = task && /[xX]/.test(task[1]) ? 'done' : 'planned';
        title = (task ? task[2] : body).replace(/\s+#+\s*$/, '').trim();
        if (!title) return;
        node = { title: title, description: '', kind: isTask ? 'task' : 'group', status: status, children: [] };
      } else {
        if (line.trim()) plain++;
        return;
      }
      if (!node || !title) return;
      if (++count > 5000) return;
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      var parent = stack.length ? stack[stack.length - 1].node : root;
      parent.children.push(node);
      stack.push({ level: level, node: node });
      cur = node;
    });
    if (plain) toast('Пропущено строк обычного текста: ' + plain);
    return root.children;
  }

  function parseOPML(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Некорректный XML.');
    var body = doc.querySelector('body');
    if (!body) throw new Error('В OPML нет body.');
    var count = 0;
    function kids(nodeEl) {
      var out = [];
      Array.prototype.forEach.call(nodeEl.children, function (el) {
        if (el.tagName.toLowerCase() !== 'outline') return;
        if (++count > 5000) return;
        var note = el.getAttribute('_note') || el.getAttribute('note') || '';
        var isTask = el.getAttribute('planIsTask') === 'true';
        var color = el.getAttribute('planColor') || '';
        var it = {
          title: el.getAttribute('text') || el.getAttribute('title') || 'Без названия',
          description: note,
          kind: isTask ? 'task' : 'group',
          status: isTask && el.getAttribute('planStatus') === 'done' ? 'done' : 'planned',
          children: []
        };
        if (/^#[0-9a-f]{6}$/i.test(color)) it.color = color;
        it.children = kids(el);
        out.push(it);
      });
      return out;
    }
    var res = kids(body);
    if (!res.length) throw new Error('В OPML нет ни одного узла.');
    return res;
  }

  function previewTree(nodes, limit) {
    var box = E('div', 'pp-card');
    box.style.maxHeight = '220px';
    box.style.overflow = 'auto';
    var shown = 0;
    function rec(list, depth) {
      list.forEach(function (n) {
        if (shown++ >= limit) return;
        var row = E('div');
        row.style.paddingLeft = Math.min(depth, 8) * 12 + 'px';
        row.style.fontSize = '11.5px';
        row.textContent = (n.kind === 'task' ? '☐ ' : '• ') + n.title;
        box.appendChild(row);
        rec(n.children || [], depth + 1);
      });
    }
    rec(nodes, 0);
    if (shown >= limit) box.appendChild(E('div', 'pp-hint', '…и ещё'));
    return box;
  }

  function dataTabImport() {
    var card = E('div', 'pp-card');
    card.appendChild(E('h4', null, 'Импорт Markdown / OPML / текста'));
    card.appendChild(E('p', null, 'Заголовки, списки и чек-листы превращаются в ветки и задачи. OPML понимает _note и planIsTask.'));
    var file = E('input');
    file.type = 'file';
    file.accept = '.md,.markdown,.opml,.txt,.xml,text/markdown,text/xml';
    file.style.marginBottom = '6px';
    file.addEventListener('change', function () {
      var f = file.files && file.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var text = String(fr.result || '');
          var ext = (f.name.split('.').pop() || '').toLowerCase();
          var nodes = ext === 'opml' || ext === 'xml' ? parseOPML(text) : parseMarkdown(text, S.importAsTasks);
          if (!nodes.length) throw new Error('Не найдено ни одного узла.');
          S.pendingImport = { name: f.name, nodes: nodes };
          renderBody();
          toast('Разобрано узлов: ' + nodes.length);
        } catch (e) {
          toast('Не удалось разобрать файл: ' + e.message);
        }
      };
      fr.readAsText(f, 'utf-8');
    });
    card.appendChild(file);

    var opt = E('label', 'pp-hint');
    opt.style.display = 'flex';
    opt.style.alignItems = 'center';
    opt.style.gap = '5px';
    var cb = E('input');
    cb.type = 'checkbox';
    cb.checked = S.importAsTasks;
    cb.addEventListener('change', function () { S.importAsTasks = cb.checked; });
    opt.appendChild(cb);
    opt.appendChild(document.createTextNode('пункты списков делать задачами'));
    card.appendChild(opt);

    var row = E('div', 'pp-row');
    row.style.marginTop = '6px';
    var sel = E('select', 'pp-select');
    sel.style.flex = '1';
    allItems(indexOf()).forEach(function (rec) {
      var o = E('option', null, new Array(Math.min(rec.depth, 6) + 1).join('· ') + rec.item.title);
      o.value = rec.item.id;
      if (rec.item.id === S.importParent) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { S.importParent = sel.value; });
    var go = E('button', 'pp-btn primary', 'Импортировать');
    go.type = 'button';
    go.disabled = !S.pendingImport;
    go.addEventListener('click', function () {
      if (!S.pendingImport) return;
      importRoots(sel.value, S.pendingImport.nodes);
    });
    row.appendChild(sel);
    row.appendChild(go);
    card.appendChild(row);

    if (S.pendingImport) {
      var info = E('div', 'pp-hint');
      info.style.margin = '8px 0 4px';
      info.textContent = 'Файл: ' + S.pendingImport.name;
      card.appendChild(info);
      card.appendChild(previewTree(S.pendingImport.nodes, 25));
    }
    return card;
  }

  // ---------- экспорт ----------
  function mdText() {
    var ix = indexOf(), lines = [], q = [];
    function rec(id, depth) {
      var it = ix.map[id], pad = new Array(depth + 1).join('  ');
      if (depth === 0) lines.push('# ' + it.title);
      else lines.push(pad + '- ' + (it.isTask ? (it.status === 'done' ? '[x] ' : '[ ] ') : '') + it.title);
      if (it.description) {
        it.description.split(/\r?\n/).forEach(function (l) {
          lines.push(pad + (depth === 0 ? '' : '  ') + '> ' + l);
        });
      }
      var meta = [];
      if (it.isTask) meta.push('статус: ' + STATUS[it.status]);
      if (it.startDate || it.endDate) meta.push(fmtDay(it.startDate) + ' — ' + fmtDay(it.endDate));
      if (it.assignee) meta.push('@' + it.assignee);
      var tg = tagsOf(it.id);
      if (tg.length) meta.push(tg.map(function (t) { return '#' + t; }).join(' '));
      if (meta.length) lines.push(pad + (depth === 0 ? '' : '  ') + '> ' + meta.join(' · '));
      (ix.kids[id] || []).forEach(function (c) { rec(c.id, depth + 1); });
    }
    rec(ix.root.id, 0);
    return lines.join('\n') + '\n';
  }

  function xmlEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c];
    });
  }

  function opmlText() {
    var ix = indexOf(), out = [];
    out.push('<?xml version="1.0" encoding="UTF-8"?>');
    out.push('<opml version="2.0"><head><title>' + xmlEsc(ix.root.title) + '</title></head><body>');
    function rec(id, indent) {
      var it = ix.map[id], pad = new Array(indent + 1).join('  ');
      var attrs = 'text="' + xmlEsc(it.title) + '"';
      if (it.description) attrs += ' _note="' + xmlEsc(it.description) + '"';
      if (it.isTask) attrs += ' planIsTask="true"';
      if (it.status) attrs += ' planStatus="' + it.status + '"';
      if (it.color) attrs += ' planColor="' + it.color + '"';
      var kids = ix.kids[id] || [];
      if (kids.length) {
        out.push(pad + '<outline ' + attrs + '>');
        kids.forEach(function (c) { rec(c.id, indent + 1); });
        out.push(pad + '</outline>');
      } else {
        out.push(pad + '<outline ' + attrs + '/>');
      }
    }
    (ix.kids[ix.root.id] || []).forEach(function (c) { rec(c.id, 1); });
    out.push('</body></opml>');
    return out.join('\n') + '\n';
  }

  function csvText() {
    var ix = indexOf(), rows = [];
    rows.push(['id', 'parentId', 'kind', 'isTask', 'title', 'status', 'startDate', 'endDate', 'assignee', 'priority', 'progress', 'tags', 'description', 'sortOrder']);
    allItems(ix).forEach(function (rec) {
      var it = rec.item;
      var st = subtreeStats(ix, it.id);
      rows.push([
        it.id, it.parentId || '', it.kind, it.isTask ? 'true' : 'false', it.title, it.status,
        it.startDate || '', it.endDate || '', it.assignee || '',
        ((META.priority || {})[it.id] || ''), st.pct, tagsOf(it.id).join(' '), it.description || '', it.sortOrder
      ]);
    });
    return '\ufeff' + rows.map(function (r) {
      return r.map(function (v) {
        v = String(v == null ? '' : v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',');
    }).join('\r\n') + '\r\n';
  }

  function jsonText() {
    return JSON.stringify(Object.assign({ version: 2, exportedAt: new Date().toISOString() }, S.data), null, 2);
  }

  function safeName() {
    var ix = indexOf();
    var n = ix.root ? ix.root.title : 'План';
    return String(n).replace(/[\\/:*?"<>|]+/g, '-').slice(0, 40) || 'План';
  }

  function download(name, text, mime) {
    try {
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1200);
      toast('Экспорт: ' + name);
    } catch (e) {
      toast('Не удалось экспортировать: ' + e.message);
    }
  }

  function exportAs(kind) {
    var base = safeName();
    if (kind === 'md') download(base + '.md', mdText(), 'text/markdown;charset=utf-8');
    else if (kind === 'opml') download(base + '.opml', opmlText(), 'text/xml;charset=utf-8');
    else if (kind === 'csv') download(base + '.csv', csvText(), 'text/csv;charset=utf-8');
    else if (kind === 'json') download(base + '.json', jsonText(), 'application/json;charset=utf-8');
  }

  // ---------- история ----------
  function loadSnaps() {
    try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]') || []; }
    catch (e) { return []; }
  }
  function storeSnaps(arr) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(arr)); return true; }
    catch (e) { toast('Не хватило места для снимка: ' + e.message); return false; }
  }
  function snapNow() {
    var arr = loadSnaps();
    arr.unshift({ at: new Date().toISOString(), name: safeName(), json: jsonText() });
    arr = arr.slice(0, 8);
    if (storeSnaps(arr)) {
      S.snaps = arr;
      renderBody();
      toast('Снимок сохранён (хранится 8 последних)');
    }
  }
  function restoreSnap(i) {
    var arr = loadSnaps();
    var s = arr[i];
    if (!s) return;
    if (!confirm('Восстановить снимок от ' + fmtTime(s.at) + '? Текущее состояние уйдёт в бэкап.')) return;
    var d;
    try { d = JSON.parse(s.json); } catch (e) { toast('Снимок повреждён.'); return; }
    delete d.version;
    delete d.exportedAt;
    commit(d, true);
  }

  function dataTabExport() {
    var card = E('div', 'pp-card');
    card.appendChild(E('h4', null, 'Экспорт'));
    card.appendChild(E('p', null, 'Markdown и OPML — для XMind, Obsidian и любых аутлайнеров. CSV — для Excel. JSON — полный бэкап.'));
    var row = E('div', 'pp-actions');
    [['md', 'Markdown'], ['opml', 'OPML'], ['csv', 'CSV'], ['json', 'JSON']].forEach(function (p) {
      var b = E('button', 'pp-btn', p[1]);
      b.type = 'button';
      b.addEventListener('click', function () { exportAs(p[0]); });
      row.appendChild(b);
    });
    card.appendChild(row);
    return card;
  }

  function dataTabHistory() {
    var card = E('div', 'pp-card');
    card.appendChild(E('h4', null, 'История версий'));
    card.appendChild(E('p', null, 'Снимок всей базы с возможностью отката. Перед каждым сохранением приложение и так пишет бэкап в data/backups.'));
    var row = E('div', 'pp-actions');
    var mk = E('button', 'pp-btn primary', 'Сделать снимок');
    mk.type = 'button';
    mk.addEventListener('click', snapNow);
    row.appendChild(mk);
    card.appendChild(row);

    S.snaps = loadSnaps();
    var list = E('div');
    list.style.marginTop = '8px';
    if (!S.snaps.length) list.appendChild(E('div', 'pp-hint', 'Снимков пока нет.'));
    S.snaps.forEach(function (s, i) {
      var line = E('div', 'pp-row');
      line.style.padding = '4px 0';
      line.style.borderTop = '1px solid var(--pp-line)';
      line.appendChild(E('span', 'pp-hint', fmtTime(s.at)));
      line.appendChild(E('span', 'pp-grow'));
      var open = E('button', 'pp-btn', 'Восстановить');
      open.type = 'button';
      open.addEventListener('click', function () { restoreSnap(i); });
      line.appendChild(open);
      var dl = E('button', 'pp-btn', 'Скачать');
      dl.type = 'button';
      dl.addEventListener('click', function () { download('snapshot-' + s.at.slice(0, 19).replace(/[:T]/g, '-') + '.json', s.json, 'application/json'); });
      line.appendChild(dl);
      list.appendChild(line);
    });
    card.appendChild(list);
    return card;
  }

  function dataTabMcp() {
    var card = E('div', 'pp-card');
    card.appendChild(E('h4', null, 'MCP / CLI для ИИ-агентов'));
    card.appendChild(E('p', null, 'Локальный CLI и MCP-сервер: агент читает план, добавляет ветки, меняет статусы и выгружает Markdown. Работает без интернета.'));
    var code = E('code', 'pp-code');
    code.textContent =
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py tree\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py search "реклама"\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py mcp   # MCP по stdio';
    card.appendChild(code);
    var row = E('div', 'pp-actions');
    row.style.marginTop = '7px';
    var copy = E('button', 'pp-btn', 'Скопировать');
    copy.type = 'button';
    copy.addEventListener('click', function () {
      var ta = document.createElement('textarea');
      ta.value = code.textContent;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('Скопировано'); }
      catch (e) { toast('Не удалось скопировать'); }
      ta.remove();
    });
    var skill = E('button', 'pp-btn', 'Инструкция');
    skill.type = 'button';
    skill.addEventListener('click', function () { download('PLAN-SKILL.md', skillText(), 'text/markdown;charset=utf-8'); });
    row.appendChild(copy);
    row.appendChild(skill);
    card.appendChild(row);
    return card;
  }

  function skillText() {
    return '# Навык: работа с планом ПЛАН\n\n' +
      'Файл плана: `~/Applications/ПЛАН/data/plan.json`. Перед правкой всегда делайте копию.\n\n' +
      '## CLI\n\n' +
      '```\npython3 ~/Applications/ПЛАН/tools/plan-cli.py tree --depth 3\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py search "запрос"\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py get <id>\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py add --parent <id|"Название"> --title "..." --task --desc "..." --start 2026-11-20 --end 2026-11-25 --assignee "Имя"\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py update <id> --status in_progress\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py rm <id>\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py export md --out plan.md\n' +
      'python3 ~/Applications/ПЛАН/tools/plan-cli.py import plan.md --parent <id>\n' +
      '```\n\n' +
      '## MCP\n\n' +
      '`python3 ~/Applications/ПЛАН/tools/plan-cli.py mcp` — JSON-RPC по stdio.\n' +
      'Инструменты: plan_tree, plan_search, plan_get, plan_add, plan_update, plan_delete, plan_export, plan_import, plan_stats.\n';
  }

  function renderData() {
    var wrap = E('div');
    var grid = E('div', 'pp-grid');
    grid.appendChild(dataTabExport());
    grid.appendChild(dataTabImport());
    wrap.appendChild(grid);
    var h = E('div', 'pp-section');
    h.style.marginTop = '10px';
    h.appendChild(dataTabHistory());
    wrap.appendChild(h);
    var m = E('div', 'pp-section');
    m.appendChild(dataTabMcp());
    wrap.appendChild(m);
    return wrap;
  }

  // ---------- оболочка ----------
  function renderBody() {
    var body = S.refs.body;
    if (!body) return;
    body.textContent = '';
    if (!S.data) { body.appendChild(E('div', 'pp-empty', 'Загрузка плана…')); return; }
    if (S.tab === 'search') body.appendChild(renderSearch());
    else if (S.tab === 'table') body.appendChild(renderTable());
    else if (S.tab === 'timeline') body.appendChild(renderTimeline());
    else if (S.tab === 'pres') body.appendChild(renderPresTab());
    else body.appendChild(renderData());
    S.refs.body.scrollTop = 0;
  }

  function renderSearch() {
    var ix = indexOf(), wrap = E('div');
    var inp = E('input', 'pp-input pp-search');
    inp.type = 'search';
    inp.placeholder = 'Поиск по названиям, описаниям, тегам и исполнителям…';
    inp.value = S.q;
    inp.addEventListener('input', function () { S.q = inp.value; renderResults(); });
    wrap.appendChild(inp);

    var row = E('div', 'pp-row');
    row.style.margin = '7px 0';
    var st = E('select', 'pp-select');
    [['all', 'Любой статус'], ['planned', 'Запланировано'], ['in_progress', 'В работе'], ['done', 'Готово']].forEach(function (p) {
      var o = E('option', null, p[1]); o.value = p[0];
      if (S.status === p[0]) o.selected = true;
      st.appendChild(o);
    });
    st.addEventListener('change', function () { S.status = st.value; renderResults(); });
    var kd = E('select', 'pp-select');
    [['all', 'Все типы'], ['task', 'Только задачи'], ['group', 'Только ветки']].forEach(function (p) {
      var o = E('option', null, p[1]); o.value = p[0];
      if (S.kind === p[0]) o.selected = true;
      kd.appendChild(o);
    });
    kd.addEventListener('change', function () { S.kind = kd.value; renderResults(); });
    var as = E('select', 'pp-select');
    var people = {};
    (S.data.items || []).forEach(function (i) { if (i.assignee) people[i.assignee] = 1; });
    var ao = E('option', null, 'Все исполнители'); ao.value = 'all';
    as.appendChild(ao);
    Object.keys(people).sort().forEach(function (p) {
      var o = E('option', null, p); o.value = p;
      if (S.assignee === p) o.selected = true;
      as.appendChild(o);
    });
    as.addEventListener('change', function () { S.assignee = as.value; renderResults(); });
    row.appendChild(st); row.appendChild(kd); row.appendChild(as);
    wrap.appendChild(row);

    var quick = E('div', 'pp-chips');
    quick.style.marginBottom = '8px';
    [['Мои задачи', 'task'], ['Готово', 'done'], ['В работе', 'in_progress']].forEach(function (p) {
      var b = E('button', 'pp-chip', p[0]);
      b.type = 'button';
      b.addEventListener('click', function () {
        if (p[1] === 'done' || p[1] === 'in_progress') { S.status = p[1]; S.kind = 'all'; }
        else { S.kind = 'task'; S.status = 'all'; }
        renderBody();
      });
      quick.appendChild(b);
    });
    if (S.q || S.status !== 'all' || S.kind !== 'all' || S.assignee !== 'all') {
      var clr = E('button', 'pp-chip', 'Сбросить');
      clr.type = 'button';
      clr.addEventListener('click', function () {
        S.q = ''; S.status = 'all'; S.kind = 'all'; S.assignee = 'all'; renderBody();
      });
      quick.appendChild(clr);
    }
    wrap.appendChild(quick);

    var res = E('div');
    S.refs.results = res;
    wrap.appendChild(res);
    if (!S.q && S.status === 'all' && S.kind === 'all' && S.assignee === 'all') {
      var hint = E('div', 'pp-hint');
      hint.style.marginTop = '10px';
      hint.textContent = 'Подсказка: теги ставятся в таблице и ищутся по #имени. Клик по результату центрирует узел на карте.';
      wrap.appendChild(hint);
    }
    setTimeout(renderResults, 0);
    return wrap;
  }

  function renderFoot() {
    var f = S.refs.foot;
    if (!f) return;
    f.textContent = '';
    if (!S.data) return;
    var ix = indexOf();
    var st = ix.root ? subtreeStats(ix, ix.root.id) : { total: 0, done: 0, pct: 0 };
    f.appendChild(E('span', null, (S.data.items || []).length + ' узлов · ' + st.total + ' задач · ' + st.done + ' готово'));
    f.appendChild(E('span', 'pp-grow'));
    if (S.dirty) f.appendChild(E('span', 'pp-dirty', 'есть несохранённые правки'));
    var nb = E('button', 'pp-btn', 'Снимок');
    nb.type = 'button';
    nb.addEventListener('click', snapNow);
    f.appendChild(nb);
    var save = E('button', 'pp-btn primary', 'Сохранить');
    save.type = 'button';
    save.disabled = !S.dirty;
    save.addEventListener('click', saveEdits);
    f.appendChild(save);
  }

  function switchTab(tab) {
    S.tab = tab;
    try { sessionStorage.setItem(TAB_KEY, tab); } catch (e) { /* ignore */ }
    Array.prototype.forEach.call(S.refs.tabs.querySelectorAll('.pp-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === tab);
    });
    renderBody();
  }

  function openPanel() {
    S.refs.panel.hidden = false;
    S.refs.fab.hidden = true;
    ensureData(true).then(function () {
      if (!S.data) return;
      renderBody();
      renderFoot();
    });
  }
  function closePanel() {
    S.refs.panel.hidden = true;
    S.refs.fab.hidden = false;
    try { sessionStorage.setItem(OPEN_KEY, '0'); } catch (e) { /* ignore */ }
  }

  function toast(msg) {
    if (!S.refs.toast) return;
    S.refs.toast.textContent = msg;
    S.refs.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { if (S.refs.toast) S.refs.toast.hidden = true; }, 3200);
  }

  function build() {
    // FAB
    var fab = E('button', 'pp-fab');
    fab.type = 'button';
    fab.title = 'ПЛАН ПРО: поиск, таблица, таймлайн, презентация';
    var mark = E('b', null, 'П');
    fab.appendChild(mark);
    fab.appendChild(document.createTextNode('ПРО'));
    fab.addEventListener('click', function (e) { e.stopPropagation(); openPanel(); });

    // Панель
    var panel = E('div', 'pp-panel');
    panel.hidden = true;
    var head = E('div', 'pp-head');
    var title = E('div', 'pp-title');
    title.innerHTML = 'ПЛАН <span>ПРО</span>';
    head.appendChild(title);
    head.appendChild(E('span', 'pp-grow'));
    var refresh = E('button', 'pp-iconbtn', '⟳');
    refresh.type = 'button';
    refresh.title = 'Перечитать план';
    refresh.addEventListener('click', function () {
      ensureData(true).then(function () { if (S.data) { renderBody(); renderFoot(); toast('Данные перечитаны'); } });
    });
    head.appendChild(refresh);
    var close = E('button', 'pp-iconbtn', '×');
    close.type = 'button';
    close.title = 'Закрыть';
    close.addEventListener('click', closePanel);
    head.appendChild(close);
    panel.appendChild(head);

    var tabs = E('div', 'pp-tabs');
    [['search', 'Поиск'], ['table', 'Таблица'], ['timeline', 'Таймлайн'], ['pres', 'Презентация'], ['data', 'Данные']].forEach(function (p) {
      var b = E('button', 'pp-tab', p[1]);
      b.type = 'button';
      b.setAttribute('data-tab', p[0]);
      if (S.tab === p[0]) b.classList.add('active');
      b.addEventListener('click', function () { switchTab(p[0]); });
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    var body = E('div', 'pp-body');
    panel.appendChild(body);
    var foot = E('div', 'pp-foot');
    panel.appendChild(foot);

    // Презентация
    var pres = E('div', 'pp-pres');
    pres.hidden = true;
    var slide = E('div', 'pp-slide');
    var top = E('div', 'pp-slide-top');
    var crumb = E('div', 'pp-slide-crumb');
    top.appendChild(crumb);
    top.appendChild(E('span', 'pp-grow'));
    var exit = E('button', 'pp-iconbtn', '×');
    exit.type = 'button';
    exit.title = 'Закрыть (Esc)';
    exit.addEventListener('click', function () { pres.hidden = true; });
    top.appendChild(exit);
    slide.appendChild(top);
    var bar = E('div', 'pp-slide-bar');
    var barFill = E('i');
    bar.appendChild(barFill);
    slide.appendChild(bar);
    var sbody = E('div', 'pp-slide-body');
    var sTitle = E('h2');
    var sMeta = E('div', 'pp-slide-meta');
    var sDesc = E('div', 'pp-slide-desc');
    sbody.appendChild(sTitle); sbody.appendChild(sMeta); sbody.appendChild(sDesc);
    slide.appendChild(sbody);
    var sfoot = E('div', 'pp-slide-foot');
    var prev = E('button', 'pp-btn', '← Назад');
    prev.type = 'button';
    prev.addEventListener('click', function () { stepSlide(-1); });
    var next = E('button', 'pp-btn primary', 'Вперёд →');
    next.type = 'button';
    next.addEventListener('click', function () { stepSlide(1); });
    var count = E('span', 'pp-slide-count');
    var kbd = E('span', 'pp-kbd', '← → · Esc');
    sfoot.appendChild(prev); sfoot.appendChild(next);
    sfoot.appendChild(E('span', 'pp-grow'));
    sfoot.appendChild(kbd);
    sfoot.appendChild(count);
    slide.appendChild(sfoot);
    pres.appendChild(slide);
    pres.addEventListener('click', function (e) { if (e.target === pres) pres.hidden = true; });

    var toastEl = E('div', 'pp-toast');
    toastEl.hidden = true;

    document.body.appendChild(fab);
    document.body.appendChild(panel);
    document.body.appendChild(pres);
    document.body.appendChild(toastEl);

    S.refs = {
      fab: fab, panel: panel, tabs: tabs, body: body, foot: foot, results: null,
      pres: pres, presCrumb: crumb, presTitle: sTitle, presMeta: sMeta, presDesc: sDesc,
      presPrev: prev, presNext: next, presCount: count, presBar: barFill,
      toast: toastEl, addform: null
    };

    document.addEventListener('keydown', function (e) {
      if (!pres.hidden) {
        if (e.key === 'Escape') { pres.hidden = true; e.preventDefault(); }
        else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { stepSlide(1); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { stepSlide(-1); e.preventDefault(); }
        else if (e.key === 'Home') { S.slide = 0; renderSlide(); e.preventDefault(); }
        else if (e.key === 'End') { S.slide = S.slides.length - 1; renderSlide(); e.preventDefault(); }
        return;
      }
      if (e.key === 'Escape' && !panel.hidden) closePanel();
    });

    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (panel.contains(e.target) || fab.contains(e.target)) return;
      // не закрываем при клике по всплывающим окнам
      if (e.target.closest && e.target.closest('.pp-modal')) return;
      // панель не модальная: клики по карте не должны её закрывать
    });
  }

  function start() {
    build();
    try {
      var t = sessionStorage.getItem(TAB_KEY);
      if (t) S.tab = t;
      else S.tab = 'search';
    } catch (e) { /* ignore */ }
    Array.prototype.forEach.call(S.refs.tabs.querySelectorAll('.pp-tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === S.tab);
    });

    var open = false;
    try { open = sessionStorage.getItem(OPEN_KEY) === '1'; } catch (e) { /* ignore */ }
    if (open) {
      setTimeout(openPanel, 500);
    }
    var j = null;
    try { j = sessionStorage.getItem(JUMP_KEY); } catch (e) { /* ignore */ }
    if (j) {
      try { sessionStorage.removeItem(JUMP_KEY); } catch (e) { /* ignore */ }
      setTimeout(function () { jumpTo(j); }, 3600);
    }
    console.log('[plan-pro] готов: поиск, таблица, таймлайн, презентация, импорт/экспорт');
  }

  // публичный мини-API для проверок и автоматизации
  window.__planPro = {
    open: openPanel,
    close: closePanel,
    state: S,
    ensureData: ensureData,
    mdText: mdText,
    opmlText: opmlText,
    csvText: csvText,
    jsonText: jsonText,
    parseMarkdown: parseMarkdown,
    parseOPML: parseOPML,
    importRoots: importRoots,
    addNode: addNode,
    jumpTo: jumpTo,
    snapNow: snapNow,
    meta: META
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
