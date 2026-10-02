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
    blocked: '보류', stale: '방치', due_soon: '마감 임박', unmanaged: '담당자·마감일 미지정', bulk_date: '월말 일괄 날짜(실제 날짜 필요)', triage_overdue: '이슈 분류 지연',
  };
  const FLAG_ORDER = ['overdue', 'missing_update', 'triage_overdue', 'bulk_date', 'blocked_aging', 'blocked', 'stale', 'due_soon', 'unmanaged'];

  let snap = null;
  let history = [];
  let ins = null, insHist = [];   // insights.json / insights_history.json (input coverage, team trend)
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
      const [s, h, i, ih] = await Promise.all([
        fetch('data/health.json', { cache: 'no-store' }),
        fetch('data/health_history.json', { cache: 'no-store' }),
        fetch('data/insights.json', { cache: 'no-store' }).catch(() => null),
        fetch('data/insights_history.json', { cache: 'no-store' }).catch(() => null),
      ]);
      if (!s.ok) throw new Error(`health.json HTTP ${s.status}`);
      snap = await s.json();
      history = h.ok ? await h.json() : [];
      if (!Array.isArray(history)) history = [];
      ins = i && i.ok ? await i.json() : null;
      insHist = ih && ih.ok ? await ih.json() : [];
      if (!Array.isArray(insHist)) insHist = [];
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

  // Decisions for the weekly meeting: spec §6 critical exceptions (blocked aging,
  // no update after due) or no owner — same rule as op_meeting_agenda.py.
  function decisionPanel(UI) {
    const crit = snap.items.filter((i) => i.flags.some((f) => f === 'blocked_aging' || f === 'missing_update') || !i.assignee)
      .filter((i) => i.flags.some((f) => ['overdue', 'missing_update', 'blocked_aging', 'triage_overdue'].includes(f)));
    const byProj = {};
    crit.forEach((i) => { (byProj[i.project] = byProj[i.project] || []).push(i); });
    const blocks = Object.entries(byProj).sort((a, b) => b[1].length - a[1].length).map(([proj, items]) => `
      <div style="margin-bottom:8px"><div class="panel-sub" style="margin:4px 0"><b>${esc(proj)}</b> · ${items.length}건${items.some((i) => !i.assignee) ? ` · 담당자 없음 ${items.filter((i) => !i.assignee).length}` : ''}</div>
      <table class="tbl"><tbody>${items.map((i) => `<tr><td style="width:90px">${link(i)}</td><td class="clamp">${esc(i.subject)}</td>
        <td style="width:100px">${esc(i.assignee || '담당자 없음')}</td><td style="width:220px;font-size:11px">${esc(i.flags.map((f) => FLAG_LABELS[f]).join(', '))}</td></tr>`).join('')}</tbody></table></div>`).join('');
    return UI.panel({ title: 'Decisions · 이번 주 결정 필요', sub: `${crit.length}건 — 목요일 회의 안건과 같은 목록 · 결정은 OP에서 담당자·마감일을 고치면 기록됨`,
      body: blocks || '<div class="empty">없음</div>' });
  }

  // OP project status says finished but open work remains (dashboard data, not the snapshot).
  function mismatchPanel(UI) {
    const D = window.DB;
    const bad = (D.PROJECTS || []).filter((p) => p.statusMismatch);
    if (!bad.length) return '';
    return UI.panel({ title: 'Project Status · 상태 불일치', sub: `${bad.length}곳 — OP 프로젝트 상태가 "마침"인데 열린 일감이 남아 있음 (팀장이 상태 또는 일감을 정리)`,
      body: `<table class="tbl"><thead><tr><th>과제</th><th>OP 상태</th><th class="num">열린 일감</th></tr></thead><tbody>
        ${bad.map((p) => `<tr><td><a class="wp-id" href="https://plm.abyz-lab.work/projects/${esc(p.identifier)}" target="_blank" rel="noopener">${esc(p.name)}</a></td><td>${esc(p.opStatus)}</td><td class="num">${p.openCount}</td></tr>`).join('')}</tbody></table>` });
  }

  /* ---- input coverage: how far the numbers on every screen can be trusted ---- */
  const pc = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  function coverage(UI) {
    if (!ins || !ins.metrics) return '<div class="empty">입력 충족도 데이터(insights.json)를 읽지 못했습니다.</div>';
    const m = ins.metrics.all;
    const lines = ins.product_lines.filter((l) => !l.regulatory).map((l) => ({ l, open: ins.project_status.filter((p) => l.projects.includes(p.identifier)).reduce((s, p) => s + p.open, 0),
      ms: ins.milestones.some((x) => l.projects.includes(x.project_identifier)) })).filter((x) => x.open > 0);
    const withMs = lines.filter((x) => x.ms).length;
    const gauges = `<div class="kpi-row kpi-strip" style="--kpi-cols:4">
      ${UI.kpi({ label: '담당 지정', value: pc(m.assigned, m.open), foot: `열린 일감 ${m.open}건 중 ${m.assigned}건` })}
      ${UI.kpi({ label: '마감일 입력', value: pc(m.with_due, m.open), foot: `${m.with_due}건 · 앞으로 일정·지연 판정의 바탕` })}
      ${UI.kpi({ label: '7일 내 수정', value: pc(m.touched_7d, m.open), foot: `${m.touched_7d}건 · 사람이 고친 것만(봇 제외)` })}
      ${UI.kpi({ label: 'OP 마일스톤 보유 제품군', value: `${withMs}/${lines.length}`, foot: '일감이 있는 제품군 기준' })}
    </div>`;
    const teamRows = Object.entries(ins.metrics.teams || {}).filter(([, c]) => c.open > 0).map(([t, c]) => `<tr><td><b>${esc(t)} 팀</b></td><td class="num">${c.open}</td>
      <td class="num">${pc(c.assigned, c.open)}</td><td class="num">${pc(c.with_due, c.open)}</td><td class="num">${pc(c.touched_7d, c.open)}</td></tr>`).join('');
    const team = UI.panel({ title: '팀별 충족도', sub: '제품군 담당(product_lines.json) 기준 · 공동 제품군은 두 팀장에 모두 포함', body: `<table class="tbl"><thead><tr><th>팀</th><th class="num">열린</th><th class="num">담당 지정</th><th class="num">마감일</th><th class="num">7일 내 수정</th></tr></thead><tbody>${teamRows}</tbody></table>` });
    const hrows = insHist.slice(-10).reverse().map((h) => { const a = h.all || {}; return `<tr><td>${esc(h.date)}</td><td class="num">${a.open ?? '–'}</td><td class="num">${a.assigned != null ? pc(a.assigned, a.open) : '–'}</td>
      <td class="num">${a.with_due != null ? pc(a.with_due, a.open) : '–'}</td><td class="num">${pc(a.touched_7d, a.open)}</td><td class="num">${a.need ?? '–'}</td><td class="num">${a.bulk ?? '–'}</td><td class="num">${a.empty ?? '–'}</td></tr>`; }).join('');
    const hist = UI.panel({ title: '충족도 추이', sub: '하루 한 줄, 최근 10일 · 담당 지정·마감일은 2026-10-01 이후 기록부터 표시', body: `<table class="tbl"><thead><tr><th>날짜</th><th class="num">열린</th><th class="num">담당 지정</th><th class="num">마감일</th><th class="num">7일 내 수정</th><th class="num">결정 필요</th><th class="num">월말 일괄</th><th class="num">빈 칸</th></tr></thead><tbody>${hrows}</tbody></table>` });
    return `<div class="muted mono" style="font-size:11px;margin:0 0 var(--grid-1)">입력 충족도 — 이 숫자들이 낮을수록 다른 화면의 판단을 그만큼 덜 믿어야 합니다. OP에 입력된 만큼만 계산됩니다.</div>${gauges}
      <div class="grid"><div class="col-6">${team}</div><div class="col-6">${hist}</div></div>`;
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
      ${coverage(UI)}
      ${kpis(UI)}
      <div class="grid">
        <div class="col-12">${decisionPanel(UI)}</div>
        <div class="col-12">${projectPanel(UI)}</div>
        <div class="col-12">${mismatchPanel(UI)}</div>
        <div class="col-12">${drillPanel(UI)}</div>
        <div class="col-6">${trendPanel(UI)}</div>
      </div>`;
  };
})();
