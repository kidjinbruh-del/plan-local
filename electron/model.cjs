"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/model.ts
var model_exports = {};
__export(model_exports, {
  cleanOrder: () => cleanOrder,
  day: () => day,
  demoData: () => demoData,
  descendants: () => descendants,
  directions: () => directions,
  effectiveColor: () => effectiveColor,
  exportBackup: () => exportBackup,
  isTask: () => isTask,
  iso: () => iso,
  labels: () => labels,
  layout: () => layout,
  parseBackup: () => parseBackup,
  scoped: () => scoped,
  stats: () => stats,
  validDate: () => validDate,
  validateItems: () => validateItems
});
module.exports = __toCommonJS(model_exports);
var isTask = (x) => x.isTask ?? x.kind === "task";
var directions = { right: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u2192", left: "\u0413\u043E\u0440\u0438\u0437\u043E\u043D\u0442\u0430\u043B\u044C\u043D\u0430\u044F \u2190", down: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u2193", up: "\u0412\u0435\u0440\u0442\u0438\u043A\u0430\u043B\u044C\u043D\u0430\u044F \u2191", both: "\u0414\u0432\u0443\u0441\u0442\u043E\u0440\u043E\u043D\u043D\u044F\u044F" };
function effectiveColor(items, id) {
  const map = new Map(items.map((x2) => [x2.id, x2]));
  let x = map.get(id);
  const seen = /* @__PURE__ */ new Set();
  while (x && !seen.has(x.id)) {
    seen.add(x.id);
    if (x.color) return x.color;
    x = x.parentId ? map.get(x.parentId) : void 0;
  }
  return "#7186a4";
}
function cleanOrder(items, order = []) {
  const ids = new Set(items.map((x) => x.id));
  return [.../* @__PURE__ */ new Set([...order.filter((id) => ids.has(id)), ...items.slice().sort((a, b) => a.sortOrder - b.sortOrder).map((x) => x.id)])];
}
var labels = { planned: "\u0417\u0430\u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u043E", in_progress: "\u0412 \u0440\u0430\u0431\u043E\u0442\u0435", done: "\u0413\u043E\u0442\u043E\u0432\u043E" };
function iso(date = /* @__PURE__ */ new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function day(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 864e5;
}
function validDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return y >= 1e3 && x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
}
function descendants(items, id) {
  const set = /* @__PURE__ */ new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const x of items) if (x.parentId && set.has(x.parentId) && !set.has(x.id)) {
      set.add(x.id);
      changed = true;
    }
  }
  return set;
}
function scoped(items, id) {
  return id ? items.filter((x) => descendants(items, id).has(x.id)) : items;
}
function stats(items) {
  const tasks = items.filter(isTask);
  return { total: tasks.length, progress: tasks.filter((x) => x.status === "in_progress").length, done: tasks.filter((x) => x.status === "done").length };
}
function validateItems(value) {
  if (!Array.isArray(value) || !value.length || value.length > 1e4) throw Error("\u041F\u043B\u0430\u043D \u0434\u043E\u043B\u0436\u0435\u043D \u0441\u043E\u0434\u0435\u0440\u0436\u0430\u0442\u044C \u043E\u0442 1 \u0434\u043E 10 000 \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u043E\u0432.");
  const ids = /* @__PURE__ */ new Set();
  for (const x of value) {
    if (!x || typeof x.id !== "string" || !x.id || ids.has(x.id)) throw Error("\u041F\u043E\u0432\u0442\u043E\u0440\u044F\u044E\u0449\u0438\u0439\u0441\u044F \u0438\u043B\u0438 \u043E\u0442\u0441\u0443\u0442\u0441\u0442\u0432\u0443\u044E\u0449\u0438\u0439 ID.");
    ids.add(x.id);
    if (x.isTask !== void 0 && typeof x.isTask !== "boolean" || x.color != null && (typeof x.color !== "string" || !/^#[0-9a-f]{6}$/i.test(x.color)) || x.branchDirection != null && !["right", "left", "down", "up", "both"].includes(x.branchDirection)) throw Error("\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u0442\u0438\u043F \u0443\u0437\u043B\u0430, HEX-\u0446\u0432\u0435\u0442 \u0438\u043B\u0438 \u043D\u0430\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u0435.");
    if (x.id.length > 200 || x.title?.length > 4096 || x.description?.length > 65536 || x.assignee?.length > 4096) throw Error("\u041F\u0440\u0435\u0432\u044B\u0448\u0435\u043D \u043B\u0438\u043C\u0438\u0442 \u0434\u043B\u0438\u043D\u044B \u043F\u043E\u043B\u044F.");
    if (!["root", "group", "task"].includes(x.kind) || !["planned", "in_progress", "done"].includes(x.status) || typeof x.title !== "string" || !x.title.trim() || typeof x.description !== "string" || !(x.assignee === null || typeof x.assignee === "string") || !Number.isFinite(x.sortOrder) || !(x.parentId === null || typeof x.parentId === "string")) throw Error("\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0435 \u043F\u043E\u043B\u044F \u044D\u043B\u0435\u043C\u0435\u043D\u0442\u0430.");
    for (const date of [x.startDate, x.endDate]) if (date !== null && !validDate(date)) throw Error("\u041D\u0435\u043A\u043E\u0440\u0440\u0435\u043A\u0442\u043D\u0430\u044F \u0434\u0430\u0442\u0430.");
    if (x.startDate && x.endDate && x.endDate < x.startDate) throw Error("\u041E\u043A\u043E\u043D\u0447\u0430\u043D\u0438\u0435 \u043D\u0435 \u043C\u043E\u0436\u0435\u0442 \u0431\u044B\u0442\u044C \u0440\u0430\u043D\u044C\u0448\u0435 \u043D\u0430\u0447\u0430\u043B\u0430.");
  }
  if (value.filter((x) => x.kind === "root").length !== 1 || value.filter((x) => x.parentId === null).length !== 1 || value.find((x) => x.kind === "root").parentId !== null) throw Error("\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F \u043E\u0434\u0438\u043D \u0437\u0430\u0449\u0438\u0449\u0451\u043D\u043D\u044B\u0439 \u043A\u043E\u0440\u0435\u043D\u044C.");
  const map = new Map(value.map((x) => [x.id, x]));
  for (const x of value) {
    const seen = /* @__PURE__ */ new Set([x.id]);
    let p = x.parentId;
    while (p !== null) {
      if (!map.has(p)) throw Error("\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D.");
      if (seen.has(p)) throw Error("\u041D\u0435\u043B\u044C\u0437\u044F \u0441\u043E\u0437\u0434\u0430\u0442\u044C \u0446\u0438\u043A\u043B \u0432 \u0438\u0435\u0440\u0430\u0440\u0445\u0438\u0438.");
      seen.add(p);
      if (seen.size > 100) throw Error("\u0412\u043B\u043E\u0436\u0435\u043D\u043D\u043E\u0441\u0442\u044C \u043F\u0440\u0435\u0432\u044B\u0448\u0430\u0435\u0442 100 \u0443\u0440\u043E\u0432\u043D\u0435\u0439.");
      p = map.get(p).parentId;
    }
  }
}
function layout(items) {
  const positions = {};
  let row = 0;
  function visit(id, depth) {
    const children = items.filter((x) => x.parentId === id).sort((a, b) => a.sortOrder - b.sortOrder);
    const ys = children.map((x) => visit(x.id, depth + 1));
    const y = ys.length ? (ys[0] + ys[ys.length - 1]) / 2 : row++ * 105;
    positions[id] = { x: depth * 270, y };
    return y;
  }
  const root = items.find((x) => x.kind === "root");
  if (root) visit(root.id, 0);
  return positions;
}
function parseBackup(text) {
  const raw = JSON.parse(text);
  if (![1, 2].includes(raw.version)) throw Error("\u041D\u0435\u043F\u043E\u0434\u0434\u0435\u0440\u0436\u0438\u0432\u0430\u0435\u043C\u0430\u044F \u0432\u0435\u0440\u0441\u0438\u044F \u0444\u0430\u0439\u043B\u0430.");
  validateItems(raw.items);
  if (raw.version === 1) raw.items = raw.items.map((x) => ({ ...x, isTask: isTask(x) }));
  const positions = {};
  for (const [id, p] of Object.entries(raw.positionsById ?? {})) if (raw.items.some((x) => x.id === id) && p && Number.isFinite(p.x) && Number.isFinite(p.y)) positions[id] = { x: p.x, y: p.y };
  return { ...raw.mapLayout ? { mapLayout: checkedLayout(raw.mapLayout) } : {}, ...raw.roadmapOrder ? { roadmapOrder: cleanOrder(raw.items, checkedOrder(raw.roadmapOrder)) } : {}, items: raw.items, positionsById: { ...layout(raw.items), ...positions }, collapsed: Array.isArray(raw.collapsed) ? raw.collapsed.filter((id) => typeof id === "string" && raw.items.some((x) => x.id === id)) : [], demo: raw.demo === true, ...raw.ui ? { ui: { timelineScale: ["day", "week", "month", "quarter"].includes(raw.ui.timelineScale) ? raw.ui.timelineScale : "week", timelineDate: validDate(raw.ui.timelineDate) ? raw.ui.timelineDate : iso(), ...typeof raw.ui.sidebarCollapsed === "boolean" ? { sidebarCollapsed: raw.ui.sidebarCollapsed } : {}, ...typeof raw.ui.propertiesCollapsed === "boolean" ? { propertiesCollapsed: raw.ui.propertiesCollapsed } : {}, ...typeof raw.ui.splitRatio === "number" && Number.isFinite(raw.ui.splitRatio) ? { splitRatio: Math.max(0, Math.min(1, raw.ui.splitRatio)) } : {} } } : {} };
}
function exportBackup(data) {
  return JSON.stringify({ version: 2, exportedAt: (/* @__PURE__ */ new Date()).toISOString(), ...data }, null, 2);
}
function demoData() {
  const items = [];
  function add(title, parentId, kind, status = "planned", endDate = null) {
    const id = crypto.randomUUID();
    items.push({ id, parentId, kind, isTask: kind === "task", title, status, description: "", startDate: endDate ? iso() : null, endDate, assignee: null, sortOrder: items.length });
    return id;
  }
  const root = add("\u041C\u043E\u0438 \u043F\u043B\u0430\u043D\u044B", null, "root");
  const work = add("\u041F\u0420\u041E\u0424\u0422\u0415\u0425", root, "group");
  const personal = add("\u041B\u0438\u0447\u043D\u043E\u0435", root, "group");
  const ideas = add("\u0418\u0434\u0435\u0438", root, "group");
  const end = /* @__PURE__ */ new Date();
  end.setDate(end.getDate() + 14);
  add("\u0420\u0435\u0433\u043B\u0430\u043C\u0435\u043D\u0442\u044B \u0424\u0438\u0437. \u043E\u0442\u0434\u0435\u043B\u0430", work, "task", "in_progress", iso(end));
  add("\u0410\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0437\u0430\u0446\u0438\u044F Bitrix24", work, "task");
  add("\u041C\u0443\u0437\u044B\u043A\u0430\u043B\u044C\u043D\u044B\u0439 \u043F\u0440\u043E\u0435\u043A\u0442", personal, "task");
  add("\u0420\u0435\u0436\u0438\u043C", personal, "task", "in_progress", iso(end));
  add("\u041F\u043B\u0430\u0442\u0444\u043E\u0440\u043C\u0430 \u043F\u043B\u0430\u043D\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F", ideas, "task", "in_progress", iso(end));
  return { items, positionsById: layout(items), collapsed: [], demo: true };
}
function checkedLayout(x) {
  if (!["right", "left", "up", "down", "both"].includes(String(x))) throw Error("\u041D\u0435\u0432\u0435\u0440\u043D\u0430\u044F \u0441\u0445\u0435\u043C\u0430 \u043A\u0430\u0440\u0442\u044B");
  return x;
}
function checkedOrder(x) {
  if (!Array.isArray(x) || x.length > 1e4 || x.some((n) => typeof n !== "string")) throw Error("\u041D\u0435\u0432\u0435\u0440\u043D\u044B\u0439 \u043F\u043E\u0440\u044F\u0434\u043E\u043A \u0434\u043E\u0440\u043E\u0436\u043D\u043E\u0439 \u043A\u0430\u0440\u0442\u044B");
  return x;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanOrder,
  day,
  demoData,
  descendants,
  directions,
  effectiveColor,
  exportBackup,
  isTask,
  iso,
  labels,
  layout,
  parseBackup,
  scoped,
  stats,
  validDate,
  validateItems
});
