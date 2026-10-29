// 개발·인허가 현황 (executive-app.js): the screen served since 2026-10-27 replaced the home/exec-core/views UI.
// These tests pin its contract: what the page loads, that it never writes, and how it renders or fails closed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');
const fixtures = path.join(__dirname, 'fixtures/home');
// data/*.json is written by Hermes at runtime and git-ignored; tests use the snapshot taken 2026-10-07.
const read = (f) => JSON.parse(fs.readFileSync(path.join(fixtures, f), 'utf8'));
const appSource = fs.readFileSync(path.join(root, 'executive-app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'PLM Dashboard.html'), 'utf8');

// A callable stand-in for any DOM node: remembers what the app writes, answers every other property with itself.
function node(selector) {
  const store = { innerHTML: '', textContent: '', hidden: false, dataset: {}, style: {},
    value: selector === '#search' ? '' : selector === '#range' ? '9' : 'all' };
  const self = new Proxy(function () {}, {
    get(_, key) {
      if (key in store) return store[key];
      if (key === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (key === 'querySelectorAll') return () => [];
      if (key === 'closest') return () => null;
      if (key === Symbol.toPrimitive) return () => '';
      return self;
    },
    set(_, key, value) { store[key] = value; return true; },
    apply() { return self; },
  });
  return self;
}

// Runs executive-app.js against the given data files; a missing key answers 404 like the real server.
async function run(files) {
  const nodes = new Map();
  const $ = (selector) => { if (!nodes.has(selector)) nodes.set(selector, node(selector)); return nodes.get(selector); };
  const calls = [];
  const context = { console, Date, Intl, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    requestAnimationFrame: (fn) => setTimeout(fn, 0), localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async (url, options = {}) => {
      const key = String(url).replace(/^\//, '').split('?')[0];
      calls.push({ key, method: options.method || 'GET' });
      const ok = key in files;
      return { ok, status: ok ? 200 : 404, json: async () => JSON.parse(JSON.stringify(files[key])) };
    },
    document: { querySelector: $, getElementById: $, querySelectorAll: () => [], createElement: () => node('x'),
      addEventListener() {}, body: node('body'), documentElement: node('html') },
    addEventListener() {}, location: { hash: '#dev' }, history: { replaceState() {} }, navigator: {},
    matchMedia: () => ({ matches: false, addEventListener() {} }), AbortController, URL, URLSearchParams };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(appSource, context, { filename: 'executive-app.js' });
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { content: String(nodes.get('#content') ? nodes.get('#content').innerHTML : ''), calls };
}

const dataFiles = (overrides = {}) => ({
  'data/health.json': read('health.json'), 'data/insights.json': read('insights.json'),
  'data/weekly.json': read('weekly.json'), 'data/ra.json': read('ra.json'),
  'data/config/tracked-projects.json': { version: 1, excluded: [], updated_at: '2026-10-15T10:03:51.445Z' },
  ...overrides,
});
const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the page loads only style.css and executive-app.js, both present, and has exactly two menus', () => {
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  const styles = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scripts.length <= 1, `scripts: ${scripts}`);
  for (const f of [...scripts, ...styles].map((s) => s.split('?')[0])) assert.ok(fs.existsSync(path.join(root, f)), `${f} missing`);
  const menus = [...html.matchAll(/<a href="#(\w+)" data-view="(\w+)"/g)].map((m) => m[2]);
  assert.deepEqual(menus, ['dev', 'ra']);
  assert.doesNotThrow(() => new vm.Script(appSource, { filename: 'executive-app.js' }));
});

test('the app is read-only: it only issues GET requests and never uses a write method', async () => {
  assert.doesNotMatch(appSource, /method\s*:\s*['"](PUT|POST|PATCH|DELETE)/i);
  const { calls } = await run(dataFiles());
  assert.ok(calls.length >= 5);
  assert.ok(calls.every((c) => c.method === 'GET'), JSON.stringify(calls));
  assert.ok(calls.every((c) => c.key.startsWith('data/') || c.key.startsWith('runtime/')), JSON.stringify(calls));
});

test('renders the snapshot without undefined/NaN and shows the exception counts and the hold exclusion note', async () => {
  const { content } = await run(dataFiles());
  const text = plain(content);
  assert.ok(content.length > 10000, `content only ${content.length} chars`);
  assert.doesNotMatch(content, /undefined|NaN|\[object/);
  assert.match(text, /일정·정보 확인 목록 \d+건/);
  assert.match(text, /보류 \d+건 제외/);
  assert.match(text, /사업 위험·실제 원인·결정 판단이 아닙니다/);
});

test('fails closed when the selection config is missing: no list is drawn from unfiltered data', async () => {
  const files = dataFiles();
  delete files['data/config/tracked-projects.json'];
  const { content } = await run(files);
  assert.match(plain(content), /관심 과제 설정을 읽지 못했습니다/);
  assert.doesNotMatch(plain(content), /일정·정보 확인 목록/);
});

test('shows a plain error instead of inventing data when the required snapshots are missing', async () => {
  const files = dataFiles();
  delete files['data/health.json'];
  const { content } = await run(files);
  assert.match(plain(content), /데이터를 불러오지 못했습니다/);
  assert.doesNotMatch(content, /일정·정보 확인 목록/);
});
