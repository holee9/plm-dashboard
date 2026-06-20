/* =============================================================================
   PLM Dashboard — app controller (state, nav, theme, render dispatch)
   ========================================================================== */
(function () {
  'use strict';
  const D = window.DB;

  /* ---------- icons ---------- */
  const IC = {
    overview: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 14h7v7H3z"/>',
    projects: '<path d="M3 7h18M3 12h18M3 17h18"/><circle cx="6" cy="7" r="0"/>',
    resources: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-1a6 6 0 0 1 12 0v1M16 11a3 3 0 1 0 0-6M22 21v-1a6 6 0 0 0-4-5.6"/>',
    board: '<rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/>',
    timeline: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    risks: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M8 2v4M16 2v4"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

  const VIEWS = [
    { key: 'overview',  en: 'Overview',  ko: '전체 현황',  ic: IC.overview,  section: 'MONITOR' },
    { key: 'projects',  en: 'Projects',  ko: '과제별',      ic: IC.projects,  section: 'MONITOR' },
    { key: 'resources', en: 'Resources', ko: '리소스',      ic: IC.resources, section: 'MONITOR' },
    { key: 'board',     en: 'Board',     ko: 'WP 보드',     ic: IC.board,     section: 'WORK' },
    { key: 'timeline',  en: 'Timeline',  ko: '일정',        ic: IC.timeline,  section: 'WORK' },
    { key: 'risks',     en: 'Risks',     ko: '리스크',      ic: IC.risks,     section: 'WORK' },
  ];
  const SUBTITLE = {
    overview: '전체 과제·인원·리스크 종합 현황',
    projects: '과제별 진행률 · 번다운 · 팀 · WP',
    resources: '입력 신뢰도 · 일정 압박 · 보조 가동률',
    board: '상태별 칸반 보드 · 필터링',
    timeline: '간트 차트 · 마일스톤 · 일정 점검',
    risks: '마감 초과 · 임박 · 과부하 · 공수 초과',
  };

  /* ---------- accent presets ---------- */
  const ACCENTS = {
    blue:   { hex: '#3B82F6', rgb: '59,130,246' },
    violet: { hex: '#8B5CF6', rgb: '139,92,246' },
    teal:   { hex: '#14B8A6', rgb: '20,184,166' },
    amber:  { hex: '#F59E0B', rgb: '245,158,11' },
    rose:   { hex: '#EC4899', rgb: '236,72,153' },
  };

  /* ---------- state ---------- */
  const DEFAULTS = { view: 'overview', theme: 'dark', density: 'cozy', style: 'telemetry',
    accent: 'blue', collapsed: false, projectTab: 1, boardProject: 'all', boardUser: 'all',
    resSort: 'pressure', tlProject: 'all', hiddenProjects: [], hiddenProjectsSeeded: false,
    projOrder: [], projPmOverrides: {}, projTlOverrides: {}, kpiSections: null, projEditMode: false, kpiEditMode: false,
    projKpiSections: null, projKpiEditMode: false,
    resKpiSections: null,  resKpiEditMode: false,
    riskKpiSections: null, riskKpiEditMode: false,
    boardHiddenCols: [], boardColEditMode: false, boardColOrder: [] };
  let state = Object.assign({}, DEFAULTS);
  /* Transient snapshot for cancel — NOT persisted to localStorage */
  const _editSnapshot = {};
  let refreshStatus = 'idle';
  let refreshMessage = '새로고침';
  if (window.TWEAK_DEFAULTS) Object.assign(state, window.TWEAK_DEFAULTS);
  try { Object.assign(state, JSON.parse(localStorage.getItem('plm_state') || '{}')); } catch (e) {}
  // Migrate: projPmOverrides/projTlOverrides were single numbers; now arrays
  ['projPmOverrides', 'projTlOverrides'].forEach((key) => {
    const map = state[key] || {};
    Object.keys(map).forEach((pid) => {
      if (typeof map[pid] === 'number') map[pid] = [map[pid]];
    });
  });
  const save = () => { try { localStorage.setItem('plm_state', JSON.stringify(state)); } catch (e) {} };
  // Expose save() so views can persist state mutations (e.g. auto-seed hiddenProjects).
  window.App = window.App || {};
  window.App.save = save;

  /* ---------- chrome (theme/density/style/accent) ---------- */
  function applyChrome() {
    const r = document.documentElement;
    r.setAttribute('data-theme', state.theme);
    r.setAttribute('data-density', state.density);
    r.setAttribute('data-style', state.style);
    const a = ACCENTS[state.accent] || ACCENTS.blue;
    r.style.setProperty('--accent', a.hex);
    r.style.setProperty('--accent-rgb', a.rgb);
  }

  /* ---------- shell ---------- */
  function renderShell() {
    const overdueTotal = D.WORK_PACKAGES.filter(D.isOverdue).length;
    let nav = '', lastSection = '';
    VIEWS.forEach((v) => {
      if (v.section !== lastSection) { nav += `<div class="nav-section-label">${v.section}</div>`; lastSection = v.section; }
      const badge = v.key === 'risks' ? `<span class="nav-badge alert">${overdueTotal}</span>`
        : v.key === 'overview' ? `<span class="nav-badge">${D.WORK_PACKAGES.length}</span>` : '';
      nav += `<div class="nav-item ${state.view === v.key ? 'active' : ''}" data-view="${v.key}">
        ${svg(v.ic)}<span class="nav-label">${v.en}</span>${badge}</div>`;
    });

    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    const cur = VIEWS.find((v) => v.key === state.view);
    const refreshTone = refreshStatus === 'loading' ? ' data-refresh-loading="true"'
      : refreshStatus === 'error' ? ' data-refresh-error="true"' : '';
    const refreshBusy = refreshStatus === 'loading' ? ' disabled aria-busy="true"' : '';

    document.getElementById('app').innerHTML = `
      <aside class="sidebar ${state.collapsed ? 'collapsed' : ''}">
        <div class="brand">
          <div class="brand-mark">P</div>
          <div class="brand-text"><b>PLM Monitor</b><span>abyz-lab.work</span></div>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot">
          <span class="live-dot ${D._loading ? 'loading' : (D._error ? 'error' : '')}"></span>
          <div class="side-foot-text"><b>${D._loading ? '연동 중…' : D._error ? '연동 오류' : 'Live · 연동 완료'}</b>OpenProject v3</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="tb-icon" data-toggle-sidebar>${svg(IC.menu)}</button>
          <div class="view-title"><b>${cur.en} · ${cur.ko}</b><span>${SUBTITLE[state.view]}</span></div>
          <div class="topbar-spacer"></div>
          <button class="tb-chip" data-noop>${svg(IC.cal)}<span>Last 90d</span></button>
          <button class="tb-chip" data-noop data-tip="마지막으로 OpenProject 데이터를 성공적으로 수신한 시각입니다. 클릭 기능 없음 — 새로고침은 오른쪽 버튼을 사용하세요."><span class="live-dot"></span>업데이트 <b>${hh}:${mm}</b></button>
          <button class="tb-chip" data-refresh${refreshTone}${refreshBusy} data-tip="OpenProject에서 전체 데이터를 다시 조회합니다. 완료 후 모든 뷰가 최신 상태로 갱신됩니다.">${svg(IC.refresh)}<span>${refreshMessage}</span></button>
          <button class="tb-icon" data-theme-toggle>${svg(state.theme === 'dark' ? IC.sun : IC.moon)}</button>
        </header>
        <div class="content" id="content"></div>
      </div>`;
    renderContent();
  }

  function renderContent() {
    document.querySelectorAll('body > .ms-panel').forEach(function(p) { p.remove(); });
    const el = document.getElementById('content');
    el.scrollTop = 0;
    if (D._loading && !D.WORK_PACKAGES.length) {
      el.innerHTML = '<div class="empty">OpenProject 데이터 로딩 중…</div>';
      return;
    }
    if (D._error) {
      el.innerHTML = `<div class="empty" style="color:var(--c-red)">연동 오류: ${escapeHtml(D._error)}</div>`;
      return;
    }
    const fn = window.Views[state.view];
    try {
      el.innerHTML = fn ? fn(state) : '<div class="empty">view not found</div>';
    } catch (err) {
      console.error('[PLM] renderContent error:', err);
      el.innerHTML = `<div class="empty">렌더링 오류: ${escapeHtml(err.message || err)}</div>`;
    }
  }

  /* ---------- navigation ---------- */
  function go(view) { state.view = view; save(); renderShell(); }

  /* ---------- ms-panel helpers ---------- */
  // Portal: move panel to <body> so position:fixed is relative to viewport,
  // not to any transformed ancestor (CSS spec: transform creates fixed containing block).
  function _openMsPanel(trigger, panel) {
    document.querySelectorAll('.ms-panel.open').forEach((el) => el.classList.remove('open'));
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    const rect = trigger.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 4) + 'px';
    panel.style.left = rect.left + 'px';
    panel.classList.add('open');
  }
  function _reopenMsPanel(panelId) {
    const triggerKey = panelId.replace(/^ms-/, '');
    const trigger = document.querySelector(`[data-ms-trigger="${triggerKey}"]`);
    const panel   = document.getElementById(panelId);
    if (!trigger || !panel) return;
    _openMsPanel(trigger, panel);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const navItem = t.closest('[data-view]');
    if (navItem) { go(navItem.dataset.view); return; }
    if (t.closest('[data-nav]')) { go(t.closest('[data-nav]').dataset.nav); return; }
    const tlScopeRow = t.closest('[data-tl-scope-project]');
    if (tlScopeRow) { state.tlProject = tlScopeRow.dataset.tlScopeProject; state.view = 'timeline'; save(); renderShell(); return; }
    const npRow = t.closest('[data-nav-project]');
    if (npRow) { state.projectTab = +npRow.dataset.navProject; state.view = 'projects'; save(); renderShell(); return; }
    const hideProj = t.closest('[data-hide-project]');
    if (hideProj) {
      const id = +hideProj.dataset.hideProject;
      const hp = new Set(state.hiddenProjects || []);
      hp.add(id);
      state.hiddenProjects = [...hp];
      if (state.projectTab === id) {
        const vis = (window.DB ? window.DB.PROJECTS : []).filter((p) => !hp.has(p.id));
        state.projectTab = vis.length ? vis[0].id : null;
      }
      save(); renderContent(); return;
    }
    const showProj = t.closest('[data-show-project]');
    if (showProj) {
      const id = +showProj.dataset.showProject;
      state.hiddenProjects = (state.hiddenProjects || []).filter((x) => x !== id);
      save(); renderContent(); return;
    }
    const ptab = t.closest('[data-project-tab]');
    if (ptab) { state.projectTab = +ptab.dataset.projectTab; save(); renderContent(); return; }
    const rsort = t.closest('[data-res-sort]');
    if (rsort) { state.resSort = rsort.dataset.resSort; save(); renderContent(); return; }
    if (t.closest('[data-cancel-proj-edit]')) {
      if (_editSnapshot.proj) {
        state.hiddenProjects = _editSnapshot.proj.hiddenProjects;
        state.projOrder      = _editSnapshot.proj.projOrder;
        delete _editSnapshot.proj;
      }
      state.projEditMode = false; save(); renderContent(); return;
    }
    if (t.closest('[data-toggle-proj-edit]')) {
      if (!state.projEditMode) {
        _editSnapshot.proj = { hiddenProjects: [...(state.hiddenProjects || [])], projOrder: [...(state.projOrder || [])] };
      } else { delete _editSnapshot.proj; }
      state.projEditMode = !state.projEditMode; save(); renderContent(); return;
    }
    if (t.closest('[data-cancel-kpi-edit]')) {
      const ns = t.closest('[data-cancel-kpi-edit]').closest('[data-kpi-ns]')?.dataset.kpiNs || '';
      const modeKey = ns ? ns + 'KpiEditMode' : 'kpiEditMode';
      const sectKey = ns ? ns + 'KpiSections' : 'kpiSections';
      if (_editSnapshot[modeKey] !== undefined) { state[sectKey] = _editSnapshot[modeKey]; delete _editSnapshot[modeKey]; }
      state[modeKey] = false; save(); renderContent(); return;
    }
    if (t.closest('[data-toggle-kpi-edit]')) {
      const ns = t.closest('[data-toggle-kpi-edit]').closest('[data-kpi-ns]')?.dataset.kpiNs || '';
      const modeKey = ns ? ns + 'KpiEditMode' : 'kpiEditMode';
      const sectKey = ns ? ns + 'KpiSections' : 'kpiSections';
      if (!state[modeKey]) { _editSnapshot[modeKey] = state[sectKey] ? [...state[sectKey]] : null; }
      else { delete _editSnapshot[modeKey]; }
      state[modeKey] = !state[modeKey];
      save(); renderContent(); return;
    }
    const kpiToggle = t.closest('[data-kpi-toggle]');
    if (kpiToggle) {
      const ns = kpiToggle.closest('[data-kpi-ns]')?.dataset.kpiNs || '';
      const rawDef = kpiToggle.closest('[data-kpi-ns]')?.dataset.kpiDefaults;
      const DEF = rawDef ? JSON.parse(rawDef) : ['total', 'open', 'spent', 'closeRate', 'dueWeek'];
      const sectKey = ns ? ns + 'KpiSections' : 'kpiSections';
      const key = kpiToggle.dataset.kpiToggle;
      const sects = [...(state[sectKey] || DEF)];
      const idx = sects.indexOf(key);
      if (idx >= 0 && sects.length > 1) { sects.splice(idx, 1); }
      else if (idx < 0) { sects.push(key); }
      state[sectKey] = sects;
      save(); renderContent(); return;
    }
    if (t.closest('[data-cancel-board-col-edit]')) {
      if (_editSnapshot.boardCol) {
        state.boardHiddenCols = _editSnapshot.boardCol.hiddenCols;
        state.boardColOrder   = _editSnapshot.boardCol.colOrder;
        delete _editSnapshot.boardCol;
      }
      state.boardColEditMode = false; save(); renderContent(); return;
    }
    if (t.closest('[data-toggle-board-col-edit]')) {
      if (!state.boardColEditMode) {
        _editSnapshot.boardCol = { hiddenCols: [...(state.boardHiddenCols || [])], colOrder: [...(state.boardColOrder || [])] };
      } else { delete _editSnapshot.boardCol; }
      state.boardColEditMode = !state.boardColEditMode; save(); renderContent(); return;
    }
    const boardColToggle = t.closest('[data-board-col-toggle]');
    if (boardColToggle) {
      const col = boardColToggle.dataset.boardColToggle;
      const hidden = [...(state.boardHiddenCols || [])];
      const idx = hidden.indexOf(col);
      if (idx >= 0) { hidden.splice(idx, 1); } else { hidden.push(col); }
      state.boardHiddenCols = hidden;
      save(); renderContent(); return;
    }
    // Multi-select PM/TL trigger: toggle panel via portal (body) to escape transform context
    const msTrigger = t.closest('[data-ms-trigger]');
    if (msTrigger) {
      const key = msTrigger.dataset.msTrigger;
      const panel = document.getElementById('ms-' + key);
      if (panel) {
        const isOpen = panel.classList.contains('open');
        document.querySelectorAll('.ms-panel.open').forEach((el) => el.classList.remove('open'));
        if (!isOpen) _openMsPanel(msTrigger, panel);
      }
      return;
    }
    // Click outside any ms-trigger closes all open panels
    if (!t.closest('[data-ms-trigger]') && !t.closest('.ms-panel')) {
      document.querySelectorAll('.ms-panel.open').forEach((el) => el.classList.remove('open'));
    }
    if (t.closest('[data-toggle-sidebar]')) { state.collapsed = !state.collapsed; save(); renderShell(); return; }
    if (t.closest('[data-theme-toggle]')) { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); applyChrome(); renderShell(); return; }
    if (t.closest('[data-refresh]')) {
      // Re-fetch live data if adapter is available; otherwise just re-render.
      if (window.OPAdapter && window.OPAdapter.USE_LIVE_API && window.DB && window.DB.reload) {
        refreshStatus = 'loading';
        refreshMessage = '갱신 중...';
        window.DB._loading = true;
        renderShell();
        window.OPAdapter.buildLiveDataset().then(function (ds) {
          window.DB.reload(ds);
          const done = new Date();
          refreshStatus = 'success';
          refreshMessage = `갱신 완료 ${String(done.getHours()).padStart(2, '0')}:${String(done.getMinutes()).padStart(2, '0')}:${String(done.getSeconds()).padStart(2, '0')}`;
          renderShell();
        }).catch(function (err) {
          console.error('[PLM] refresh fetch failed:', err);
          refreshStatus = 'error';
          refreshMessage = '갱신 실패';
          window.DB._loading = false;
          renderShell();
        });
      } else {
        refreshStatus = 'success';
        refreshMessage = '갱신 완료';
        renderShell();
      }
      return;
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-board-project]')) { state.boardProject = t.value; save(); renderContent(); }
    if (t.matches('[data-board-user]')) { state.boardUser = t.value; save(); renderContent(); }
    if (t.matches('[data-tl-project]')) { state.tlProject = t.value; save(); renderContent(); }
    if (t.matches('[data-proj-pm-check]')) {
      const pid = +t.dataset.projPmCheck;
      if (!state.projPmOverrides) state.projPmOverrides = {};
      const panel = t.closest('.ms-panel');
      const panelId = panel?.id;
      const checked = [...panel.querySelectorAll('[data-proj-pm-check]:checked')].map((el) => +el.value);
      if (checked.length) { state.projPmOverrides[pid] = checked; }
      else { delete state.projPmOverrides[pid]; }
      save(); renderContent();
      // Re-open the panel in the fresh DOM, repositioned below the new trigger
      if (panelId) _reopenMsPanel(panelId);
    }
    if (t.matches('[data-proj-tl-check]')) {
      const pid = +t.dataset.projTlCheck;
      if (!state.projTlOverrides) state.projTlOverrides = {};
      const panel = t.closest('.ms-panel');
      const panelId = panel?.id;
      const checked = [...panel.querySelectorAll('[data-proj-tl-check]:checked')].map((el) => +el.value);
      if (checked.length) { state.projTlOverrides[pid] = checked; }
      else { delete state.projTlOverrides[pid]; }
      save(); renderContent();
      // Re-open the panel in the fresh DOM, repositioned below the new trigger
      if (panelId) _reopenMsPanel(panelId);
    }
  });

  /* ---------- drag & drop — project order + KPI section order + board col order ---------- */
  let _dragProjId = null, _dragKpiKey = null, _dragKpiNs = '', _dragKpiDef = null, _dragBoardColKey = null;

  document.addEventListener('dragstart', (e) => {
    const chip = e.target.closest('[data-proj-drag]');
    if (chip) {
      _dragProjId = +chip.dataset.projDrag;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_dragProjId));
      chip.classList.add('is-dragging');
      return;
    }
    const kpiEl = e.target.closest('[data-kpi-drag]');
    if (kpiEl) {
      _dragKpiKey = kpiEl.dataset.kpiDrag;
      _dragKpiNs = kpiEl.closest('[data-kpi-ns]')?.dataset.kpiNs || '';
      _dragKpiDef = kpiEl.closest('[data-kpi-ns]')?.dataset.kpiDefaults || null;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragKpiKey);
      kpiEl.classList.add('is-dragging');
      return;
    }
    const boardColEl = e.target.closest('[data-board-col-drag]');
    if (boardColEl) {
      _dragBoardColKey = boardColEl.dataset.boardColDrag;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', _dragBoardColKey);
      boardColEl.classList.add('is-dragging');
    }
  });

  document.addEventListener('dragover', (e) => {
    if (_dragProjId !== null) {
      const chip = e.target.closest('[data-proj-drag]');
      if (chip && +chip.dataset.projDrag !== _dragProjId) { e.preventDefault(); chip.classList.add('drag-over'); }
    }
    if (_dragKpiKey) {
      const kpiEl = e.target.closest('[data-kpi-drag]');
      if (kpiEl && kpiEl.dataset.kpiDrag !== _dragKpiKey) { e.preventDefault(); kpiEl.classList.add('drag-over'); }
    }
    if (_dragBoardColKey) {
      const boardColEl = e.target.closest('[data-board-col-drag]');
      if (boardColEl && boardColEl.dataset.boardColDrag !== _dragBoardColKey) { e.preventDefault(); boardColEl.classList.add('drag-over'); }
    }
  });

  document.addEventListener('dragleave', (e) => {
    e.target.closest('[data-proj-drag]')?.classList.remove('drag-over');
    e.target.closest('[data-kpi-drag]')?.classList.remove('drag-over');
    e.target.closest('[data-board-col-drag]')?.classList.remove('drag-over');
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (_dragProjId !== null) {
      const target = e.target.closest('[data-proj-drag]');
      if (target && +target.dataset.projDrag !== _dragProjId) {
        const allIds = D.PROJECTS.map((p) => p.id);
        const baseOrder = (state.projOrder && state.projOrder.length) ? [...state.projOrder] : [...allIds];
        const order = [...baseOrder, ...allIds.filter((id) => !baseOrder.includes(id))];
        const from = order.indexOf(_dragProjId), to = order.indexOf(+target.dataset.projDrag);
        if (from >= 0 && to >= 0) { order.splice(from, 1); order.splice(to, 0, _dragProjId); }
        state.projOrder = order;
        save(); renderContent();
      }
    }
    if (_dragKpiKey) {
      const target = e.target.closest('[data-kpi-drag]');
      if (target && target.dataset.kpiDrag !== _dragKpiKey) {
        const DEF = _dragKpiDef ? JSON.parse(_dragKpiDef) : ['total', 'open', 'spent', 'closeRate', 'dueWeek'];
        const sectKey = _dragKpiNs ? _dragKpiNs + 'KpiSections' : 'kpiSections';
        const sects = [...(state[sectKey] || DEF)];
        const from = sects.indexOf(_dragKpiKey), to = sects.indexOf(target.dataset.kpiDrag);
        if (from >= 0 && to >= 0) { sects.splice(from, 1); sects.splice(to, 0, _dragKpiKey); }
        state[sectKey] = sects;
        save(); renderContent();
      }
    }
    if (_dragBoardColKey) {
      const target = e.target.closest('[data-board-col-drag]');
      if (target && target.dataset.boardColDrag !== _dragBoardColKey) {
        const allKeys = D.BOARD_COLS.map((c) => c.key);
        const order = (state.boardColOrder && state.boardColOrder.length) ? [...state.boardColOrder] : [...allKeys];
        const from = order.indexOf(_dragBoardColKey), to = order.indexOf(target.dataset.boardColDrag);
        if (from >= 0 && to >= 0) { order.splice(from, 1); order.splice(to, 0, _dragBoardColKey); }
        state.boardColOrder = order;
        save(); renderContent();
      }
    }
  });

  document.addEventListener('dragend', () => {
    document.querySelectorAll('.is-dragging,.drag-over').forEach((el) => el.classList.remove('is-dragging', 'drag-over'));
    _dragProjId = null; _dragKpiKey = null; _dragKpiNs = ''; _dragKpiDef = null; _dragBoardColKey = null;
  });

  /* ---------- tooltip ---------- */
  const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.textContent = el.getAttribute('data-tip');
    tip.classList.add('show');
  });
  document.addEventListener('mousemove', (e) => {
    if (!tip.classList.contains('show')) return;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + pad, y = e.clientY + pad;
    if (x + w > innerWidth) x = e.clientX - w - pad;
    if (y + h > innerHeight) y = e.clientY - h - pad;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  });
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest('[data-tip]')) tip.classList.remove('show');
  });

  /* ---------- expose for Tweaks ---------- */
  window.App = {
    save,
    set(key, val) {
      if (key === 'accent' && !ACCENTS[val]) return;
      state[key] = val; save(); applyChrome();
      if (['theme', 'density', 'style', 'accent'].includes(key)) renderShell();
    },
    get(key) { return state[key]; },
    getState() { return state; },
    refresh() { renderShell(); },
    showError(msg) {
      const el = document.getElementById('content');
      if (el) el.innerHTML = `<div class="empty" style="color:var(--c-red)">연동 오류: ${escapeHtml(msg)}</div>`;
    },
  };

  /* ---------- boot ---------- */
  applyChrome();
  renderShell();
})();
