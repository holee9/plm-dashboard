const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');

const RA = {
  generated: '2026-10-06T03:00:00Z', today: '2026-10-06', window_days: 180, requests_total: 0, open: 0, done_180: 0, canceled_180: 0,
  processing_days: {}, desired_date_rate: { met: 0, of: 0, ratio: null }, review_delay: 0, over_desired: 0, open_requests: [],
  registry_connected: true, new_acquisitions: 0, missed_renewals: 0,
  registry: {
    commit: 'abcdef1234', synced_at: '2026-10-06T03:00:00Z', branch: 'main', columns: ['한국', '미국'], families: ['BLUE (G series)'],
    matrix: [{ family: 'BLUE (G series)', country: '한국', state: 'partial' }, { family: 'BLUE (G series)', country: '미국', state: 'full' }],
    family_models: { 'BLUE (G series)': [
      { model: 'G1417CW', cells: { '한국': { state: '유효', types: ['MFDS 신고'], expiry: '2027-03-14' }, '미국': { state: '유효', types: ['FDA 510(k)'], expiry: '' } } },
      { model: 'G1717CW', cells: { '미국': { state: '유효', types: ['FDA 510(k)'], expiry: '' } } },
    ] },
    obligations: [{ reg_id: 'REG-0031', scope: 'company', family: '', models: [], country: '미국', type: 'US 대리인', kind: '만료', date: '2026-11-24', overdue: false, state: '유효' }],
    models: {}, counts: { rows: 2, company_rows: 2, pending: 0 }, excluded_rows: 0,
    company: [
      { reg_id: 'REG-0030', country: '미국', type: 'FDA 제조소 등록', state: '유효', expiry: '', next_duty: '연간 시설등록 갱신(10/1~12/31)', next_date: '2026-12-31' },
      { reg_id: 'REG-0031', country: '미국', type: 'US 대리인', state: '유효', expiry: '2026-11-24', next_duty: '', next_date: '' },
    ],
  },
};

