/* ============================================================
   PLM Dashboard — 인허가 현황 (managers only)
   Source: data/ra.json (op_ra_insights.py, from OpenProject request work packages).
   A 등록 상태 · B 갱신 의무 · E 모델 조회 come from the registry repo and show "연결 전" until it is
   connected (ra.json registry_connected). C 요청 and D KPI come from OP requests (form-reporter, project RA).
   No certificate numbers, no certificate files.
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OP = 'https://plm.abyz-lab.work';
  const BEFORE = '<span class="muted">연결 전</span>';
  let R = null, err = null, loading = false;

  async function load() {
    loading = true;
    try {
      const r = await fetch('data/ra.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(`ra ${r.status}`);
      R = await r.json(); err = null;
    } catch (e) { err = e.message; }
    loading = false;
    if (window.App?.refresh) window.App.refresh();
  }

  const pct = (x) => (x === null || x === undefined ? null : Math.round(x * 100));

  function counts() {
    const UI = window.UI;
    const rate = R.desired_date_rate || {};
    return `<div class="kpi-row kpi-strip" style="--kpi-cols:5">
      ${UI.kpi({ label: '열린 요청', value: `${R.open}건`, foot: `전체 요청 ${R.requests_total}건` })}
      ${UI.kpi({ label: '검토 지연', value: `${R.review_delay}건`, tone: R.review_delay ? 'amber' : '', foot: '접수 7일 후에도 마감일이 없는 요청' })}
      ${UI.kpi({ label: '희망일 초과', value: `${R.over_desired}건`, tone: R.over_desired ? 'amber' : '', foot: '열린 요청의 마감일이 희망일보다 늦음' })}
      ${UI.kpi({ label: `최근 ${R.window_days}일 완료`, value: `${R.done_180}건`, foot: `취소 ${R.canceled_180}건은 제외` })}
      ${UI.kpi({ label: '희망일 준수율', value: rate.ratio === null || rate.ratio === undefined ? '대상 없음' : `${rate.met}/${rate.of} · ${pct(rate.ratio)}%`, foot: '완료일이 희망일 이내 / 희망일이 있는 완료 요청' })}
    </div>`;
  }

  function kpis() {
    const UI = window.UI;
    const pd = Object.entries(R.processing_days || {});
    const body = `<div class="kpi-row" style="--kpi-cols:4">
      ${UI.kpi({ label: '처리 기간', value: pd.length ? pd.map(([k, v]) => `${esc(k)} ${v.median}일`).join(' · ') : '대상 없음',
        foot: pd.length ? pd.map(([k, v]) => `${esc(k)} ${v.n}건`).join(' · ') + ' · 접수→첫 완료 중앙값' : `최근 ${R.window_days}일 완료 요청 없음` })}
      ${UI.kpi({ label: '희망일 준수율', value: R.desired_date_rate && R.desired_date_rate.ratio !== null ? `${R.desired_date_rate.met}/${R.desired_date_rate.of} · ${pct(R.desired_date_rate.ratio)}%` : '대상 없음', foot: '완료일 ≤ 희망일' })}
      ${UI.kpi({ label: '신규 취득', value: R.registry_connected ? esc(R.new_acquisitions) : BEFORE, foot: R.registry_connected ? '이번 분기 새로 등록된 제품군·국가 (등록부)' : '분기 내 첫 등록 (등록부)' })}
      ${UI.kpi({ label: '갱신 놓침', value: R.registry_connected ? esc(R.missed_renewals) : BEFORE, foot: R.registry_connected ? '만료일·의무일이 지났는데 아직 유효·갱신중인 줄 (등록부)' : '갱신 의무 기준 (등록부)' })}
    </div>`;
    return UI.panel({ title: '지표', sub: `최근 ${R.window_days}일 · 취소(Won't Fix·폐기됨)는 처리 기간에서 제외`, body });
  }

  function requests() {
    const UI = window.UI;
    const rows = R.open_requests || [];
    const body = rows.length ? `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>구분</th><th>상태</th><th>담당자</th><th>희망일</th><th>마감일</th><th>표시</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-ra-row="${esc(r.display_id)}"><td><a class="wp-id" href="${OP}/work_packages/${r.id}" target="_blank" rel="noopener">${esc(r.display_id)}</a></td>
        <td>${esc((r.subject || '').slice(0, 60))}</td><td>${esc(r.kind || '–')}</td><td>${esc(r.status)}</td><td>${esc(r.assignee || '담당자 없음')}</td>
        <td>${esc(r.desired || '–')}</td><td>${esc(r.due || '–')}</td>
        <td>${r.auto ? '자동 생성' : ''}${r.review_delay ? ' 검토 지연' : ''}${r.desired && r.due && r.due > r.desired ? ' 희망일 초과' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">열린 요청이 없습니다</div>';
    return UI.panel({ title: `요청 — 열린 ${rows.length}건`, sub: '폼으로 접수된 인허가 요청 · 접수 7일이 지나도 마감일이 없으면 검토 지연', body });
  }

  const pending = (title, sub) => window.UI.panel({ title, sub, body: `<div class="empty">${BEFORE} — 등록부(저장소)를 연결하면 표시됩니다</div>` });

  /* ---- registry panels (R3): shown only when ra.json says registry_connected ---- */
  const SYMBOL = { full: '●', partial: '◐', renewing: '갱신중', expired: '만료' };
  const STATE_TITLE = { full: '전 모델 유효', partial: '일부 모델만 유효', renewing: '갱신 진행 중', expired: '만료·철회' };
  const regSub = (g) => `기준 ${esc(g.synced_at ? new Date(g.synced_at).toLocaleString('ko-KR') : '–')} · 커밋 ${esc(String(g.commit || '').slice(0, 7))}${g.excluded_rows ? ` · 오류로 제외된 행 ${g.excluded_rows}건` : ''}`;

  function matrixPanel() {
    const g = R.registry, UI = window.UI;
    const cell = {};
    g.matrix.forEach((m) => { cell[`${m.family}|${m.country}`] = m.state; });
    const cols = g.columns.filter((c) => g.matrix.some((m) => m.country === c));
    const fams = g.families.filter((f) => g.matrix.some((m) => m.family === f));
    const body = fams.length ? `<table class="tbl" data-ra-matrix><thead><tr><th>제품군</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>
      ${fams.map((f) => `<tr><td><b>${esc(f)}</b></td>${cols.map((c) => { const st = cell[`${f}|${c}`]; return `<td data-ra-cell="${esc(f)}|${esc(c)}" title="${st ? STATE_TITLE[st] : ''}">${st ? SYMBOL[st] : '–'}</td>`; }).join('')}</tr>`).join('')}
      </tbody></table><div class="muted mono" style="font-size:11px;margin-top:6px">● 전 모델 유효 · ◐ 일부 모델만 유효 · 갱신중 · 만료 · – 등록 없음 (제품군 단위 표시, 입력 대기 줄은 제외)</div>`
      : '<div class="empty">등록부에 등록된 줄이 없습니다</div>';
    return UI.panel({ title: '등록 상태', sub: `제품군 × 국가 · 등록 ${g.counts.rows}건 · 입력 대기 ${g.counts.pending}건 · ${regSub(g)}`, body });
  }

  function obligationsPanel() {
    const g = R.registry, UI = window.UI;
    const rows = g.obligations;
    const body = rows.length ? `<table class="tbl" data-ra-obligations><thead><tr><th>의무일</th><th>등록</th><th>제품군</th><th>모델</th><th>국가</th><th>종류</th><th>상태</th></tr></thead><tbody>
      ${rows.map((o) => `<tr data-ra-ob="${esc(o.reg_id)}"><td>${esc(o.date)}</td><td>${esc(o.reg_id)}</td><td>${esc(o.family)}</td><td>${esc((o.models || []).join(', '))}</td><td>${esc(o.country)}</td><td>${esc(o.kind)}</td><td>${o.overdue ? '<b>기한 지남</b>' : '예정'}${o.state === '갱신중' ? ' · 갱신중' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">착수 시점이 된 의무가 없습니다</div>';
    return UI.panel({ title: '갱신 의무', sub: `의무일 − 착수 기준일수에 도달한 의무 · ${rows.length}건 (기한 지남 ${rows.filter((o) => o.overdue).length}건) · 의무일순`, body });
  }

  function lookupResult(q) {
    const g = R.registry, term = String(q || '').trim().toLowerCase();
    if (!term) return '<div class="muted">모델명을 입력하면 국가별 등록 상태가 나옵니다</div>';
    const hits = Object.entries(g.models).filter(([m]) => m.toLowerCase().includes(term));
    if (!hits.length) return '<div class="empty">없음 — 등록부에 이 모델이 없습니다</div>';
    return hits.map(([m, list]) => `<div data-ra-model="${esc(m)}"><b>${esc(m)}</b> — ${list.map((e) => `${esc(e.country)} ${esc(e.state)}${e.type ? ' (' + esc(e.type) + ')' : ''}`).join(' · ')}</div>`).join('');
  }

  function lookupPanel() {
    const UI = window.UI;
    return UI.panel({ title: '모델 조회', sub: '모델별 국가 등록 상태 · 입력 대기 줄은 제외',
      body: `<input type="search" class="form-input" id="raModelQ" placeholder="모델명 (예: BLUE-G1417CW)" autocomplete="off" style="max-width:360px"><div id="raModelResult" style="margin-top:8px">${lookupResult('')}</div>` });
  }

  window.Views.ra = function () {
    if (!R && !loading && !err) { load(); return '<div class="empty">인허가 데이터 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">인허가 데이터를 읽지 못함: ${esc(err)} <button class="mini-btn" data-ra-reload>다시 읽기</button></div>`;
    if (!R) return '<div class="empty">인허가 데이터 로딩 중…</div>';
    return `
      <div class="tier"><span class="tier-name">인허가 현황</span>
        <span class="tier-en">기준 ${esc(new Date(R.generated).toLocaleString('ko-KR'))} · 요청은 OP, 등록은 등록부 · 관리자용</span>
        <button type="button" class="tb-chip" data-ra-reload>다시 읽기</button><span class="rule"></span></div>
      ${counts()}
      <div class="grid">
        <div class="col-12">${R.registry_connected && R.registry ? matrixPanel() : (R.registry_note ? pending('등록 상태', `등록부를 읽지 못함: ${R.registry_note}`) : pending('등록 상태', '제품군 × 국가 · ◐ = 제품군 일부 모델만 등록'))}</div>
        <div class="col-12">${R.registry_connected && R.registry ? obligationsPanel() : pending('갱신 의무', '갱신 시한이 다가오는 의무')}</div>
        <div class="col-12">${requests()}</div>
        <div class="col-12">${kpis()}</div>
        <div class="col-12">${R.registry_connected && R.registry ? lookupPanel() : pending('모델 조회', '모델별 국가 등록 상태')}</div>
      </div>`;
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-ra-reload]')) { R = null; load(); } });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.id === 'raModelQ' && R && R.registry) document.getElementById('raModelResult').innerHTML = lookupResult(e.target.value);
  });
})();
