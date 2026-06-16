/* =============================================================================
   View: Resources — 개발자별 리소스/가동률
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

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
    const avgLoad = Math.round(util.reduce((a, u) => a + u.load, 0) / util.length);
    const totalSpent = Math.round(util.reduce((a, u) => a + u.spent, 0));

    const kpiRow = `<div class="kpi-row" style="grid-template-columns:repeat(5,1fr)">
      ${UI.kpi({ label: 'MEMBERS', value: D.USERS.length, foot: `<span class="muted">활성 인원</span>` })}
      ${UI.kpi({ label: 'AVG LOAD', value: avgLoad, unit: '%', tone: avgLoad > 100 ? 'red' : 'accent', foot: `<span class="muted">평균 가동률</span>` })}
      ${UI.kpi({ label: 'OVERLOADED', value: overloaded, tone: 'red', foot: `<span class="muted">100% 초과</span>` })}
      ${UI.kpi({ label: 'UNDERUTILIZED', value: under, tone: 'amber', foot: `<span class="muted">50% 미만</span>` })}
      ${UI.kpi({ label: 'TOTAL SPENT', value: totalSpent.toLocaleString(), unit: 'h', tone: 'accent', foot: `<span class="muted">누적 기록</span>` })}
    </div>`;

    /* capacity vs load chart — all members */
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
      body: `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${C.donut({ segments: roleArr.map(([r, v]) => ({ value: Math.round(v.remaining), color: roleColors[r] || '#888', label: r })), size: 132, thickness: 20, centerTop: roleArr.reduce((a, [, v]) => a + v.count, 0), centerBottom: 'PEOPLE' })}
        <div class="legend" style="flex-direction:column;flex:1;min-width:120px">
          ${roleArr.map(([r, v]) => `<div class="legend-item" style="justify-content:space-between"><span style="display:flex;gap:7px;align-items:center"><i class="dot" style="background:${roleColors[r] || '#888'}"></i>${r}</span><b class="mono" style="color:var(--text)">${Math.round(v.remaining)}h</b></div>`).join('')}
        </div></div>`,
    });

    /* detail table */
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
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    return `
      <div class="section-row"><h2>Resources · 개발자별 리소스</h2><span class="muted mono" style="font-size:11px">15 members</span></div>
      ${kpiRow}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-7">${loadPanel}</div>
        <div class="col-5">${rolePanel}</div>
        <div class="col-12">${tablePanel}</div>
      </div>`;
  };
})();
