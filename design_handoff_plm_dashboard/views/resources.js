/* =============================================================================
   View: Resources — 리소스 입력 신뢰도 / 일정 압박 / 가동률
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const RES_KPI_ALL = [
    { key: 'members',      label: 'MEMBERS',      hint: '활성 인원(Observer·Bot 제외)입니다.' },
    { key: 'assignment',   label: 'ASSIGNMENT',   hint: 'Open WP 중 담당자(Assignee)가 입력된 비율입니다.' },
    { key: 'estimate',     label: 'ESTIMATE',     hint: 'Open WP 중 Estimated time이 입력된 비율입니다. Load 신뢰도 기준입니다.' },
    { key: 'dueCoverage',  label: 'DUE DATE',     hint: 'Open WP 중 Due date가 입력된 비율입니다.' },
    { key: 'due21',        label: 'DUE 21D',      hint: '지연 항목을 포함해 21일 내 마감되는 Open WP입니다.' },
    { key: 'unassigned',   label: 'UNASSIGNED',   hint: 'Assignee가 없는 Open WP입니다. 리소스 검토 전에 우선 보정해야 합니다.' },
    { key: 'missingDue',   label: 'MISSING DUE',  hint: 'Due date가 없어 일정 압박 산정에서 빠지는 Open WP입니다.' },
    { key: 'avgLoad',      label: 'AVG LOAD',     hint: '향후 3주 내 마감 예정 잔여 estimated hours ÷ capacity입니다.' },
    { key: 'overloaded',   label: 'OVERLOADED',   hint: 'Load가 100%를 초과하는 인원 수입니다. Estimated time 입력률이 낮으면 보조 지표로만 봅니다.' },
    { key: 'under',        label: 'UNDERUTIL',    hint: 'Load가 50% 미만인 인원 수입니다. Estimated time 입력률이 낮으면 과소 산정됩니다.' },
    { key: 'totalSpent',   label: 'TOTAL SPENT',  hint: 'Time entries 기반 누적 기록 공수(h)입니다.' },
    { key: 'avgRemaining', label: 'AVG REMAIN',   hint: '인당 평균 21일 내 잔여 estimated hours입니다.' },
  ];
  const RES_DEFAULT_KEYS = ['members', 'assignment', 'estimate', 'due21', 'unassigned'];
  const RES_OLD_DEFAULT_KEYS = ['members', 'avgLoad', 'overloaded', 'under', 'totalSpent'];
  const DAY21 = 21;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const pct = (part, total) => total ? Math.round((part / total) * 100) : 0;
  const hasEstimate = (wp) => Number(wp.estimatedHours || 0) > 0;

  function toneForCoverage(value) {
    if (value < 40) return 'red';
    if (value < 80) return 'amber';
    return 'accent';
  }

  function renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit) {
    const totalCols = activeSections.length + (kpiEdit ? hiddenDefs.length : 0);
    const kpiCards = activeSections.map((key) => {
      const def = RES_KPI_ALL.find((d) => d.key === key) || { label: key, hint: '' };
      const val = kpiVals[key] || { v: '-', u: '', tone: '', foot: '' };
      const attrs = kpiEdit
        ? `draggable="true" data-kpi-drag="${esc(key)}" data-tip="${esc(def.hint)}"`
        : `data-tip="${esc(def.hint)}"`;
      const labelHtml = kpiEdit
        ? `${def.label}<span class="kpi-remove" data-kpi-toggle="${esc(key)}" title="숨기기">&times;</span>`
        : def.label;
      return UI.kpi({ label: labelHtml, value: val.v, unit: val.u, foot: val.foot, tone: val.tone, attrs });
    }).join('');
    const hiddenCards = kpiEdit ? hiddenDefs.map((def) =>
      `<div class="kpi kpi-hidden" data-kpi-toggle="${esc(def.key)}" title="${esc(def.hint)}">
        <div class="kpi-label">${def.label}</div>
        <div class="kpi-value" style="font-size:18px;color:var(--text-faint)">+ 추가</div>
      </div>`
    ).join('') : '';
    return `<div data-kpi-ns="res" data-kpi-defaults='${JSON.stringify(RES_DEFAULT_KEYS)}'>
      <div class="kpi-row kpi-strip${kpiEdit ? ' kpi-edit' : ''}" style="--kpi-cols:${Math.max(1, totalCols)}">
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

  function resourceStats(D, util) {
    const activeUsers = D.USERS.filter((u) => !u.isGroup && !u.isObserver && !u.isBot);
    const open = D.WORK_PACKAGES.filter(D.isOpen);
    const horizonEnd = D.addDays(D.TODAY, DAY21);
    const assigned = open.filter((w) => !!w.assigneeId);
    const estimated = open.filter(hasEstimate);
    const dueDated = open.filter((w) => !!w._due);
    const overdue = open.filter(D.isOverdue);
    const due7 = open.filter((w) => D.dueWithin(w, 7));
    const due21 = open.filter((w) => w._due && w._due <= horizonEnd);
    const unassigned = open.filter((w) => !w.assigneeId);
    const missingEstimate = open.filter((w) => !hasEstimate(w));
    const missingDue = open.filter((w) => !w._due);
    const utilByUser = Object.fromEntries(util.map((u) => [u.user.id, u]));

    const people = activeUsers.map((user) => {
      const assignedAll = D.WORK_PACKAGES.filter((w) => w.assigneeId === user.id);
      const openAssigned = assignedAll.filter(D.isOpen);
      const userOverdue = openAssigned.filter(D.isOverdue);
      const userDue7 = openAssigned.filter((w) => D.dueWithin(w, 7));
      const userDue21 = openAssigned.filter((w) => w._due && w._due <= horizonEnd);
      const userMissingEstimate = openAssigned.filter((w) => !hasEstimate(w));
      const userMissingDue = openAssigned.filter((w) => !w._due);
      const projects = [...new Set(openAssigned.map((w) => w.projectId))];
      const base = utilByUser[user.id] || {
        user, openCount: openAssigned.length, totalCount: assignedAll.length,
        remaining: 0, backlog: 0, spent: 0, overdue: userOverdue.length, load: 0, projects,
      };
      const pressure = (userOverdue.length * 5)
        + (userDue7.length * 3)
        + (Math.max(0, userDue21.length - userDue7.length) * 2)
        + userMissingDue.length
        + Math.ceil(openAssigned.length / 4);
      return {
        ...base,
        user,
        openAssigned,
        openCount: openAssigned.length,
        totalCount: assignedAll.length,
        overdue: userOverdue.length,
        due7: userDue7.length,
        due21: userDue21.length,
        missingEstimate: userMissingEstimate.length,
        missingDue: userMissingDue.length,
        projects,
        pressure,
      };
    });

    const projectGaps = Object.values(open.reduce((acc, w) => {
      const id = w.projectId || 'none';
      if (!acc[id]) {
        const p = D.P[w.projectId] || { id, name: 'Unknown project' };
        acc[id] = { project: p, open: 0, unassigned: 0, missingEstimate: 0, missingDue: 0, totalGap: 0 };
      }
      const row = acc[id];
      row.open += 1;
      if (!w.assigneeId) row.unassigned += 1;
      if (!hasEstimate(w)) row.missingEstimate += 1;
      if (!w._due) row.missingDue += 1;
      row.totalGap = row.unassigned + row.missingEstimate + row.missingDue;
      return acc;
    }, {})).filter((row) => row.totalGap > 0)
      .sort((a, b) => b.totalGap - a.totalGap || b.open - a.open)
      .slice(0, 8);

    const assignmentCoverage = pct(assigned.length, open.length);
    const estimateCoverage = pct(estimated.length, open.length);
    const dueCoverage = pct(dueDated.length, open.length);
    const loadConfidence = estimateCoverage >= 80 ? 'high' : estimateCoverage >= 40 ? 'medium' : 'low';

    return {
      activeUsers,
      open,
      assigned,
      estimated,
      dueDated,
      overdue,
      due7,
      due21,
      unassigned,
      missingEstimate,
      missingDue,
      people,
      projectGaps,
      timeEntries: D.TIME_ENTRIES || [],
      capacityOverrides: activeUsers.filter((u) => !!u.capacityOverride).length,
      assignmentCoverage,
      estimateCoverage,
      dueCoverage,
      loadConfidence,
    };
  }

  function readinessCard(label, value, foot, tone, tip) {
    return `<div class="resource-card ${tone ? 'tone-' + tone : ''}" data-tip="${esc(tip)}">
      <div class="resource-card-label">${label}</div>
      <div class="resource-card-value">${value}</div>
      <div class="resource-card-foot">${foot}</div>
    </div>`;
  }

  function gapCard(label, value, field, impact, tone, tip) {
    return `<div class="resource-gap-item ${tone ? 'tone-' + tone : ''}" data-tip="${esc(tip)}">
      <div class="resource-gap-top">
        <span class="resource-gap-label">${label}</span>
        <span class="resource-gap-value">${value}</span>
      </div>
      <div class="resource-gap-field">${field}</div>
      <div class="resource-gap-impact">${impact}</div>
    </div>`;
  }

  function sortPeople(people, sort) {
    const validSort = ['pressure', 'open', 'overdue', 'due21', 'projects', 'load'].includes(sort) ? sort : 'pressure';
    const sorted = [...people].sort((a, b) => {
      if (validSort === 'open') return b.openCount - a.openCount || b.pressure - a.pressure;
      if (validSort === 'overdue') return b.overdue - a.overdue || b.due21 - a.due21;
      if (validSort === 'due21') return b.due21 - a.due21 || b.overdue - a.overdue;
      if (validSort === 'projects') return b.projects.length - a.projects.length || b.openCount - a.openCount;
      if (validSort === 'load') return b.load - a.load || b.pressure - a.pressure;
      return b.pressure - a.pressure || b.overdue - a.overdue || b.openCount - a.openCount;
    });
    return { sort: validSort, sorted };
  }

  Views.resources = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;
    const util = D.userUtilization();
    const stats = resourceStats(D, util);
    const { sort, sorted } = sortPeople(stats.people, state.resSort || 'pressure');

    const overloaded = util.filter((u) => u.load > 100).length;
    const under = util.filter((u) => u.load < 50).length;
    const avgLoad = util.length ? Math.round(util.reduce((a, u) => a + u.load, 0) / util.length) : 0;
    const totalSpent = Math.round(util.reduce((a, u) => a + u.spent, 0));
    const avgRemaining = util.length ? Math.round(util.reduce((a, u) => a + u.remaining, 0) / util.length) : 0;
    const activeMembers = stats.activeUsers.length;
    const confidenceLabel = stats.loadConfidence === 'high' ? 'High' : stats.loadConfidence === 'medium' ? 'Medium' : 'Low';
    const confidenceTone = stats.loadConfidence === 'low' ? 'red' : stats.loadConfidence === 'medium' ? 'amber' : 'accent';

    const kpiEdit = !!state.resKpiEditMode;
    const storedSections = state.resKpiSections || null;
    const storedLooksOld = storedSections && storedSections.join('|') === RES_OLD_DEFAULT_KEYS.join('|');
    const activeSections = (storedSections && !storedLooksOld ? storedSections : RES_DEFAULT_KEYS)
      .filter((key) => RES_KPI_ALL.some((d) => d.key === key));
    const hiddenDefs = RES_KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const kpiVals = {
      members:      { v: activeMembers, u: '',  tone: '', foot: `<span class="muted">활성 인원</span>` },
      assignment:   { v: stats.assignmentCoverage, u: '%', tone: toneForCoverage(stats.assignmentCoverage), foot: `<span class="muted">${stats.assigned.length}/${stats.open.length} open WP</span>` },
      estimate:     { v: stats.estimateCoverage, u: '%', tone: toneForCoverage(stats.estimateCoverage), foot: `<span class="muted">${stats.estimated.length}/${stats.open.length} open WP</span>` },
      dueCoverage:  { v: stats.dueCoverage, u: '%', tone: toneForCoverage(stats.dueCoverage), foot: `<span class="muted">${stats.dueDated.length}/${stats.open.length} open WP</span>` },
      due21:        { v: stats.due21.length, u: '', tone: stats.overdue.length ? 'red' : stats.due7.length ? 'amber' : '', foot: `<span class="muted">overdue ${stats.overdue.length}</span>` },
      unassigned:   { v: stats.unassigned.length, u: '', tone: stats.unassigned.length ? 'amber' : '', foot: `<span class="muted">Assignee 입력 필요</span>` },
      missingDue:   { v: stats.missingDue.length, u: '', tone: stats.missingDue.length ? 'amber' : '', foot: `<span class="muted">Due date 없음</span>` },
      avgLoad:      { v: avgLoad, u: '%', tone: avgLoad > 100 ? 'red' : confidenceTone, foot: `<span class="muted">신뢰도 ${confidenceLabel}</span>` },
      overloaded:   { v: overloaded, u: '', tone: overloaded ? 'red' : '', foot: `<span class="muted">100% 초과</span>` },
      under:        { v: under, u: '', tone: 'amber', foot: `<span class="muted">Estimate 낮으면 과소</span>` },
      totalSpent:   { v: totalSpent.toLocaleString(), u: 'h', tone: stats.timeEntries.length ? 'accent' : 'amber', foot: `<span class="muted">entries ${stats.timeEntries.length}</span>` },
      avgRemaining: { v: avgRemaining, u: 'h', tone: '', foot: `<span class="muted">21D 인당 잔여</span>` },
    };
    const kpiRow = renderKpiStrip(UI, kpiVals, activeSections.length ? activeSections : RES_DEFAULT_KEYS, hiddenDefs, kpiEdit);

    const readinessPanel = UI.panel({
      title: 'Data Readiness · 입력 신뢰도',
      sub: `${stats.open.length} open WP · Load confidence ${confidenceLabel}`,
      cls: 'resource-readiness-panel',
      bodyStyle: 'overflow:hidden',
      hint: 'Resource의 Load/Overloaded/Underutilized는 Estimated time과 Time entries 입력률에 따라 신뢰도가 달라집니다.',
      body: `<div data-resource-readiness>
        <div class="resource-notice tone-${confidenceTone}" data-tip="${esc('Estimated time 입력률이 낮으면 Load는 실제 업무량보다 작게 보입니다. 먼저 OP Estimated time 입력을 보강하세요.')}">
          <span class="badge soft">Load confidence ${confidenceLabel}</span>
          <span>Estimated time ${stats.estimateCoverage}% · Time entries ${stats.timeEntries.length}</span>
        </div>
        <div class="resource-metrics">
          ${readinessCard('Assignment', `${stats.assignmentCoverage}%`, `${stats.assigned.length}/${stats.open.length} open WP`, toneForCoverage(stats.assignmentCoverage), 'Open WP 중 담당자 입력 비율')}
          ${readinessCard('Estimate', `${stats.estimateCoverage}%`, `${stats.estimated.length}/${stats.open.length} open WP`, toneForCoverage(stats.estimateCoverage), 'Open WP 중 Estimated time 입력 비율')}
          ${readinessCard('Due Date', `${stats.dueCoverage}%`, `${stats.dueDated.length}/${stats.open.length} open WP`, toneForCoverage(stats.dueCoverage), 'Open WP 중 Due date 입력 비율')}
          ${readinessCard('Due 21D', stats.due21.length, `overdue ${stats.overdue.length}`, stats.overdue.length ? 'red' : stats.due7.length ? 'amber' : '', '지연 포함 21일 내 마감되는 Open WP')}
          ${readinessCard('Capacity', `${stats.capacityOverrides}/${activeMembers}`, 'override users', stats.capacityOverrides ? 'accent' : 'amber', 'user-overrides.js에 capacityPerWeek가 명시된 활성 인원')}
        </div>
      </div>`,
    });

    const loadRows = sorted.slice(0, 7).map((u) => ({
      label: `<div class="resource-load-label">${UI.avatar(u.user)}<span>${esc(u.user.name)}</span></div>`,
      value: Math.min(150, u.load),
      max: 150,
      color: stats.loadConfidence === 'low' ? 'var(--text-faint)' : u.load > 100 ? 'var(--c-red)' : u.load > 80 ? 'var(--c-amber)' : 'var(--c-green)',
      capPct: (100 / 150) * 100,
      right: `${u.load}%`,
    }));
    const capacityPanel = UI.panel({
      title: 'Capacity Signal · 보조 가동률',
      sub: `21D estimated hours ÷ capacity · estimate ${stats.estimateCoverage}%`,
      cls: 'resource-capacity-panel',
      bodyStyle: 'overflow:hidden',
      hint: 'Estimate 입력률이 낮은 상태에서는 부하율을 확정 판단으로 쓰지 않고 일정 압박과 입력 누락을 함께 봅니다.',
      body: `<div data-resource-capacity>
        ${C.hbars({ rows: loadRows, valueFmt: (v) => `${v}%` })}
        <div class="resource-panel-foot">정렬 기준 ${esc(sort)} · 상위 ${loadRows.length}명 표시</div>
      </div>`,
    });

    const sortBtn = (key, label) => `<button class="mini-btn ${sort === key ? 'on' : ''}" data-res-sort="${key}">${label}</button>`;
    const pressureRows = sorted.map((u) => {
      const loadColor = stats.loadConfidence === 'low' ? 'var(--text-faint)' : u.load > 100 ? 'var(--c-red)' : 'var(--text)';
      return `<tr>
        <td><div class="resource-member-cell">${UI.avatar(u.user)}<div><div class="strong">${esc(u.user.name)}</div><div class="muted">${esc(u.user.title || u.user.role || '')}</div></div></div></td>
        <td><span class="badge soft">${esc(u.user.role || 'Member')}</span></td>
        <td class="num">${u.openCount}<span class="muted"> / ${u.totalCount}</span></td>
        <td class="num" style="color:${u.overdue ? 'var(--c-red)' : 'var(--text-faint)'}">${u.overdue || '-'}</td>
        <td class="num" style="color:${u.due7 ? 'var(--c-amber)' : 'var(--text-faint)'}">${u.due7 || '-'}</td>
        <td class="num">${u.due21 || '-'}</td>
        <td class="num" style="color:${u.missingEstimate ? 'var(--c-amber)' : 'var(--text-faint)'}">${u.missingEstimate || '-'}</td>
        <td class="num" style="color:${u.missingDue ? 'var(--c-amber)' : 'var(--text-faint)'}">${u.missingDue || '-'}</td>
        <td class="num">${u.projects.length || '-'}</td>
        <td class="num" style="color:${loadColor}" data-tip="${esc(`Load confidence ${confidenceLabel} · estimate coverage ${stats.estimateCoverage}%`)}">${u.load}%</td>
      </tr>`;
    }).join('');
    const pressurePanel = UI.panel({
      title: 'Person Pressure · 인원별 점검',
      sub: '지연·7일 내 마감·21일 내 마감·입력 누락 기준',
      cls: 'resource-pressure-panel',
      tools: `<div class="resource-sort-tools"><span class="muted">정렬</span>${sortBtn('pressure', 'Pressure')}${sortBtn('overdue', 'Overdue')}${sortBtn('due21', 'Due 21D')}${sortBtn('open', 'Open')}${sortBtn('load', 'Load')}</div>`,
      bodyStyle: 'padding:0 4px 4px;overflow:auto',
      body: `<div data-resource-pressure>
        <table class="tbl resource-pressure-table"><thead><tr>
          <th>Member</th><th>Role</th><th class="num">Open</th><th class="num">Overdue</th><th class="num">Due 7D</th><th class="num">Due 21D</th><th class="num">No Est.</th><th class="num">No Due</th><th class="num">Proj</th><th class="num">Load</th>
        </tr></thead><tbody>${pressureRows}</tbody></table>
      </div>`,
    });

    const gapRows = stats.projectGaps.length ? stats.projectGaps.map((row) => `<tr>
      <td class="strong clamp">${esc(row.project.name)}</td>
      <td class="num">${row.unassigned || '-'}</td>
      <td class="num">${row.missingEstimate || '-'}</td>
      <td class="num">${row.missingDue || '-'}</td>
    </tr>`).join('') : `<tr><td colspan="4"><div class="empty">입력 누락 없음</div></td></tr>`;
    const inputPanel = UI.panel({
      title: 'Input Actions · OP 입력 유도',
      sub: '현재 OP에 실제 존재하지만 누락된 필드',
      cls: 'resource-input-panel',
      bodyStyle: 'overflow:auto',
      hint: '새 필드를 만들지 않고 OP의 기존 Assignee, Estimated time, Due date, Time entries 입력을 유도합니다.',
      body: `<div data-resource-input-gaps>
        <div class="resource-gap-grid">
          ${gapCard('Missing Assignee', stats.unassigned.length, 'OP field · Assignee', '리소스 귀속 불가', stats.unassigned.length ? 'amber' : '', '담당자가 없으면 인원별 업무량과 책임자 점검에서 빠집니다.')}
          ${gapCard('Missing Estimate', stats.missingEstimate.length, 'OP field · Estimated time', 'Load 신뢰도 저하', stats.estimateCoverage < 40 ? 'red' : stats.missingEstimate.length ? 'amber' : '', 'Estimated time이 없으면 capacity/load 산정이 과소 계산됩니다.')}
          ${gapCard('Missing Due Date', stats.missingDue.length, 'OP field · Due date', '일정 압박 누락', stats.missingDue.length ? 'amber' : '', 'Due date가 없으면 임박/지연/21일 압박 집계에서 빠집니다.')}
          ${gapCard('Time Entries', stats.timeEntries.length, 'OP field · Time entries', stats.timeEntries.length ? '실적 기록 있음' : '실적 분석 불가', stats.timeEntries.length ? '' : 'amber', 'Time entries가 없으면 spent/actual 기반 리소스 분석을 할 수 없습니다.')}
        </div>
        <div class="resource-subhead">Top Project Gaps</div>
        <table class="tbl resource-gap-table"><thead><tr><th>Project</th><th class="num">No Owner</th><th class="num">No Est.</th><th class="num">No Due</th></tr></thead><tbody>${gapRows}</tbody></table>
      </div>`,
    });

    return `
      <div class="section-row"><h2>Resources · 리소스 입력 신뢰도</h2><span class="muted mono" style="font-size:11px">${activeMembers} members · ${stats.open.length} open WP</span></div>
      ${kpiRow}
      <div class="resource-layout-grid">
        <div class="resource-main-stack">${readinessPanel}${pressurePanel}</div>
        <div class="resource-side-stack">${capacityPanel}${inputPanel}</div>
      </div>`;
  };
})();