function setup(ra = RA) {
  const handlers = {};
  const context = { console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: true, json: async () => JSON.parse(JSON.stringify(ra)) }),
    document: { getElementById: () => null, addEventListener: (n, fn) => { (handlers[n] = handlers[n] || []).push(fn); }, querySelectorAll: () => [] } };
  context.window = context;
  vm.createContext(context);
  for (const f of ['ui.js', 'ra-panels.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f });
  let refreshed = 0;
  context.window.App = { refresh() { refreshed += 1; } };
  context.window.Views = { ra: () => context.RAPanels.detail(JSON.parse(JSON.stringify(ra))) };   // #98: panels only, no screen
  const click = (selector, attrs) => handlers.click.forEach((fn) => fn({ target: { closest: (sel) => (sel === selector ? { getAttribute: (k) => attrs[k] } : null) } }));
  return { c: context, click, refreshed: () => refreshed };
}
async function render(env) { return env.c.Views.ra({}); }
const region = (html, from, to) => { const i = html.indexOf(from); assert.ok(i >= 0, `${from} missing`); return html.slice(i, html.indexOf(to, i + 1)); };

test('product and company licences are separate panels and the product matrix has no company row', async () => {
  const html = await render(setup());
  assert.match(html, /제품 인허가/);
  assert.match(html, /회사 허가·인증/);
  assert.doesNotMatch(region(html, 'data-ra-matrix', '회사 허가·인증'), /공통/);
  assert.match(html, /◐/);
  assert.match(html, /등록부에 있는 모델 중 일부만 유효/);      // ◐ is about the models in the registry, not a full product line-up the registry does not hold
});

test('families and countries start collapsed and expand to models / licences on click', async () => {
  const env = setup();
  let html = await render(env);
  assert.doesNotMatch(html, /data-ra-modelrow/);
  assert.doesNotMatch(html, /data-ra-comp=/);
  const before = env.refreshed();
  env.click('[data-ra-fam]', { 'data-ra-fam': 'BLUE (G series)' });
  env.click('[data-ra-country]', { 'data-ra-country': '미국' });
  assert.equal(env.refreshed(), before + 2);
  html = env.c.Views.ra({});
  const models = [...html.matchAll(/data-ra-modelrow="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(models, ['BLUE (G series)|G1417CW', 'BLUE (G series)|G1717CW']);
  assert.match(region(html, 'BLUE (G series)|G1717CW', '</tr>'), /등록 없음/);        // the model without a 한국 row says so: the cause of the ◐
  const comps = [...html.matchAll(/data-ra-comp="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(comps, ['REG-0030', 'REG-0031']);
  env.click('[data-ra-fam]', { 'data-ra-fam': 'BLUE (G series)' });
  assert.doesNotMatch(env.c.Views.ra({}), /data-ra-modelrow/);
});

test('expand-all and collapse-all buttons act on every family and country', async () => {
  const env = setup();
  await render(env);
  env.click('[data-ra-all]', { 'data-ra-all': 'fam:open' });
  env.click('[data-ra-all]', { 'data-ra-all': 'country:open' });
  const html = env.c.Views.ra({});
  assert.equal((html.match(/data-ra-modelrow/g) || []).length, 2);
  assert.equal((html.match(/data-ra-comp=/g) || []).length, 2);
  env.click('[data-ra-all]', { 'data-ra-all': 'fam:close' });
  env.click('[data-ra-all]', { 'data-ra-all': 'country:close' });
  const closed = env.c.Views.ra({});
  assert.doesNotMatch(closed, /data-ra-modelrow/);
  assert.doesNotMatch(closed, /data-ra-comp=/);
});

test('obligations label company rows and show the licence type; no sensitive column names appear', async () => {
  const html = await render(setup());
  const ob = region(html, 'data-ra-obligations', '요청 —');
  assert.match(ob, /<td>회사<\/td>/);
  assert.match(ob, /US 대리인/);
  for (const bad of ['인증번호', '인증서 파일', '보유자']) assert.doesNotMatch(html, new RegExp(bad));
});

test('before the registry is connected both panels say 연결 전', async () => {
  const html = await render(setup({ ...RA, registry_connected: false, registry: undefined }));
  assert.match(html, /제품 인허가/);
  assert.match(html, /회사 허가·인증/);
  assert.equal((html.match(/연결 전/g) || []).length >= 3, true);
});

test('the whole family or country row opens it, and the arrow is a large, labelled target', async () => {
  const env = setup();
  const html = await render(env);
  assert.match(html, /aria-label="펼치기"/);
  assert.match(html, /width:32px;height:32px/);
  env.click('[data-ra-famrow]', { 'data-ra-famrow': 'BLUE (G series)' });
  env.click('[data-ra-ctryrow]', { 'data-ra-ctryrow': '미국' });
  const open = env.c.Views.ra({});
  assert.equal((open.match(/data-ra-modelrow/g) || []).length, 2);
  assert.equal((open.match(/data-ra-comp=/g) || []).length, 2);
  assert.match(open, /aria-label="접기"/);
});

test('the request panel describes the whole RA project work and the header carries no admin-only wording', async () => {
  const html = await render(setup());
  assert.match(html, /OP RA 프로젝트의 인허가 업무/);
  assert.doesNotMatch(html, /관리자용/);
  assert.doesNotMatch(html, /폼으로 접수된/);
});

test('no screen carries the admin-only wording', () => {
  const files = ['app.js', 'exec-core.js', 'ra-panels.js', 'views/home.js'];
  for (const f of files) assert.doesNotMatch(fs.readFileSync(path.join(root, f), 'utf8'), /관리자용/, f);
});

test('models that carry a series are grouped under series header rows; models without a series list directly', async () => {
  const ra = JSON.parse(JSON.stringify(RA));
  ra.registry.family_models['BLUE (G series)'][0].series = 'BLUE';
  ra.registry.family_models['BLUE (G series)'][1].series = 'BLUE';
  ra.registry.family_models['BLUE (G series)'].push({ model: 'GT1717C', series: 'CYAN', cells: { '한국': { state: '유효', types: ['MFDS 신고'], expiry: '' } } });
  const env = setup(ra); let html = await render(env);
  assert.doesNotMatch(html, /data-ra-seriesrow/);
  env.click('[data-ra-famrow]', { 'data-ra-famrow': 'BLUE (G series)' }); html = env.c.Views.ra({});
  const series = [...html.matchAll(/data-ra-seriesrow="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(series, ['BLUE (G series)|BLUE', 'BLUE (G series)|CYAN']);
  assert.equal((html.match(/data-ra-modelrow/g) || []).length, 3);
  assert.ok(html.indexOf('data-ra-seriesrow="BLUE (G series)|BLUE"') < html.indexOf('data-ra-modelrow="BLUE (G series)|G1417CW"'));
  const plain = setup(); await render(plain); plain.click('[data-ra-famrow]', { 'data-ra-famrow': 'BLUE (G series)' });
  assert.doesNotMatch(plain.c.Views.ra({}), /data-ra-seriesrow/);
});
