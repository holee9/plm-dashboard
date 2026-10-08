/* ============================================================
   PLM Dashboard — 대시보드 (first screen, #94)
   One screen for executives and managers, read top to bottom:
     1. data basis (when, how trustworthy)          insights.json metrics.all
     2. Q1–Q5 strip                                  ExecCore.strip
     3. product line: status → why → this week's decision   ExecCore.lineRow
     4. this week's work: due in 7 days (live OP) · decisions pending with days slipped (health.json)
        · long-running in-progress (insights.json flow)
     5. regulatory summary (ra.json)                 links to the RA screen
   Rules and numbers come from ExecCore (views/exec.js) so this screen never
   disagrees with the status screen it replaces. All input happens in OP.
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const DAY = 86400000;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /* ---- 1. data basis ---- */
  function basis(C, H, I) {
    const m = (I.metrics && I.metrics.all) || {};
    const upd = H.process_health ? Math.round(H.process_health.weekly_update_rate * 100) : null;
    const low = upd !== null && upd < 50;
    return `<div class="muted mono" data-home-basis style="font-size:11px;margin:0 0 var(--grid-1)">
      이 숫자의 바탕: 열린 일감 <b>${m.open ?? '–'}</b>건 · 마감일 입력 <b>${pct(m.with_due, m.open)}</b> · 담당 지정 <b>${pct(m.assigned, m.open)}</b> · 7일 내 갱신 <b>${upd === null ? '–' : upd + '%'}</b>
      ${low ? ' · ⚪ 갱신률이 50% 아래라 일정·부하 판단은 보류 표시' : ''} · 기준 ${C.esc(new Date(H.generated_at).toLocaleString('ko-KR'))}
    </div>`;
  }

  /* ---- 4a. due within 7 days — live OP work packages, same scope as Hermes (open work, no bulk month-end dates) ---- */
  function dueThisWeek(C, I) {
    const UI = window.UI, D = window.DB;
    const ident = {}; (I.product_lines || []).forEach((l) => l.projects.forEach((p) => { ident[p] = l.name; }));
    if (!D || !D.WORK_PACKAGES || !D.WORK_PACKAGES.length) return UI.panel({ title: '이번 주 마감', sub: 'OP 실시간', body: '<span class="muted" data-home-due="none">OP 데이터를 아직 받지 못했습니다</span>' });
    const rows = D.WORK_PACKAGES.filter((w) => D.dueWithin(w, 7)).sort((a, b) => a._due - b._due);
    const body = rows.length ? `<table class="tbl" data-home-due><thead><tr><th>마감</th><th>일감</th><th>제품군 / 과제</th><th>담당자</th><th>상태</th></tr></thead><tbody>
      ${rows.map((w) => { const p = D.P[w.projectId] || {}; const due = UI.dueLabel(w.dueDate); const line = ident[p.identifier];
        return `<tr data-home-duerow="${w.id}"><td><span class="kpi-delta ${due.cls}">${due.txt}</span> <span class="muted">${C.esc(w.dueDate.slice(5))}</span></td><td>${UI.wpLink(w)} ${C.esc(String(w.subject || '').slice(0, 40))}</td><td>${line ? `<b>${C.esc(line)}</b> / ` : ''}${C.esc(p.name || '')}</td><td>${C.esc((D.U[w.assigneeId] || {}).name || '담당자 없음')}</td><td>${C.esc((D.S[w.statusId] || {}).name || '')}</td></tr>`; }).join('')}</tbody></table>`
      : '<span class="muted" data-home-due="empty">이번 주 마감 일감 없음</span>';
    return UI.panel({ title: `이번 주 마감 ${rows.length}건`, sub: '오늘부터 7일 안 · 열린 일감 · 월말 일괄 날짜 제외 (Hermes와 같은 기준)', body, bodyStyle: 'max-height:360px;overflow-y:auto' });
  }

  /* ---- 4b. decisions pending, with days slipped — same selection as 이번 주 결정 TOP 5 but the whole list ---- */
  function decisionsPending(C, H, I) {
    const UI = window.UI;
    const NEED = ['overdue', 'missing_update', 'blocked_aging'];
    const crit = H.items.filter((i) => i.flags.some((f) => f === 'blocked_aging' || f === 'missing_update' || f === 'triage_overdue') || (!i.assignee && i.flags.some((f) => NEED.includes(f))));
    const slip = (i) => i.flags.includes('blocked_aging') ? C.days(C.today(), (i.blocked_since || C.today()).slice(0, 10))
      : i.flags.includes('missing_update') && i.due ? C.days(C.today(), i.due)
      : i.flags.includes('triage_overdue') ? C.days(C.today(), i.created) : (i.age_days ?? (I.items.find((x) => x.id === i.id) || {}).age_days ?? 0);
    const why = (i) => i.flags.includes('blocked_aging') ? '보류 장기화' : i.flags.includes('triage_overdue') ? '이슈 분류 지연' : i.flags.includes('missing_update') ? '마감 지남 후 갱신 없음' : '담당자 없는 예외';
    const ownerOf = (i) => { const id = (I.project_status.find((p) => p.project === i.project) || {}).identifier; const l = I.product_lines.find((x) => x.projects.includes(id)); return l ? l.owner : '–'; };
    const rows = crit.map((i) => ({ i, d: slip(i) })).sort((a, b) => b.d - a.d);
    const body = rows.length ? `<table class="tbl" data-home-decide><thead><tr><th>밀림</th><th>일감</th><th>왜</th><th>과제</th><th>담당자</th><th>결정 주체</th></tr></thead><tbody>
      ${rows.map(({ i, d }) => `<tr data-home-deciderow="${C.esc(i.display_id)}"><td class="num"><b>${d}</b>일</td><td>${C.wp(i)} ${C.esc(i.subject.slice(0, 40))}</td><td style="font-size:12px">${why(i)}</td><td>${C.esc(i.project)}</td><td>${C.esc(i.assignee || '없음')}</td><td><b>${C.esc(ownerOf(i))}</b></td></tr>`).join('')}</tbody></table>`
      : '<span class="muted" data-home-decide="empty">결정 필요 없음</span>';
    return UI.panel({ title: `결정 필요 ${rows.length}건`, sub: `밀린 일수 순 · 결정 시한 ${C.nextMeeting()} · 결정은 OP에서 담당자·마감일을 고치면 기록`, body, bodyStyle: 'max-height:360px;overflow-y:auto' });
  }

  /* ---- 4c. long-running in-progress / in-review work ---- */
  function longRunning(C, I) {
    const UI = window.UI;
    const all = (I.flow && I.flow.open_items || []).filter((i) => i.status !== 'On Hold' && i.start_days != null).sort((a, b) => b.start_days - a.start_days);
    const top = all.slice(0, 8);
    const body = top.length ? `<table class="tbl" data-home-long><thead><tr><th class="num">시작 후</th><th>일감</th><th>과제</th><th>상태</th><th>담당자</th></tr></thead><tbody>
      ${top.map((i) => `<tr><td class="num"><b>${i.start_days}</b>일</td><td>${C.wp(i)} ${C.esc(i.subject.slice(0, 36))}</td><td>${C.esc(i.project)}</td><td>${C.esc(i.status)}</td><td>${C.esc(i.assignee || '담당자 없음')}</td></tr>`).join('')}</tbody></table>${all.length > top.length ? `<div class="muted" style="font-size:11px">외 ${all.length - top.length}건</div>` : ''}`
      : '<span class="muted" data-home-long="empty">진행·검토 중인 일감 없음</span>';
    return UI.panel({ title: `진행·검토 중 ${all.length}건 — 오래 끈 순`, sub: '시작 후 경과일 상위 8건', body, bodyStyle: 'max-height:360px;overflow-y:auto' });
  }

  /* ---- 5. regulatory summary ---- */
  function regulatory(C, RA) {
    const UI = window.UI;
    if (!RA) return UI.panel({ title: '인허가', body: '<span class="muted" data-home-ra="none">인허가 데이터 없음</span>' });
    const g = RA.registry || {};
    const lim = iso(new Date(new Date(RA.today + 'T00:00:00').getTime() + 90 * DAY));
    const obs = (g.obligations || []).filter((o) => o.date && (o.overdue || o.date <= lim)).sort((a, b) => a.date.localeCompare(b.date));
    const obTxt = obs.length ? `<table class="tbl" data-home-ra-ob><thead><tr><th>의무일</th><th>구분</th><th>국가</th><th>인허가</th><th>의무</th><th>상태</th></tr></thead><tbody>
      ${obs.map((o) => `<tr><td>${C.esc(o.date)}</td><td>${o.scope === 'company' ? '회사' : C.esc(o.family || '제품')}${(o.models || []).length ? ' · ' + C.esc(o.models.join(', ')) : ''}</td><td>${C.esc(o.country)}</td><td>${C.esc(o.type || '–')}</td><td>${C.esc(o.kind)}</td><td>${o.overdue ? '<b>기한 지남</b>' : '예정'}${o.state === '갱신중' ? ' · 갱신중' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<span class="muted" data-home-ra-ob="empty">90일 안 의무 없음</span>';
    const kp = `<div class="kpi-row kpi-strip" style="--kpi-cols:4;margin:0 0 var(--grid-1)">
      ${UI.kpi({ label: '열린 요청', value: RA.open, foot: `최근 ${RA.window_days}일 완료 ${RA.done_180}건` })}
      ${UI.kpi({ label: '검토 지연', value: `${RA.review_delay ? C.DOT.amber : C.DOT.green} ${RA.review_delay}건`, foot: '접수 후 검토 없이 지난 요청' })}
      ${UI.kpi({ label: '90일 안 의무', value: `${obs.some((o) => o.overdue) ? C.DOT.red : obs.length ? C.DOT.amber : C.DOT.green} ${obs.length}건`, foot: `기한 지남 ${obs.filter((o) => o.overdue).length}건` })}
      ${UI.kpi({ label: '등록부', value: g.counts ? `${g.counts.rows}+${g.counts.company_rows}` : '–', foot: `제품 ${g.counts ? g.counts.rows : '–'}줄 · 회사 ${g.counts ? g.counts.company_rows : '–'}줄 · ${RA.registry_connected ? '연결됨' : '연결 전'}` })}
    </div>`;
    // #96: the full regulatory detail (product matrix → series → model, company licences, obligations, requests)
    // opens in place from views/ra.js; no separate screen.
    const detail = raOpen && window.RAPanels ? `<div style="margin-top:var(--grid-1)">${window.RAPanels.detail(RA)}</div>` : '';
    return UI.panel({ title: '인허가 — 회사 전체', sub: '요청은 OP, 등록은 등록부 · 펼치면 제품군 → 시리즈 → 모델, 회사 허가·인증, 의무, 요청',
      tools: `<button type="button" class="mini-btn${raOpen ? ' on' : ''}" data-home-ra-toggle aria-expanded="${raOpen}">${raOpen ? '상세 접기 ▾' : '상세 펼치기 ▸'}</button>`, body: kp + obTxt + detail });
  }
  let raOpen = false;   // view state only: whether the regulatory detail is expanded on the first screen

  window.Views.home = function () {
    const C = window.ExecCore, UI = window.UI;
    if (!C) return '<div class="empty">현황 모듈이 없습니다 (views/exec.js)</div>';
    const { H, I, RA, err, loading } = C.data();
    if (!H && !loading && !err) { C.load(); return '<div class="empty">현황 데이터 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">현황 데이터를 읽지 못함: ${C.esc(err)} <button class="mini-btn" data-exec-reload>다시 읽기</button></div>`;
    if (!H || !I) return '<div class="empty">현황 데이터 로딩 중…</div>';
    const order = { red: 0, amber: 1, grey: 2, green: 3 };
    const allStats = I.product_lines.map(C.lineStats).sort((a, b) => order[a.status] - order[b.status]);
    const stats = allStats.filter((s) => !s.line.regulatory);
    return `
      <div class="tier"><span class="tier-name">대시보드</span>
        <span class="tier-en">DR 사업본부 — 과제 현황 → 이번 주 업무 → 결정 → 인허가 · 모든 입력은 OP</span>
        <button type="button" class="tb-chip" data-exec-reload>다시 읽기</button><span class="rule"></span></div>
      ${basis(C, H, I)}
      ${C.strip(stats, allStats)}
      <div class="muted mono" style="font-size:11px;margin:0 0 var(--grid-1)">신호등: 🔴 마일스톤 지남 또는 보류 30일↑ · 🟡 마감 지남·보류·담당자 없는 결정 · 🟢 예외 없음 · ⚪ 판단할 자료 부족</div>
      ${UI.panel({ title: '제품군별 상태 → 왜 → 이번 주 결정', sub: '행을 누르면 과제·일감이 펼쳐집니다 · 일감 번호를 누르면 OP 원본', body: `<table class="tbl" data-home-lines><thead><tr><th>제품군</th><th>상태</th><th>다음 마일스톤</th><th>왜 (규칙으로 생성)</th><th>이번 주 결정</th></tr></thead><tbody>${stats.map(C.lineRow).join('')}</tbody></table>` })}
      <div class="tier"><span class="tier-name">이번 주 업무</span><span class="tier-en">마감 · 결정 · 오래 끈 일 — 목요일 회의와 같은 기준</span><span class="rule"></span></div>
      <div class="grid"><div class="col-6">${dueThisWeek(C, I)}</div><div class="col-6">${decisionsPending(C, H, I)}</div><div class="col-12">${longRunning(C, I)}</div></div>
      ${regulatory(C, RA)}`;
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-home-ra-toggle]')) {
      raOpen = !raOpen;
      const top = document.getElementById('content')?.scrollTop || 0;   // keep the reader where they were (P41)
      if (window.App?.refresh) window.App.refresh();
      const el = document.getElementById('content'); if (el) el.scrollTop = top;
    }
  });
})();
