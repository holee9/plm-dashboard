/* =============================================================================
   View: Risks — 지연/리스크 알림
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.risks = function () {
    const D = window.DB, UI = window.UI;
    const wps = D.WORK_PACKAGES;

    const overdue = wps.filter(D.isOverdue).sort((a, b) => a._due - b._due);
    const dueSoon = wps.filter((w) => D.dueWithin(w, 7)).sort((a, b) => a._due - b._due);
    const onHold = wps.filter((w) => D.S[w.statusId].cat === 'onHold');
    const overBudget = wps.filter((w) => D.isOpen(w) && w.estimatedHours > 0 && w.spentHours > w.estimatedHours * 1.1)
      .sort((a, b) => (b.spentHours / b.estimatedHours) - (a.spentHours / a.estimatedHours));
    const util = D.userUtilization();
    const overloaded = util.filter((u) => u.load > 100);

    const kpiRow = `<div class="kpi-row" style="grid-template-columns:repeat(5,1fr)">
      ${UI.kpi({ label: 'OVERDUE', value: overdue.length, tone: 'red', foot: `<span class="muted">마감 초과</span>` })}
      ${UI.kpi({ label: 'DUE 7D', value: dueSoon.length, tone: 'amber', foot: `<span class="muted">임박</span>` })}
      ${UI.kpi({ label: 'ON HOLD', value: onHold.length, tone: 'amber', foot: `<span class="muted">보류</span>` })}
      ${UI.kpi({ label: 'OVER BUDGET', value: overBudget.length, tone: 'red', foot: `<span class="muted">공수 초과</span>` })}
      ${UI.kpi({ label: 'OVERLOADED', value: overloaded.length, tone: 'red', foot: `<span class="muted">인원 과부하</span>` })}
    </div>`;

    const wpRow = (w, extra) => {
      const due = UI.dueLabel(w.dueDate);
      return `<tr>
        <td class="mono" style="color:var(--text-faint)">#${w.id}</td>
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
        <tbody>${overdue.slice(0, 12).map((w) => wpRow(w, (w) => `<td class="num mono" style="font-size:11px">${UI.fmtDate(w.dueDate)}</td><td class="num" style="color:var(--c-red)">${-UI.daysFromToday(w.dueDate)}d</td>`)).join('') || '<tr><td colspan="7"><div class="empty">없음 🎉</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    const overloadPanel = UI.panel({
      title: 'Overloaded Members · 과부하 인원', sub: `근시일 부하 100% 초과 ${overloaded.length}명`,
      body: overloaded.length ? `<div class="feed">${overloaded.map((u) => `<div class="feed-item">
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
        <tbody>${dueSoon.slice(0, 10).map((w) => wpRow(w, (w, due) => `<td class="num"><span class="kpi-delta ${due.cls}" style="font-size:11px">${due.txt}</span></td>`)).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    const budgetPanel = UI.panel({
      title: 'Over Budget · 공수 초과', sub: `예상 대비 110%+ · ${overBudget.length}건`,
      body: `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Owner</th><th class="num">Est</th><th class="num">Spent</th><th class="num">초과율</th></tr></thead>
        <tbody>${overBudget.slice(0, 10).map((w) => `<tr>
          <td class="mono" style="color:var(--text-faint)">#${w.id}</td>
          <td class="strong clamp">${w.subject}</td>
          <td>${UI.avatar(D.U[w.assigneeId])}</td>
          <td class="num">${w.estimatedHours}h</td>
          <td class="num" style="color:var(--c-red)">${w.spentHours}h</td>
          <td class="num" style="color:var(--c-red)">+${Math.round((w.spentHours / w.estimatedHours - 1) * 100)}%</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    return `
      <div class="section-row"><h2>Risks · 지연/리스크 알림</h2><span class="muted mono" style="font-size:11px">우선 조치 대상</span></div>
      ${kpiRow}
      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-7">${overduePanel}</div>
        <div class="col-5">${overloadPanel}</div>
        <div class="col-6">${dueSoonPanel}</div>
        <div class="col-6">${budgetPanel}</div>
      </div>`;
  };
})();
