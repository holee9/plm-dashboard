/* =============================================================================
   View: Board — 칸반 (WP 상태 보드)
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.board = function (state) {
    const D = window.DB, UI = window.UI;
    const hp = new Set(state.hiddenProjects || []);
    const fProj = state.boardProject || 'all';
    const fUser = state.boardUser || 'all';

    let wps = D.WORK_PACKAGES.filter((w) => !hp.has(w.projectId));
    if (fProj !== 'all') wps = wps.filter((w) => w.projectId === +fProj);
    if (fUser !== 'all') wps = wps.filter((w) => w.assigneeId === +fUser);

    const selProj = `<select class="board-select" data-board-project>
      <option value="all" ${fProj === 'all' ? 'selected' : ''}>All Projects · 전체 과제</option>
      ${D.PROJECTS.filter((p) => !hp.has(p.id)).map((p) => `<option value="${p.id}" ${+fProj === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
    </select>`;
    const selUser = `<select class="board-select" data-board-user>
      <option value="all" ${fUser === 'all' ? 'selected' : ''}>All Members · 전체 담당자</option>
      ${D.USERS.filter((u) => !u.isGroup && !u.isObserver).map((u) => `<option value="${u.id}" ${+fUser === u.id ? 'selected' : ''}>${u.name} · ${u.role}</option>`).join('')}
    </select>`;

    const filterBar = `<div style="display:flex;align-items:center;gap:10px;margin:var(--grid-1) 0">
      ${selProj}${selUser}
      <span class="muted mono" style="font-size:11.5px">${wps.length} work packages</span>
      <div class="spacer" style="flex:1"></div>
      <span class="legend"><span class="legend-item"><i class="dot" style="background:var(--c-red)"></i>마감 초과</span></span>
    </div>`;

    const cols = D.BOARD_COLS.map((col) => {
      const items = wps.filter((w) => col.statusIds.includes(w.statusId))
        .sort((a, b) => a._due - b._due);
      const headStatus = col.statusIds.length > 0 ? D.S[col.statusIds[0]] : null;
      const headColor = headStatus ? headStatus.color : 'var(--text-faint)';
      const CAP = 30;
      const shown = items.slice(0, CAP);
      const cards = shown.map((w) => {
        const due = UI.dueLabel(w.dueDate);
        const overdue = D.isOverdue(w);
        return `<div class="card ${overdue ? 'overdue' : ''}">
          <div class="card-top">${UI.priorityDot(w.priorityId)}<span class="card-id">#${w.id}</span>
            <span class="tag" style="margin-left:auto">${D.T[w.typeId].glyph} ${D.T[w.typeId].name}</span></div>
          <div class="card-subject">${w.subject}</div>
          <div class="card-foot">
            ${UI.avatar(D.U[w.assigneeId])}
            <span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${D.P[w.projectId].name}</span>
            <span class="spacer"></span>
            ${col.key === 'closed' ? '<span class="kpi-delta up" style="font-size:11px">완료</span>'
              : `<span class="kpi-delta ${due.cls}" style="font-size:11px">${due.txt}</span>`}
          </div>
          <div class="pbar thin" style="margin-top:8px"><span style="width:${w.percentDone}%"></span></div>
        </div>`;
      }).join('') || '<div class="empty" style="padding:16px">–</div>';
      const more = items.length > CAP ? `<div class="muted mono" style="text-align:center;font-size:11px;padding:8px">+${items.length - CAP} more</div>` : '';
      return `<div class="board-col">
        <div class="board-col-head"><i class="dot" style="background:${headColor}"></i><b>${col.label}</b><span class="cnt">${items.length}</span></div>
        <div class="board-cards">${cards}${more}</div>
      </div>`;
    }).join('');

    return `
      <div class="section-row"><h2>Board · WP 상태 보드</h2><span class="muted mono" style="font-size:11px">칸반 · New → Done</span></div>
      ${filterBar}
      <div class="board">${cols}</div>`;
  };
})();
