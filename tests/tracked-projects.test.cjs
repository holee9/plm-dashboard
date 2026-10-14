// 주요 과제 선택 (#110): the excluded-projects setting changes every number on the first screen consistently,
// is shared through one file, and degrades to "show everything + warn" when that file is broken.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/home', f), 'utf8'));
const URL = 'data/config/tracked-projects.json';

function setup({ config, puts = [], putStatus = 200 } = {}) {
  const health = read('health.json'), insights = read('insights.json'), weekly = read('weekly.json'), ra = read('ra.json');
  const files = { 'data/health.json': health, 'data/insights.json': insights, 'data/ra.json': ra, 'data/weekly.json': weekly };
  const handlers = {};
  let cfg = config;       // string = raw file body, object = JSON, undefined = missing file
  const context = { console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    fetch: async (url, opts = {}) => {
      if (url === URL) {
        if (opts.method === 'PUT') { puts.push(JSON.parse(opts.body)); if (putStatus === 200) cfg = JSON.parse(opts.body); return { ok: putStatus === 200, status: putStatus }; }
        if (cfg === undefined) return { ok: false, status: 404 };
        return { ok: true, status: 200, json: async () => (typeof cfg === 'string' ? JSON.parse(cfg) : JSON.parse(JSON.stringify(cfg))) };
      }
      return { ok: url in files, status: url in files ? 200 : 404, json: async () => JSON.parse(JSON.stringify(files[url])) };
    },
    document: { getElementById: () => null, addEventListener: (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); }, querySelectorAll: () => [],
      _click: (sel, dataset = {}) => (handlers.click || []).forEach((fn) => fn({ preventDefault() {}, target: { closest: (s) => (s === sel ? { dataset, getAttribute: () => null } : null) } })) } };
  context.window = context;
  vm.createContext(context);
  context.window.DB = null;
  for (const f of ['ui.js', 'exec-core.js', 'views/home.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  context.window.App = { refresh() {}, go() {} };
  return { c: context, health, insights, weekly };
}
async function render(env) { env.c.Views.home({}); await new Promise((r) => setTimeout(r, 0)); return env.c.Views.home({}); }
const rows = (html) => (html.match(/data-exec-line="/g) || []).length;
const num = (html, attr) => +(html.match(new RegExp(`${attr}[^>]*>(\\d+)<`)) || [])[1];

// a product line with at least two projects, and one of its projects that has open work
function pick(insights, weekly) {
  const line = insights.product_lines.find((l) => !l.regulatory && l.projects.length > 1);
  const weeklyCount = (p) => { const n = (insights.project_status.find((x) => x.identifier === p) || {}).project; return weekly ? weekly.lines.reduce((t, l) => t + ['done_last', 'carry', 'new_week', 'due_week', 'decide'].reduce((a, k) => a + (l[k] || []).filter((i) => i.project === n).length, 0), 0) : 0; };
  const cands = line.projects.filter((p) => (insights.project_stats.find((s) => s.identifier === p) || {}).open > 0);
  const id = cands.sort((a, b) => weeklyCount(b) - weeklyCount(a))[0];
  return { line, id, stats: insights.project_stats.find((s) => s.identifier === id), name: insights.project_status.find((p) => p.identifier === id).project };
}

test('P1 no setting file: all line projects count, no warning, panel closed', async () => {
  const env = setup();
  const html = await render(env);
  const lines = env.insights.product_lines.filter((l) => !l.regulatory);
  assert.equal(rows(html), lines.length);
  assert.equal(num(html, 'data-home-scope-n'), lines.reduce((n, l) => n + l.projects.length, 0));
  assert.equal(num(html, 'data-home-scope-x'), 0);
  assert.doesNotMatch(html, /data-home-scope-warn|data-home-scope-panel/);
  assert.match(html, new RegExp(`열린 일감 <b>${env.insights.metrics.all.open}</b>건`));
});

test('P2 P4 excluding a project removes exactly its numbers everywhere', async () => {
  const base = await render(setup());
  const env0 = setup(), { id, stats, name } = pick(env0.insights, env0.weekly);
  const env = setup({ config: { version: 1, excluded: [id], updated_at: '2026-10-14T01:00:00Z' } });
  const html = await render(env);
  const m = env.insights.metrics.all;
  assert.match(html, new RegExp(`열린 일감 <b>${m.open - stats.open}</b>건`));
  assert.equal(num(html, 'data-home-scope-x'), 1);
  assert.equal(num(html, 'data-home-scope-n'), num(base, 'data-home-scope-n') - 1);
  assert.match(html, /마지막 변경 2026-10-14/);
  // 주간 흐름 total = recount over the same weekly.json without that project's items
  const w = env.weekly, keys = ['done_last', 'carry', 'new_week', 'due_week', 'decide'];
  const totalRow = (html.match(/data-home-wftotal>([\s\S]*?)<\/tr>/) || [])[1];
  const got = [...totalRow.matchAll(/<td><b>(\d+)<\/b>/g)].map((x) => +x[1]);
  const want = keys.map((k) => w.lines.reduce((n, l) => n + (l[k] || []).filter((i) => i.project !== name).length, 0));
  assert.deepEqual(got, want);
  assert.ok(keys.some((k, i) => want[i] < w.totals[k]), 'the chosen project must actually have weekly items, or this test proves nothing');
  assert.match(html, /주요 과제만 고른 동안 표시하지 않습니다/);
});

test('a line whose projects are all excluded disappears from the table', async () => {
  const env0 = setup(), line = env0.insights.product_lines.find((l) => !l.regulatory);
  const html = await render(setup({ config: { version: 1, excluded: line.projects } }));
  assert.equal(rows(html), env0.insights.product_lines.filter((l) => !l.regulatory).length - 1);
  assert.doesNotMatch(html, new RegExp(`data-exec-line="${line.name.replace(/[()/]/g, '.')}"`));
});

test('P7 broken or malformed file shows everything and a visible warning', async () => {
  for (const config of ['{not json', { excluded: 'x' }, { excluded: [1] }]) {
    const env = setup({ config });
    const html = await render(env);
    assert.equal(rows(html), env.insights.product_lines.filter((l) => !l.regulatory).length);
    assert.match(html, /data-home-scope-warn/);
    assert.equal(num(html, 'data-home-scope-x'), 0);
  }
});

test('an unknown identifier in the file is ignored (new or removed projects never break the count)', async () => {
  const env = setup({ config: { version: 1, excluded: ['NOPE-123'] } });
  const html = await render(env);
  assert.equal(num(html, 'data-home-scope-x'), 0);
  assert.doesNotMatch(html, /data-home-scope-warn/);
});

test('the selector lists every line project, checks the tracked ones, and saves the unchecked ones', async () => {
  const puts = [], env = setup({ puts });
  await render(env);
  const { id } = pick(env.insights, env.weekly);
  env.c.document._click('[data-home-scope-toggle]');
  env.c.document._click('[data-home-scope-proj]', { homeScopeProj: id });
  const html = env.c.Views.home({});
  assert.match(html, /data-home-scope-panel/);
  const lines = env.insights.product_lines.filter((l) => !l.regulatory);
  assert.equal((html.match(/data-home-scope-proj="/g) || []).length, lines.reduce((n, l) => n + l.projects.length, 0));
  assert.match(html, new RegExp(`data-home-scope-proj="${id}"\\s*>`));        // unchecked = excluded
  env.c.document._click('[data-home-scope-save]');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].excluded, [id]);
  assert.ok(puts[0].updated_at && puts[0].version === 1);
  assert.equal(num(env.c.Views.home({}), 'data-home-scope-x'), 1);              // re-read from the file after saving
});

test('a failed save keeps the panel open with the error and changes nothing', async () => {
  const puts = [], env = setup({ puts, putStatus: 403 });
  await render(env);
  const { id } = pick(env.insights, env.weekly);
  env.c.document._click('[data-home-scope-toggle]');
  env.c.document._click('[data-home-scope-proj]', { homeScopeProj: id });
  env.c.document._click('[data-home-scope-save]');
  await new Promise((r) => setTimeout(r, 5));
  const html = env.c.Views.home({});
  assert.match(html, /HTTP 403/);
  assert.match(html, /data-home-scope-panel/);
  assert.equal(num(html, 'data-home-scope-x'), 0);
});

test('excluding every project is refused', async () => {
  const puts = [], env = setup({ puts });
  await render(env);
  env.c.document._click('[data-home-scope-toggle]');
  for (const l of env.insights.product_lines.filter((x) => !x.regulatory)) for (const p of l.projects) env.c.document._click('[data-home-scope-proj]', { homeScopeProj: p });
  env.c.document._click('[data-home-scope-save]');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(puts.length, 0);
  assert.match(env.c.Views.home({}), /하나 이상 남겨/);
});

// audit F1 (#110): the expandable detail row must count the same scope as the summary row above it
test('the line detail row counts only tracked projects', async () => {
  const env0 = setup(), { line, id, stats } = pick(env0.insights, env0.weekly);
  const openOf = (ids) => ids.reduce((n, p) => n + ((env0.insights.project_stats.find((s) => s.identifier === p) || {}).open || 0), 0);
  const html = await render(setup({ config: { version: 1, excluded: [id] } }));
  const detail = html.match(new RegExp(`data-exec-detail="${line.name.replace(/[()/]/g, '.')}"[\\s\\S]*?</tr>`))[0];
  assert.match(detail, new RegExp(`열린 ${openOf(line.projects) - stats.open}건`));
  assert.ok(openOf(line.projects) - stats.open !== openOf(line.projects), 'the chosen project must have open work');
});

// audit F2 (#110): the last-change date is shown in the viewer's local calendar day, not the UTC day
test('last change date uses the local day', async () => {
  const html = await render(setup({ config: { version: 1, excluded: [], updated_at: '2026-10-13T16:30:00Z' } }));
  const d = new Date('2026-10-13T16:30:00Z'), local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.match(html, new RegExp(`마지막 변경 ${local}`));
});

// audit F5 (#110): the regulatory line is not selectable, so naming it in the file changes nothing
test('excluding the regulatory line in the file is ignored', async () => {
  const env0 = setup(), ra = env0.insights.product_lines.find((l) => l.regulatory);
  const html = await render(setup({ config: { version: 1, excluded: ra.projects } }));
  assert.equal(num(html, 'data-home-scope-x'), 0);
});
