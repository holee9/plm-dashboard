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
  const shortDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

  function milestoneItems(D, UI, wps) {
    return wps.filter((w) => isMilestone(D, w)).map((w) => {
      const date = milestoneDate(w);
      if (!date) return null;
      const dateIso = D.iso(date);
      const project = D.P[w.projectId]?.name || 'Unknown project';
      const status = D.S[w.statusId]?.name || 'Unknown status';
      return {
        id: w.id,
        label: w.subject,
        date,
        dateIso,
        dateShort: shortDate(date),
        project,
        status,
        tip: `◇ ${w.subject} · ${shortDate(date)} · ${status}`,
      };
    }).filter(Boolean).sort((a, b) => a.date - b.date);
  }

  function renderMilestoneMarkers(milestones, pct) {
    const laneLast = [-999, -999];
    const minGapPct = 2.2;
    return milestones.map((m) => {
      const ml = pct(m.date);
      if (ml < 0 || ml > 100) return '';
      let lane = ml - laneLast[0] >= minGapPct ? 0 : 1;
      if (lane === 1 && ml - laneLast[1] < minGapPct) lane = laneLast[0] <= laneLast[1] ? 0 : 1;
      laneLast[lane] = ml;
      const size = 14;
      const top = lane === 0 ? 7 : 19;
      return `<div class="gantt-milestone" data-timeline-milestone="${m.id}" style="left:calc(${ml}% - ${size / 2}px);top:${top}px;width:${size}px;height:${size}px;background:var(--c-violet, #8B5CF6)" data-tip="${attr(m.tip)}"></div>`;
    }).join('');
  }

  function followsCount(D, wps) {
    const ids = new Set(wps.map((w) => w.id));
    return (D.RELATIONS || []).filter((r) => r.type === 'follows' && ids.has(r.fromId) && ids.has(r.toId)).length;
  }

  function scheduleStats(D, wps) {
    const work = wps.filter((w) => D.isOpen(w) && !isMilestone(D, w));
    const scheduled = work.filter((w) => w._start && w._due);
    const missingStart = work.filter((w) => !w._start);
    const missingDue = work.filter((w) => !w._due);
    const missingBoth = work.filter((w) => !w._start && !w._due);
    const due7 = work.filter((w) => D.dueWithin(w, 7)).sort((a, b) => a._due - b._due);
    const due14 = work.filter((w) => D.dueWithin(w, 14)).sort((a, b) => a._due - b._due);
    const overdue = work.filter((w) => D.isOverdue(w)).sort((a, b) => a._due - b._due);
    const longSpan = work.filter((w) => w._start && w._due && ((w._due - w._start) / DAY) > 60)
      .sort((a, b) => (b._due - b._start) - (a._due - a._start));
    return {
      work,
      scheduled,
      coverage: work.length ? Math.round((scheduled.length / work.length) * 100) : 100,
      missingStart,
      missingDue,
      missingBoth,
      due7,
      due14,
      overdue,
      longSpan,
      follows: followsCount(D, wps),
    };
  }

  function metricCard(label, value, foot, tone, tip) {
    return `<div class="schedule-card ${tone ? 'tone-' + tone : ''}" ${tip ? `data-tip="${attr(tip)}"` : ''}>
      <div class="schedule-card-label">${label}</div>
      <div class="schedule-card-value">${value}</div>
      <div class="schedule-card-foot">${foot}</div>
    </div>`;
  }

  function projectInspectionTable(D, UI, projects, hp) {
    const rows = projects.filter((p) => !hp.has(p.id)).map((p) => {
      const wps = D.WORK_PACKAGES.filter((w) => w.projectId === p.id);
      const s = scheduleStats(D, wps);
      const pressure = s.overdue.length * 3 + s.due7.length * 2 + s.missingDue.length + s.longSpan.length;
      return { p, s, pressure };
    }).filter((r) => r.s.work.length || r.s.follows || milestoneItems(D, UI, D.WORK_PACKAGES.filter((w) => w.projectId === r.p.id)).length)
      .sort((a, b) => b.pressure - a.pressure || b.s.missingDue.length - a.s.missingDue.length)
      .slice(0, 10);

    if (!rows.length) return '<div class="empty">점검할 일정 항목 없음</div>';
    return `<table class="tbl schedule-table"><thead><tr>
      <th>Project</th><th class="num">Coverage</th><th class="num">Due 7D</th><th class="num">Missing Due</th><th class="num">Long</th><th class="num">Deps</th>
    </tr></thead><tbody>${rows.map(({ p, s }) => `<tr data-tl-scope-project="${p.id}" style="cursor:pointer">
      <td class="strong">${p.name}</td>
      <td class="num mono" style="color:${s.coverage < 80 ? 'var(--c-amber)' : 'var(--text)'}">${s.coverage}%</td>
      <td class="num">${s.due7.length || '–'}</td>
      <td class="num" style="color:${s.missingDue.length ? 'var(--c-amber)' : 'var(--text-faint)'}">${s.missingDue.length || '–'}</td>
      <td class="num">${s.longSpan.length || '–'}</td>
      <td class="num">${s.follows || '–'}</td>
    </tr>`).join('')}</tbody></table>`;
  }

  function projectInspectionFeed(D, UI, stats) {
    const seen = new Set();
    const items = [];
    function add(list, kind, tone, meta) {
      list.forEach((w) => {
        if (seen.has(w.id) || items.length >= 8) return;
        seen.add(w.id);
        items.push({ w, kind, tone, meta: meta(w) });
      });
    }
    add(stats.overdue, 'Overdue', 'red', (w) => `${UI.fmtDate(w.dueDate)} · ${UI.dueLabel(w.dueDate).txt}`);
    add(stats.due7, 'Due 7D', 'amber', (w) => `${UI.fmtDate(w.dueDate)} · ${UI.dueLabel(w.dueDate).txt}`);
    add(stats.missingDue, 'Missing due', 'amber', () => '마감일 없음');
    add(stats.missingStart, 'Missing start', '', () => '시작일 없음');
    add(stats.longSpan, 'Long span', '', (w) => `${Math.round((w._due - w._start) / DAY)}일 span`);

    if (!items.length) return '<div class="empty">선택 프로젝트의 일정 점검 항목 없음</div>';
    return `<div class="feed schedule-feed">${items.map(({ w, kind, tone, meta }) => `<div class="feed-item">
      <div class="feed-ic schedule-ic ${tone ? 'tone-' + tone : ''}">${tone === 'red' ? '!' : tone === 'amber' ? '!' : 'i'}</div>
      <div class="feed-main"><div class="feed-title">${UI.wpLink(w)} ${w.subject}</div>
        <div class="feed-meta"><span>${kind}</span><span>${meta}</span><span>${D.S[w.statusId]?.name || 'Unknown status'}</span></div></div>
    </div>`).join('')}</div>`;
  }

  function renderSchedulePanel(D, UI, scope, scopeWps, projects, hp) {
    const stats = scheduleStats(D, scopeWps);
    const metricRow = `<div class="schedule-metrics">
      ${metricCard('Coverage', `${stats.coverage}%`, `${stats.scheduled.length}/${stats.work.length} open WP`, stats.coverage < 80 ? 'amber' : '', '시작일과 마감일이 모두 있는 Open WP 비율')}
      ${metricCard('Due 7D', stats.due7.length, `14D ${stats.due14.length}`, stats.due7.length ? 'amber' : '', '오늘부터 7일 이내 마감 예정인 Open WP')}
      ${metricCard('Missing Due', stats.missingDue.length, `Both ${stats.missingBoth.length}`, stats.missingDue.length ? 'amber' : '', '마감일이 없어 일정 리스크 집계에서 빠지는 Open WP')}
      ${metricCard('Long Span', stats.longSpan.length, '>60 days', stats.longSpan.length ? 'amber' : '', '시작일과 마감일 간격이 60일을 초과하는 Open WP')}
      ${metricCard('Deps', stats.follows, 'follows', '', 'OpenProject relation type=follows로 입력된 선후관계 수')}
    </div>`;
    const detail = scope === 'all'
      ? projectInspectionTable(D, UI, projects, hp)
      : projectInspectionFeed(D, UI, stats);
    return UI.panel({
      title: 'Schedule Inspection · 일정 점검',
      sub: `${stats.work.length} open WP · ${stats.coverage}% scheduled`,
      body: `<div data-schedule-inspection>${metricRow}<div class="schedule-detail">${detail}</div></div>`,
      bodyStyle: 'max-height:360px;overflow-y:auto;min-height:360px',
      hint: 'Timeline은 일정 전용 점검만 표시합니다. 담당자·가동률·상세 리스크 목록은 Projects/Risks/Resources에서 확인합니다.',
    });
  }

  Views.timeline = function (state) {
    const D = window.DB, UI = window.UI;
    const hp = new Set(state.hiddenProjects || []);
    const projects = orderedProjects(state);
    let scope = state.tlProject || 'all';
    if (scope !== 'all' && (!D.P[+scope] || hp.has(+scope))) scope = 'all';

    // build rows
    let rows, rangeStart, rangeEnd, projectMilestones = [], scopeWps = [];
    if (scope === 'all') {
      scopeWps = D.WORK_PACKAGES.filter((w) => !hp.has(w.projectId));
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
      scopeWps = projectWps;
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
      const rowAttr = r.nav ? `data-tl-scope-project="${r.nav}" style="cursor:pointer"` : '';
      return `<div class="gantt-row" ${rowAttr}>
        <div class="gantt-label">
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
    const milestones = milestoneItems(D, UI, scopeWps.filter((w) => D.isOpen(w)));
    const msPanel = UI.panel({
      title: (scope === 'all' ? 'Upcoming Milestones' : 'Project Milestones') + ' · 마일스톤', sub: `${milestones.length} dated`,
      body: `<div class="feed">${milestones.map((m) => { const due = UI.dueLabel(m.dateIso); return `<div class="feed-item">
        <div class="feed-ic" style="background:rgba(139,92,246,.16)"><span style="color:#8B5CF6">◇</span></div>
        <div class="feed-main"><div class="feed-title">${m.label}</div>
          <div class="feed-meta"><span>${m.project}</span><span class="mono">${m.dateShort}</span><span>${m.status}</span></div></div>
        <span class="kpi-delta ${due.cls}">${due.txt}</span></div>`; }).join('') || '<div class="empty">예정 마일스톤 없음</div>'}</div>`,
      bodyStyle: 'max-height:360px;overflow-y:auto;min-height:360px',
    });

    const schedulePanel = renderSchedulePanel(D, UI, scope, scopeWps, projects, hp);

    return `
      <div class="section-row"><h2>Timeline · 일정/간트</h2><div class="spacer"></div>${scopeSel}</div>
      <div style="margin-top:var(--grid-1)">${gantt}</div>
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-5">${msPanel}</div>
        <div class="col-7">${schedulePanel}</div>
      </div>`;
  };
})();
