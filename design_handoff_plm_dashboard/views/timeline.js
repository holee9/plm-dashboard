/* =============================================================================
   View: Timeline — 간트 / 마일스톤
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};
  const DAY = 86400000;

  function orderedProjects(state) {
    const ord = state.projOrder && state.projOrder.length ? state.projOrder : null;
    if (!ord) return [...window.DB.PROJECTS];
    const byId = Object.fromEntries(window.DB.PROJECTS.map((p) => [p.id, p]));
    const sorted = ord.map((id) => byId[id]).filter(Boolean);
    const rest = window.DB.PROJECTS.filter((p) => !ord.includes(p.id));
    return [...sorted, ...rest];
  }

  const isMilestone = (D, wp) => /milestone|마일스톤/i.test(D.T[wp.typeId]?.name || '');
  const hasSchedule = (wp) => !!(wp._start && wp._due);
  const milestoneDate = (wp) => wp._milestoneDate || wp._due || wp._start || null;
  const attr = (s) => String(s == null ? '' : s).replace(/"/g, '&quot;');

  function milestoneItems(D, UI, wps) {
    return wps.filter((w) => isMilestone(D, w)).map((w) => {
      const date = milestoneDate(w);
      if (!date) return null;
      const dateIso = D.iso(date);
      const project = D.P[w.projectId]?.name || 'Unknown project';
      const status = D.S[w.statusId]?.name || 'Unknown status';
      const assignee = D.U[w.assigneeId]?.name || '미배정';
      return {
        id: w.id,
        label: w.subject,
        date,
        dateIso,
        project,
        status,
        assignee,
        tip: `◇ ${w.subject} · ${project} · ${UI.fmtDateY(dateIso)} · ${status} · ${assignee}`,
      };
    }).filter(Boolean).sort((a, b) => a.date - b.date);
  }

  function renderMilestoneMarkers(milestones, pct) {
    return milestones.map((m) => {
      const ml = pct(m.date);
      if (ml < 0 || ml > 100) return '';
      return `<div class="gantt-milestone" data-timeline-milestone="${m.id}" style="left:calc(${ml}% - 8px);background:var(--c-violet, #8B5CF6)" data-tip="${attr(m.tip)}"></div>`;
    }).join('');
  }

  Views.timeline = function (state) {
    const D = window.DB, UI = window.UI;
    const hp = new Set(state.hiddenProjects || []);
    const projects = orderedProjects(state);
    let scope = state.tlProject || 'all';
    if (scope !== 'all' && (!D.P[+scope] || hp.has(+scope))) scope = 'all';

    // build rows
    let rows, rangeStart, rangeEnd, projectMilestones = [];
    if (scope === 'all') {
      rows = projects.filter((p) => !hp.has(p.id)).map((p) => {
        const wps = D.WORK_PACKAGES.filter((w) => w.projectId === p.id);
        const prog = wps.length ? Math.round(wps.reduce((a, w) => a + w.percentDone, 0) / wps.length) : 0;
        const ms = milestoneItems(D, UI, wps);
        return { id: p.id, label: p.name, ko: p.nameKo, start: p._start, end: p._end, progress: prog,
          color: p.health === 'on_track' ? 'var(--c-blue)' : p.health === 'at_risk' ? 'var(--c-amber)' : 'var(--c-red)',
          milestones: ms, health: p.health, nav: p.id };
      });
    } else {
      const p = D.P[+scope];
      const projectWps = D.WORK_PACKAGES.filter((w) => w.projectId === p.id);
      projectMilestones = milestoneItems(D, UI, projectWps);
      const wps = projectWps.filter((w) => !isMilestone(D, w) && hasSchedule(w))
        .sort((a, b) => a._start - b._start).slice(0, 22);
      rows = wps.map((w) => ({ label: `#${w.id}`, ko: w.subject, start: w._start, end: w._due, progress: w.percentDone,
        color: D.S[w.statusId].color, milestones: [], assignee: w.assigneeId, overdue: D.isOverdue(w) }));
    }

    const datePoints = [];
    rows.forEach((r) => { if (r.start) datePoints.push(r.start); if (r.end) datePoints.push(r.end); });
    projectMilestones.forEach((m) => datePoints.push(m.date));
    const allStart = datePoints.length ? new Date(Math.min(...datePoints.map((d) => +d))) : D.TODAY;
    const allEnd = datePoints.length ? new Date(Math.max(...datePoints.map((d) => +d))) : D.TODAY;
    rangeStart = D.addDays(D.startOfWeek(allStart), -3);
    rangeEnd = D.addDays(allEnd, 7);
    const span = Math.max(1, (rangeEnd - rangeStart) / DAY);
    const pct = (d) => ((d - rangeStart) / DAY / span) * 100;

    // month grid
    let months = '';
    let cur = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    while (cur < rangeEnd) {
      const left = pct(cur);
      if (left >= 0 && left < 100) months += `<div class="gantt-month" style="left:${left}%">${cur.getFullYear()}.${String(cur.getMonth() + 1).padStart(2, '0')}</div>`;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    // grid lines (months)
    let gridLines = '';
    let gc = new Date(rangeStart.getFullYear(), rangeStart.getMonth() + 1, 1);
    while (gc < rangeEnd) { const l = pct(gc); gridLines += `<div class="gantt-grid-line" style="left:${l}%"></div>`; gc = new Date(gc.getFullYear(), gc.getMonth() + 1, 1); }
    const todayLeft = pct(D.TODAY);

    const ganttRows = rows.map((r) => {
      const left = Math.max(0, pct(r.start));
      const width = Math.max(1.5, pct(r.end) - pct(r.start));
      const ms = renderMilestoneMarkers(r.milestones || [], pct);
      const navAttr = r.nav ? `data-nav-project="${r.nav}" style="cursor:pointer"` : '';
      return `<div class="gantt-row">
        <div class="gantt-label" ${navAttr}>
          ${r.health ? `<i class="dot" style="background:${r.color}"></i>` : ''}
          ${r.assignee ? UI.avatar(D.U[r.assignee]) : ''}
          <div style="overflow:hidden"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px">${r.label}</div>
          ${r.ko ? `<div class="muted" style="font-size:10.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.ko}</div>` : ''}</div>
        </div>
        <div class="gantt-track">
          ${gridLines}
          <div class="gantt-bar" style="left:${left}%;width:${width}%;background:${r.color}${r.overdue ? ';outline:1.5px solid var(--c-red)' : ''}"
            data-tip="${r.label} · ${UI.fmtDateY(D.iso(r.start))} → ${UI.fmtDateY(D.iso(r.end))} · ${r.progress}%">
            <div class="gantt-fill" style="width:${r.progress}%"></div>
            <span style="position:relative;z-index:2">${r.progress}%</span>
          </div>
          ${ms}
        </div>
      </div>`;
    }).join('');
    const milestoneLane = scope !== 'all' && projectMilestones.length ? `<div class="gantt-row gantt-ms-lane">
      <div class="gantt-label"><span style="color:var(--c-violet)">◇</span><div><div style="font-size:12.5px">Milestones</div><div class="muted" style="font-size:10.5px">${projectMilestones.length} items</div></div></div>
      <div class="gantt-track">${gridLines}${renderMilestoneMarkers(projectMilestones, pct)}</div>
    </div>` : '';

    const scopeSel = `<select class="board-select" data-tl-project>
      <option value="all" ${scope === 'all' ? 'selected' : ''}>All Projects · 전체 과제</option>
      ${projects.filter((p) => !hp.has(p.id)).map((p) => `<option value="${p.id}" ${+scope === p.id ? 'selected' : ''}>${p.name} · WP</option>`).join('')}
    </select>`;

    const gantt = UI.panel({
      title: 'Gantt · ' + (scope === 'all' ? '과제 일정' : D.P[+scope].name + ' WP 일정'),
      sub: `${UI.fmtDateY(D.iso(rangeStart))} → ${UI.fmtDateY(D.iso(rangeEnd))}`,
      tools: `<span class="legend" style="margin-right:8px"><span class="legend-item"><i style="width:14px;height:3px;background:var(--accent);display:inline-block;border-radius:2px"></i>Today</span><span class="legend-item"><span class="gantt-milestone" style="position:static;width:11px;height:11px;border:none;background:#8B5CF6"></span>Milestone</span></span>`,
      body: `<div class="gantt">
        <div class="gantt-head"><div></div><div class="gantt-months" style="position:relative">${months}</div></div>
        <div style="position:relative">
          <div class="gantt-today" style="left:calc(200px + (100% - 200px) * ${todayLeft / 100})" data-tip="Today · ${UI.fmtDateY(D.iso(D.TODAY))}"></div>
          ${milestoneLane}
          ${ganttRows}
        </div>
      </div>`,
      bodyStyle: 'padding:0',
    });

    // upcoming milestones — scoped to the current timeline selection.
    const milestoneScope = scope === 'all'
      ? D.WORK_PACKAGES
      : D.WORK_PACKAGES.filter((w) => w.projectId === +scope);
    const milestones = milestoneItems(D, UI, milestoneScope.filter((w) => D.isOpen(w)));
    const msPanel = UI.panel({
      title: (scope === 'all' ? 'Upcoming Milestones' : 'Project Milestones') + ' · 마일스톤', sub: `${milestones.length} dated`,
      body: `<div class="feed">${milestones.map((m) => { const due = UI.dueLabel(m.dateIso); return `<div class="feed-item">
        <div class="feed-ic" style="background:rgba(139,92,246,.16)"><span style="color:#8B5CF6">◇</span></div>
        <div class="feed-main"><div class="feed-title">${m.label}</div>
          <div class="feed-meta"><span>${m.project}</span><span class="mono">${UI.fmtDateY(m.dateIso)}</span><span>${m.status}</span><span>${m.assignee}</span></div></div>
        <span class="kpi-delta ${due.cls}">${due.txt}</span></div>`; }).join('') || '<div class="empty">예정 마일스톤 없음</div>'}</div>`,
      bodyStyle: 'max-height:360px;overflow-y:auto',
    });

    // sprint status — all, scrollable
    const activeSprints = D.PROJECTS.map((p) => ({ p, v: D.currentVersion(p.id) })).filter((x) => x.v && x.v.status === 'open');
    const sprintPanel = UI.panel({
      title: 'Active Sprints · 진행 스프린트', sub: `${activeSprints.length} open`,
      body: `<table class="tbl"><thead><tr><th>Project</th><th>Sprint</th><th>Period</th><th class="num">Progress</th></tr></thead><tbody>
        ${activeSprints.map(({ p, v }) => { const wps = D.WORK_PACKAGES.filter((w) => w.versionId === v.id); const prog = wps.length ? Math.round(wps.reduce((a, w) => a + w.percentDone, 0) / wps.length) : 0;
          return `<tr><td class="strong">${p.name}</td><td class="mono">${v.name}</td><td class="mono muted" style="font-size:11px">${UI.fmtDate(v.startDate)}–${UI.fmtDate(v.dueDate)}</td>
          <td style="width:120px"><div style="display:flex;align-items:center;gap:8px">${UI.progressBar(prog)}<span class="mono" style="font-size:11px">${prog}%</span></div></td></tr>`; }).join('')}
      </tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:360px;overflow-y:auto;min-height:360px',
    });

    return `
      <div class="section-row"><h2>Timeline · 일정/간트</h2><div class="spacer"></div>${scopeSel}</div>
      <div style="margin-top:var(--grid-1)">${gantt}</div>
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-5">${msPanel}</div>
        <div class="col-7">${sprintPanel}</div>
      </div>`;
  };
})();
