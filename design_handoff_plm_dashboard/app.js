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
    resources: '개발자별 가동률 · 잔여 공수 · 할당',
    board: '상태별 칸반 보드 · 필터링',
    timeline: '간트 차트 · 마일스톤 · 스프린트',
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
    resSort: 'load', tlProject: 'all' };
  let state = Object.assign({}, DEFAULTS);
  if (window.TWEAK_DEFAULTS) Object.assign(state, window.TWEAK_DEFAULTS);
  try { Object.assign(state, JSON.parse(localStorage.getItem('plm_state') || '{}')); } catch (e) {}
  const save = () => { try { localStorage.setItem('plm_state', JSON.stringify(state)); } catch (e) {} };

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

    document.getElementById('app').innerHTML = `
      <aside class="sidebar ${state.collapsed ? 'collapsed' : ''}">
        <div class="brand">
          <div class="brand-mark">P</div>
          <div class="brand-text"><b>PLM Monitor</b><span>abyz-lab.work</span></div>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot">
          <span class="live-dot"></span>
          <div class="side-foot-text"><b>Live · 연동 대기</b>OpenProject v3</div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="tb-icon" data-toggle-sidebar>${svg(IC.menu)}</button>
          <div class="view-title"><b>${cur.en} · ${cur.ko}</b><span>${SUBTITLE[state.view]}</span></div>
          <div class="topbar-spacer"></div>
          <button class="tb-chip" data-noop>${svg(IC.cal)}<span>Last 90d</span></button>
          <button class="tb-chip" data-noop><span class="live-dot"></span>업데이트 <b>${hh}:${mm}</b></button>
          <button class="tb-icon" data-refresh>${svg(IC.refresh)}</button>
          <button class="tb-icon" data-theme-toggle>${svg(state.theme === 'dark' ? IC.sun : IC.moon)}</button>
        </header>
        <div class="content" id="content"></div>
      </div>`;
    renderContent();
  }

  function renderContent() {
    const fn = window.Views[state.view];
    const el = document.getElementById('content');
    el.scrollTop = 0;
    el.innerHTML = fn ? fn(state) : '<div class="empty">view not found</div>';
  }

  /* ---------- navigation ---------- */
  function go(view) { state.view = view; save(); renderShell(); }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    const navItem = t.closest('[data-view]');
    if (navItem) { go(navItem.dataset.view); return; }
    if (t.closest('[data-nav]')) { go(t.closest('[data-nav]').dataset.nav); return; }
    const npRow = t.closest('[data-nav-project]');
    if (npRow) { state.projectTab = +npRow.dataset.navProject; state.view = 'projects'; save(); renderShell(); return; }
    const ptab = t.closest('[data-project-tab]');
    if (ptab) { state.projectTab = +ptab.dataset.projectTab; save(); renderContent(); return; }
    const rsort = t.closest('[data-res-sort]');
    if (rsort) { state.resSort = rsort.dataset.resSort; save(); renderContent(); return; }
    if (t.closest('[data-toggle-sidebar]')) { state.collapsed = !state.collapsed; save(); renderShell(); return; }
    if (t.closest('[data-theme-toggle]')) { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); applyChrome(); renderShell(); return; }
    if (t.closest('[data-refresh]')) {
      const ic = t.closest('[data-refresh]').querySelector('svg');
      ic.style.transition = 'transform .6s'; ic.style.transform = 'rotate(360deg)';
      setTimeout(() => { ic.style.transition = 'none'; ic.style.transform = 'none'; renderShell(); }, 600);
      return;
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-board-project]')) { state.boardProject = t.value; save(); renderContent(); }
    if (t.matches('[data-board-user]')) { state.boardUser = t.value; save(); renderContent(); }
    if (t.matches('[data-tl-project]')) { state.tlProject = t.value; save(); renderContent(); }
  });

  /* ---------- tooltip ---------- */
  const tip = document.createElement('div'); tip.className = 'tip'; document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.innerHTML = el.getAttribute('data-tip');
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
    set(key, val) {
      if (key === 'accent' && !ACCENTS[val]) return;
      state[key] = val; save(); applyChrome();
      if (['theme', 'density', 'style', 'accent'].includes(key)) renderShell();
    },
    get(key) { return state[key]; },
    getState() { return state; },
  };

  /* ---------- boot ---------- */
  applyChrome();
  renderShell();
})();
