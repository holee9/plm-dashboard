/* =============================================================================
   View: Health — 운영 건강도 (Project / Goal / Process Health)
   -----------------------------------------------------------------------------
   Displays data/health.json written every 30 minutes by the Hermes job
   op_health_snapshot.py (abyz-lab-pm scripts/hermes). This view computes
   nothing: every number comes from the same exception and goal rules Hermes
   uses. Metric definitions: abyz-lab-pm docs/integrated-work-mgmt/dashboard-metrics.md
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const FLAG_LABELS = {
    overdue: '마감 지남', missing_update: '마감 후 갱신 없음', blocked_aging: '보류 장기화',
    blocked: '보류', stale: '방치', due_soon: '마감 임박', unmanaged: '담당자·마감일 미지정',
  };
  const FLAG_ORDER = ['overdue', 'missing_update', 'blocked_aging', 'blocked', 'stale', 'due_soon', 'unmanaged'];

  let snap = null;
  let history = [];
  let loadState = 'idle';   // idle | loading | ok | error
  let loadError = '';
  let filter = { flag: 'overdue', projectId: null };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
  const safeUrl = (u) => (/^https?:\/\//.test(String(u || '')) ? esc(u) : '#');
  const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
  const link = (item) => `<a class="wp-id" href="${safeUrl(item.url)}" target="_blank" rel="noopener">${esc(item.display_id || item.id)}</a>`;

  async function load() {
    loadState = 'loading';
    try {
      const [s, h] = await Promise.all([
        fetch('data/health.json', { cache: 'no-store' }),
        fetch('data/health_history.json', { cache: 'no-store' }),
      ]);
      if (!s.ok) throw new Error(`health.json HTTP ${s.status}`);
      snap = await s.json();
      history = h.ok ? await h.json() : [];
      if (!Array.isArray(history)) history = [];
      loadState = 'ok';
    } catch (e) {
      loadState = 'error';
      loadError = e.message || String(e);
    }
    if (window.App && window.App.refresh) window.App.refresh();
  }

  document.addEventListener('click', (ev) => {
    const f = ev.target.closest('[data-health-flag]');
    if (f) { filter = { flag: f.dataset.healthFlag, projectId: filter.projectId }; window.App.refresh(); return; }
    const p = ev.target.closest('[data-health-project]');
    if (p) {
      const id = p.dataset.healthProject || null;
      filter = { flag: filter.flag, projectId: filter.projectId === id ? null : id };
      window.App.refresh();
      return;
    }
    if (ev.target.closest('[data-health-reload]')) { load(); }
  });

  function kpis(UI) {
    const ph = snap.process_health;
    const cards = [
      { label: 'STALE', value: ph.stale, foot: '방치 (7일 무수정)', tone: ph.stale ? 'amber' : '', flag: 'stale' },
      { label: 'NO UPDATE', value: ph.missing_update, foot: '마감 후 갱신 없음', tone: ph.missing_update ? 'red' : '', flag: 'missing_update' },
      { label: 'BLOCKED AGING', value: ph.blocked_aging, foot: '보류 7일 초과', tone: ph.blocked_aging ? 'red' : '', flag: 'blocked_aging' },
      { label: 'UNMANAGED', value: ph.unmanaged, foot: '담당자·마감일 미지정', tone: ph.unmanaged ? 'amber' : '', flag: 'unmanaged' },
      { label: 'EXCEPTION AGING', value: ph.exception_aging, foot: '지난 리뷰부터 지속', tone: ph.exception_aging ? 'amber' : '' },
      { label: 'WEEKLY UPDATE', value: pct(ph.weekly_update_rate), foot: `열린 일감 ${ph.open_work}건 중 7일 내 수정` },
      { label: 'KR UPDATE', value: pct(ph.kr_update_rate), foot: 'KR 7일 내 수정' },
      { label: 'CLOSURE', value: pct(ph.exception_closure_rate), foot: ph.previous_review ? `지난 리뷰(${esc(ph.previous_review)}) 예외 해소·결정` : '주간 리뷰 기록 없음' },
    ];
    return `<div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">${cards.map((c) => UI.kpi({
      label: c.label, value: esc(c.value), foot: `<span class="muted">${c.foot}</span>`, tone: c.tone,
      attrs: c.flag ? `data-health-flag="${c.flag}" style="cursor:pointer" data-tip="눌러서 아래 목록에 표시"` : '',
    })).join('')}</div>`;
  }

  function projectPanel(UI) {
    const rows = snap.project_health.map((p) => {
      const sel = filter.projectId === String(p.project_id);
      const n = (v, tone) => (v ? `<span style="font-weight:600;color:var(--c-${tone})">${v}</span>` : '<span class="muted">–</span>');
      return `<tr data-health-project="${esc(p.project_id)}" style="cursor:pointer${sel ? ';background:var(--panel-hover)' : ''}">
        <td class="strong clamp">${esc(p.project)}</td>
        <td>${UI.progressBar(Math.round((p.progress || 0) * 100))}<span class="muted" style="font-size:11px">${pct(p.progress)}</span></td>
        <td class="num">${p.open}</td>
        <td class="num">${n(p.overdue, 'red')}</td>
        <td class="num">${n(p.due_soon, 'amber')}</td>
        <td class="num">${n(p.blocked, 'amber')}</td>
        <td class="num">${n(p.milestones_overdue, 'red')}</td>
        <td class="muted">${p.next_milestone ? UI.fmtDateY(p.next_milestone) : '–'}</td>
        <td class="num">${n(p.critical, 'red')}</td>
        <td>${p.schedule_risk ? '<span style="color:var(--c-red);font-weight:600">위험</span>' : '<span class="muted">정상</span>'}</td>
      </tr>`;
    }).join('');
    return UI.panel({
      title: 'Project Health · 프로젝트',
      sub: `${snap.project_health.length}개 프로젝트 · 행을 누르면 아래 목록이 그 프로젝트로 좁혀집니다`,
      body: `<table class="tbl"><thead><tr><th>Project</th><th>진행률</th><th class="num">열린</th><th class="num">마감 지남</th>
        <th class="num">임박</th><th class="num">보류</th><th class="num">MS 지남</th><th>다음 MS</th><th class="num">긴급</th><th>일정</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="10" class="muted">데이터 없음</td></tr>'}</tbody></table>`,
    });
  }

  function goalPanel(UI) {
    const g = snap.goal_health;
    if (!g.objectives.length) {
      return UI.panel({ title: 'Goal Health · 목표', sub: 'OKR 프로젝트에 등록된 목표 없음',
        body: '<div class="empty">목표(Objective)와 핵심 결과(Key Result)는 OpenProject 프로젝트 "목표 관리(OKR)"에서 등록합니다.</div>' });
    }
    const body = g.objectives.map((o) => {
      const krs = o.key_results.map((k) => {
        const flags = [...k.risks, ...(k.stagnant ? ['정체'] : [])];
        const related = k.related.map((r) => `${link(r)}<span class="muted" style="font-size:11px"> ${esc(r.status)}</span>`).join(' · ');
        return `<tr>
          <td>${link(k)}</td><td class="strong clamp">${esc(k.subject)}</td>
          <td class="muted">${esc(k.kind || '미지정')}</td>
          <td>${k.progress == null ? '<span class="muted">–</span>' : UI.progressBar(Math.round(k.progress * 100)) + `<span class="muted" style="font-size:11px">${pct(k.progress)}</span>`}</td>
          <td class="muted" style="font-size:11px">${esc(k.basis)}</td>
          <td>${esc(k.confidence || '–')}</td>
          <td>${flags.length ? `<span style="color:var(--c-red);font-weight:600">${esc(flags.join(', '))}</span>` : '<span class="muted">–</span>'}</td>
          <td style="font-size:11px">${related || '<span class="muted">–</span>'}</td>
        </tr>`;
      }).join('');
      return `<div style="margin:6px 0 2px;font-weight:600">${link(o)} ${esc(o.subject)}
          <span class="muted" style="font-weight:400">· 진행률 ${pct(o.progress)} · ${esc(o.owner || '담당자 없음')}</span></div>
        <table class="tbl"><thead><tr><th>KR</th><th>제목</th><th>유형</th><th>진행률</th><th>근거</th><th>확신도</th><th>위험</th><th>관련 일감</th></tr></thead>
        <tbody>${krs || '<tr><td colspan="8" class="muted">KR 없음</td></tr>'}</tbody></table>`;
    }).join('');
    return UI.panel({ title: 'Goal Health · 목표', sub: `KR ${g.kr_total}개 · 위험 ${g.kr_at_risk} · 정체 ${g.kr_stagnant}`, body });
  }

  function drillPanel(UI) {
    const items = snap.items.filter((i) => i.flags.includes(filter.flag)
      && (!filter.projectId || String(i.project_id) === filter.projectId));
    const proj = filter.projectId ? snap.project_health.find((p) => String(p.project_id) === filter.projectId) : null;
    const chips = FLAG_ORDER.map((f) => {
      const n = snap.items.filter((i) => i.flags.includes(f) && (!filter.projectId || String(i.project_id) === filter.projectId)).length;
      const on = filter.flag === f;
      return `<button type="button" class="tb-chip" data-health-flag="${f}" style="${on ? 'border-color:var(--accent);color:var(--text)' : ''}">${FLAG_LABELS[f]} <b>${n}</b></button>`;
    }).join(' ');
    const rows = items.map((i) => `<tr>
      <td>${link(i)}</td><td class="strong clamp">${esc(i.subject)}</td><td class="muted" style="font-size:11.5px">${esc(i.project)}</td>
      <td>${esc(i.status)}</td><td>${esc(i.assignee || '–')}</td><td>${i.due ? UI.fmtDateY(i.due) : '–'}</td>
      <td style="font-size:11px">${esc(i.flags.map((f) => FLAG_LABELS[f]).join(', '))}</td>
    </tr>`).join('');
    return UI.panel({
      title: 'Exceptions · 예외 목록',
      sub: `${FLAG_LABELS[filter.flag]} ${items.length}건${proj ? ` · ${esc(proj.project)}` : ''} · 번호를 누르면 OpenProject 원본이 열립니다`,
      body: `<div style="padding:8px;display:flex;flex-wrap:wrap;gap:6px">${chips}</div>
        <table class="tbl" style="table-layout:fixed;width:100%"><thead><tr><th style="width:90px">WP</th><th>제목</th><th style="width:180px">Project</th>
        <th style="width:100px">상태</th><th style="width:100px">담당자</th><th style="width:100px">마감일</th><th style="width:220px">판정</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">해당 없음</td></tr>'}</tbody></table>`,
    });
  }

  function trendPanel(UI) {
    const rows = history.slice(-14).reverse().map((h) => `<tr><td>${UI.fmtDateY(h.date)}</td><td class="num">${esc(h.overdue)}</td>
      <td class="num">${esc(h.blocked)}</td><td class="num">${esc(h.stale)}</td><td class="num">${esc(h.unmanaged)}</td>
      <td class="num">${pct(h.weekly_update_rate)}</td></tr>`).join('');
    return UI.panel({ title: 'Trend · 추이', sub: '하루 한 줄, 최근 14일',
      body: `<table class="tbl"><thead><tr><th>날짜</th><th class="num">마감 지남</th><th class="num">보류</th><th class="num">방치</th>
        <th class="num">미지정</th><th class="num">주간 갱신율</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">기록 없음</td></tr>'}</tbody></table>` });
  }

  Views.health = function () {
    const UI = window.UI;
    if (loadState === 'idle') { load(); }
    if (loadState !== 'ok') {
      return loadState === 'error'
        ? `<div class="empty" style="color:var(--c-red)">운영 건강도 데이터를 읽지 못했습니다: ${esc(loadError)}
             <button type="button" class="tb-chip" data-health-reload>다시 읽기</button></div>`
        : '<div class="empty">운영 건강도 데이터 로딩 중…</div>';
    }
    const at = new Date(snap.generated_at);
    const t = snap.thresholds || {};
    return `
      <div class="tier">
        <span class="tier-name">운영 건강도</span>
        <span class="tier-en">기준 시각 ${esc(at.toLocaleString('ko-KR'))} · 마감 임박 ${esc(t.due_soon_days)}일 · 방치 ${esc(t.stale_days)}일 · 보류 장기화 ${esc(t.blocked_aging_days)}일</span>
        <button type="button" class="tb-chip" data-health-reload>다시 읽기</button>
        <span class="rule"></span>
      </div>
      ${kpis(UI)}
      <div class="grid">
        <div class="col-12">${projectPanel(UI)}</div>
        <div class="col-12">${drillPanel(UI)}</div>
        <div class="col-12">${goalPanel(UI)}</div>
        <div class="col-6">${trendPanel(UI)}</div>
      </div>`;
  };
})();
