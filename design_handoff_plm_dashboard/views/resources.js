/* =============================================================================
   View: Resources — 개발자별 리소스/가동률
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const RES_KPI_ALL = [
    { key: 'members',      label: 'MEMBERS',     hint: '활성 인원(Observer·Bot 제외)입니다.' },
    { key: 'avgLoad',      label: 'AVG LOAD',    hint: '팀 전체 평균 가동률입니다. 100% 초과 시 과부하.' },
    { key: 'overloaded',   label: 'OVERLOADED',  hint: '가동률 100% 초과 인원 수입니다.' },
    { key: 'under',        label: 'UNDERUTIL',   hint: '가동률 50% 미만 인원 수입니다.' },
    { key: 'totalSpent',   label: 'TOTAL SPENT', hint: '전체 인원의 누적 기록 공수(h)입니다.' },
    { key: 'avgRemaining', label: 'AVG REMAIN',  hint: '인당 평균 잔여 공수(h)입니다.' },
  ];
  const RES_DEFAULT_KEYS = ['members', 'avgLoad', 'overloaded', 'under', 'totalSpent'];

  function renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit) {
    const totalCols = activeSections.length + (kpiEdit ? hiddenDefs.length : 0);
    const kpiCards = activeSections.map((key) => {
      const def = RES_KPI_ALL.find((d) => d.key === key) || { label: key, hint: '' };
      const val = kpiVals[key] || { v: '-', u: '', tone: '', foot: '' };
      const attrs = kpiEdit
        ? `draggable="true" data-kpi-drag="${key}" data-tip="${def.hint}"`
        : `data-tip="${def.hint}"`;
      const labelHtml = kpiEdit
        ? `${def.label}<span class="kpi-remove" data-kpi-toggle="${key}" title="숨기기">×</span>`
        : def.label;
      return UI.kpi({ label: labelHtml, value: val.v, unit: val.u, foot: val.foot, tone: val.tone, attrs });
    }).join('');
    const hiddenCards = kpiEdit ? hiddenDefs.map((def) =>
      `<div class="kpi kpi-hidden" data-kpi-toggle="${def.key}" title="${def.hint}">
        <div class="kpi-label">${def.label}</div>
        <div class="kpi-value" style="font-size:18px;color:var(--text-faint)">+ 추가</div>
      </div>`
    ).join('') : '';
    return `<div data-kpi-ns="res" data-kpi-defaults='${JSON.stringify(RES_DEFAULT_KEYS)}'>
      <div class="kpi-row kpi-strip${kpiEdit ? ' kpi-edit' : ''}" style="--kpi-cols:${totalCols}">
        ${kpiCards}${hiddenCards}
      </div>
      <div style="display:flex;justify-content:flex-end;gap:6px;margin-top:4px">
        ${kpiEdit ? `<button class="mini-btn" data-cancel-kpi-edit>취소</button>` : ''}
        <button class="mini-btn${kpiEdit ? ' on' : ''}" data-toggle-kpi-edit>
          ${kpiEdit ? 'KPI 편집 완료' : 'KPI 편집'}
        </button>
      </div>
    </div>`;
  }

  Views.resources = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;
    const util = D.userUtilization();
    const sort = state.resSort || 'load';
    const sorted = [...util].sort((a, b) =>
      sort === 'load' ? b.load - a.load :
      sort === 'open' ? b.openCount - a.openCount :
      sort === 'overdue' ? b.overdue - a.overdue : b.spent - a.spent);

    const overloaded = util.filter((u) => u.load > 100).length;
    const under = util.filter((u) => u.load < 50).length;
    const avgLoad = util.length ? Math.round(util.reduce((a, u) => a + u.load, 0) / util.length) : 0;
    const totalSpent = Math.round(util.reduce((a, u) => a + u.spent, 0));
    const avgRemaining = util.length ? Math.round(util.reduce((a, u) => a + u.remaining, 0) / util.length) : 0;
    const activeMembers = D.USERS.filter((u) => !u.isGroup && !u.isObserver && !u.isBot).length;

    /* KPI strip */
    const kpiEdit = !!state.resKpiEditMode;
    const activeSections = state.resKpiSections || RES_DEFAULT_KEYS;
    const hiddenDefs = RES_KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const kpiVals = {
      members:      { v: activeMembers,               u: '',  tone: '',                            foot: `<span class="muted">활성 인원</span>` },
      avgLoad:      { v: avgLoad,                     u: '%', tone: avgLoad > 100 ? 'red' : 'accent', foot: `<span class="muted">평균 가동률</span>` },
      overloaded:   { v: overloaded,                  u: '',  tone: 'red',                         foot: `<span class="muted">100% 초과</span>` },
      under:        { v: under,                       u: '',  tone: 'amber',                       foot: `<span class="muted">50% 미만</span>` },
      totalSpent:   { v: totalSpent.toLocaleString(), u: 'h', tone: 'accent',                      foot: `<span class="muted">누적 기록</span>` },
      avgRemaining: { v: avgRemaining,                u: 'h', tone: '',                            foot: `<span class="muted">인당 잔여</span>` },
    };
    const kpiRow = renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit);

    /* capacity vs load chart */
    const loadRows = sorted.map((u) => ({
      label: `<div style="width:120px;display:flex;align-items:center;gap:7px;overflow:hidden;white-space:nowrap">${UI.avatar(u.user)}<span style="overflow:hidden;text-overflow:ellipsis">${u.user.name}</span></div>`,
      value: Math.min(150, u.load), max: 150,
      color: u.load > 100 ? 'var(--c-red)' : u.load > 80 ? 'var(--c-amber)' : 'var(--c-green)',
      capPct: (100 / 150) * 100, right: u.load + '%',
    }));
    const loadPanel = UI.panel({
      title: 'Capacity vs Load · 가동률', sub: '향후 3주 마감 작업 ÷ 가용 시간 (수직선 = 100% 기준)',
      tools: `<div class="legend"><span class="legend-item"><i class="dot" style="background:var(--c-green)"></i>여유</span><span class="legend-item"><i class="dot" style="background:var(--c-amber)"></i>적정</span><span class="legend-item"><i class="dot" style="background:var(--c-red)"></i>과부하</span></div>`,
      body: C.hbars({ rows: loadRows, valueFmt: (v) => v + '%' }),
    });

    /* workload by role */
    const roles = {};
    util.forEach((u) => { roles[u.user.role] = roles[u.user.role] || { open: 0, remaining: 0, count: 0 }; const r = roles[u.user.role]; r.open += u.openCount; r.remaining += u.remaining; r.count++; });
    const roleColors = { PM: '#8B5CF6', Backend: '#3B82F6', Frontend: '#06B6D4', Fullstack: '#6366F1', QA: '#22C55E', DevOps: '#F59E0B', Design: '#EC4899', Data: '#14B8A6' };
    const roleArr = Object.entries(roles).sort((a, b) => b[1].remaining - a[1].remaining);
    const rolePanel = UI.panel({
      title: 'Workload by Role · 직무별', sub: '잔여 공수 기준',
      bodyStyle: 'min-height:396px;display:flex;align-items:center',
      body: `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${C.donut({ segments: roleArr.map(([r, v]) => ({ value: Math.round(v.remaining), color: roleColors[r] || '#888', label: r })), size: 132, thickness: 20, centerTop: roleArr.reduce((a, [, v]) => a + v.count, 0), centerBottom: 'PEOPLE' })}
        <div class="legend" style="flex-direction:column;flex:1;min-width:120px">
          ${roleArr.map(([r, v]) => `<div class="legend-item" style="justify-content:space-between"><span style="display:flex;gap:7px;align-items:center"><i class="dot" style="background:${roleColors[r] || '#888'}"></i>${r}</span><b class="mono" style="color:var(--text)">${Math.round(v.remaining)}h</b></div>`).join('')}
        </div></div>`,
    });

    /* detail table — all members, scrollable */
    const sortBtn = (key, label) => `<button class="mini-btn ${sort === key ? 'on' : ''}" data-res-sort="${key}">${label}</button>`;
    const tableRows = sorted.map((u) => `<tr>
      <td><div style="display:flex;align-items:center;gap:9px">${UI.avatar(u.user)}<div><div class="strong">${u.user.name}</div><div class="muted" style="font-size:11px">${u.user.title}</div></div></div></td>
      <td><span class="badge soft">${u.user.role}</span></td>
      <td class="num">${u.openCount}<span class="muted" style="font-size:11px"> / ${u.totalCount}</span></td>
      <td class="num" style="color:${u.overdue ? 'var(--c-red)' : 'var(--text-faint)'}">${u.overdue || '–'}</td>
      <td class="num">${u.remaining}h</td>
      <td class="num">${u.spent}h</td>
      <td class="num">${u.projects.length}</td>
      <td style="width:160px"><div style="display:flex;align-items:center;gap:8px">
        <div class="loadbar" style="flex:1"><span style="left:0;width:${Math.min(100, (u.load / 150) * 100)}%;background:${u.load > 100 ? 'var(--c-red)' : u.load > 80 ? 'var(--c-amber)' : 'var(--c-green)'}"></span><i class="cap" style="left:${(100 / 150) * 100}%"></i></div>
        <span class="mono" style="font-size:11.5px;width:38px;text-align:right;color:${u.load > 100 ? 'var(--c-red)' : 'var(--text)'}">${u.load}%</span></div></td>
    </tr>`).join('');
    const tablePanel = UI.panel({
      title: 'Member Detail · 인원별 상세',
      tools: `<span class="muted" style="font-size:11px;margin-right:6px">정렬</span>${sortBtn('load', 'Load')}${sortBtn('open', 'Open')}${sortBtn('overdue', 'Overdue')}${sortBtn('spent', 'Spent')}`,
      body: `<table class="tbl"><thead><tr><th>Member</th><th>Role</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Remaining</th><th class="num">Spent</th><th class="num">Proj</th><th>Load</th></tr></thead><tbody>${tableRows}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:360px;overflow-y:auto',
    });

    return `
      <div class="section-row"><h2>Resources · 개발자별 리소스</h2><span class="muted mono" style="font-size:11px">${activeMembers} members</span></div>
      ${kpiRow}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-7">${loadPanel}</div>
        <div class="col-5">${rolePanel}</div>
        <div class="col-12">${tablePanel}</div>
      </div>`;
  };
})();
