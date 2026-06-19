/* =============================================================================
   View: Risks — 지연/리스크 알림
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const RISK_KPI_ALL = [
    { key: 'overdue',    label: 'OVERDUE',     hint: '마감 초과 WP 수입니다. 즉각 조치 필요.' },
    { key: 'dueSoon',   label: 'DUE 7D',      hint: '7일 이내 마감 예정 WP 수입니다.' },
    { key: 'onHold',    label: 'ON HOLD',     hint: '보류 상태 WP 수입니다.' },
    { key: 'overBudget', label: 'OVER BUDGET', hint: '예상 공수 110% 초과 WP 수입니다.' },
    { key: 'overloaded', label: 'OVERLOADED',  hint: '가동률 100% 초과 인원 수입니다.' },
  ];
  const RISK_DEFAULT_KEYS = ['overdue', 'dueSoon', 'onHold', 'overBudget', 'overloaded'];

  function renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit) {
    const totalCols = activeSections.length + (kpiEdit ? hiddenDefs.length : 0);
    const kpiCards = activeSections.map((key) => {
      const def = RISK_KPI_ALL.find((d) => d.key === key) || { label: key, hint: '' };
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
    return `<div data-kpi-ns="risk" data-kpi-defaults='${JSON.stringify(RISK_DEFAULT_KEYS)}'>
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

  Views.risks = function (state) {
    const D = window.DB, UI = window.UI;
    const wps = D.WORK_PACKAGES;

    const overdue = wps.filter(D.isOverdue).sort((a, b) => a._due - b._due);
    const dueSoon = wps.filter((w) => D.dueWithin(w, 7)).sort((a, b) => a._due - b._due);
    const onHold = wps.filter((w) => D.S[w.statusId].cat === 'onHold');
    const overBudget = wps.filter((w) => D.isOpen(w) && w.estimatedHours > 0 && w.spentHours > w.estimatedHours * 1.1)
      .sort((a, b) => (b.spentHours / b.estimatedHours) - (a.spentHours / a.estimatedHours));
    const util = D.userUtilization();
    const overloaded = util.filter((u) => u.load > 100);

    /* KPI strip */
    const kpiEdit = !!state.riskKpiEditMode;
    const activeSections = state.riskKpiSections || RISK_DEFAULT_KEYS;
    const hiddenDefs = RISK_KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const kpiVals = {
      overdue:    { v: overdue.length,    u: '', tone: 'red',   foot: `<span class="muted">마감 초과</span>` },
      dueSoon:    { v: dueSoon.length,    u: '', tone: 'amber', foot: `<span class="muted">임박</span>` },
      onHold:     { v: onHold.length,     u: '', tone: 'amber', foot: `<span class="muted">보류</span>` },
      overBudget: { v: overBudget.length, u: '', tone: 'red',   foot: `<span class="muted">공수 초과</span>` },
      overloaded: { v: overloaded.length, u: '', tone: 'red',   foot: `<span class="muted">인원 과부하</span>` },
    };
    const kpiRow = renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit);

    const wpRow = (w, extra) => {
      const due = UI.dueLabel(w.dueDate);
      return `<tr>
        <td>${UI.wpLink(w)}</td>
        <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
        <td class="muted" style="font-size:11.5px">${D.P[w.projectId].name}</td>
        <td>${UI.statusChip(w.statusId)}</td>
        <td>${UI.avatar(D.U[w.assigneeId])}</td>
        ${extra(w, due)}
      </tr>`;
    };

    const overduePanel = UI.panel({
      title: 'Overdue · 마감 초과', sub: `${overdue.length}건 — 즉시 조치 필요`,
      tools: `<span class="badge" style="background:rgba(239,68,68,.16);color:#FCA5A5">${overdue.length} CRITICAL</span>`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Project</th><th>Status</th><th>Owner</th><th class="num">Due</th><th class="num">초과</th></tr></thead>
        <tbody>${overdue.map((w) => wpRow(w, (w) => `<td class="num mono" style="font-size:11px">${UI.fmtDate(w.dueDate)}</td><td class="num" style="color:var(--c-red)">${w.dueDate ? `${-UI.daysFromToday(w.dueDate)}d` : '–'}</td>`)).join('') || '<tr><td colspan="7"><div class="empty">없음 🎉</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:340px;overflow-y:auto',
    });

    const overloadPanel = UI.panel({
      title: 'Overloaded Members · 과부하 인원', sub: `근시일 부하 100% 초과 ${overloaded.length}명`,
      body: overloaded.length ? `<div class="feed" style="max-height:340px;overflow-y:auto">${overloaded.map((u) => `<div class="feed-item">
        ${UI.avatar(u.user, 'lg')}
        <div class="feed-main">
          <div style="display:flex;align-items:center;gap:8px">
            <div class="feed-title" style="flex:1">${u.user.name} <span class="muted" style="font-weight:400">· ${u.user.title}</span></div>
            <b class="mono" style="color:var(--c-red);font-size:14px">${u.load}%</b>
          </div>
          <div class="feed-meta" style="margin:4px 0 8px">
            <span>Open ${u.openCount}</span><span>근시일 잔여 ${u.remaining}h</span>${u.overdue ? `<span style="color:var(--c-red)">지연 ${u.overdue}</span>` : ''}
          </div>
          <div class="loadbar"><span style="left:0;width:${Math.min(100, (u.load / 160) * 100)}%;background:var(--c-red)"></span><i class="cap" style="left:${(100 / 160) * 100}%"></i></div>
        </div>
      </div>`).join('')}</div>` : '<div class="empty">과부하 인원 없음 👍</div>',
    });

    const dueSoonPanel = UI.panel({
      title: 'Due Soon · 임박 (7일)', sub: `${dueSoon.length}건`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Project</th><th>Status</th><th>Owner</th><th class="num">D-day</th></tr></thead>
        <tbody>${dueSoon.map((w) => wpRow(w, (w, due) => `<td class="num"><span class="kpi-delta ${due.cls}" style="font-size:11px">${due.txt}</span></td>`)).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:300px;overflow-y:auto',
    });

    const budgetPanel = UI.panel({
      title: 'Over Budget · 공수 초과', sub: `예상 대비 110%+ · ${overBudget.length}건`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Owner</th><th class="num">Est</th><th class="num">Spent</th><th class="num">초과율</th></tr></thead>
        <tbody>${overBudget.map((w) => `<tr>
          <td>${UI.wpLink(w)}</td>
          <td class="strong clamp">${w.subject}</td>
          <td>${UI.avatar(D.U[w.assigneeId])}</td>
          <td class="num">${w.estimatedHours}h</td>
          <td class="num" style="color:var(--c-red)">${w.spentHours}h</td>
          <td class="num" style="color:var(--c-red)">+${Math.round((w.spentHours / w.estimatedHours - 1) * 100)}%</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:300px;overflow-y:auto',
    });

    return `
      <div class="section-row"><h2>Risks · 지연/리스크 알림</h2><span class="muted mono" style="font-size:11px">우선 조치 대상</span></div>
      ${kpiRow}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-8">${overduePanel}</div>
        <div class="col-4">${overloadPanel}</div>
        <div class="col-7">${dueSoonPanel}</div>
        <div class="col-5">${budgetPanel}</div>
      </div>`;
  };
})();
