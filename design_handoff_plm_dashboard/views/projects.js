/* =============================================================================
   View: Projects — 과제별 상세 (탭 분리)
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.projects = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;
    // state.projectTab may hold a stale ID from a previous OP instance; fall back to first real project.
    const pid = (state.projectTab && D.P[state.projectTab]) ? state.projectTab : D.PROJECTS[0].id;
    const p = D.P[pid];
    const wps = D.WORK_PACKAGES.filter((w) => w.projectId === pid);
    const k = D.kpis(wps);
    const progress = wps.length ? Math.round(wps.reduce((a, w) => a + w.percentDone, 0) / wps.length) : 0;
    const dist = D.statusDistribution(wps).filter((d) => d.count > 0);
    const versions = D.versionsByProject(pid);
    const curV = D.currentVersion(pid);

    /* subtabs */
    const subtabs = `<div class="subtabs">${D.PROJECTS.map((pp) => {
      const wc = D.WORK_PACKAGES.filter((w) => w.projectId === pp.id);
      const od = wc.filter(D.isOverdue).length;
      return `<button class="subtab ${pp.id === pid ? 'on' : ''}" data-project-tab="${pp.id}">
        <i class="dot" style="background:var(--c-${pp.health === 'on_track' ? 'green' : pp.health === 'at_risk' ? 'amber' : 'red'})"></i>
        ${pp.name}${od ? `<span class="nav-badge alert">${od}</span>` : ''}</button>`;
    }).join('')}</div>`;

    /* header */
    const header = `<div class="panel" style="margin-top:var(--grid-1)"><div class="panel-body" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap">
      <div style="flex:1;min-width:220px">
        <div style="display:flex;align-items:center;gap:12px">
          <h2 style="margin:0;font-size:20px;white-space:nowrap">${p.name}</h2>${UI.healthChip(p.health)}
        </div>
        <div class="muted" style="margin-top:4px;font-size:13px">${p.nameKo} · <span class="mono">${p.identifier}</span></div>
        <div style="display:flex;gap:18px;margin-top:14px;flex-wrap:wrap">
          <div><div class="kpi-label">LEAD</div><div style="display:flex;align-items:center;gap:7px;margin-top:5px">${UI.avatar(D.U[p.leadId])}<b style="font-size:13px">${D.U[p.leadId] ? D.U[p.leadId].name : '–'}</b></div></div>
          <div><div class="kpi-label">TIMELINE</div><div class="mono" style="margin-top:7px;font-size:13px">${UI.fmtDateY(p.startDate)} → ${UI.fmtDateY(p.dueDate)}</div></div>
          <div><div class="kpi-label">SPRINT</div><div class="mono" style="margin-top:7px;font-size:13px">${curV ? curV.name : '–'}</div></div>
          <div><div class="kpi-label">TEAM</div><div style="margin-top:5px">${UI.avatarStack(p.memberIds, 6)}</div></div>
        </div>
      </div>
      <div style="text-align:center">${C.donut({ segments: [{ value: progress, color: 'var(--accent)', label: '완료' }, { value: 100 - progress, color: 'var(--panel-2)', label: '잔여' }], size: 132, thickness: 16, centerTop: progress + '%', centerBottom: 'PROGRESS' })}</div>
    </div></div>`;

    /* mini kpis */
    const miniKpis = `<div class="kpi-row" style="grid-template-columns:repeat(5,1fr);margin-top:var(--grid-1)">
      ${UI.kpi({ label: 'OPEN WP', value: k.open, foot: `<span class="muted">/ ${k.total} total</span>` })}
      ${UI.kpi({ label: 'CLOSED', value: k.closed, foot: `<span class="kpi-delta up">${k.closeRate}%</span>` })}
      ${UI.kpi({ label: 'OVERDUE', value: k.overdue, tone: k.overdue ? 'red' : '', foot: `<span class="muted">마감 초과</span>` })}
      ${UI.kpi({ label: 'SPENT / EST', value: k.spent, unit: 'h', tone: 'accent', foot: `<span class="muted">/ ${k.estimated}h 예상</span>` })}
      ${UI.kpi({ label: 'DUE 7D', value: k.dueThisWeek, tone: k.dueThisWeek ? 'amber' : '', foot: `<span class="muted">이번 주 마감</span>` })}
    </div>`;

    /* burndown */
    const bd = curV ? D.burndown(curV) : { points: [], total: 0 };
    const burndown = UI.panel({
      title: 'Sprint Burndown · 번다운', sub: curV ? `${curV.name} · 잔여 공수 ${bd.total}h` : '진행 중 스프린트 없음',
      tools: `<div class="legend"><span class="legend-item"><i class="dot" style="background:var(--text-faint)"></i>Ideal</span><span class="legend-item"><i class="dot" style="background:var(--accent)"></i>Remaining</span></div>`,
      body: bd.points.length ? C.lines({
        series: [
          { name: 'Ideal', color: 'var(--text-faint)', dashed: true, values: bd.points.map((p) => p.ideal) },
          { name: 'Remaining', color: 'var(--accent)', values: bd.points.map((p) => p.remaining) },
        ], labels: bd.points.map((p) => p.label), h: 220, area: true, yLabel: 'h',
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

    /* team within project */
    const teamRows = p.memberIds.map((id) => {
      const u = D.U[id] || { id, name: `#${id}`, initials: '?', role: '', color: '#8B93A7' };
      const owned = wps.filter((w) => w.assigneeId === id);
      const open = owned.filter(D.isOpen);
      const spent = Math.round(owned.reduce((a, w) => a + w.spentHours, 0));
      return { u, open: open.length, total: owned.length, spent, overdue: owned.filter(D.isOverdue).length };
    }).sort((a, b) => b.open - a.open);
    const teamPanel = UI.panel({
      title: 'Team · 팀원별 WP', sub: `${p.memberIds.length} members`,
      body: `<table class="tbl"><thead><tr><th>Member</th><th>Role</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Spent</th></tr></thead>
        <tbody>${teamRows.map((r) => `<tr><td><div style="display:flex;align-items:center;gap:8px">${UI.avatar(r.u)}<span class="strong">${r.u.name}</span></div></td>
          <td>${r.u.role}</td><td class="num">${r.open}</td><td class="num" style="color:${r.overdue ? 'var(--c-red)' : 'var(--text-faint)'}">${r.overdue || '–'}</td><td class="num">${r.spent}h</td></tr>`).join('')}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px',
    });

    /* recent WP list */
    const recent = [...wps].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 9);
    const wpPanel = UI.panel({
      title: 'Work Packages · 최근 업데이트',
      tools: `<button class="mini-btn" data-nav="board">보드 →</button>`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Type</th><th>Status</th><th>Assignee</th><th>Due</th><th class="num">%</th></tr></thead>
        <tbody>${recent.map((w) => { const due = UI.dueLabel(w.dueDate); return `<tr>
          <td class="mono" style="color:var(--text-faint)">#${w.id}</td>
          <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
          <td>${UI.typeTag(w.typeId)}</td>
          <td>${UI.statusChip(w.statusId)}</td>
          <td>${UI.avatar(D.U[w.assigneeId])}</td>
          <td><span class="kpi-delta ${D.isOpen(w) ? due.cls : ''}" style="font-size:11px">${D.isOpen(w) ? due.txt : '완료'}</span></td>
          <td class="num">${w.percentDone}</td></tr>`; }).join('')}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    return `
      <div class="section-row"><h2>Projects · 과제별 현황</h2><span class="muted mono" style="font-size:11px">탭으로 과제 전환</span></div>
      ${subtabs}
      ${header}
      ${miniKpis}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-8">${burndown}</div>
        <div class="col-4">${statusPanel}</div>
        <div class="col-5">${teamPanel}</div>
        <div class="col-7">${wpPanel}</div>
      </div>`;
  };
})();
