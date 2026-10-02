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
      ${UI.kpi({ label: '신규 취득', value: R.registry_connected ? esc(R.new_acquisitions) : BEFORE, foot: '분기 내 첫 등록 (등록부)' })}
      ${UI.kpi({ label: '갱신 놓침', value: R.registry_connected ? esc(R.missed_renewals) : BEFORE, foot: '갱신 의무 기준 (등록부)' })}
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
        <td>${r.review_delay ? '검토 지연' : ''}${r.desired && r.due && r.due > r.desired ? ' 희망일 초과' : ''}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">열린 요청이 없습니다</div>';
    return UI.panel({ title: `요청 — 열린 ${rows.length}건`, sub: '폼으로 접수된 인허가 요청 · 접수 7일이 지나도 마감일이 없으면 검토 지연', body });
  }

  const pending = (title, sub) => window.UI.panel({ title, sub, body: `<div class="empty">${BEFORE} — 등록부(저장소)를 연결하면 표시됩니다</div>` });

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
        <div class="col-12">${pending('등록 상태', '제품군 × 국가 · ◐ = 제품군 일부 모델만 등록')}</div>
        <div class="col-12">${pending('갱신 의무', '갱신 시한이 다가오는 의무')}</div>
        <div class="col-12">${requests()}</div>
        <div class="col-12">${kpis()}</div>
        <div class="col-12">${pending('모델 조회', '모델별 국가 등록 상태')}</div>
      </div>`;
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-ra-reload]')) { R = null; load(); } });
})();
