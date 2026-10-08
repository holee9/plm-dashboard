// 대시보드 first screen (#94): renders the five blocks from the same data the status screen uses,
// and the this-week numbers agree with a recomputation over the same inputs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');
// data/*.json is written by Hermes at runtime and git-ignored; tests use a snapshot taken 2026-10-07.
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/home', f), 'utf8'));

// Live OP work packages as the data layer exposes them (window.DB): today ±, one bulk month-end date excluded.
function fakeDB(today) {
  const d = (n) => new Date(today.getTime() + n * 86400000);
  const isoD = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;   // local date, like data.js
  const mk = (id, n, statusId = 2, projectId = 1, assigneeId = 1) => ({ id, displayId: `T-${id}`, subject: `일감 ${id}`, projectId, statusId, assigneeId, dueDate: isoD(d(n)), _due: d(n) });
  const WORK_PACKAGES = [mk(1, 0), mk(2, 3), mk(3, 7), mk(4, 8), mk(5, -1), mk(6, 2, 6), mk(7, 5, 2, 2, null)];
  const S = { 2: { name: 'In Progress' }, 6: { name: 'Done', isClosed: true } };
  const P = { 1: { name: 'BLUE', identifier: 'BLU' }, 2: { name: 'RA', identifier: 'RA' } };
  const U = { 1: { name: '김명섭' } };
  const isOpenWork = (w) => !(S[w.statusId] || {}).isClosed;
  const dueWithin = (w, days) => isOpenWork(w) && !!w._due && w._due >= today && w._due <= d(days);
  return { TODAY: today, WORK_PACKAGES, S, P, U, isOpen: isOpenWork, isOpenWork, dueWithin, isOverdue: (w) => isOpenWork(w) && w._due < today };
}

