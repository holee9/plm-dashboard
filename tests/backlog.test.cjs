// Backlog: a non-closed OP status that is a pure future to-do list. A Work Package in Backlog — even with an assignee and
// a past due date — must be in no dashboard count, list or column, and must not be counted as closed either.
// The live pipeline is exercised end to end: op-adapter.buildLiveDataset() (fake OP API) → data.js reload() → window.DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');

const link = (kind, id, title) => ({ href: `/api/v3/${kind}/${id}`, title });
const STATUSES = [
  { id: 1, name: 'Open', isClosed: false }, { id: 7, name: 'In Progress', isClosed: false },
  { id: 13, name: 'On Hold', isClosed: false }, { id: 15, name: 'Ticketed', isClosed: false },
  { id: 20, name: 'Backlog', isClosed: false }, { id: 12, name: 'Done', isClosed: true },
];
const wp = (id, statusId, extra = {}) => Object.assign({
  id, displayId: `T-${id}`, subject: `일감 ${id}`, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  startDate: '2026-09-01', dueDate: '2026-09-10', percentageDone: 0,
  _links: { project: link('projects', 1), type: link('types', 1), status: link('statuses', statusId), assignee: link('users', 5, 'mskim'),
            priority: link('priorities', 1), author: link('users', 5) },
}, extra);

async function boot(wps) {
  const api = {
    '/op/statuses': STATUSES, '/op/types': [{ id: 1, name: 'Task' }], '/op/priorities': [{ id: 1, name: 'Normal' }],
    '/op/time_entries/activities': [], '/op/principals': [{ id: 5, name: 'mskim', _type: 'User' }],
    '/op/projects': [{ id: 1, name: 'BLUE', identifier: 'BLU', active: true }], '/op/versions': [], '/op/memberships': [],
    '/op/relations': [], '/op/work_packages': wps, '/op/time_entries': [],
  };
  const context = { console: { info() {}, warn() {}, error: console.error, log() {} }, URL, Date, Math, JSON, setTimeout,
    location: { origin: 'http://x' },
    fetch: async (url) => {
      const p = new URL(url).pathname;
      const els = p.endsWith('/activities') && p.startsWith('/op/work_packages/') ? [] : api[p];
      return { ok: !!els, status: els ? 200 : 404, statusText: '', json: async () => ({ _embedded: { elements: els || [] }, total: (els || []).length }) };
    } };
  context.window = context;
  vm.createContext(context);
  for (const f of ['op-adapter.js', 'data.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  for (let i = 0; i < 50 && context.window.DB._loading; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(context.window.DB._error, null);
  return context.window.DB;
}

const BASE = [wp(1, 1), wp(2, 7, { dueDate: '2099-01-01' }), wp(3, 13), wp(4, 15), wp(5, 12)];
const BACKLOG = [wp(10, 20), wp(11, 20, { dueDate: '2026-09-30' }), wp(12, 20, { _links: { project: link('projects', 1), type: link('types', 1), status: link('statuses', 20) } })];

test('Backlog status gets its own category, never "new", and no board column', async () => {
  const D = await boot(BASE.concat(BACKLOG));
  const s = D.STATUSES.find((x) => x.name === 'Backlog');
  assert.equal(s.cat, 'backlog');
  assert.equal(D.STATUSES.find((x) => x.name === 'Ticketed').cat, 'new');          // Ticketed unchanged
  assert.equal(D.STATUSES.find((x) => x.name === 'On Hold').cat, 'onHold');        // On Hold unchanged
  assert.ok(!D.BOARD_COLS.some((c) => c.statusIds.includes(s.id)));
});

test('a Backlog work package with assignee and past due date is in no count, open or closed', async () => {
  const D = await boot(BASE.concat(BACKLOG));
  const ids = D.WORK_PACKAGES.map((w) => w.id);
  for (const b of BACKLOG) assert.ok(!ids.includes(b.id), `WP ${b.id} must not reach any view`);
  const k = D.kpis(D.WORK_PACKAGES);
  assert.deepEqual([k.total, k.open, k.closed, k.overdue], [5, 4, 1, 3]);           // 1,3,4 overdue (open lifecycle); Backlog adds nothing
  const st = D.statusDistribution(D.WORK_PACKAGES).find((x) => x.status.name === 'Backlog');
  assert.equal(st.count, 0);
  const mine = D.WORK_PACKAGES.filter((w) => w.assigneeId === 5);                    // the per-person inputs (userUtilization, people)
  assert.deepEqual([mine.length, mine.filter(D.isOpen).length, mine.filter(D.isOpenWork).length], [5, 4, 4]);   // On Hold stays in isOpenWork (unchanged)
});

test('isOpen / isOpenWork reject a Backlog work package even if one reaches the data layer', async () => {
  const D = await boot(BASE);
  const st = D.STATUSES.find((x) => x.name === 'Backlog');
  const w = { id: 99, statusId: st.id, typeId: 1, subject: 'x', _due: new Date('2026-09-01T00:00:00'), dueDate: '2026-09-01' };
  assert.equal(D.isOpen(w), false);
  assert.equal(D.isOpenWork(w), false);
  assert.equal(D.isOverdue(w), false);
  assert.equal(D.isBacklog(w), true);
  assert.equal(D.isBacklog(D.WORK_PACKAGES[0]), false);
});

test('no Backlog item: the dataset is identical with or without the Backlog status defined', async () => {
  const a = await boot(BASE);
  const strip = (D) => JSON.stringify({ wp: D.WORK_PACKAGES.map((w) => [w.id, w.statusId]), k: D.kpis(D.WORK_PACKAGES), b: D.BOARD_COLS });
  const b = await boot(BASE.concat(BACKLOG));
  assert.equal(strip(a), strip(b));
});
