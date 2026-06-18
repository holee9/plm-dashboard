/* =============================================================================
   View: Overview — 전체 현황 한눈에
   Hierarchy: ① status headline (hero) → ② what needs attention → ③ trends (supporting)
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  // All available KPI section definitions
  const KPI_ALL = [
    { key: 'total',       label: 'TOTAL WP',   hint: '현재 가시 범위 내 전체 WP 수입니다. 다른 모든 지표의 기준값으로 활용합니다.' },
    { key: 'open',        label: 'OPEN',        hint: '완료·거절되지 않은 진행 중 WP 수입니다. 급격히 증가하면 백로그가 쌓이는 신호입니다.' },
    { key: 'spent',       label: 'SPENT / EST', hint: '투입 공수 대비 예상 공수 비율입니다. 100% 초과는 공수 초과, 낮으면 계획 대비 여유가 있음을 의미합니다.' },
    { key: 'closeRate',   label: 'CLOSE RATE',  hint: '전체 WP 중 완료된 비율입니다. 완료율이 지속 낮으면 진척이 느린 것이므로 병목을 찾아야 합니다.' },
    { key: 'dueWeek',     label: '금주 마감',   hint: '이번 주(7일 이내) 마감 예정인 WP 수입니다. 팀의 단기 집중 필요 업무를 파악하고 사전에 리소스를 조율하세요.' },
    { key: 'overdue',     label: 'OVERDUE',     hint: '마감일이 지난 미완료 WP 수입니다. 즉각적인 조치가 필요한 지연 항목입니다. 0을 목표로 관리하세요.' },
    { key: 'remaining',   label: '잔여 공수',   hint: '예상 공수에서 투입 공수를 뺀 잔여 시간(h)입니다. 남은 작업량을 공수로 가늠할 수 있습니다.' },
    { key: 'avgProgress', label: '평균 진행률', hint: '모든 과제의 WP 평균 완료율입니다. 포트폴리오 전체의 진행 상황을 단일 숫자로 확인합니다.' },
  ];
  const DEFAULT_KPI_KEYS = ['total', 'open', 'spent', 'closeRate', 'dueWeek'];

  // Helper: return D.PROJECTS sorted by state.projOrder
  function orderedProjects(state) {
    const ord = state.projOrder && state.projOrder.length ? state.projOrder : null;
    if (!ord) return [...window.DB.PROJECTS];
    const byId = Object.fromEntries(window.DB.PROJECTS.map((p) => [p.id, p]));
    const sorted = ord.map((id) => byId[id]).filter(Boolean);
    const rest = window.DB.PROJECTS.filter((p) => !ord.includes(p.id));
    return [...sorted, ...rest];
  }

  Views.overview = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;

    const projects = orderedProjects(state);
    const hp = new Set(state.hiddenProjects || []);
    const projEdit = !!state.projEditMode;
    const kpiEdit = !!state.kpiEditMode;

    /* -------- ① Project filter bar (drag + edit mode) -------- */
    const visChips = projects.filter((p) => !hp.has(p.id));
    const hidChips = projects.filter((p) => hp.has(p.id));

    const projFilterBar = `<div class="proj-filter-bar">
      <span class="muted" style="font-size:11px;flex-shrink:0">과제</span>
      ${visChips.map((p) => `<button class="proj-chip active" draggable="true"
          data-proj-drag="${p.id}"
          ${!projEdit ? `data-hide-project="${p.id}" title="클릭해서 숨김"` : `title="드래그로 순서 변경"`}>
          ${projEdit ? `<span style="opacity:.35;font-size:9px;line-height:1">⠿</span>` : ''}
          ${p.name}
          ${projEdit ? `<span class="proj-chip-x" data-hide-project="${p.id}">×</span>` : ''}
        </button>`).join('')}
      ${projEdit ? hidChips.map((p) =>
        `<button class="proj-chip proj-chip-hidden" data-show-project="${p.id}" title="클릭해서 표시">+ ${p.name}</button>`
      ).join('') : ''}
      <button class="mini-btn${projEdit ? ' on' : ''}" data-toggle-proj-edit style="flex-shrink:0;margin-left:2px">
        ${projEdit ? '완료' : '편집'}
      </button>
    </div>`;

    /* -------- data -------- */
    const wps = D.WORK_PACKAGES.filter((w) => !hp.has(w.projectId));
    const k = D.kpis(wps);
    const trend = D.openCloseTrend(wps, 12);
    const dist = D.statusDistribution(wps).filter((d) => d.count > 0);
    const health = D.projectHealth().filter((h) => !hp.has(h.project.id));
    const util = D.userUtilization();
    const spentRatio = k.estimated ? Math.round((k.spent / k.estimated) * 100) : 0;
    const avgProgress = health.length ? Math.round(health.reduce((a, h) => a + h.progress, 0) / health.length) : 0;
    const remaining = Math.max(0, k.estimated - k.spent);

    /* -------- ② Status headline -------- */
    const offTrack = health.filter((h) => h.project.health === 'off_track');
    const atRisk = health.filter((h) => h.project.health === 'at_risk');
    const onTrack = health.filter((h) => h.project.health === 'on_track');
    const overloaded = util.filter((u) => u.load > 100);

    let verdict, vtone, vglyph;
    if (offTrack.length >= 3 || k.overdue > 40 || overloaded.length >= 3) { verdict = '위험'; vtone = 'red'; vglyph = '!'; }
    else if (offTrack.length >= 1 || atRisk.length >= 2 || overloaded.length >= 1 || k.overdue > 15) { verdict = '주의'; vtone = 'amber'; vglyph = '!'; }
    else { verdict = '정상'; vtone = 'green'; vglyph = '✓'; }

    const sentence = `활성 과제 <b>${health.length}</b>개 · 정상 ${onTrack.length} / 주의 ${atRisk.length} / 지연 ${offTrack.length} · 전체 진행률 <b>${avgProgress}%</b>`;

    const callouts = [
      { n: k.overdue, t: '마감 초과', tone: 'red', nav: 'risks', show: k.overdue > 0 },
      { n: overloaded.length, t: '인원 과부하', tone: 'red', nav: 'resources', show: overloaded.length > 0 },
      { n: offTrack.length, t: '지연 과제', tone: 'amber', nav: 'projects', show: offTrack.length > 0 },
      { n: k.dueThisWeek, t: '이번 주 마감', tone: 'amber', nav: 'timeline', show: k.dueThisWeek > 0 },
    ].filter((c) => c.show).slice(0, 4);
    if (!callouts.length) callouts.push({ n: '✓', t: '주의 항목 없음', tone: 'ok', nav: '', show: true });

    const headline = `<div class="headline tone-${vtone}">
      <div class="headline-status">
        <div class="status-badge">${vglyph}</div>
        <div>
          <div class="status-verdict"><span class="lbl">운영 상태</span><span class="v">${verdict}</span></div>
          <div class="status-sentence">${sentence}</div>
        </div>
      </div>
      <div class="headline-callouts">
        ${callouts.map((c) => `<button class="callout ${c.tone}" ${c.nav ? `data-nav="${c.nav}"` : ''}>
          <span class="n">${c.n}</span><span class="t">${c.t}</span></button>`).join('')}
      </div>
    </div>`;

    /* -------- ③ KPI strip (configurable, draggable in edit mode) -------- */
    const kpiVals = {
      total:       { v: k.total,        u: '',   tone: '',                          foot: `<span class="muted">${health.length}개 과제</span>` },
      open:        { v: k.open,         u: '',   tone: '',                          foot: `<span class="muted">완료 ${k.closed}</span>` },
      spent:       { v: spentRatio,     u: '%',  tone: 'accent',                    foot: `<span class="mono muted">${k.spent}/${k.estimated}h</span>` },
      closeRate:   { v: k.closeRate,    u: '%',  tone: '',                          foot: `<span class="kpi-delta up">▲ 4%</span>` },
      dueWeek:     { v: k.dueThisWeek, u: '',   tone: k.dueThisWeek > 5 ? 'amber' : '', foot: `<span class="muted">이번 주 마감</span>` },
      overdue:     { v: k.overdue,      u: '',   tone: k.overdue > 0 ? 'red' : '', foot: `<span class="muted">마감 초과</span>` },
      remaining:   { v: remaining,      u: 'h',  tone: '',                          foot: `<span class="muted">잔여 공수</span>` },
      avgProgress: { v: avgProgress,    u: '%',  tone: '',                          foot: `<span class="muted">전체 평균</span>` },
    };

    const activeSections = state.kpiSections || DEFAULT_KPI_KEYS;
    const hiddenDefs = KPI_ALL.filter((d) => !activeSections.includes(d.key));
    const totalCols = activeSections.length + (kpiEdit ? hiddenDefs.length : 0);

    const kpiCards = activeSections.map((key) => {
      const def = KPI_ALL.find((d) => d.key === key) || { label: key, hint: '' };
      const val = kpiVals[key] || { v: '-', u: '', tone: '', foot: '' };
      const attrs = kpiEdit
        ? `draggable="true" data-kpi-drag="${key}" data-tip="${def.hint}"`
        : `data-tip="${def.hint}"`;
      const labelHtml = kpiEdit
        ? `${def.label}<span class="kpi-remove" data-kpi-toggle="${key}" title="숨기기">×</span>`
        : def.label;
      return UI.kpi({ label: labelHtml, value: val.v, unit: val.u, foot: val.foot, tone: val.tone, attrs });
    }).join('');

    const hiddenKpiCards = kpiEdit ? hiddenDefs.map((def) =>
      `<div class="kpi kpi-hidden" data-kpi-toggle="${def.key}" title="${def.hint}">
        <div class="kpi-label">${def.label}</div>
        <div class="kpi-value" style="font-size:18px;color:var(--text-faint)">+ 추가</div>
      </div>`
    ).join('') : '';

    const kpiStrip = `
      <div class="kpi-row kpi-strip${kpiEdit ? ' kpi-edit' : ''}" style="--kpi-cols:${totalCols}">
        ${kpiCards}${hiddenKpiCards}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:4px">
        <button class="mini-btn${kpiEdit ? ' on' : ''}" data-toggle-kpi-edit>
          ${kpiEdit ? 'KPI 편집 완료' : 'KPI 편집'}
        </button>
      </div>`;

    /* -------- ④ Project health panel -------- */
    const healthRows = [...health]
      .sort((a, b) => ({ off_track: 0, at_risk: 1, on_track: 2 }[a.project.health] - { off_track: 0, at_risk: 1, on_track: 2 }[b.project.health]))
      .map((h) => {
        const p = h.project;
        return `<tr data-nav-project="${p.id}" style="cursor:pointer">
          <td class="strong"><div style="display:flex;flex-direction:column"><span>${p.name}</span><span class="muted" style="font-size:11px">${p.nameKo}</span></div></td>
          <td>${UI.healthChip(p.health)}</td>
          <td style="width:130px"><div style="display:flex;align-items:center;gap:8px">${UI.progressBar(h.progress, 'neutral')}<span class="mono" style="font-size:11px;color:var(--text)">${h.progress}%</span></div></td>
          <td class="num">${h.kpi.open}</td>
          <td class="num" style="color:${h.overdue ? 'var(--c-red)' : 'var(--text-faint)'}">${h.overdue || '–'}</td>
          <td>${UI.avatarStack(p.memberIds, 4)}</td>
        </tr>`;
      }).join('');

    const healthPanel = UI.panel({
      title: 'Projects · 과제 현황', sub: '지연·주의 순',
      tools: `<button class="mini-btn" data-nav="projects">전체 보기 →</button>`,
      hint: '각 과제의 건강 상태·진행률·지연 WP를 한눈에 비교합니다. 지연(Off track)·주의(At risk) 과제가 상단에 정렬됩니다. 행을 클릭하면 과제 상세로 이동합니다.',
      body: `<table class="tbl"><thead><tr><th>Project</th><th>Health</th><th>Progress</th><th class="num">Open</th><th class="num">Overdue</th><th>Team</th></tr></thead>
        <tbody>${healthRows}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    /* -------- ⑤ Needs Attention (risk feed) -------- */
    const overdue = wps.filter(D.isOverdue).sort((a, b) => a._due - b._due).slice(0, 4);
    const riskFeed = UI.panel({
      title: 'Needs Attention · 주의 항목', sub: `${wps.filter(D.isOverdue).length}건 마감 초과`,
      tools: `<button class="mini-btn" data-nav="risks">전체 →</button>`,
      hint: '마감일이 이미 지난 WP를 초과 일수 순으로 표시합니다. 가장 긴급한 항목부터 담당자에게 확인하고 완료 처리 또는 일정 재조정을 진행하세요.',
      body: `<div class="feed">${overdue.map((wp) => {
        const due = UI.dueLabel(wp.dueDate);
        return `<div class="feed-item">
          <div class="feed-ic" style="background:rgba(239,68,68,.14)"><i class="dot" style="background:var(--c-red)"></i></div>
          <div class="feed-main">
            <div class="feed-title">${wp.subject}</div>
            <div class="feed-meta">${UI.wpLink(wp)}<span>${D.P[wp.projectId].name}</span>
              <span class="kpi-delta ${due.cls}">${due.txt}</span></div>
          </div>
          ${UI.avatar(D.U[wp.assigneeId])}
        </div>`;
      }).join('') || '<div class="empty">지연 항목 없음 🎉</div>'}</div>`,
    });

    /* -------- ⑥ 이번 주 마감 WP 피드 -------- */
    const thisWeekWps = wps
      .filter((w) => D.isOpen(w) && w._due && w._due > D.TODAY && w._due <= D.addDays(D.TODAY, 7))
      .sort((a, b) => a._due - b._due)
      .slice(0, 4);
    const weeklyFeed = UI.panel({
      title: '이번 주 마감 · 금주 WP', sub: `이번 주 마감 예정 ${k.dueThisWeek}건`,
      tools: `<button class="mini-btn" data-nav="timeline">일정 →</button>`,
      hint: '이번 주(오늘 기준 7일 이내) 마감 예정인 WP입니다. 미리 진행 상태를 확인해 완료율을 높이면 다음 주 지연 건으로 이어지는 것을 막을 수 있습니다.',
      body: `<div class="feed">${thisWeekWps.map((wp) => {
        const due = UI.dueLabel(wp.dueDate);
        return `<div class="feed-item">
          <div class="feed-ic" style="background:rgba(245,158,11,.12)"><i class="dot" style="background:var(--c-amber)"></i></div>
          <div class="feed-main">
            <div class="feed-title">${wp.subject}</div>
            <div class="feed-meta">${UI.wpLink(wp)}<span>${D.P[wp.projectId].name}</span>
              <span class="kpi-delta ${due.cls}">${due.txt}</span></div>
          </div>
          ${UI.avatar(D.U[wp.assigneeId])}
        </div>`;
      }).join('') || '<div class="empty">이번 주 마감 WP 없음 ✓</div>'}</div>`,
    });

    /* -------- ⑦ 추세·분배: Throughput + WP Status (동일 col-6) -------- */
    const trendPanel = UI.panel({
      title: 'Throughput · 주간 생성 vs 완료', sub: '최근 12주',
      hint: '매주 생성(Opened)과 완료(Closed) WP 수를 비교합니다. Closed가 Opened보다 지속적으로 많으면 백로그 감소 중입니다. 역전이 반복되면 우선순위 재검토가 필요한 신호입니다.',
      tools: `<div class="legend"><span class="legend-item"><i class="dot" style="background:var(--c-prog)"></i>Opened</span>
        <span class="legend-item"><i class="dot" style="background:var(--c-done)"></i>Closed</span></div>`,
      body: C.columns({ groups: trend.map((t) => ({ label: t.label, values: [t.opened, t.closed] })),
        series: [{ name: 'Opened', color: 'var(--c-prog)' }, { name: 'Closed', color: 'var(--c-done)' }], h: 226 }),
    });

    const donut = UI.panel({
      title: 'WP Status · 상태 분포', sub: `${k.total} total`,
      hint: '전체 WP의 상태별 분포입니다. In Progress·Review·Testing 비율로 병목 구간을 파악하세요. On Hold가 많으면 블로커 해소가 시급합니다. Closed 비율이 낮으면 완료 속도를 점검하세요.',
      body: `<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        ${C.donut({ segments: dist.map((d) => ({ value: d.count, color: d.status.color, label: d.status.name })),
          size: 150, thickness: 22, centerTop: k.open, centerBottom: 'OPEN' })}
        <div class="legend" style="flex-direction:column;flex:1;min-width:120px">
          ${dist.map((d) => `<div class="legend-item" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:7px"><i class="dot" style="background:${d.status.color}"></i>${d.status.name}</span>
            <b class="mono" style="color:var(--text)">${d.count}</b></div>`).join('')}
        </div>
      </div>`,
    });

    /* -------- ⑧ 지원 패널: Team Load + Effort -------- */
    const utilRows = util.slice(0, 8).map((u) => ({
      label: `<div style="width:110px;display:flex;align-items:center;gap:6px;overflow:hidden">${UI.avatar(u.user)}<span style="overflow:hidden;text-overflow:ellipsis">${u.user.name}</span></div>`,
      value: Math.min(140, u.load), max: 140,
      color: u.load > 100 ? 'var(--c-red)' : u.load > 80 ? 'var(--c-amber)' : 'var(--c-green)',
      capPct: (100 / 140) * 100, right: u.load + '%',
    }));
    const utilPanel = UI.panel({
      title: 'Team Load · 인원별 가동률', sub: '향후 3주 마감 기준 · 100% = 기준선',
      tools: `<button class="mini-btn" data-nav="resources">리소스 →</button>`,
      hint: '향후 3주간 마감되는 WP의 잔여 공수를 팀원 주간 용량(40h)으로 나눈 가동률입니다. 100% 초과는 과부하를 의미합니다. 빨간 막대가 보이면 리소스 재배분이나 마감 조정을 검토하세요.',
      body: C.hbars({ rows: utilRows }),
    });

    const act = D.activityBreakdown(D.TIME_ENTRIES);
    const totalH = act.reduce((a, x) => a + x.hours, 0);
    const actPanel = UI.panel({
      title: 'Effort by Activity · 활동별 투입', sub: `총 ${totalH.toLocaleString()}h`,
      hint: '전체 투입 시간을 활동 유형(개발·테스트·관리 등)별로 분류합니다. 개발 대비 관리·지원 비율이 과도하게 높으면 실질 진척이 낮을 수 있습니다. 이상 패턴 발견 시 프로세스를 점검하세요.',
      body: `<div style="margin-bottom:14px"><div class="loadbar" style="height:14px;border-radius:7px">
        ${(() => { let x = 0; return act.map((a) => { const w = (a.hours / totalH) * 100; const s = `<span data-tip="${a.activity.name}: ${a.hours}h (${Math.round(w)}%)" style="left:${x}%;width:${w}%;background:${a.activity.color};cursor:pointer"></span>`; x += w; return s; }).join(''); })()}
      </div></div>
      ${C.hbars({ rows: act.sort((a, b) => b.hours - a.hours).map((a) => ({
        label: `<span style="display:flex;align-items:center;gap:6px"><i class="dot" style="background:${a.activity.color}"></i>${a.activity.name}</span>`,
        value: a.hours, color: a.activity.color, right: a.hours + 'h' })) })}`,
    });

    /* -------- layout -------- */
    return `
      <div class="section-row"><h2>Operations Overview</h2><span class="muted mono" style="font-size:11px">${D.PROJECTS.length} projects · ${D.USERS.filter((u) => !u.isGroup && !u.isObserver && !u.isBot).length} members</span></div>
      ${projFilterBar}
      ${headline}
      ${kpiStrip}
      <div class="tier">
        <span class="tier-name">핵심 현황</span>
        <span class="tier-en">What needs attention</span>
        <span class="hint-ic" data-tip="지금 당장 주의가 필요한 항목을 식별합니다. 마감 초과 WP와 이번 주 마감 WP를 함께 확인하여 우선순위와 리소스 배분을 결정하세요.">ⓘ</span>
        <span class="rule"></span>
      </div>
      <div class="grid">
        <div class="col-7">${healthPanel}</div>
        <div class="col-5" style="display:flex;flex-direction:column;gap:var(--grid-1)">${riskFeed}${weeklyFeed}</div>
      </div>
      <div class="tier">
        <span class="tier-name">추세 · 분배</span>
        <span class="tier-en">Trends & distribution · 보조</span>
        <span class="hint-ic" data-tip="WP 생성·완료 추세, 현재 상태 분포, 팀 가동률, 활동별 공수를 보조 데이터로 제공합니다. 현황 판단보다 패턴과 이상 징후 포착에 활용하세요.">ⓘ</span>
        <span class="rule"></span>
      </div>
      <div class="grid supporting">
        <div class="col-6">${trendPanel}</div>
        <div class="col-6">${donut}</div>
        <div class="col-6">${utilPanel}</div>
        <div class="col-6">${actPanel}</div>
      </div>`;
  };
})();
