/* =============================================================================
   PLM Dashboard — Data layer
   Mock dataset shaped to mirror the OpenProject API v3 schema so that a future
   live integration is a drop-in replacement. Every collection below maps to a
   real OpenProject endpoint:

     PROJECTS     ->  GET /api/v3/projects
     USERS        ->  GET /api/v3/users  (+ memberships for capacity/roles)
     STATUSES     ->  GET /api/v3/statuses
     TYPES        ->  GET /api/v3/types
     PRIORITIES   ->  GET /api/v3/priorities
     VERSIONS     ->  GET /api/v3/versions      (sprints / milestones)
     ACTIVITIES   ->  GET /api/v3/time_entries/activities
     WORK_PACKAGES->  GET /api/v3/work_packages (filtered/paginated)
     TIME_ENTRIES ->  GET /api/v3/time_entries

   To go live: replace buildDataset() with fetches against plm.abyz-lab.work,
   normalise the HAL/_links payloads into these flat shapes, and keep the
   selectors below untouched.
   ========================================================================== */
(function () {
  'use strict';

  // ---- deterministic PRNG so the mock is stable across reloads --------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260529);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const pickW = (arr, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rnd() * total;
    for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
    return arr[arr.length - 1];
  };
  const ri = (min, max) => min + Math.floor(rnd() * (max - min + 1));
  const rf = (min, max) => min + rnd() * (max - min);

  // ---- time helpers ---------------------------------------------------------
  const localMidnight = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let TODAY = new Date('2026-05-29T00:00:00');
  const DAY = 86400000;
  const addDays = (d, n) => new Date(d.getTime() + n * DAY);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const startOfWeek = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; return addDays(x, -day); };

  // =====================  STATIC ENUMS  ======================================
  const STATUSES = [
    { id: 1, name: 'New',         cat: 'new',        color: '#8B93A7', isClosed: false },
    { id: 2, name: 'In progress', cat: 'inProgress', color: '#3B82F6', isClosed: false },
    { id: 3, name: 'In review',   cat: 'review',     color: '#8B5CF6', isClosed: false },
    { id: 4, name: 'In testing',  cat: 'testing',    color: '#06B6D4', isClosed: false },
    { id: 5, name: 'On hold',     cat: 'onHold',     color: '#F59E0B', isClosed: false },
    { id: 6, name: 'Closed',      cat: 'closed',     color: '#22C55E', isClosed: true  },
    { id: 7, name: 'Rejected',    cat: 'closed',     color: '#EF4444', isClosed: true  },
  ];
  const BOARD_COLS = [
    { key: 'new',        label: 'New',         statusIds: [1] },
    { key: 'inProgress', label: 'In Progress', statusIds: [2] },
    { key: 'review',     label: 'In Review',   statusIds: [3] },
    { key: 'testing',    label: 'Testing',     statusIds: [4] },
    { key: 'onHold',     label: 'On Hold',     statusIds: [5] },
    { key: 'wont',       label: "Won't",       statusIds: [7] },
    { key: 'closed',     label: 'Done',        statusIds: [6] },
  ];
  const TYPES = [
    { id: 1, name: 'Epic',       glyph: '◆' },
    { id: 2, name: 'Feature',    glyph: '★' },
    { id: 3, name: 'User story', glyph: '▣' },
    { id: 4, name: 'Task',       glyph: '✓' },
    { id: 5, name: 'Bug',        glyph: '⬣' },
    { id: 6, name: 'Milestone',  glyph: '◇' },
    { id: 7, name: 'Phase',      glyph: '▤' },
  ];
  const PRIORITIES = [
    { id: 1, name: 'Low',       color: '#8B93A7' },
    { id: 2, name: 'Normal',    color: '#3B82F6' },
    { id: 3, name: 'High',      color: '#F59E0B' },
    { id: 4, name: 'Immediate', color: '#EF4444' },
  ];
  const ACTIVITIES = [
    { id: 1, name: 'Management',    color: '#8B5CF6' },
    { id: 2, name: 'Specification', color: '#06B6D4' },
    { id: 3, name: 'Development',   color: '#3B82F6' },
    { id: 4, name: 'Testing',       color: '#22C55E' },
    { id: 5, name: 'Support',       color: '#F59E0B' },
    { id: 6, name: 'Other',         color: '#8B93A7' },
  ];

  // =====================  USERS (members)  ===================================
  const AVATAR_COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#22C55E', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#6366F1', '#F97316'];
  // Sample data removed — USE_LIVE_API=true, all data comes from OP on page load.
  const USER_DEFS = [];
  const USERS = USER_DEFS.map((u, i) => ({
    id: i + 1,
    name: u[0],
    title: u[1],
    role: u[2],
    initials: u[0].slice(1),                       // 2 trailing chars of KR name
    color: AVATAR_COLORS[i % AVATAR_COLORS.length],
    capacityPerWeek: u[2] === 'PM' ? 25 : 40,      // PM has split duties
  }));
  const usersByRole = (role) => USERS.filter((u) => u.role === role);

  // =====================  PROJECTS  ==========================================
  // Sample data removed — USE_LIVE_API=true, all data comes from OP on page load.
  const PROJECT_DEFS = [];
  const PROJECTS = PROJECT_DEFS.map((p, i) => {
    const start = addDays(TODAY, -ri(70, 220));
    const end = addDays(TODAY, ri(20, 160));
    // team: a lead + 2-5 contributors (lead spread across the whole org)
    const lead = pick(USERS);
    const team = new Set([lead.id]);
    const teamSize = ri(3, 6);
    while (team.size < teamSize) team.add(pick(USERS).id);
    // Assign project roles: lead → PL, first PM-titled member → PM, rest → Member
    const memberRoles = {};
    [...team].forEach((id) => {
      const u = USERS.find((u) => u.id === id);
      if (id === lead.id) memberRoles[id] = 'PL';
      // GOTCHA: title = job title ('Project Lead'), role = dept code ('PM'). Check role, not title.
      else if (u && u.role === 'PM' && !Object.values(memberRoles).includes('PM')) memberRoles[id] = 'PM';
      else memberRoles[id] = 'Member';
    });
    return {
      id: i + 1,
      name: p[0],
      nameKo: p[1],
      identifier: p[2],
      health: p[3],
      leadId: lead.id,
      memberIds: [...team],
      memberRoles,
      startDate: iso(start),
      dueDate: iso(end),
      _start: start, _end: end,
    };
  });

  // =====================  VERSIONS (sprints)  ================================
  let versionId = 1;
  const VERSIONS = [];
  PROJECTS.forEach((p) => {
    const sprintLen = 14;
    let cur = startOfWeek(p._start);
    let n = 1;
    while (cur < addDays(p._end, sprintLen) && n <= 20) {
      const vStart = cur;
      const vEnd = addDays(cur, sprintLen - 1);
      VERSIONS.push({
        id: versionId++,
        projectId: p.id,
        name: `Sprint ${n}`,
        startDate: iso(vStart),
        dueDate: iso(vEnd),
        _start: vStart, _end: vEnd,
        status: vEnd < TODAY ? 'closed' : (vStart <= TODAY ? 'open' : 'planned'),
      });
      cur = addDays(cur, sprintLen);
      n++;
    }
  });
  const versionsByProject = (pid) => VERSIONS.filter((v) => v.projectId === pid);
  const currentVersion = (pid) => versionsByProject(pid).find((v) => v.status === 'open')
    || versionsByProject(pid).slice(-1)[0];

  // =====================  WORK PACKAGES  =====================================
  const SUBJECTS = {
    1: ['플랫폼 아키텍처 재설계', '멀티테넌시 기반 마련', '인증·권한 체계 정비'],
    2: ['{m} API 설계', '{m} 데이터 모델 정의', '{m} 검색 기능 구현', '{m} 대량 등록 처리', '{m} 권한 정책 적용', '{m} 캐싱 레이어 추가'],
    3: ['{m} 화면 사용성 개선', '{m} 사용자 시나리오 정의', '{m} 온보딩 플로우', '{m} 알림 설정 화면'],
    4: ['{m} 단위 작업 처리', '{m} 배치 스케줄러 구성', '{m} 로그 수집 연동', '{m} 환경설정 분리', '{m} 마이그레이션 스크립트', '{m} 문서화 보강'],
    5: ['{m} 로그인 간헐적 실패', '{m} 목록 정렬 오류', '{m} 동시성 데이터 깨짐', '{m} 메모리 누수 의심', '{m} 첨부 업로드 실패'],
    6: ['{m} 1차 릴리스', '{m} 베타 오픈', '{m} 정식 배포'],
    7: ['{m} 설계 단계', '{m} 개발 단계', '{m} 안정화 단계'],
  };
  const subjectFor = (typeId, projectName) => {
    const pool = SUBJECTS[typeId] || SUBJECTS[4];
    return pick(pool).replace('{m}', projectName.split(' ')[0]);
  };

  let wpId = 1000;
  const WORK_PACKAGES = [];
  PROJECTS.forEach((p) => {
    const count = ri(16, 26);
    const versions = versionsByProject(p.id);
    for (let i = 0; i < count; i++) {
      const type = pickW(TYPES, [3, 8, 8, 22, 9, 2, 2]); // task/feature heavy
      // status distribution skews by project health
      const sw = p.health === 'off_track' ? [10, 16, 6, 4, 8, 18, 3]
               : p.health === 'at_risk'   ? [9, 16, 7, 5, 4, 26, 2]
               :                            [7, 14, 6, 5, 2, 38, 1];
      const status = pickW(STATUSES, sw);
      const priority = pickW(PRIORITIES, [4, 14, 6, 1.5]);
      const assignee = pick(p.memberIds.map((id) => USERS.find((u) => u.id === id)));
      const author = pick(USERS);
      const version = versions.length ? pick(versions) : null;

      // ---- dates: open WPs live in an active window around today; closed are historical
      const span = ri(2, 18);
      const daysToToday = Math.max(1, Math.round((TODAY - p._start) / DAY));
      let created, start, due, closedAt = null;
      if (status.isClosed) {
        created = addDays(p._start, ri(0, daysToToday));
        start = addDays(created, ri(0, 8));
        due = addDays(start, span);
        closedAt = addDays(due, ri(-3, 6));
        if (closedAt > TODAY) closedAt = addDays(TODAY, -ri(1, 20));
      } else if (rnd() < 0.15) {
        // ~15% of open WPs are overdue, by at most two weeks (realistic)
        due = addDays(TODAY, -ri(1, 14));
        start = addDays(due, -span);
        created = addDays(start, -ri(0, 8));
      } else {
        // upcoming / in-flight work scheduled around now
        due = addDays(TODAY, ri(1, 55));
        start = addDays(due, -span);
        created = addDays(TODAY, -ri(2, 40));
      }

      const estimated = ri(4, 60);
      let pct;
      if (status.isClosed) pct = 100;
      else if (status.cat === 'new') pct = 0;
      else if (status.cat === 'inProgress') pct = ri(15, 70);
      else if (status.cat === 'review') pct = ri(70, 90);
      else if (status.cat === 'testing') pct = ri(80, 95);
      else pct = ri(10, 60); // onHold
      const spent = Math.round(estimated * (pct / 100) * rf(0.8, 1.3) * 10) / 10;

      WORK_PACKAGES.push({
        id: wpId++,
        subject: subjectFor(type.id, p.name),
        projectId: p.id,
        typeId: type.id,
        statusId: status.id,
        priorityId: priority.id,
        assigneeId: assignee ? assignee.id : null,
        authorId: author.id,
        versionId: version ? version.id : null,
        startDate: iso(start),
        dueDate: iso(due),
        estimatedHours: estimated,
        spentHours: spent,
        percentDone: pct,
        createdAt: iso(created),
        updatedAt: iso(addDays(closedAt || TODAY, -ri(0, 12))),
        closedAt: closedAt ? iso(closedAt) : null,
        _start: start, _due: due, _created: created, _closed: closedAt,
      });
    }
  });

  // =====================  TIME ENTRIES  ======================================
  let teId = 5000;
  const TIME_ENTRIES = [];
  WORK_PACKAGES.forEach((wp) => {
    if (wp.spentHours <= 0) return;
    const actW = wp.typeId === 5 ? [1, 1, 5, 6, 3, 1]   // bug -> dev+test
              : wp.typeId === 6 ? [6, 2, 1, 1, 1, 1]    // milestone -> mgmt
              : [2, 3, 8, 3, 2, 1];                      // default dev-heavy
    let remaining = wp.spentHours;
    const begin = wp._start;
    const endRef = wp._closed || TODAY;
    const days = Math.max(1, Math.round((endRef - begin) / DAY));
    let guard = 0;
    while (remaining > 0.5 && guard < 12) {
      const h = Math.min(remaining, Math.round(rf(2, 8) * 10) / 10);
      const activity = pickW(ACTIVITIES, actW);
      const on = addDays(begin, ri(0, days));
      TIME_ENTRIES.push({
        id: teId++,
        workPackageId: wp.id,
        projectId: wp.projectId,
        userId: wp.assigneeId || pick(USERS).id,
        activityId: activity.id,
        hours: h,
        spentOn: iso(on > TODAY ? TODAY : on),
        _on: on > TODAY ? TODAY : on,
      });
      remaining -= h;
      guard++;
    }
  });

  // =====================  SELECTORS  =========================================
  const byId = (coll) => { const m = {}; coll.forEach((x) => (m[x.id] = x)); return m; };
  const U = byId(USERS), P = byId(PROJECTS), S = byId(STATUSES),
        T = byId(TYPES), PR = byId(PRIORITIES), V = byId(VERSIONS), A = byId(ACTIVITIES);

  const isOpen = (wp) => {
    const status = S[wp.statusId];
    return !status || !status.isClosed;
  };
  const hasDueDate = (wp) => !!wp._due;
  const isOverdue = (wp) => isOpen(wp) && hasDueDate(wp) && wp._due < TODAY;
  const dueWithin = (wp, days) => isOpen(wp) && hasDueDate(wp) && wp._due >= TODAY && wp._due <= addDays(TODAY, days);

  function statusDistribution(wps) {
    const d = {};
    STATUSES.forEach((s) => (d[s.id] = 0));
    wps.forEach((wp) => d[wp.statusId]++);
    return STATUSES.map((s) => ({ status: s, count: d[s.id] }));
  }

  function kpis(wps) {
    const open = wps.filter(isOpen);
    const closed = wps.filter((wp) => !isOpen(wp));
    return {
      total: wps.length,
      open: open.length,
      closed: closed.length,
      overdue: wps.filter(isOverdue).length,
      dueThisWeek: wps.filter((wp) => dueWithin(wp, 7)).length,
      estimated: Math.round(wps.reduce((a, wp) => a + wp.estimatedHours, 0)),
      spent: Math.round(wps.reduce((a, wp) => a + wp.spentHours, 0)),
      closeRate: wps.length ? Math.round((closed.length / wps.length) * 100) : 0,
    };
  }

  // weekly open/close throughput for the last N weeks
  function openCloseTrend(wps, weeks) {
    const out = [];
    const thisWeek = startOfWeek(TODAY);
    for (let i = weeks - 1; i >= 0; i--) {
      const ws = addDays(thisWeek, -i * 7);
      const we = addDays(ws, 7);
      const opened = wps.filter((wp) => wp._created >= ws && wp._created < we).length;
      const closedCnt = wps.filter((wp) => wp._closed && wp._closed >= ws && wp._closed < we).length;
      out.push({ label: `${ws.getMonth() + 1}/${ws.getDate()}`, ws, opened, closed: closedCnt });
    }
    return out;
  }

  // cumulative backlog (open WP count) over weeks — for area chart
  function backlogTrend(wps, weeks) {
    const tr = openCloseTrend(wps, weeks);
    // approximate starting backlog
    let backlog = wps.filter((wp) => isOpen(wp)).length
      - tr.reduce((a, w) => a + w.opened - w.closed, 0);
    return tr.map((w) => { backlog += w.opened - w.closed; return { label: w.label, value: Math.max(0, backlog) }; });
  }

  // per-user load — NEAR-TERM only.
  // Load = remaining hours of work DUE within the next 3 weeks ÷ capacity for that
  // window. Total backlog is reported separately so far-future work never inflates
  // "overload". This keeps the number believable (OP has no capacity field, so an
  // honest near-term band beats a precise-looking 300%+).
  function userUtilization() {
    const HORIZON = 21;
    const horizonEnd = addDays(TODAY, HORIZON);
    return USERS.filter((u) => !u.isGroup && !u.isObserver && !u.isBot).map((u) => {
      const assigned = WORK_PACKAGES.filter((wp) => wp.assigneeId === u.id);
      const open = assigned.filter(isOpen);
      const imminent = open.filter((wp) => wp._due && wp._due <= horizonEnd); // incl. overdue, excludes unscheduled work
      const nearTerm = imminent.reduce((a, wp) => a + wp.estimatedHours * (1 - wp.percentDone / 100), 0);
      const backlog = open.reduce((a, wp) => a + wp.estimatedHours * (1 - wp.percentDone / 100), 0);
      const spent = assigned.reduce((a, wp) => a + wp.spentHours, 0);
      const overdue = assigned.filter(isOverdue).length;
      const load = Math.round((nearTerm / (u.capacityPerWeek * 3)) * 100);
      return {
        user: u, openCount: open.length, totalCount: assigned.length,
        remaining: Math.round(nearTerm),   // near-term remaining (drives load)
        backlog: Math.round(backlog),      // total open backlog
        spent: Math.round(spent), overdue,
        load, projects: [...new Set(open.map((wp) => wp.projectId))],
      };
    }).sort((a, b) => b.load - a.load);
  }

  function projectHealth() {
    return PROJECTS.map((p) => {
      const wps = WORK_PACKAGES.filter((wp) => wp.projectId === p.id);
      const k = kpis(wps);
      const progress = wps.length
        ? Math.round(wps.reduce((a, wp) => a + wp.percentDone, 0) / wps.length) : 0;
      return { project: p, wps, kpi: k, progress, overdue: k.overdue, members: p.memberIds.length };
    });
  }

  // burndown for a version: remaining estimated hours vs ideal line
  function burndown(version) {
    const wps = WORK_PACKAGES.filter((wp) => wp.versionId === version.id);
    const total = wps.reduce((a, wp) => a + wp.estimatedHours, 0);
    // current actual remaining = unfinished portion of every WP
    const currentRemaining = wps.reduce((a, wp) => a + wp.estimatedHours * (1 - wp.percentDone / 100), 0);
    const days = Math.max(1, Math.round((version._end - version._start) / DAY));
    const toToday = Math.max(0, Math.round((TODAY - version._start) / DAY));
    const pts = [];
    for (let d = 0; d <= days; d += Math.max(1, Math.round(days / 10))) {
      const cur = addDays(version._start, d);
      let remaining = null;
      if (cur <= TODAY) {
        const closedH = wps.filter((wp) => wp._closed && wp._closed <= cur)
          .reduce((a, wp) => a + wp.estimatedHours, 0);
        const openProg = wps.filter((wp) => isOpen(wp))
          .reduce((a, wp) => a + wp.estimatedHours * (wp.percentDone / 100), 0);
        const frac = toToday ? Math.min(1, d / toToday) : 1;
        remaining = Math.max(0, Math.round(total - closedH - openProg * frac));
      }
      pts.push({
        label: `${cur.getMonth() + 1}/${cur.getDate()}`,
        ideal: Math.round(total * (1 - d / days)),
        remaining,
      });
    }
    return { points: pts, total: Math.round(currentRemaining) };
  }

  function activityBreakdown(entries) {
    const d = {};
    ACTIVITIES.forEach((a) => (d[a.id] = 0));
    entries.forEach((e) => (d[e.activityId] += e.hours));
    return ACTIVITIES.map((a) => ({ activity: a, hours: Math.round(d[a.id]) }));
  }

  // =====================  LIVE DATA HYDRATION + RELOAD  =======================
  function hydrateWP(wp) {
    const d = (s) => s ? new Date(s + 'T00:00:00') : null;
    wp._start   = d(wp.startDate);
    wp._due     = d(wp.dueDate);
    wp._created = d(wp.createdAt);
    wp._closed  = d(wp.closedAt);
    return wp;
  }

  function hydrateTE(te) { te._on = te.spentOn ? new Date(te.spentOn + 'T00:00:00') : null; return te; }

  function hydrateVersion(v) {
    v._start = v.startDate ? new Date(v.startDate + 'T00:00:00') : null;
    v._end   = v.dueDate   ? new Date(v.dueDate   + 'T00:00:00') : null;
    return v;
  }

  function hydrateProject(p) {
    const wps = WORK_PACKAGES.filter((wp) => wp.projectId === p.id);
    const pvs = VERSIONS.filter((v) => v.projectId === p.id);
    p.memberIds = [...new Set(wps.map((wp) => wp.assigneeId).filter(Boolean))];
    if (!p.health) p.health  = 'on_track';
    if (!p.nameKo) p.nameKo  = p.name;
    if (!p.leadId) p.leadId  = p.memberIds[0] || null;
    if (!p.memberRoles) {
      p.memberRoles = {};
      p.memberIds.forEach((id) => {
        const u = USERS.find((u) => u.id === id);
        if (id === p.leadId) { p.memberRoles[id] = 'PL'; return; }
        if (u && /project.?manager/i.test(u.role) && !Object.values(p.memberRoles).includes('PM')) {
          p.memberRoles[id] = 'PM'; return;
        }
        p.memberRoles[id] = 'Member';
      });
    }
    const starts = [...pvs.map((v) => v._start), ...wps.map((wp) => wp._start)].filter(Boolean);
    const ends   = [...pvs.map((v) => v._end),   ...wps.map((wp) => wp._due)].filter(Boolean);
    p._start = starts.length ? new Date(Math.min(...starts.map((x) => x.getTime()))) : TODAY;
    p._end   = ends.length   ? new Date(Math.max(...ends.map((x) => x.getTime())))   : addDays(TODAY, 30);
    p.startDate = iso(p._start); p.dueDate = iso(p._end);
    return p;
  }

  function buildBoardColsFromStatuses(statuses) {
    const catMap = {};
    statuses.forEach((s) => { if (!catMap[s.cat]) catMap[s.cat] = []; catMap[s.cat].push(s.id); });
    // Filter out columns whose category doesn't exist in this OP instance (empty statusIds).
    return [
      { key: 'new',        label: 'New',         statusIds: catMap.new        || [] },
      { key: 'inProgress', label: 'In Progress', statusIds: catMap.inProgress || [] },
      { key: 'review',     label: 'In Review',   statusIds: catMap.review     || [] },
      { key: 'testing',    label: 'Testing',     statusIds: catMap.testing    || [] },
      { key: 'onHold',     label: 'On Hold',     statusIds: catMap.onHold     || [] },
      { key: 'wont',       label: "Won't",       statusIds: catMap.wont       || [] },
      { key: 'closed',     label: 'Done',        statusIds: catMap.closed     || [] },
    ].filter((col) => col.statusIds.length > 0);
  }

  function reload(ds) {
    function replaceArr(t, s) { t.length = 0; s.forEach((x) => t.push(x)); }
    function replaceObj(t, s) { Object.keys(t).forEach((k) => delete t[k]); Object.assign(t, s); }
    TODAY = localMidnight();
    ds.WORK_PACKAGES.forEach(hydrateWP);
    ds.TIME_ENTRIES.forEach(hydrateTE);
    ds.VERSIONS.forEach(hydrateVersion);
    replaceArr(STATUSES, ds.STATUSES); replaceArr(TYPES, ds.TYPES);
    replaceArr(PRIORITIES, ds.PRIORITIES); replaceArr(ACTIVITIES, ds.ACTIVITIES);
    replaceArr(USERS, ds.USERS); replaceArr(PROJECTS, ds.PROJECTS);
    replaceArr(VERSIONS, ds.VERSIONS);
    replaceArr(WORK_PACKAGES, ds.WORK_PACKAGES); replaceArr(TIME_ENTRIES, ds.TIME_ENTRIES);
    PROJECTS.forEach(hydrateProject);
    replaceArr(BOARD_COLS, buildBoardColsFromStatuses(STATUSES));
    replaceObj(U, byId(USERS)); replaceObj(P, byId(PROJECTS)); replaceObj(S, byId(STATUSES));
    replaceObj(T, byId(TYPES)); replaceObj(PR, byId(PRIORITIES));
    replaceObj(V, byId(VERSIONS)); replaceObj(A, byId(ACTIVITIES));
    Object.assign(window.DB, { TODAY, STATUSES, BOARD_COLS, TYPES, PRIORITIES, ACTIVITIES,
      USERS, PROJECTS, VERSIONS, WORK_PACKAGES, TIME_ENTRIES, U, P, S, T, PR, V, A });
    window.DB._loading = false; window.DB._error = null;
    if (window.App && window.App.refresh) window.App.refresh();
  }

  // expose
  window.DB = {
    TODAY, iso, addDays, startOfWeek,
    STATUSES, BOARD_COLS, TYPES, PRIORITIES, ACTIVITIES, USERS, PROJECTS, VERSIONS,
    WORK_PACKAGES, TIME_ENTRIES,
    U, P, S, T, PR, V, A,
    usersByRole, versionsByProject, currentVersion,
    isOpen, isOverdue, dueWithin,
    statusDistribution, kpis, openCloseTrend, backlogTrend,
    userUtilization, projectHealth, burndown, activityBreakdown,
    reload,
  };

  // =====================  LIVE API BOOT  =====================================
  if (window.OPAdapter && window.OPAdapter.USE_LIVE_API) {
    window.DB._loading = true;
    window.DB._error = null;

    window.OPAdapter.buildLiveDataset().then(function (ds) {
      // Log newly added users and former employees detected via NAME_TABLE gap.
      const prevIds = new Set(USERS.map(function (u) { return u.id; }));
      const added = ds.USERS.filter(function (u) { return !prevIds.has(u.id) && !u.isBot; });
      if (added.length) {
        console.info('[PLM] 신규 사용자 ' + added.length + '명 감지: ' +
          added.map(function (u) { return u.name + '(#' + u.id + ')'; }).join(', '));
      }
      reload(ds);
    }).catch(function (err) {
      console.error('[PLM] live fetch failed:', err);
      window.DB._loading = false;
      window.DB._error = err.message || String(err);
      if (window.App && window.App.showError) window.App.showError(window.DB._error);
    });
  }
})();
