/* ============================================================
   PLM Dashboard — 대시보드 (first screen, #94)
   One screen for executives and managers, read top to bottom:
     1. data basis (when, how trustworthy)          insights.json metrics.all
     2. Q1–Q5 strip                                  ExecCore.strip
     3. product line: status → why → this week's decision   ExecCore.lineRow
     4. 주간 흐름 (#101): per product line — last week done · carried over · this week new / due · decisions
        (+ decided marks), all classified by Hermes op_weekly_flow.py into data/weekly.json
     5. regulatory summary (ra.json)                 links to the RA screen
   Rules and numbers come from ExecCore (exec-core.js) so this screen never
   disagrees with the rules it inherited from the former status screen. All input happens in OP.
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
      이 숫자의 바탕: 열린 일감 <b>${m.open ?? '–'}</b>건 · 마감 지남 <b data-home-overdue>${H.exception_counts ? H.exception_counts.overdue : '–'}</b>건 · 마감일 입력 <b>${pct(m.with_due, m.open)}</b> · 담당 지정 <b>${pct(m.assigned, m.open)}</b> · 7일 내 갱신 <b>${upd === null ? '–' : upd + '%'}</b>
      ${low ? ' · ⚪ 갱신률이 50% 아래라 일정·부하 판단은 보류 표시' : ''} · 기준 <b>${C.esc(new Date(H.generated_at).toLocaleString('ko-KR'))}</b> (Hermes 30분 스냅숏 — 이 화면의 모든 숫자가 이 시각 기준)
    </div>`;
  }

  /* ---- 4. 주간 흐름 (#101): one table per product line, classified by Hermes (data/weekly.json) ---- */
  const wfOpen = new Set();   // expanded cells, "line|bucket" (view state only)
  const kst = (iso) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const BUCKETS = [
    ['done_last', '지난주 완료', (i) => `완료 ${kst(i.closed_at)}`],
    ['carry', '지난주에서 이어짐', (i) => `${i.status}${i.due ? ' · 마감 ' + i.due.slice(5) : ''}${i.overdue ? ' · <b>마감 지남</b>' : ''}`],
    ['new_week', '이번 주 신규', (i) => `생성 ${i.created.slice(5)}${i.due ? ' · 마감 ' + i.due.slice(5) : ''}`],
    ['due_week', '이번 주 마감', (i) => `마감 <b>${(i.due || '').slice(5)}</b> · ${i.status}`],
    ['decide', '결정 필요', (d) => d.decided_at ? `결정됨 ${kst(d.decided_at)} · ${d.why} (${d.slip_days}일 만에)` : `${d.why} · <b>${d.slip_days}일</b> 밀림`],
  ];
  function wfCell(C, line, key, label, fmt) {
    const items = line[key] || [];
    const extra = key === 'carry' ? items.filter((i) => i.overdue).length : key === 'decide' ? items.filter((d) => d.decided_at).length : 0;
    const note = key === 'carry' && extra ? ` <span class="muted">마감 지남 ${extra}</span>` : key === 'decide' && extra ? ` <span class="muted">결정됨 ${extra}</span>` : '';
    const k = `${line.name}|${key}`;
    const btn = items.length ? `<button type="button" class="mini-btn${wfOpen.has(k) ? ' on' : ''}" data-home-wf="${C.esc(k)}" aria-expanded="${wfOpen.has(k)}" aria-label="${label} ${items.length}건 ${wfOpen.has(k) ? '접기' : '펼치기'}"><b>${items.length}</b></button>` : '<span class="muted">0</span>';
    return `<td data-home-wfcell="${C.esc(k)}">${btn}${note}</td>`;
  }
  function wfList(C, line, key, fmt) {
    const items = line[key] || [];
    return `<div data-home-wflist="${C.esc(line.name + '|' + key)}" style="padding:6px 4px"><b>${BUCKETS.find((b) => b[0] === key)[1]}</b> · ${C.esc(line.name)} · ${items.length}건
      <table class="tbl" style="margin-top:4px"><thead><tr><th>일감</th><th>과제</th><th>담당자</th><th>상태 / 날짜</th></tr></thead><tbody>
      ${items.map((i) => `<tr data-home-wfrow="${i.id}"><td>${C.wp(i)} ${C.esc(String(i.subject || '').slice(0, 44))}</td><td>${C.esc(i.project || '')}</td><td>${C.esc(i.assignee || '담당자 없음')}</td><td style="font-size:12px">${fmt(i)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function weeklyFlow(C, W) {
    const UI = window.UI;
    if (!W) return UI.panel({ title: '주간 흐름', body: '<span class="muted" data-home-wf="none">주간 흐름 데이터(weekly.json)가 아직 없습니다 — Hermes 다음 실행 후 표시됩니다</span>' });
    const wk = W.week, t = W.totals || {};
    const sub = `지난주 ${kst(wk.prev_anchor)} → 이번 주 ${kst(wk.anchor)} → ${kst(wk.next_anchor)} (목요일 리뷰 기준${wk.source === 'calendar' ? ', 리뷰 기록 없어 달력 목요일' : ''}) · 숫자를 누르면 일감 목록`;
    const lines = (W.lines || []).filter((l) => !l.regulatory || BUCKETS.some(([k]) => (l[k] || []).length));
    const rows = lines.map((l) => {
      const open = BUCKETS.filter(([k]) => wfOpen.has(`${l.name}|${k}`));
      return `<tr data-home-wfline="${C.esc(l.name)}"><td><b>${C.esc(l.name)}</b><div class="muted" style="font-size:11px">${C.esc(l.owner || '')}</div></td>${BUCKETS.map(([k, label, fmt]) => wfCell(C, l, k, label, fmt)).join('')}</tr>`
        + (open.length ? `<tr data-home-wfdetail="${C.esc(l.name)}"><td colspan="${BUCKETS.length + 1}" style="background:var(--surface-2,transparent)">${open.map(([k, , fmt]) => wfList(C, l, k, fmt)).join('')}</td></tr>` : '');
    }).join('');
    const total = `<tr data-home-wftotal><td><b>합계</b></td>${BUCKETS.map(([k]) => `<td><b>${t[k] ?? 0}</b>${k === 'decide' && t.decided ? ` <span class="muted">결정됨 ${t.decided}</span>` : ''}</td>`).join('')}</tr>`;
    const plan = W.plan && W.plan.prev ? `지난주 계획(마감 ${W.plan.prev.planned}건) 중 완료 <b>${W.plan.prev.done}</b>건 (${W.plan.prev.ratio === null ? '–' : Math.round(W.plan.prev.ratio * 100) + '%'})` : '계획 대비 완료율은 다음 주부터 (이번 주 마감 목록을 저장해 둠)';
    const body = `<table class="tbl" data-home-wf><thead><tr><th>제품군</th>${BUCKETS.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${rows}${total}</tbody></table>
      <div class="muted mono" style="font-size:11px;margin-top:6px" data-home-wfplan>${plan} · 지난주 완료 = 상태가 완료로 바뀐 시각 기준 · 이어짐 = 지난주 마감이었거나 지난주에 사람이 손댄 열린 일감 · 결정됨 = 회의 뒤 담당자·마감일 변경(D-04)</div>`;
    return UI.panel({ title: '주간 흐름 — 지난주 완료 → 이어짐 → 이번 주 신규·마감 → 결정', sub, body });
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
    // opens in place from ra-panels.js; no separate screen (#98).
    const detail = raOpen && window.RAPanels ? `<div style="margin-top:var(--grid-1)">${window.RAPanels.detail(RA)}</div>` : '';
    return UI.panel({ title: '인허가 — 회사 전체', sub: '요청은 OP, 등록은 등록부 · 펼치면 제품군 → 시리즈 → 모델, 회사 허가·인증, 의무, 요청',
      tools: `<button type="button" class="mini-btn${raOpen ? ' on' : ''}" data-home-ra-toggle aria-expanded="${raOpen}">${raOpen ? '상세 접기 ▾' : '상세 펼치기 ▸'}</button>`, body: kp + obTxt + detail });
  }
  let raOpen = false;   // view state only: whether the regulatory detail is expanded on the first screen

  window.Views.home = function () {
    const C = window.ExecCore, UI = window.UI;
    if (!C) return '<div class="empty">현황 모듈이 없습니다 (exec-core.js)</div>';
    const { H, I, RA, W, err, loading } = C.data();
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
      ${weeklyFlow(C, W)}
      ${regulatory(C, RA)}`;
  };
  document.addEventListener('click', (e) => {
    const wf = e.target.closest('[data-home-wf]');
    if (wf) {
      const k = wf.dataset.homeWf; if (wfOpen.has(k)) wfOpen.delete(k); else wfOpen.add(k);
      const top = document.getElementById('content')?.scrollTop || 0;
      if (window.App?.refresh) window.App.refresh();
      const el = document.getElementById('content'); if (el) el.scrollTop = top;
      return;
    }
    if (e.target.closest('[data-home-ra-toggle]')) {
      raOpen = !raOpen;
      const top = document.getElementById('content')?.scrollTop || 0;   // keep the reader where they were (P41)
      if (window.App?.refresh) window.App.refresh();
      const el = document.getElementById('content'); if (el) el.scrollTop = top;
    }
  });
})();
