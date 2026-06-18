/* =============================================================================
   View: Projects — 과제별 상세 (탭 분리)
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const PROJ_KPI_ALL = [
    { key: 'open',      label: 'OPEN WP',    hint: '진행 중인 미완료 WP 수입니다.' },
    { key: 'closed',    label: 'CLOSED',     hint: '완료된 WP 수입니다.' },
    { key: 'overdue',   label: 'OVERDUE',    hint: '마감일 초과 WP 수입니다.' },
    { key: 'spent',     label: 'SPENT',      hint: '이 과제에 기록된 총 공수(h)입니다.' },
    { key: 'dueWeek',   label: 'DUE 7D',     hint: '이번 주 마감 WP 수입니다.' },
    { key: 'total',     label: 'TOTAL WP',   hint: '이 과제의 전체 WP 수입니다.' },
    { key: 'closeRate', label: 'CLOSE RATE', hint: '완료율(%)입니다.' },
  ];
  const PROJ_DEFAULT_KEYS = ['open', 'closed', 'overdue', 'spent', 'dueWeek'];

  function renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit) {
    const totalCols = activeSections.length + (kpiEdit ? hiddenDefs.length : 0);
    const kpiCards = activeSections.map((key) => {
      const def = PROJ_KPI_ALL.find((d) => d.key === key) || { label: key, hint: '' };
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
    return `<div data-kpi-ns="proj" data-kpi-defaults='${JSON.stringify(PROJ_DEFAULT_KEYS)}'>
      <div class="kpi-row kpi-strip${kpiEdit ? ' kpi-edit' : ''}" style="--kpi-cols:${totalCols}">
        ${kpiCards}${hiddenCards}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:4px">
        <button class="mini-btn${kpiEdit ? ' on' : ''}" data-toggle-kpi-edit>
          ${kpiEdit ? 'KPI 편집 완료' : 'KPI 편집'}
        </button>
      </div>
    </div>`;
  }

  Views.projects = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;

    const hp = new Set(state.hiddenProjects || []);
    const orderedAll = (() => {
      const ord = state.projOrder && state.projOrder.length ? state.projOrder : null;
      if (!ord) return [...D.PROJECTS];
      const byId = Object.fromEntries(D.PROJECTS.map((p) => [p.id, p]));
      return [...ord.map((id) => byId[id]).filter(Boolean), ...D.PROJECTS.filter((p) => !ord.includes(p.id))];
    })();
    const visibleProjects = orderedAll.filter((p) => !hp.has(p.id));
    const hiddenList = orderedAll.filter((p) => hp.has(p.id));

    if (visibleProjects.length === 0) {
      return `<div class="section-row"><h2>Projects · 과제별 현황</h2></div>
        <div class="panel" style="margin-top:var(--grid-1)"><div class="panel-body">
          <div class="empty" style="margin-bottom:12px">모든 과제가 숨겨져 있습니다.</div>
          <div class="hidden-proj-strip">${hiddenList.map((p) => `<button class="hidden-proj-chip" data-show-project="${p.id}">${p.name} <b>+</b></button>`).join('')}</div>
        </div></div>`;
    }

    const pid = (state.projectTab && D.P[state.projectTab] && !hp.has(state.projectTab))
      ? state.projectTab : visibleProjects[0].id;
    const p = D.P[pid];
    const wps = D.WORK_PACKAGES.filter((w) => w.projectId === pid);
    const k = D.kpis(wps);
    const progress = wps.length ? Math.round(wps.reduce((a, w) => a + w.percentDone, 0) / wps.length) : 0;
    const dist = D.statusDistribution(wps).filter((d) => d.count > 0);
    const versions = D.versionsByProject(pid);
    const curV = D.currentVersion(pid);

    /* subtabs */
    const subtabs = `<div class="subtabs">
      ${visibleProjects.map((pp) => {
        const wc = D.WORK_PACKAGES.filter((w) => w.projectId === pp.id);
        const od = wc.filter(D.isOverdue).length;
        return `<button class="subtab ${pp.id === pid ? 'on' : ''}" data-project-tab="${pp.id}">
          <i class="dot" style="background:var(--c-${pp.health === 'on_track' ? 'green' : pp.health === 'at_risk' ? 'amber' : 'red'})"></i>
          ${pp.name}${od ? `<span class="nav-badge alert">${od}</span>` : ''}
          <span class="subtab-hide" data-hide-project="${pp.id}" title="이 과제 숨김">×</span>
        </button>`;
      }).join('')}
    </div>
    ${hiddenList.length ? `<div class="hidden-proj-strip">
      <span class="muted" style="font-size:11px;flex-shrink:0">숨김:</span>
      ${hiddenList.map((hp2) => `<button class="hidden-proj-chip" data-show-project="${hp2.id}">${hp2.name}</button>`).join('')}
    </div>` : ''}`;

    /* PM/PL/Member role info */
    const roles = p.memberRoles || {};
    const pmId  = Object.entries(roles).find(([, r]) => r === 'PM')?.[0];
    const plId  = Object.entries(roles).find(([, r]) => r === 'PL')?.[0];

    /* header */
    const pmBlock = pmId && D.U[+pmId]
      ? `<div><div class="kpi-label">PM</div><div style="display:flex;align-items:center;gap:7px;margin-top:5px">${UI.avatar(D.U[+pmId])}<b style="font-size:13px">${D.U[+pmId].name}</b></div></div>`
      : '';
    const plBlock = plId && D.U[+plId]
      ? `<div><div class="kpi-label">PL</div><div style="display:flex;align-items:center;gap:7px;margin-top:5px">${UI.avatar(D.U[+plId])}<b style="font-size:13px">${D.U[+plId].name}</b></div></div>`
      : '';
    const header = `<div class="panel" style="margin-top:var(--grid-1)"><div class="panel-body" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div style="display:flex;align-items:center;gap:12px">
          <h2 style="margin:0;font-size:20px;white-space:nowrap">${p.name}</h2>${UI.healthChip(p.health)}
        </div>
        <div class="muted" style="margin-top:4px;font-size:13px">${p.nameKo} · <span class="mono">${p.identifier}</span></div>
        <div style="display:flex;gap:18px;margin-top:14px;flex-wrap:wrap">
          ${pmBlock}
          ${plBlock}
          <div><div class="kpi-label">TIMELINE</div><div class="mono" style="margin-top:7px;font-size:13px">${UI.fmtDateY(p.startDate)} → ${UI.fmtDateY(p.dueDate)}</div></div>
          <div><div class="kpi-label">SPRINT</div><div class="mono" style="margin-top:7px;font-size:13px">${curV ? curV.name : '–'}</div></div>
          <div><div class="kpi-label">TEAM</div><div style="margin-top:5px">${UI.avatarStack(p.memberIds.filter((id) => roles[id] !== 'PL' && roles[id] !== 'PM'), 6)}</div></div>
        </div>
      </div>
      <div style="text-align:center">${C.donut({ segments: [{ value: progress, color: 'var(--accent)', label: '완료' }, { value: 100 - progress, color: 'var(--panel-2)', label: '잔여' }], size: 132, thickness: 16, centerTop: progress + '%', centerBottom: 'PROGRESS' })}</div>
    </div></div>`;

    /* KPI strip */
    const kpiEdit = !!state.projKpiEditMode;
    const activeSections = state.projKpiSections || PROJ_DEFAULT_KEYS;
    const hiddenDefs = PROJ_KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const kpiVals = {
      open:      { v: k.open,       u: '',  tone: '',                              foot: `<span class="muted">/ ${k.total} total</span>` },
      closed:    { v: k.closed,     u: '',  tone: '',                              foot: `<span class="kpi-delta up">${k.closeRate}%</span>` },
      overdue:   { v: k.overdue,    u: '',  tone: k.overdue ? 'red' : '',          foot: `<span class="muted">마감 초과</span>` },
      spent:     { v: k.spent,      u: 'h', tone: 'accent',                        foot: `<span class="muted">/ ${k.estimated}h 예상</span>` },
      dueWeek:   { v: k.dueThisWeek, u: '', tone: k.dueThisWeek ? 'amber' : '',   foot: `<span class="muted">이번 주 마감</span>` },
      total:     { v: k.total,      u: '',  tone: '',                              foot: `<span class="muted">전체 WP</span>` },
      closeRate: { v: k.closeRate,  u: '%', tone: '',                              foot: `<span class="muted">완료율</span>` },
    };
    const miniKpis = renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit);

    /* burndown */
    const bd = curV ? D.burndown(curV) : { points: [], total: 0 };
    const burndown = UI.panel({
      title: 'Sprint Burndown · 번다운', sub: curV ? `${curV.name} · 잔여 공수 ${bd.total}h` : '진행 중 스프린트 없음',
      tools: `<div class="legend"><span class="legend-item"><i class="dot" style="background:var(--text-faint)"></i>Ideal</span><span class="legend-item"><i class="dot" style="background:var(--accent)"></i>Remaining</span></div>`,
      body: bd.points.length ? C.lines({
        series: [
          { name: 'Ideal', color: 'var(--text-faint)', dashed: true, values: bd.points.map((pt) => pt.ideal) },
          { name: 'Remaining', color: 'var(--accent)', values: bd.points.map((pt) => pt.remaining) },
        ], labels: bd.points.map((pt) => pt.label), h: 220, area: true, yLabel: 'h',
      }) : '<div class="empty">데이터 없음</div>',
    });

    /* status breakdown */
    const statusPanel = UI.panel({
      title: 'Status · 상태 분포',
      body: `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${C.donut({ segments: dist.map((d) => ({ value: d.count, color: d.status.color, label: d.status.name })), size: 130, thickness: 20, centerTop: k.total, centerBottom: 'WP' })}
        <div class="legend" style="flex-direction:column;flex:1;min-width:120px">
          ${dist.map((d) => `<div class="legend-item" style="justify-content:space-between"><span style="display:flex;gap:7px;align-items:center"><i class="dot" style="background:${d.status.color}"></i>${d.status.name}</span><b class="mono" style="color:var(--text)">${d.count}</b></div>`).join('')}
        </div></div>`,
    });

    /* team — PM/PL/Member roles, no observer/bot */
    const validMembers = p.memberIds.filter((id) => {
      const u = D.U[id];
      return u && !u.isObserver && !u.isBot;
    });
    const teamRows = validMembers.map((id) => {
      const u = D.U[id] || { id, name: `#${id}`, initials: '?', role: '', color: '#8B93A7' };
      const projRole = roles[id] || 'Member';
      const owned = wps.filter((w) => w.assigneeId === id);
      const open = owned.filter(D.isOpen);
      const spent = Math.round(owned.reduce((a, w) => a + w.spentHours, 0));
      return { u, projRole, open: open.length, total: owned.length, spent, overdue: owned.filter(D.isOverdue).length };
    }).sort((a, b) => {
      const order = { PM: 0, PL: 1, Member: 2 };
      return (order[a.projRole] ?? 2) - (order[b.projRole] ?? 2) || b.open - a.open;
    });
    const teamPanel = UI.panel({
      title: 'Team · 팀원별 WP', sub: `${validMembers.length} members`,
      body: `<table class="tbl"><thead><tr><th>Member</th><th>역할</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Spent</th></tr></thead>
        <tbody>${teamRows.map((r) => `<tr><td><div style="display:flex;align-items:center;gap:8px">${UI.avatar(r.u)}<span class="strong">${r.u.name}</span></div></td>
          <td><span class="badge soft" style="${r.projRole === 'PM' ? 'background:rgba(139,92,246,.18);color:#a78bfa' : r.projRole === 'PL' ? 'background:rgba(59,130,246,.18);color:#93c5fd' : ''}">${r.projRole}</span></td>
          <td class="num">${r.open}</td><td class="num" style="color:${r.overdue ? 'var(--c-red)' : 'var(--text-faint)'}">${r.overdue || '–'}</td><td class="num">${r.spent}h</td></tr>`).join('')}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:300px;overflow-y:auto',
    });

    /* recent WP list — all, scrollable */
    const recent = [...wps].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const wpPanel = UI.panel({
      title: 'Work Packages · 최근 업데이트',
      tools: `<button class="mini-btn" data-nav="board">보드 →</button>`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Type</th><th>Status</th><th>Assignee</th><th>Due</th><th class="num">%</th></tr></thead>
        <tbody>${recent.map((w) => { const due = UI.dueLabel(w.dueDate); return `<tr>
          <td>${UI.wpLink(w)}</td>
          <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
          <td>${UI.typeTag(w.typeId)}</td>
          <td>${UI.statusChip(w.statusId)}</td>
          <td>${UI.avatar(D.U[w.assigneeId])}</td>
          <td><span class="kpi-delta ${D.isOpen(w) ? due.cls : ''}" style="font-size:11px">${D.isOpen(w) ? due.txt : '완료'}</span></td>
          <td class="num">${w.percentDone}</td></tr>`; }).join('')}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:380px;overflow-y:auto',
    });

    return `
      <div class="section-row"><h2>Projects · 과제별 현황</h2><span class="muted mono" style="font-size:11px">탭으로 과제 전환</span></div>
      ${subtabs}
      ${header}
      ${miniKpis}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-6">${burndown}</div>
        <div class="col-6">${statusPanel}</div>
        <div class="col-4">${teamPanel}</div>
        <div class="col-8">${wpPanel}</div>
      </div>`;
  };
})();