function setup({ ra = read('ra.json'), db } = {}) {
  const health = read('health.json'), insights = read('insights.json');
  const files = { 'data/health.json': health, 'data/insights.json': insights, 'data/ra.json': ra };
  const handlers = {};
  const context = { console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    fetch: async (url) => ({ ok: url in files, status: url in files ? 200 : 404, json: async () => JSON.parse(JSON.stringify(files[url])) }),
    document: { getElementById: () => null, addEventListener: (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); }, querySelectorAll: () => [],
      _fire: (n, sel, attrs) => (handlers[n] || []).forEach((fn) => fn({ preventDefault() {}, target: { closest: (s) => (s === sel ? { getAttribute: (k) => attrs[k], dataset: {} } : null) } })) } };
  context.window = context;
  vm.createContext(context);
  context.window.DB = db === undefined ? fakeDB(new Date(health.today + 'T00:00:00')) : db;
  for (const f of ['ui.js', 'exec-core.js', 'views/home.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  context.window.App = { refresh() {}, go() {} };
  return { c: context, health, insights, ra };
}
async function render(env) {
  env.c.Views.home({});
  await new Promise((r) => setTimeout(r, 0));
  return env.c.Views.home({});
}
const count = (html, re) => (html.match(re) || []).length;

test('the first screen renders all five blocks', async () => {
  const html = await render(setup());
  assert.match(html, /data-home-basis/);                 // 1 data basis
  assert.match(html, /Q1 제품 일정/);                    // 2 strip
  assert.match(html, /data-home-lines/);                 // 3 product lines
  assert.match(html, /data-home-due/);                   // 4 this week
  assert.match(html, /data-home-decide/);
  assert.match(html, /data-home-long/);
  assert.match(html, /인허가 — 회사 전체/);               // 5 regulatory
  assert.match(html, /data-home-ra-toggle/);
  assert.doesNotMatch(html, /data-home-go|data-exec-ra/);   // #96: no link to a separate RA screen
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('due-this-week lists open work due within 7 days from live OP, closed and past excluded', async () => {
  const html = await render(setup());
  const ids = [...html.matchAll(/data-home-duerow="(\d+)"/g)].map((m) => +m[1]);
  assert.deepEqual(ids, [1, 2, 7, 3]);                   // sorted by due (day 0, 3, 5, 7); 4 (day 8), 5 (past), 6 (closed) excluded
  assert.doesNotMatch(html, /D-NaN/);
  assert.match(html, /이번 주 마감 4건/);
  assert.match(html, /담당자 없음/);                      // id 7 has no assignee
});

test('decisions-pending count equals a recomputation over health.json and shows days slipped', async () => {
  const env = setup();
  const html = await render(env);
  const NEED = ['overdue', 'missing_update', 'blocked_aging'];
  const expect = env.health.items.filter((i) => i.flags.some((f) => ['blocked_aging', 'missing_update', 'triage_overdue'].includes(f)) || (!i.assignee && i.flags.some((f) => NEED.includes(f)))).length;
  assert.equal(count(html, /data-home-deciderow=/g), expect);
  assert.match(html, new RegExp(`결정 필요 ${expect}건`));
  if (expect) assert.match(html, /<td class="num"><b>\d+<\/b>일<\/td>/);
});

test('regulatory block shows obligations due within 90 days and the registry counts', async () => {
  const env = setup();
  const html = await render(env);
  const lim = new Date(new Date(env.ra.today + 'T00:00:00').getTime() + 90 * 86400000).toISOString().slice(0, 10);
  const expect = env.ra.registry.obligations.filter((o) => o.date && (o.overdue || o.date <= lim)).length;
  assert.match(html, new RegExp(`90일 안 의무</div>\\s*<div class="kpi-value">[^<]*${expect}건`));
  assert.match(html, new RegExp(`${env.ra.registry.counts.rows}\\+${env.ra.registry.counts.company_rows}`));
});

test('without live OP data the due block says so instead of failing', async () => {
  const html = await render(setup({ db: { WORK_PACKAGES: [] } }));
  assert.match(html, /data-home-due="none"/);
  assert.match(html, /data-home-lines/);
});

test('without ra.json the screen still renders and says regulatory data is missing', async () => {
  const env = setup();
  env.c.fetch = async (url) => (url === 'data/ra.json' ? { ok: false, status: 404 } : { ok: true, json: async () => read(url.slice(5)) });
  const html = await render(env);
  assert.match(html, /data-home-ra="none"/);
  assert.match(html, /data-home-lines/);
});

// #96 A1/A3: the regulatory detail expands in place and is byte-identical to the old RA screen's panels.
test('regulatory detail expands in place to family → series → model and matches the RA screen', async () => {
  const env = setup();
  for (const f of ['ra-panels.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), env.c, { filename: f });
  let html = await render(env);
  assert.doesNotMatch(html, /data-ra-matrix/);                         // collapsed by default
  const click = (sel, attrs = {}) => env.c.document._fire('click', sel, attrs);
  click('[data-home-ra-toggle]');
  html = env.c.Views.home({});
  assert.match(html, /data-ra-detail/);
  assert.match(html, /data-ra-matrix/); assert.match(html, /data-ra-company/); assert.match(html, /data-ra-obligations/);
  // the same panels rendered directly from the module, same data (#98: there is no separate RA screen any more)
  const old = env.c.RAPanels.detail(JSON.parse(JSON.stringify(env.ra)));
  const region = (h, from, to) => { const i = h.indexOf(from); const j = h.indexOf(to, i + 1); return h.slice(i, j); };
  assert.equal(region(html, '<table class="tbl" data-ra-matrix', '</table>'), region(old, '<table class="tbl" data-ra-matrix', '</table>'));
  assert.equal(region(html, '<table class="tbl" data-ra-company', '</table>'), region(old, '<table class="tbl" data-ra-company', '</table>'));
  // expand a family → series rows → model rows, inside the first screen
  const fam = env.ra.registry.families[0];
  click('[data-ra-fam]', { 'data-ra-fam': fam });
  html = env.c.Views.home({});
  assert.match(html, /data-ra-seriesrow=/); assert.match(html, /data-ra-modelrow=/);
  click('[data-home-ra-toggle]');
  assert.doesNotMatch(env.c.Views.home({}), /data-ra-matrix/);
});
