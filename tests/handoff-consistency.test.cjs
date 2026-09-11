const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../design_handoff_plm_dashboard');
function setup() {
  let now = '2026-09-11T05:00:00Z';
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return new Date(now).getTime(); } }
  const els = { app: { innerHTML: '' }, content: { innerHTML: '', scrollTop: 0 } };
  const events = {};
  const context = { console, Date: Clock, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} },
    document: { documentElement: { setAttribute() {}, style: { setProperty() {} } }, getElementById: id => els[id], querySelectorAll: () => [],
      addEventListener: (name, fn) => { events[name] = fn; }, createElement: () => ({classList:{contains:()=>false,remove(){},add(){}},style:{}}), body: { appendChild() {} } } };
  context.window = context;
  vm.createContext(context);
  for (const f of ['data.js','charts.js','ui.js', ...['overview','projects','resources','board','timeline','risks'].map(v=>`views/${v}.js`), 'app.js']) vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'), context, {filename:f});
  return { c: context, els, events, time: value => now = value };
}
function dataset(wps=[], projects=[{id:1,name:'Test',identifier:'test',health:null}]) {
  return {STATUSES:[{id:1,name:'Open',cat:'new',isClosed:false,color:'#888888'},{id:2,name:'Done',cat:'closed',isClosed:true,color:'#00aa00'}],
    TYPES:[{id:1,name:'Task',glyph:'•'},{id:2,name:'Milestone',glyph:'◇'}], PRIORITIES:[{id:1,name:'Normal',color:'#888888'}], ACTIVITIES:[],USERS:[],PROJECTS:projects,
    VERSIONS:[],RELATIONS:[],TIME_ENTRIES:[],WORK_PACKAGES:wps.map((w,i)=>({id:i+1,displayId:`TEST-${i+1}`,subject:'Task',projectId:1,typeId:1,statusId:1,priorityId:1,assigneeId:null,estimatedHours:0,spentHours:0,percentDone:0,startDate:null,dueDate:null,createdAt:'2026-09-01',updatedAt:'2026-09-01',...w}))};
}
test('missing health is neutral across views and never a healthy portfolio',()=>{
  const {c}=setup(); c.DB.reload(dataset());
  assert.equal(c.DB.PROJECTS[0].health,'unknown');
  assert.match(c.UI.healthChip(null),/미평가/);
  assert.equal(c.UI.healthColor(null),'var(--text-dim)');
  const html=c.Views.overview({}); assert.match(html,/미평가 1/); assert.doesNotMatch(html,/class="status-verdict"[^]*?<span class="v">정상/);
  assert.match(c.Views.projects({projectTab:1}),/미평가/);
});
test('real risk remains visible with unknown project health',()=>{
  const {c}=setup();c.DB.reload(dataset(Array.from({length:41},()=>({dueDate:'2026-01-01'}))));
  assert.match(c.Views.overview({}),/tone-red/);assert.match(c.Views.overview({}),/미평가 1/);
});
test('missing, partial and reversed dates never create duration bars',()=>{
  for(const wps of [[],[{}],[{startDate:'2026-09-01'}],[{dueDate:'2026-10-01'}],[{startDate:'2026-10-01',dueDate:'2026-09-01'}],[{startDate:'2026-02-30',dueDate:'2026-10-01'}]]) {
    const {c}=setup();c.DB.reload(dataset(wps));
    assert.notEqual(c.DB.PROJECTS[0].scheduleState,'complete');
    for(const state of [{},{tlProject:1}]) {
      const html=c.Views.timeline(state);assert.doesNotMatch(html,/class="gantt-bar"/);assert.doesNotMatch(html,/NaN|Invalid Date|undefined/);
    }
    assert.doesNotMatch(c.Views.projects({projectTab:1}),/NaN|Invalid Date|undefined/);
  }
});
test('missing project dates stay null; milestone-only projects retain markers',()=>{
  const {c}=setup();c.DB.reload(dataset());assert.equal(c.DB.PROJECTS[0].startDate,null);assert.equal(c.DB.PROJECTS[0].dueDate,null);
  c.DB.reload(dataset([{typeId:2,milestoneDate:'2027-12-15'}]));
  assert.equal(c.DB.PROJECTS[0].startDate,null);
  const html=c.Views.timeline({});assert.match(html,/data-timeline-milestone="1"/);assert.doesNotMatch(html,/class="gantt-bar"/);assert.match(html,/2027\.12/);
});
test('valid intervals and WP links work, while invalid ones are excluded from coverage',()=>{
  const {c}=setup();c.DB.reload(dataset([{id:99,displayId:'BH-1',startDate:'2026-09-01',dueDate:'2026-10-01'},{startDate:'2026-10-01',dueDate:'2026-09-01'}]));
  assert.equal(c.DB.PROJECTS[0].scheduleState,'complete');
  const html=c.Views.timeline({tlProject:1});assert.match(html,/class="gantt-bar"/);assert.match(html,/work_packages\/99" target="_blank"[^>]*>BH-1<\/a>/);assert.match(html,/50% scheduled/);
  c.DB.reload(dataset([{id:100,displayId:null,startDate:'2026-09-01',dueDate:'2026-09-01'}]));assert.match(c.Views.timeline({tlProject:1}),/>100<\/a>/);
});
test('date aggregation never joins two incomplete WPs into a planned interval',()=>{
  const {c}=setup();c.DB.reload(dataset([{startDate:'2026-09-01'},{dueDate:'2026-10-01'}]));
  assert.notEqual(c.DB.PROJECTS[0].scheduleState,'complete');assert.doesNotMatch(c.Views.timeline({}),/class="gantt-bar"/);
});
test('receipt time survives view/theme changes and failed refresh; advances on success',async()=>{
  const {c,els,events,time}=setup();assert.equal(c.DB.lastReceivedAt,null);assert.match(els.app.innerHTML,/수신 이력 없음/);
  c.DB.reload(dataset());const first=c.DB.lastReceivedAt;assert.ok(first);
  time('2026-09-12T06:30:00Z');c.App.set('theme','light');c.App.set('view','timeline');c.App.refresh();assert.equal(c.DB.lastReceivedAt,first);assert.match(els.app.innerHTML,/2026\.09\.11/);
  c.OPAdapter={USE_LIVE_API:true,buildLiveDataset:()=>Promise.reject(new Error('offline'))};
  events.click({target:{closest:s=>s==='[data-refresh]'?{}:null}});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.DB.lastReceivedAt,first);assert.match(els.app.innerHTML,/갱신 실패/);assert.doesNotMatch(els.app.innerHTML,/Live · 연동 완료/);assert.equal(c.DB.PROJECTS.length,1);
  c.OPAdapter.buildLiveDataset=()=>Promise.resolve(dataset());events.click({target:{closest:s=>s==='[data-refresh]'?{}:null}});await new Promise(resolve=>setImmediate(resolve));
  assert.notEqual(c.DB.lastReceivedAt,first);assert.match(els.app.innerHTML,/갱신 완료/);
});
test('malformed dataset cannot replace previously accepted data or receipt time',()=>{
  const {c}=setup();c.DB.reload(dataset());const first=c.DB.lastReceivedAt;const p=c.DB.PROJECTS[0];
  assert.throws(()=>c.DB.reload({...dataset(),USERS:null}));assert.equal(c.DB.lastReceivedAt,first);assert.equal(c.DB.PROJECTS[0],p);
});
test('all six views render missing data without undefined/NaN or exceptions',()=>{
  const {c}=setup();c.DB.reload(dataset([{}]));
  for(const v of ['overview','projects','resources','board','timeline','risks']) assert.doesNotMatch(c.Views[v]({projectTab:1}),/undefined|NaN|Invalid Date/,v);
});
test('undated or reversed versions do not break Projects burndown',()=>{
  for (const dates of [{},{startDate:'2026-10-01',dueDate:'2026-09-01'},{startDate:'2026-02-30',dueDate:'2026-10-01'}]) {
    const {c}=setup();const ds=dataset();ds.VERSIONS=[{id:1,projectId:1,name:'Sprint',status:'open',...dates}];c.DB.reload(ds);
    assert.doesNotMatch(c.Views.projects({projectTab:1}),/undefined|NaN|Invalid Date/);
    assert.equal(c.DB.burndown(c.DB.VERSIONS[0]).points.length,0);
  }
});
test('explicit health remains unchanged and no projects is not healthy',()=>{
  const {c}=setup();c.DB.reload(dataset([],[{id:1,name:'A',health:'at_risk'},{id:2,name:'B',health:'off_track'}]));
  assert.equal(c.DB.P[1].health,'at_risk');assert.equal(c.DB.P[2].health,'off_track');
  c.DB.reload(dataset([],[]));assert.match(c.Views.overview({}),/미평가/);
});
test('initial failure updates shell without inventing previous data',()=>{
  const {c,els}=setup();c.DB._loading=false;c.App.showError('offline');
  assert.match(els.app.innerHTML,/연동 오류/);assert.doesNotMatch(els.app.innerHTML,/Live · 연동 완료|이전 데이터/);
  assert.equal(c.DB.lastReceivedAt,null);
});
