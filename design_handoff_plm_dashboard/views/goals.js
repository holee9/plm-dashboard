/* ============================================================
   PLM Dashboard — Goals view (목표 · OKR)
   Reads the Hermes health snapshot (data/health.json, goal_health):
   Objective → Key Result → linked execution Work Packages. Every row links to
   the OpenProject record; values are edited in OP (KR fields), shown here.
   Spec §3 (progress rules) / §6 Goal Health / D-05 (yearly OKR project).
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v) => v === null || v === undefined ? '–' : `${Math.round(v * 100)}%`;
  const link = (url, label) => `<a class="wp-id" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  let snap = null, err = null, loading = false;

  async function load() {
    loading = true;
    try {
      const r = await fetch('data/health.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(`health.json ${r.status}`);
      snap = await r.json(); err = null;
    } catch (e) { err = e.message; }
    loading = false;
    if (window.App && window.App.refresh) window.App.refresh();
  }

  function krRow(UI, k) {
    const flags = [...(k.risks || []), ...(k.stagnant ? ['정체 14일'] : [])];
    const tone = flags.length ? 'color:var(--c-red)' : '';
    const related = (k.related || []).map((r) => `${link(r.url, r.display_id)} <span class="muted">${esc(r.status)}</span>`).join(' · ') || '<span class="muted">연결 일감 없음 — OP에서 관계로 연결</span>';
    return `<tr>
      <td>${link(k.url, k.display_id)}</td>
      <td><b>${esc(k.subject)}</b><div class="muted" style="font-size:11px">${related}</div></td>
      <td>${esc(k.kind || '유형 미지정')}</td>
      <td style="min-width:120px">${k.progress === null ? '<span class="muted">–</span>' : UI.progressBar(Math.round(k.progress * 100))}<div class="muted" style="font-size:11px">${esc(k.basis || '')}</div></td>
      <td>${esc(k.confidence || '–')}</td>
      <td>${esc(k.owner || '담당자 없음')}</td>
      <td>${UI.fmtDateY(k.due)}</td>
      <td style="${tone}">${esc(flags.join(', ') || '정상')}</td>
    </tr>`;
  }

  function objectivePanel(UI, o) {
    const krs = o.key_results || [];
    const risk = krs.filter((k) => k.at_risk).length, stag = krs.filter((k) => k.stagnant).length;
    const body = krs.length ? `<table class="tbl"><thead><tr><th>KR</th><th>핵심 결과</th><th>유형</th><th>진행률</th><th>확신도</th><th>담당</th><th>마감</th><th>위험</th></tr></thead><tbody>${krs.map((k) => krRow(UI, k)).join('')}</tbody></table>`
      : '<div class="empty">Key Result 없음 — OP에서 Objective의 자식으로 추가</div>';
    return UI.panel({
      title: `${link(o.url, o.display_id)} ${esc(o.subject)}`,
      sub: `${esc(o.owner || '담당자 없음')} · 마감 ${UI.fmtDateY(o.due)} · 진행률 ${pct(o.progress)} · KR ${krs.length}개${risk ? ` · 위험 ${risk}` : ''}${stag ? ` · 정체 ${stag}` : ''}`,
      tools: `<a class="mini-btn" href="${esc(o.url)}" target="_blank" rel="noopener">OP에서 열기</a>`,
      body,
    });
  }

  window.Views.goals = function () {
    const UI = window.UI;
    if (!snap && !loading && !err) { load(); return '<div class="empty">목표 스냅샷 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">목표 스냅샷을 읽지 못함: ${esc(err)}<br><button class="mini-btn" data-goals-reload>다시 읽기</button></div>`;
    if (!snap) return '<div class="empty">목표 스냅샷 로딩 중…</div>';
    const g = snap.goal_health || {}; const objs = g.objectives || [];
    const krUpd = snap.process_health?.kr_update_rate;
    const head = `<div class="kpi-row kpi-strip" style="--kpi-cols:5">
      ${UI.kpi({ label: 'OBJECTIVES', value: objs.length, foot: '분기 목표' })}
      ${UI.kpi({ label: 'KEY RESULTS', value: g.kr_total ?? 0, foot: '핵심 결과' })}
      ${UI.kpi({ label: 'AT RISK', value: g.kr_at_risk ?? 0, tone: (g.kr_at_risk || 0) > 0 ? 'red' : '', foot: '확신도 낮음 · 마감 위험' })}
      ${UI.kpi({ label: 'STAGNANT', value: g.kr_stagnant ?? 0, tone: (g.kr_stagnant || 0) > 0 ? 'amber' : '', foot: '14일 이상 무수정' })}
      ${UI.kpi({ label: 'KR UPDATE', value: krUpd === null || krUpd === undefined ? '–' : `${Math.round(krUpd * 100)}%`, foot: 'KR 7일 내 수정' })}
    </div>
    <div class="muted mono" style="font-size:11.5px;margin:4px 0 var(--grid-1)">기준 시각 ${esc(new Date(snap.generated_at).toLocaleString('ko-KR'))} · 입력은 OpenProject(KR 현재값·확신도), 여기서는 보기만 · 작업 기반 KR은 연결 일감이 닫히면 자동 반영
      <button class="mini-btn" data-goals-reload style="margin-left:8px">다시 읽기</button></div>`;
    if (!objs.length) return head + '<div class="empty">등록된 목표가 없습니다. OP의 올해 OKR 프로젝트에 Objective를 추가하세요.</div>';
    return head + objs.map((o) => objectivePanel(UI, o)).join('');
  };

  document.addEventListener('click', (e) => { if (e.target.closest('[data-goals-reload]')) { snap = null; load(); } });
})();
