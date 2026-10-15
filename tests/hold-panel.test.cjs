// 보류 현황 (#112): On Hold work is listed apart and never changes an indicator.
// The fixtures are a snapshot of the OLD Hermes output; adaptToHermes112() reshapes them the way the new Hermes
// (scripts/hermes, tested in test_op_hold_separation.py) writes them: holds carry only "blocked", are counted as on_hold
// and left out of open / overdue / critical, the flow lists and the weekly buckets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/home', f), 'utf8'));
const BUCKETS = ['done_last', 'carry', 'new_week', 'due_week'];

function reshape(env, origFlags) {
  const { health, insights, weekly } = env;
  const holds = health.items.filter((i) => i.status === 'On Hold');
  const had = (i, f) => (origFlags.get(i.id) || []).includes(f);
  for (const p of health.project_health) {
    const hs = holds.filter((i) => i.project === p.project);
    p.open -= hs.length; p.on_hold = hs.length; p.blocked = hs.length;
    p.overdue -= hs.filter((i) => had(i, 'overdue')).length;
    p.critical -= hs.filter((i) => had(i, 'blocked_aging') || had(i, 'missing_update')).length;
  }
  health.exception_counts.overdue -= holds.filter((i) => had(i, 'overdue')).length;
  const idOf = Object.fromEntries(insights.project_status.map((p) => [p.project, p.identifier]));
  for (const p of insights.project_status) { const n = holds.filter((i) => i.project === p.project).length; p.open -= n; p.on_hold = n; }
  for (const p of insights.project_stats) {
    const hs = holds.filter((i) => idOf[i.project] === p.identifier);
    p.open -= hs.length; p.with_due -= hs.filter((i) => i.due).length; p.assigned -= hs.filter((i) => i.assignee).length;
    if (p.statuses['On Hold']) delete p.statuses['On Hold'];
    for (const i of hs) { const k = i.assignee || '(담당 없음)'; if (p.assignees[k]) { p.assignees[k] -= 1; if (!p.assignees[k]) delete p.assignees[k]; } }
  }
  const m = insights.metrics.all; m.open -= holds.length; m.with_due -= holds.filter((i) => i.due).length; m.assigned -= holds.filter((i) => i.assignee).length;
  insights.flow.open_items = insights.flow.open_items.filter((i) => i.status !== 'On Hold');
  const heldIds = new Set(holds.map((i) => i.id));
  for (const l of weekly.lines) {
    for (const b of BUCKETS) l[b] = l[b].filter((i) => !heldIds.has(i.id));
    l.decide = l.decide.filter((d) => !heldIds.has(d.id));
  }
  weekly.totals = Object.fromEntries([...BUCKETS, 'decide'].map((k) => [k, weekly.lines.reduce((n, l) => n + l[k].length, 0)]).concat([['decided', weekly.lines.reduce((n, l) => n + l.decide.filter((d) => d.decided_at).length, 0)]]));
}
function build({ drop = false, config, mutate, raw = false } = {}) {
  const env = { health: read('health.json'), insights: read('insights.json'), weekly: read('weekly.json') };
  const orig = new Map(env.health.items.map((i) => [i.id, i.flags.slice()]));
  const holds0 = env.health.items.filter((i) => i.status === 'On Hold');
  if (!raw) {                                  // raw = the OLD Hermes shape: holds still flagged and still counted in open
    for (const i of holds0) i.flags = ['blocked'];
    reshape(env, orig);
  }
  if (drop) { const ids = new Set(holds0.map((i) => i.id)); env.health.items = env.health.items.filter((i) => !ids.has(i.id)); }
  if (mutate) mutate(env);
  return env;
}
function mount(env, config) {
  const files = { 'data/health.json': env.health, 'data/insights.json': env.insights, 'data/ra.json': read('ra.json'), 'data/weekly.json': env.weekly };
  if (config) files['data/config/tracked-projects.json'] = config;
  const ctx = { console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    fetch: async (u) => ({ ok: files[u] != null, status: files[u] != null ? 200 : 404, json: async () => JSON.parse(JSON.stringify(files[u])) }),
    document: { getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] } };
  ctx.window = ctx; vm.createContext(ctx);
  ctx.window.DB = null;
  for (const f of ['ui.js', 'exec-core.js', 'views/home.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  ctx.window.App = { refresh() {}, go() {} };
  return ctx;
}
async function render(env, config) { const c = mount(env, config); c.Views.home({}); await new Promise((r) => setTimeout(r, 0)); return c.Views.home({}); }
// the part of the screen that holds the indicators: everything except the hold panel (cut by its own start and the next
// panel's start) and the one note in the basis line
const indicators = (html) => {
  const at = html.indexOf('보류 현황 — 지표에서 제외');
  const start = html.lastIndexOf('<div class="panel ">', at), end = html.indexOf('<div class="panel ">', at);
  assert.ok(at > 0 && start >= 0 && end > at, 'hold panel not found');
  return (html.slice(0, start) + html.slice(end)).replace(/<span class="muted" data-home-basis-hold>[^<]*<\/span>/, '').replace(/\s+/g, ' ');
};
const panel = (html) => (html.match(/data-home-hold-summary[\s\S]*?<\/table>/) || [''])[0];
const count = (html, re) => (html.match(re) || []).length;

test('the hold panel lists every On Hold item with number, subject, assignee and days, and no colour judgement', async () => {
  const env = build();
  const holds = env.health.items.filter((i) => i.status === 'On Hold');
  const html = await render(env);
  assert.ok(holds.length > 0, 'fixture must contain holds');
  assert.equal(count(html, /data-home-holdrow="/g), holds.length);
  assert.match(html, new RegExp(`data-home-hold-n>${holds.length}<`));
  for (const h of holds) {
    const row = html.match(new RegExp(`<tr data-home-holdrow="${h.id}">[\\s\\S]*?</tr>`))[0];
    assert.match(row, new RegExp(h.display_id.replace(/[-/]/g, '.')));
    assert.match(row, h.assignee ? new RegExp(h.assignee) : /담당자 없음/);
    const days = Math.round((new Date(env.health.today) - new Date(h.blocked_since.slice(0, 10))) / 86400000);
    assert.match(row, new RegExp(`${days}일`));
  }
  assert.doesNotMatch(panel(html), /🔴|🟡|🟢|⚪/);
});

test('holds change no indicator: the screen with holds equals the screen with every hold deleted from the data', async () => {
  const withHolds = await render(build());
  const without = await render(build({ drop: true }));
  assert.equal(indicators(withHolds), indicators(without));
  assert.notEqual(panel(withHolds), panel(without));                       // the panel itself is the only difference
});

test('Q2 counts decisions (overdue, no update after the due date, triage) and ignores holds', async () => {
  const env = build();
  const need = env.health.items.filter((i) => i.flags.some((f) => ['overdue', 'missing_update', 'triage_overdue'].includes(f)));
  const waited = (i) => Math.round((new Date(env.health.today) - new Date(i.flags.includes('triage_overdue') ? i.created : i.due)) / 86400000);
  const oldest = Math.max(0, ...need.map(waited));
  const html = await render(env);
  const q2 = html.match(/Q2 결정 지연<\/div>[\s\S]*?kpi-foot">([^<]*)</)[0];
  assert.match(q2, new RegExp(`${need.length}건`));
  assert.match(q2, new RegExp(`최장 ${oldest}일 지연`));
  assert.doesNotMatch(q2, /보류/);
});

test('a line with nothing but old holds is not red or amber because of them', async () => {
  const env = build();
  const lines = env.insights.product_lines.filter((l) => !l.regulatory);
  const heldProjects = new Set(env.health.items.filter((i) => i.status === 'On Hold').map((i) => i.project));
  const idOf = Object.fromEntries(env.insights.project_status.map((p) => [p.project, p.identifier]));
  const target = lines.find((l) => l.projects.some((id) => [...heldProjects].some((n) => idOf[n] === id)));
  assert.ok(target);
  const stat = (html) => (html.match(new RegExp(`data-exec-line="${target.name.replace(/[()/]/g, '.')}">[\\s\\S]*?</td>\\s*<td[^>]*>([^<]*)<`)) || [])[1];
  assert.equal(stat(await render(env)), stat(await render(build({ drop: true }))));
});

test('the hold panel follows 「주요 과제 선택」: an excluded project hides its holds and its count', async () => {
  const env = build();
  const holds = env.health.items.filter((i) => i.status === 'On Hold');
  const idOf = Object.fromEntries(env.insights.project_status.map((p) => [p.project, p.identifier]));
  const inLine = new Set(env.insights.product_lines.filter((l) => !l.regulatory).flatMap((l) => l.projects));
  const target = holds.map((h) => idOf[h.project]).find((id) => inLine.has(id));
  const gone = holds.filter((h) => idOf[h.project] === target);
  const html = await render(build(), { version: 1, excluded: [target] });
  assert.equal(count(html, /data-home-holdrow="/g), holds.length - gone.length);
  for (const g of gone) assert.doesNotMatch(html, new RegExp(`data-home-holdrow="${g.id}"`));
});

test('state changes: a hold that becomes In Progress returns to the indicators, one that is Won\'t Fix leaves everything', async () => {
  const base = build(), holds = base.health.items.filter((i) => i.status === 'On Hold');
  const resumed = holds[0], dropped = holds[1];
  const html = await render(build({ mutate: (e) => {
    const a = e.health.items.find((i) => i.id === resumed.id); a.status = 'In Progress'; a.flags = ['overdue']; a.due = '2026-09-01';
    e.health.items = e.health.items.filter((i) => i.id !== dropped.id);          // closed work is not in the exception list
  } }));
  assert.doesNotMatch(html, new RegExp(`data-home-holdrow="${resumed.id}"`));
  assert.doesNotMatch(html, new RegExp(`data-home-holdrow="${dropped.id}"`));
  assert.equal(count(html, /data-home-holdrow="/g), holds.length - 2);
  const q2 = html.match(/Q2 결정 지연<\/div>[\s\S]*?kpi-value">[^<]*?(\d+)건/)[1];
  const need = base.health.items.filter((i) => i.flags.some((f) => ['overdue', 'missing_update', 'triage_overdue'].includes(f))).length;
  assert.equal(+q2, need + 1);                                                    // the resumed item is a decision again
});

test('no holds at all: the panel says so and nothing else moves', async () => {
  const html = await render(build({ drop: true }));
  assert.match(html, /data-home-hold="empty"/);
  assert.doesNotMatch(html, /data-home-holdrow/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('an item still carrying the retired blocked_aging flag (old snapshot) does not break the screen or Q2', async () => {
  const html = await render(build({ mutate: (e) => { e.health.items.find((i) => i.status === 'On Hold').flags = ['blocked', 'blocked_aging']; } }));
  assert.doesNotMatch(html, /undefined|NaN/);
  assert.match(html, /data-home-hold-n>/);
});

test('the panel keys on the status On Hold, not on a flag: a Won\'t Fix item never appears', async () => {
  const base = build(), holds = base.health.items.filter((i) => i.status === 'On Hold');
  const html = await render(build({ mutate: (e) => { e.health.items.find((i) => i.id === holds[0].id).status = "Won't Fix"; } }));   // flag "blocked" stays
  assert.doesNotMatch(html, new RegExp(`data-home-holdrow="${holds[0].id}"`));
  assert.equal(count(html, /data-home-holdrow="/g), holds.length - 1);
});

// ---- audit follow-ups (#112) ----
const q2 = (html) => html.match(/Q2 결정 지연<\/div>\s*<div class="kpi-value">([^<]*)<\/div>\s*<div class="kpi-foot">([^<]*)</);
const clearNeed = (e) => { for (const i of e.health.items) i.flags = i.flags.filter((f) => !['overdue', 'missing_update', 'triage_overdue', 'unmanaged'].includes(f)); };
const daysAgo = (e, n) => new Date(new Date(e.health.today).getTime() - n * 86400000).toISOString().slice(0, 10);

test('Q2 colour: 🟢 without decisions, 🟡 when waiting up to 30 days, 🔴 beyond 30 days', async () => {
  const one = (n) => (e) => { clearNeed(e); const t = e.health.items.find((i) => i.status !== 'On Hold'); t.flags = ['overdue']; t.due = daysAgo(e, n); t.assignee = t.assignee || 'x'; };
  const none = q2(await render(build({ mutate: clearNeed })));
  assert.match(none[1], /🟢 0건/); assert.match(none[2], /최장 0일 지연/);
  const recent = q2(await render(build({ mutate: one(5) })));
  assert.match(recent[1], /🟡 1건/); assert.match(recent[2], /최장 5일 지연/);
  const old = q2(await render(build({ mutate: one(31) })));
  assert.match(old[1], /🔴 1건/); assert.match(old[2], /최장 31일 지연/);
  assert.match(q2(await render(build({ mutate: one(30) })))[1], /🟡 1건/);          // the boundary: 30 days is still amber
});

test('a hold without an assignee is not a decision without an owner, and shows 담당자 없음 in the panel', async () => {
  const base = build(), h = base.health.items.filter((i) => i.status === 'On Hold');
  const noOwnerOf = (html) => +q2(html)[2].match(/담당자 없는 결정 (\d+)건/)[1];
  const withOwner = noOwnerOf(await render(build({ mutate: (e) => { clearNeed(e); e.health.items.filter((i) => i.status === 'On Hold').forEach((i) => { i.assignee = '김명섭'; }); } })));
  const html = await render(build({ mutate: (e) => { clearNeed(e); e.health.items.filter((i) => i.status === 'On Hold').forEach((i) => { i.assignee = null; }); } }));
  assert.equal(noOwnerOf(html), withOwner);
  assert.equal(count(html, new RegExp(`data-home-holdrow="[0-9]+">(?:(?!</tr>)[\\s\\S])*담당자 없음`, 'g')), h.length);
});

test('a hold without blocked_since shows a dash, not 0 days', async () => {
  const base = build(), id = base.health.items.find((i) => i.status === 'On Hold').id;
  const html = await render(build({ mutate: (e) => { e.health.items.find((i) => i.id === id).blocked_since = null; } }));
  const row = html.match(new RegExp(`<tr data-home-holdrow="${id}">[\\s\\S]*?</tr>`))[0];
  assert.match(row, /<td class="num">–<\/td>/);
});

test('old-shaped data (dashboard deployed before Hermes): holds stay out of decisions and no false 「제외」 note appears', async () => {
  const env = build({ raw: true });
  const holds = env.health.items.filter((i) => i.status === 'On Hold');
  assert.ok(holds.some((i) => i.flags.includes('overdue') || i.flags.includes('blocked_aging')), 'raw fixture has judged holds');
  const html = await render(env);
  const need = env.health.items.filter((i) => i.status !== 'On Hold' && i.flags.some((f) => ['overdue', 'missing_update', 'triage_overdue'].includes(f))).length;
  assert.match(q2(html)[1], new RegExp(`${need}건`));
  assert.doesNotMatch(html, /data-home-basis-hold/);                           // the open counts still contain the holds: saying they are excluded would be false
  assert.equal(count(html, /data-home-holdrow="/g), holds.length);             // the panel itself works on either shape
});
