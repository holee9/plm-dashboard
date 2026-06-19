/* =============================================================================
   View: Risks — 지연/리스크 알림
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const RISK_KPI_ALL = [
    { key: 'overdue',    label: 'OVERDUE',    hint: '마감일을 초과한 Open WP 수입니다. 즉각 조치 필요. WP에 마감일(Due Date)이 설정된 경우만 집계됩니다.' },
    { key: 'dueSoon',   label: 'DUE 7D',     hint: '오늘부터 7일 이내에 마감 예정인 Open WP 수입니다. WP에 마감일(Due Date)이 설정된 경우만 집계됩니다.' },
    { key: 'unassigned',label: 'UNASSIGNED', hint: '담당자가 없는 Open WP 수입니다. 지연 WP 중 담당자 없는 건은 조치 불가 상태입니다. OP에서 담당자(Assignee)를 지정해 주세요.' },
    { key: 'onHold',    label: 'ON HOLD',    hint: '보류 상태 WP 수입니다. OP에서 상태를 보류로 변경하면 자동 반영됩니다.' },
    { key: 'overBudget',label: 'OVER BUDGET',hint: '예상 공수 대비 실제 투입이 110% 초과된 WP 수입니다. 활성화하려면 OP에서 예상 시간(Estimated Hours) 입력 및 시간 기록(Time Entry) 등록이 필요합니다.' },
    { key: 'overloaded',label: 'OVERLOADED', hint: '근시일(3주) 기준 가동률 100% 초과 인원 수입니다. 활성화하려면 OP에서 담당자(Assignee) 지정 및 예상 시간(Estimated Hours) 입력이 필요합니다.' },
  ];
  const RISK_DEFAULT_KEYS = ['overdue', 'dueSoon', 'unassigned', 'onHold', 'overBudget', 'overloaded'];

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

    // --- 데이터 계산 ---
    const overdue = wps.filter(D.isOverdue).sort((a, b) => a._due - b._due);
    const dueSoon = wps.filter((w) => D.dueWithin(w, 7)).sort((a, b) => a._due - b._due);
    const onHold = wps.filter((w) => D.S[w.statusId].cat === 'onHold')
      .sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
    const unassigned = wps.filter((w) => D.isOpen(w) && !w.assigneeId)
      .sort((a, b) => {
        const aR = D.isOverdue(a) ? 0 : D.dueWithin(a, 7) ? 1 : 2;
        const bR = D.isOverdue(b) ? 0 : D.dueWithin(b, 7) ? 1 : 2;
        return aR !== bR ? aR - bR : ((a._due || 1e15) - (b._due || 1e15));
      });
    const noDueDate = wps.filter((w) => D.isOpen(w) && !w.dueDate);
    const stale14 = wps.filter((w) =>
      D.isOpen(w) && w.updatedAt && (D.TODAY - new Date(w.updatedAt)) / 86400000 > 14
    ).sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
    const overBudget = wps.filter((w) => D.isOpen(w) && w.estimatedHours > 0 && w.spentHours > w.estimatedHours * 1.1)
      .sort((a, b) => (b.spentHours / b.estimatedHours) - (a.spentHours / a.estimatedHours));
    const util = D.userUtilization();
    const overloaded = util.filter((u) => u.load > 100);

    const hasEstimate = wps.some((w) => w.estimatedHours > 0);
    const hasTimeEntry = wps.some((w) => w.spentHours > 0);
    const estimateCount = wps.filter((w) => w.estimatedHours > 0).length;

    // --- 과제별 리스크 매트릭스 ---
    const projMatrix = D.PROJECTS.map((p) => {
      const pw = wps.filter((w) => w.projectId === p.id);
      return {
        p,
        overdue:    pw.filter(D.isOverdue).length,
        dueSoon:    pw.filter((w) => D.dueWithin(w, 7)).length,
        unassigned: pw.filter((w) => D.isOpen(w) && !w.assigneeId).length,
        onHold:     pw.filter((w) => D.S[w.statusId].cat === 'onHold').length,
        noDue:      pw.filter((w) => D.isOpen(w) && !w.dueDate).length,
        stale:      pw.filter((w) => D.isOpen(w) && w.updatedAt && (D.TODAY - new Date(w.updatedAt)) / 86400000 > 14).length,
      };
    }).filter((r) => r.overdue + r.dueSoon + r.unassigned + r.onHold > 0)
      .sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon);

    // --- KPI ---
    const kpiEdit = !!state.riskKpiEditMode;
    const activeSections = state.riskKpiSections || RISK_DEFAULT_KEYS;
    const hiddenDefs = RISK_KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const kpiVals = {
      overdue:    { v: overdue.length,    u: '', tone: overdue.length > 0 ? 'red' : '',         foot: '<span class="muted">마감 초과</span>' },
      dueSoon:    { v: dueSoon.length,    u: '', tone: dueSoon.length > 0 ? 'amber' : '',       foot: '<span class="muted">임박</span>' },
      unassigned: { v: unassigned.length, u: '', tone: unassigned.length > 0 ? 'amber' : '',   foot: '<span class="muted">미배정</span>' },
      onHold:     { v: onHold.length,     u: '', tone: onHold.length > 0 ? 'amber' : '',       foot: '<span class="muted">보류</span>' },
      overBudget: (!hasEstimate || !hasTimeEntry)
        ? { v: '–', u: '', tone: '', foot: '<span style="color:var(--c-amber);font-size:10px;font-weight:600">OP 입력 필요 ↑</span>' }
        : { v: overBudget.length, u: '', tone: overBudget.length > 0 ? 'red' : '', foot: '<span class="muted">공수 초과</span>' },
      overloaded: !hasEstimate
        ? { v: '–', u: '', tone: '', foot: '<span style="color:var(--c-amber);font-size:10px;font-weight:600">OP 입력 필요 ↑</span>' }
        : { v: overloaded.length, u: '', tone: overloaded.length > 0 ? 'red' : '', foot: '<span class="muted">인원 과부하</span>' },
    };
    const kpiRow = renderKpiStrip(UI, kpiVals, activeSections, hiddenDefs, kpiEdit);

    // --- 헬퍼 ---
    const INFO_TIP = (msg) =>
      `<span data-tip="${msg}" style="cursor:help;color:var(--text-faint);font-size:12px;margin-left:4px">ⓘ</span>`;
    const OP_NOTICE = (lines) =>
      `<div style="margin:8px;padding:10px 14px;background:rgba(245,158,11,.1);border-radius:6px;border-left:3px solid var(--c-amber)">
        <div style="font-size:11.5px;font-weight:600;color:var(--c-amber);margin-bottom:6px">📋 OpenProject 입력 필요</div>
        <div style="font-size:11px;color:var(--text-faint);line-height:1.8">${lines}</div>
      </div>`;
    const N = (v, style = '') =>
      v > 0 ? `<span style="font-weight:600;${style}">${v}</span>` : `<span class="muted" style="font-size:11px">–</span>`;
    const staleDays = (w) => w.updatedAt ? Math.floor((D.TODAY - new Date(w.updatedAt)) / 86400000) : null;

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

    // --- 1. 과제별 리스크 매트릭스 ---
    const matrixPanel = UI.panel({
      title: '과제별 리스크 현황',
      sub: `${projMatrix.length}개 과제에 리스크 발생`,
      tools: INFO_TIP('과제별 리스크 건수 요약입니다. 지연·임박·미배정·보류 중 한 건이라도 있는 과제만 표시됩니다. 헤더를 마우스 오버하면 설명을 확인할 수 있습니다.'),
      body: projMatrix.length
        ? `<table class="tbl" style="table-layout:fixed;width:100%">
          <thead><tr>
            <th>과제명</th>
            <th class="num" style="width:68px" data-tip="마감일을 초과한 Open WP 수">지연</th>
            <th class="num" style="width:72px" data-tip="7일 이내 마감 예정 Open WP 수">임박(7d)</th>
            <th class="num" style="width:72px" data-tip="담당자가 없는 Open WP 수">미배정</th>
            <th class="num" style="width:56px" data-tip="보류 상태 WP 수">보류</th>
            <th class="num" style="width:76px" data-tip="마감일이 없는 Open WP 수 — 모든 리스크 필터 사각지대">마감미설정</th>
            <th class="num" style="width:68px" data-tip="14일 이상 업데이트 없는 Open WP 수">방치(14d+)</th>
          </tr></thead>
          <tbody>${projMatrix.map((r) => `<tr>
            <td class="strong">${r.p.name}</td>
            <td class="num">${N(r.overdue, 'color:var(--c-red)')}</td>
            <td class="num">${N(r.dueSoon, 'color:var(--c-amber)')}</td>
            <td class="num">${N(r.unassigned, 'color:var(--c-amber)')}</td>
            <td class="num">${N(r.onHold)}</td>
            <td class="num">${N(r.noDue)}</td>
            <td class="num">${N(r.stale)}</td>
          </tr>`).join('')}</tbody></table>`
        : '<div class="empty">모든 과제 리스크 없음 🎉</div>',
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    // --- 2. Overdue (진행률 추가) ---
    const overduePanel = UI.panel({
      title: 'Overdue · 마감 초과',
      sub: `${overdue.length}건 — 즉시 조치 필요`,
      tools: `${INFO_TIP('마감일(Due Date)을 지난 Open WP 목록입니다. 마감일이 없는 WP는 집계되지 않습니다. 진행률(%) 0은 빨간색으로 표시됩니다.')}<span class="badge" style="background:rgba(239,68,68,.16);color:#FCA5A5;margin-left:6px">${overdue.length} CRITICAL</span>`,
      body: `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
          <th style="width:72px">ID</th>
          <th>Subject</th>
          <th style="width:130px">Project</th>
          <th style="width:100px">Status</th>
          <th style="width:44px">Owner</th>
          <th class="num" style="width:76px">Due</th>
          <th class="num" style="width:48px">초과</th>
          <th class="num" style="width:44px">%</th>
        </tr></thead>
        <tbody>${overdue.map((w) => wpRow(w, (w) => {
          const pct = w.percentDone;
          const pctStyle = pct === 0 ? 'color:var(--c-red);font-weight:600' : pct < 50 ? 'color:var(--c-amber)' : '';
          return `<td class="num mono" style="font-size:11px">${UI.fmtDate(w.dueDate)}</td>
            <td class="num" style="color:var(--c-red)">${w.dueDate ? `${-UI.daysFromToday(w.dueDate)}d` : '–'}</td>
            <td class="num" style="${pctStyle}">${pct}%</td>`;
        })).join('') || '<tr><td colspan="8"><div class="empty">없음 🎉</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:300px;overflow-y:auto',
    });

    // --- 3. DueSoon (진행률 추가) ---
    const dueSoonPanel = UI.panel({
      title: 'Due Soon · 임박 (7일)',
      sub: `${dueSoon.length}건 — 오늘부터 7일 이내 마감`,
      tools: INFO_TIP('7일 이내 마감 예정인 Open WP입니다. 진행률(%)이 낮을수록 미완료 리스크가 높습니다.'),
      body: `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
          <th style="width:72px">ID</th>
          <th>Subject</th>
          <th style="width:120px">Project</th>
          <th style="width:44px">Owner</th>
          <th class="num" style="width:52px">D-day</th>
          <th class="num" style="width:44px">%</th>
        </tr></thead>
        <tbody>${dueSoon.map((w) => {
          const due = UI.dueLabel(w.dueDate);
          const pct = w.percentDone;
          const pctStyle = pct === 0 ? 'color:var(--c-red);font-weight:600' : pct < 50 ? 'color:var(--c-amber)' : '';
          return `<tr>
            <td>${UI.wpLink(w)}</td>
            <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
            <td class="muted" style="font-size:11.5px">${D.P[w.projectId].name}</td>
            <td>${UI.avatar(D.U[w.assigneeId])}</td>
            <td class="num"><span class="kpi-delta ${due.cls}" style="font-size:11px">${due.txt}</span></td>
            <td class="num" style="${pctStyle}">${pct}%</td>
          </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:280px;overflow-y:auto',
    });

    // --- 4. ON HOLD 상세 (방치일 포함) ---
    const onHoldPanel = UI.panel({
      title: 'On Hold · 보류',
      sub: `${onHold.length}건 — 방치 기간 순`,
      tools: INFO_TIP('보류 상태 WP 목록입니다. 방치(마지막 업데이트)가 21일 이상이면 빨간색으로 표시됩니다. 취소 또는 재개 여부를 검토해 주세요.'),
      body: onHold.length
        ? `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
            <th style="width:72px">ID</th>
            <th>Subject</th>
            <th style="width:120px">Project</th>
            <th style="width:44px">Owner</th>
            <th class="num" style="width:60px" data-tip="마지막 업데이트로부터 경과일">방치</th>
            <th class="num" style="width:76px">Due</th>
          </tr></thead>
          <tbody>${onHold.map((w) => {
            const sd = staleDays(w);
            const sdStyle = sd > 21 ? 'color:var(--c-red);font-weight:600' : sd > 7 ? 'color:var(--c-amber)' : '';
            return `<tr>
              <td>${UI.wpLink(w)}</td>
              <td class="strong clamp">${w.subject}</td>
              <td class="muted" style="font-size:11.5px">${D.P[w.projectId].name}</td>
              <td>${UI.avatar(D.U[w.assigneeId])}</td>
              <td class="num" style="${sdStyle}">${sd !== null ? `${sd}d` : '–'}</td>
              <td class="num mono" style="font-size:11px">${w.dueDate ? UI.fmtDate(w.dueDate) : '–'}</td>
            </tr>`;
          }).join('')}</tbody></table>`
        : '<div class="empty">보류 없음 👍</div>',
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:280px;overflow-y:auto',
    });

    // --- 5. 미배정 WP --- (Zone A: unassigned max-height = overdue와 동일 300px)
    const overdueUnassigned = unassigned.filter(D.isOverdue).length;
    const unassignedPanel = UI.panel({
      title: '미배정 · Unassigned Open WP',
      sub: `${unassigned.length}건 — 담당자 없음 (지연 우선 정렬)`,
      tools: `${INFO_TIP('담당자가 지정되지 않은 Open WP입니다. 지연 중인 미배정 WP는 조치 불가 상태이므로 즉시 담당자를 지정해 주세요. 빨간 행 = Overdue, 노란 행 = DueSoon.')}${overdueUnassigned > 0 ? `<span class="badge" style="background:rgba(239,68,68,.16);color:#FCA5A5;margin-left:6px">${overdueUnassigned} OVERDUE</span>` : ''}`,
      body: unassigned.length
        ? `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
            <th style="width:72px">ID</th>
            <th>Subject</th>
            <th style="width:130px">Project</th>
            <th style="width:100px">Status</th>
            <th class="num" style="width:76px">Due</th>
            <th class="num" style="width:44px">%</th>
          </tr></thead>
          <tbody>${unassigned.map((w) => {
            const isOvd = D.isOverdue(w);
            const isSoon = D.dueWithin(w, 7);
            const rowStyle = isOvd ? 'background:rgba(239,68,68,.05)' : isSoon ? 'background:rgba(245,158,11,.05)' : '';
            const dueStyle = isOvd ? 'color:var(--c-red)' : isSoon ? 'color:var(--c-amber)' : '';
            return `<tr style="${rowStyle}">
              <td>${UI.wpLink(w)}</td>
              <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
              <td class="muted" style="font-size:11.5px">${D.P[w.projectId].name}</td>
              <td>${UI.statusChip(w.statusId)}</td>
              <td class="num mono" style="font-size:11px;${dueStyle}">${w.dueDate ? UI.fmtDate(w.dueDate) : '–'}</td>
              <td class="num">${w.percentDone}%</td>
            </tr>`;
          }).join('')}</tbody></table>`
        : '<div class="empty">미배정 없음 👍</div>',
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:300px;overflow-y:auto',
    });

    // --- 6. 마감일 미설정 --- (Zone B: 280px로 dueSoon/onHold와 통일)
    const noDueDatePanel = UI.panel({
      title: '마감일 미설정',
      sub: `${noDueDate.length}건 — 모든 리스크 필터 사각지대`,
      tools: INFO_TIP('마감일(Due Date)이 없는 Open WP는 지연/임박 등 모든 리스크 지표에서 제외됩니다. OP에서 마감일을 설정해 주세요.'),
      body: noDueDate.length
        ? `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
            <th style="width:72px">ID</th>
            <th>Subject</th>
            <th style="width:44px">Owner</th>
            <th style="width:100px">Project</th>
          </tr></thead>
          <tbody>${noDueDate.slice(0, 80).map((w) => `<tr>
            <td>${UI.wpLink(w)}</td>
            <td class="strong clamp">${UI.priorityDot(w.priorityId)} ${w.subject}</td>
            <td>${UI.avatar(D.U[w.assigneeId])}</td>
            <td class="muted" style="font-size:11px">${D.P[w.projectId].name}</td>
          </tr>`).join('')}</tbody></table>`
        : '<div class="empty">모든 Open WP에 마감일 설정됨 👍</div>',
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:280px;overflow-y:auto',
    });

    // --- 7. 방치 WP (14일 이상 미업데이트) ---
    const stalePanel = stale14.length ? UI.panel({
      title: '방치 WP · 14일 이상 미업데이트',
      sub: `${stale14.length}건 — 진행 여부 확인 필요`,
      tools: INFO_TIP('마지막 업데이트로부터 14일 이상 경과한 Open WP입니다. 실제로 진행 중인지, 중단됐는지 확인이 필요합니다.'),
      body: `<table class="tbl" style="table-layout:fixed;width:100%"><thead><tr>
          <th style="width:72px">ID</th>
          <th>Subject</th>
          <th style="width:130px">Project</th>
          <th style="width:44px">Owner</th>
          <th class="num" style="width:60px">방치일</th>
          <th class="num" style="width:76px">Due</th>
        </tr></thead>
        <tbody>${stale14.map((w) => {
          const sd = staleDays(w);
          const sdStyle = sd > 30 ? 'color:var(--c-red);font-weight:600' : 'color:var(--c-amber)';
          return `<tr>
            <td>${UI.wpLink(w)}</td>
            <td class="strong clamp">${w.subject}</td>
            <td class="muted" style="font-size:11.5px">${D.P[w.projectId].name}</td>
            <td>${UI.avatar(D.U[w.assigneeId])}</td>
            <td class="num" style="${sdStyle}">${sd}d</td>
            <td class="num mono" style="font-size:11px">${w.dueDate ? UI.fmtDate(w.dueDate) : '–'}</td>
          </tr>`;
        }).join('')}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:260px;overflow-y:auto',
    }) : null;

    // --- 8. Over Budget ---
    const budgetNotice = OP_NOTICE(
      `· <b>예상 시간(Estimated Hours)</b>: Work Package 상세 페이지 우측 패널 → "예상 시간" 항목 입력<br>` +
      `· <b>시간 기록(Time Entry)</b>: Work Package 상세 → "시간 기록" 버튼 → 날짜·시간·Activity 입력 후 저장<br><br>` +
      `현재 예상 시간 입력된 WP: <b>${estimateCount}건</b> / 시간 기록 입력된 WP: <b>${wps.filter((w) => w.spentHours > 0).length}건</b>`
    );
    const budgetPanel = UI.panel({
      title: 'Over Budget · 공수 초과',
      sub: `예상 대비 110%+ · ${overBudget.length}건`,
      tools: INFO_TIP('예상 시간(Estimated Hours) 대비 실제 투입 시간(Time Entry)이 110% 이상인 WP입니다. OP에서 두 항목을 입력해야 활성화됩니다.'),
      body: (!hasEstimate || !hasTimeEntry)
        ? budgetNotice
        : `<table class="tbl"><thead><tr><th>ID</th><th>Subject</th><th>Owner</th><th class="num">Est</th><th class="num">Spent</th><th class="num">초과율</th></tr></thead>
          <tbody>${overBudget.map((w) => `<tr>
            <td>${UI.wpLink(w)}</td>
            <td class="strong clamp">${w.subject}</td>
            <td>${UI.avatar(D.U[w.assigneeId])}</td>
            <td class="num">${w.estimatedHours}h</td>
            <td class="num" style="color:var(--c-red)">${w.spentHours}h</td>
            <td class="num" style="color:var(--c-red)">+${Math.round((w.spentHours / w.estimatedHours - 1) * 100)}%</td>
          </tr>`).join('') || '<tr><td colspan="6"><div class="empty">없음</div></td></tr>'}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto;max-height:280px;overflow-y:auto',
    });

    // --- 9. Overloaded ---
    const overloadNotice = OP_NOTICE(
      `· <b>담당자(Assignee)</b>: Work Package 상세 → 우측 패널 "담당자" 항목에 담당자 지정<br>` +
      `· <b>예상 시간(Estimated Hours)</b>: Work Package 상세 → "예상 시간" 항목 입력<br><br>` +
      `담당자별 Open WP 예상 시간을 합산해 3주 기준 가동률을 계산합니다.<br>` +
      `현재 담당자 지정된 Open WP: <b>${wps.filter((w) => D.isOpen(w) && w.assigneeId).length}건</b> / 예상 시간 입력된 WP: <b>${estimateCount}건</b>`
    );
    const overloadPanel = UI.panel({
      title: 'Overloaded Members · 과부하 인원',
      sub: `근시일 부하 100% 초과 ${overloaded.length}명`,
      tools: INFO_TIP('담당자별 예상 잔여 공수를 3주 근무 용량(capacityPerWeek×3)으로 나눈 가동률이 100% 초과인 인원입니다. OP에서 담당자와 예상 시간을 입력해야 활성화됩니다.'),
      body: !hasEstimate ? overloadNotice : overloaded.length
        ? `<div class="feed" style="max-height:300px;overflow-y:auto">${overloaded.map((u) => `<div class="feed-item">
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
        </div>`).join('')}</div>`
        : '<div class="empty">과부하 인원 없음</div>',
    });

    const zoneLabel = (txt) =>
      `<div style="margin-top:calc(var(--grid-1)*1.4);margin-bottom:calc(var(--grid-1)*0.3);display:flex;align-items:center;gap:10px">
        <span style="font-size:10.5px;font-weight:700;letter-spacing:.08em;color:var(--text-faint);text-transform:uppercase">${txt}</span>
        <div style="flex:1;height:1px;background:var(--border)"></div>
      </div>`;

    const zoneC = stalePanel
      ? `<div class="grid" style="margin-top:var(--grid-1)">
           <div class="col-12">${stalePanel}</div>
         </div>
         <div class="grid" style="margin-top:var(--grid-1)">
           <div class="col-6">${budgetPanel}</div>
           <div class="col-6">${overloadPanel}</div>
         </div>`
      : `<div class="grid" style="margin-top:var(--grid-1)">
           <div class="col-6">${budgetPanel}</div>
           <div class="col-6">${overloadPanel}</div>
         </div>`;

    return `
      <div class="section-row"><h2>Risks · 지연/리스크 알림</h2><span class="muted mono" style="font-size:11px">우선 조치 대상</span></div>
      ${kpiRow}

      <div class="grid" style="margin-top:var(--grid-1)">
        <div class="col-12">${matrixPanel}</div>
      </div>

      ${zoneLabel('Zone A — 즉각 조치')}
      <div class="grid">
        <div class="col-6">${overduePanel}</div>
        <div class="col-6">${unassignedPanel}</div>
      </div>

      ${zoneLabel('Zone B — 주의 모니터링')}
      <div class="grid">
        <div class="col-4">${dueSoonPanel}</div>
        <div class="col-4">${onHoldPanel}</div>
        <div class="col-4">${noDueDatePanel}</div>
      </div>

      ${zoneLabel('Zone C — 방치 · 공수 분석')}
      ${zoneC}`;
  };
})();
