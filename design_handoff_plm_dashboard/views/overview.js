/* =============================================================================
   View: Overview — 전체 현황 한눈에
   Hierarchy: ① status headline (hero) → ② what needs attention → ③ trends (supporting)
   ========================================================================== */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.overview = function (state) {
    const D = window.DB, UI = window.UI, C = window.Charts;

    // Project visibility filter — managed here and shared across all views via state.hiddenProjects.
    const hp = new Set(state.hiddenProjects || []);
    const projFilterBar = `<div class="proj-filter-bar">
      <span class="muted" style="font-size:11px;flex-shrink:0">과제</span>
      ${D.PROJECTS.map((p) => hp.has(p.id)
        ? `<button class="proj-chip" data-show-project="${p.id}" title="클릭해서 표시">${p.name}</button>`
        : `<button class="proj-chip active" data-hide-project="${p.id}" title="클릭해서 숨김">${p.name}</button>`
      ).join('')}
    </div>`;

    const visibleWps = D.WORK_PACKAGES.filter((w) => !hp.has(w.projectId));
    const wps = visibleWps;
    const k = D.kpis(wps);
    const trend = D.openCloseTrend(wps, 12);
    const dist = D.statusDistribution(wps).filter((d) => d.count > 0);
    const health = D.projectHealth().filter((h) => !hp.has(h.project.id));
    const util = D.userUtilization();

    /* ---------- ① STATUS HEADLINE (hero / squint-test focal point) ---------- */
    const offTrack = health.filter((h) => h.project.health === 'off_track');
    const atRisk = health.filter((h) => h.project.health === 'at_risk');
    const onTrack = health.filter((h) => h.project.health === 'on_track');
    const overloaded = util.filter((u) => u.load > 100);
    const spentRatio = Math.round((k.spent / k.estimated) * 100);
    const avgProgress = Math.round(health.reduce((a, h) => a + h.progress, 0) / health.length);

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

    /* ---------- quiet KPI reference strip (no decoration; OVERDUE/DUE live in the headline callouts) ---------- */
    const kpiStrip = `<div class="kpi-row kpi-strip">
      ${UI.kpi({ label: 'TOTAL WP', value: k.total, foot: `<span class="muted">12개 과제</span>` })}
      ${UI.kpi({ label: 'OPEN', value: k.open, foot: `<span class="muted">진행 중 · 완료 ${k.closed}</span>` })}
      ${UI.kpi({ label: 'SPENT / EST', value: spentRatio, unit: '%', foot: `<span class="mono muted">${k.spent} / ${k.estimated}h</span>` })}
      ${UI.kpi({ label: 'CLOSE RATE', value: k.closeRate, unit: '%', foot: `<span class="kpi-delta up">▲ 4%</span><span class="muted">완료율</span>` })}
    </div>`;

    /* ---------- ② PROJECT HEALTH (primary decision panel) ---------- */
    const healthRows = health.sort((a, b) => ({ off_track: 0, at_risk: 1, on_track: 2 }[a.project.health] - { off_track: 0, at_risk: 1, on_track: 2 }[b.project.health])).map((h) => {
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
      body: `<table class="tbl"><thead><tr><th>Project</th><th>Health</th><th>Progress</th><th class="num">Open</th><th class="num">Overdue</th><th>Team</th></tr></thead>
        <tbody>${healthRows}</tbody></table>`,
      bodyStyle: 'padding:0 4px 4px;overflow-x:auto',
    });

    /* ---------- ② RISK FEED (primary attention panel) ---------- */
    const overdue = wps.filter(D.isOverdue).sort((a, b) => a._due - b._due).slice(0, 6);
    const riskFeed = UI.panel({
      title: 'Needs Attention · 주의 항목', sub: `${wps.filter(D.isOverdue).length}건 마감 초과`,
      tools: `<button class="mini-btn" data-nav="risks">전체 →</button>`,
      body: `<div class="feed">${overdue.map((wp) => {
        const due = UI.dueLabel(wp.dueDate);
        return `<div class="feed-item">
          <div class="feed-ic" style="background:rgba(239,68,68,.14)"><i class="dot" style="background:var(--c-red)"></i></div>
          <div class="feed-main">
            <div class="feed-title">${wp.subject}</div>
            <div class="feed-meta"><span class="mono">#${wp.id}</span><span>${D.P[wp.projectId].name}</span>
              <span class="kpi-delta ${due.cls}">${due.txt}</span></div>
          </div>
          ${UI.avatar(D.U[wp.assigneeId])}
        </div>`;
      }).join('') || '<div class="empty">지연 항목 없음 🎉</div>'}</div>`,
    });

    /* ---------- ③ SUPPORTING: throughput / status / load / activity ---------- */
    const trendPanel = UI.panel({
      title: 'Throughput · 주간 생성 vs 완료', sub: '최근 12주',
      tools: `<div class="legend"><span class="legend-item"><i class="dot" style="background:var(--c-prog)"></i>Opened</span>
        <span class="legend-item"><i class="dot" style="background:var(--c-done)"></i>Closed</span></div>`,
      body: C.columns({ groups: trend.map((t) => ({ label: t.label, values: [t.opened, t.closed] })),
        series: [{ name: 'Opened', color: 'var(--c-prog)' }, { name: 'Closed', color: 'var(--c-done)' }], h: 226 }),
    });

    const donut = UI.panel({
      title: 'WP Status · 상태 분포', sub: `${k.total} total`,
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

    const utilRows = util.slice(0, 8).map((u) => ({
      label: `<div style="width:110px;display:flex;align-items:center;gap:6px;overflow:hidden">${UI.avatar(u.user)}<span style="overflow:hidden;text-overflow:ellipsis">${u.user.name}</span></div>`,
      value: Math.min(140, u.load), max: 140,
      color: u.load > 100 ? 'var(--c-red)' : u.load > 80 ? 'var(--c-amber)' : 'var(--c-green)',
      capPct: (100 / 140) * 100, right: u.load + '%',
    }));
    const utilPanel = UI.panel({
      title: 'Team Load · 인원별 가동률', sub: '향후 3주 마감 기준 · 100% = 기준선',
      tools: `<button class="mini-btn" data-nav="resources">리소스 →</button>`,
      body: C.hbars({ rows: utilRows }),
    });

    const act = D.activityBreakdown(D.TIME_ENTRIES);
    const totalH = act.reduce((a, x) => a + x.hours, 0);
    const actPanel = UI.panel({
      title: 'Effort by Activity · 활동별 투입', sub: `총 ${totalH.toLocaleString()}h`,
      body: `<div style="margin-bottom:14px"><div class="loadbar" style="height:14px;border-radius:7px">
        ${(() => { let x = 0; return act.map((a) => { const w = (a.hours / totalH) * 100; const s = `<span data-tip="${a.activity.name}: ${a.hours}h (${Math.round(w)}%)" style="left:${x}%;width:${w}%;background:${a.activity.color};cursor:pointer"></span>`; x += w; return s; }).join(''); })()}
      </div></div>
      ${C.hbars({ rows: act.sort((a, b) => b.hours - a.hours).map((a) => ({
        label: `<span style="display:flex;align-items:center;gap:6px"><i class="dot" style="background:${a.activity.color}"></i>${a.activity.name}</span>`,
        value: a.hours, color: a.activity.color, right: a.hours + 'h' })) })}`,
    });

    return `
      <div class="section-row"><h2>Operations Overview</h2><span class="muted mono" style="font-size:11px">${D.PROJECTS.length} projects · ${D.USERS.filter((u) => !u.isGroup && !u.isObserver).length} members</span></div>
      ${projFilterBar}
      ${headline}
      ${kpiStrip}
      <div class="tier"><span class="tier-name">핵심 현황</span><span class="tier-en">What needs attention</span><span class="rule"></span></div>
      <div class="grid">
        <div class="col-7">${healthPanel}</div>
        <div class="col-5">${riskFeed}</div>
      </div>
      <div class="tier"><span class="tier-name">추세 · 분배</span><span class="tier-en">Trends & distribution · 보조</span><span class="rule"></span></div>
      <div class="grid supporting">
        <div class="col-8">${trendPanel}</div>
        <div class="col-4">${donut}</div>
        <div class="col-6">${utilPanel}</div>
        <div class="col-6">${actPanel}</div>
      </div>`;
  };
})();
