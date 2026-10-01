/* ============================================================
   PLM Dashboard — People view (담당자)
   Per assignee: open work, overdue, on hold, due this week, projects.
   Scope = the same work packages every other view uses (D.WORK_PACKAGES,
   management projects / samples / goals already excluded by the adapter);
   service accounts, observers and locked users are not listed.
   Replaces the old Resources view — time/budget metrics are not entered in
   OP here, so they are not shown.
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.Views.people = function (state) {
    const D = window.DB, UI = window.UI;
    const open = D.WORK_PACKAGES.filter(D.isOpenWork);
    const weekEnd = D.addDays(D.TODAY, 7);
    const onHold = (w) => /hold/i.test(D.S[w.statusId]?.name || '');
    const people = D.USERS.filter((u) => !u.isGroup && !u.isBot && !u.isObserver);
    const rows = people.map((u) => {
      const mine = open.filter((w) => w.assigneeId === u.id);
      const projs = [...new Set(mine.map((w) => D.P[w.projectId]?.name).filter(Boolean))];
      return { u, open: mine.length, overdue: mine.filter(D.isOverdue).length, hold: mine.filter(onHold).length,
        week: mine.filter((w) => w._due && w._due >= D.TODAY && w._due <= weekEnd).length, noDue: mine.filter((w) => !w._due).length, projs };
    }).filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open);
    const unassigned = open.filter((w) => !w.assigneeId);
    const head = `<div class="kpi-row kpi-strip" style="--kpi-cols:4">
      ${UI.kpi({ label: 'MEMBERS', value: rows.length, foot: '열린 일감이 있는 담당자' })}
      ${UI.kpi({ label: 'OPEN WORK', value: open.length, foot: '열린 업무 일감' })}
      ${UI.kpi({ label: 'UNASSIGNED', value: unassigned.length, tone: unassigned.length ? 'amber' : '', foot: '담당자 없음 — 리더 결정 필요' })}
      ${UI.kpi({ label: 'OVERDUE', value: open.filter(D.isOverdue).length, tone: open.some(D.isOverdue) ? 'red' : '', foot: '마감 지남 (담당자 합계)' })}
    </div>`;
    const table = `<table class="tbl"><thead><tr><th>담당자</th><th>열린</th><th>마감 지남</th><th>보류</th><th>이번 주 마감</th><th>마감일 없음</th><th>담당 과제</th></tr></thead><tbody>
      ${rows.map((r) => `<tr>
        <td>${UI.avatar(r.u)} <b>${esc(r.u.name)}</b> <span class="muted" style="font-size:11px">${esc(r.u.role || '')}</span></td>
        <td class="num">${r.open}</td>
        <td class="num" style="${r.overdue ? 'color:var(--c-red);font-weight:600' : ''}">${r.overdue || '–'}</td>
        <td class="num">${r.hold || '–'}</td>
        <td class="num">${r.week || '–'}</td>
        <td class="num" style="${r.noDue ? 'color:var(--c-amber)' : ''}">${r.noDue || '–'}</td>
        <td class="muted" style="font-size:11.5px">${r.projs.map(esc).join(', ')}</td>
      </tr>`).join('')}
    </tbody></table>`;
    const unassignedPanel = UI.panel({
      title: '담당자 없는 열린 일감', sub: `${unassigned.length}건 — 주간 운영 리뷰 "담당자 없음"과 같은 목록`,
      body: unassigned.length ? `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>과제</th><th>상태</th><th>마감</th></tr></thead><tbody>
        ${unassigned.sort((a, b) => (a._due || 9e15) - (b._due || 9e15)).slice(0, 60).map((w) => `<tr><td>${UI.wpLink(w)}</td><td>${esc(w.subject)}</td><td>${esc(D.P[w.projectId]?.name || '')}</td><td>${UI.statusChip(w.statusId)}</td><td>${UI.dueLabel(w.dueDate)}</td></tr>`).join('')}
        </tbody></table>${unassigned.length > 60 ? `<div class="muted" style="padding:6px">외 ${unassigned.length - 60}건</div>` : ''}` : '<div class="empty">없음</div>',
    });
    return head + UI.panel({ title: '담당자별 열린 일감', sub: '마감 지남 많은 순 · 시간·예산 지표는 OP에 입력되지 않아 표시하지 않음', body: table }) + unassignedPanel;
  };
})();
