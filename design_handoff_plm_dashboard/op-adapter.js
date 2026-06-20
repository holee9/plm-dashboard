/* =============================================================================
   PLM Dashboard — OpenProject API v3 Adapter (integration seam)
   -----------------------------------------------------------------------------
   This is the ONLY file that needs to talk to OpenProject. It fetches HAL+JSON
   from plm.abyz-lab.work/api/v3 and normalises it into the SAME flat shape that
   data.js produces today. The views never change.

       OpenProject HAL+JSON   ──▶   OPAdapter   ──▶   window.DB (flat shape)

   Cross-validated against the OpenProject API v3 spec (2026-06). The notes below
   each function flag the real-world gotchas surfaced during that review.

   ⚠ This file is a WORKING SKELETON, not yet wired into the live dashboard.
     Flip USE_LIVE_API to true (and stand up the proxy — see §CORS) to activate.
   ========================================================================== */
(function () {
  'use strict';

  const USE_LIVE_API = true;                  // proxy is up at /op
  const BASE = '/op';                          // proxy path → plm.abyz-lab.work/api/v3
  // Direct browser → OpenProject is blocked by CORS and would leak the API key.
  // Run a tiny same-origin proxy that injects `Authorization: Basic base64(apikey:TOKEN)`
  // and forwards to https://plm.abyz-lab.work/api/v3/*  (see §CORS in the audit).

  // GOTCHA #13 — /principals returns account login as `name` even when First/Last name
  // are set in the OP admin panel. /api/v3/users (admin-only, 403) is the only endpoint
  // that exposes firstName/lastName. This static table maps OP account names → 성+이름.
  // Update when users are added or renamed in OP admin (Administration → Users).
  // @MX:NOTE: [AUTO] Add new OP users here when /principals shows an unrecognized account name.
  const NAME_TABLE = {
    'drake.lee':  '이태호',
    'mskim':      '김명섭',
    'jjm':        '정재민',
    'sjs':        '송진선',
    'sdc':        '서동철',
    's.heigl':    '이성하',
    'David.kang': '강동근',
    'Jimin Han':  '한지민',
    'Jimmy Jeon': '전제우',
    // jykim — not in admin panel; add Korean name when confirmed
  };

  /* ------------------------------------------------------------------ utils */

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }
  function safeColor(color, fallback) {
    const c = String(color || '').trim();
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : fallback;
  }

  // GOTCHA #1 — TIME IS ISO8601 DURATION, NOT A NUMBER.
  // estimatedTime / spentTime / time-entry hours come as "PT40H", "PT5H30M",
  // "P1DT2H" … never 40. Parse to decimal hours (8h working day for the D part).
  function durationToHours(iso) {
    if (iso == null) return 0;
    if (typeof iso === 'number') return iso;
    const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
    if (!m) return 0;
    const [, d, h, min, s] = m.map((x) => (x == null ? 0 : parseFloat(x)));
    return d * 8 + h + min / 60 + s / 3600;     // OP treats 1 day = 8h for effort
  }

  // HAL references live in _links.X.href = "/api/v3/<resource>/<id>". Pull the id.
  function refId(resource, link) {
    if (!resource || !resource._links || !resource._links[link]) return null;
    const href = resource._links[link].href;
    if (!href) return null;                      // null link = unassigned/none
    const seg = href.split('/').filter(Boolean);
    const id = seg[seg.length - 1];
    return /^\d+$/.test(id) ? +id : id;
  }
  const refTitle = (r, link) => (r && r._links && r._links[link] ? r._links[link].title : null);

  // Paginated fetch — OP caps pageSize (instance setting, often 100–200), so loop.
  async function fetchAll(path, filters) {
    const out = [];
    let offset = 1;
    const pageSize = 200;
    for (;;) {
      const url = new URL(BASE + path, location.origin);
      url.searchParams.set('offset', offset);
      url.searchParams.set('pageSize', pageSize);
      if (filters) url.searchParams.set('filters', JSON.stringify(filters));
      const res = await fetch(url, { headers: { Accept: 'application/hal+json' } });
      if (!res.ok) throw new Error(`OP ${path} → HTTP ${res.status} ${res.statusText}`);
      const body = await res.json();
      const els = (body._embedded && body._embedded.elements) || [];
      out.push(...els);
      if (out.length >= (body.total || 0) || els.length === 0) break;
      offset += 1;
    }
    return out;
  }

  // fetchSafe: returns [] instead of throwing on 404 or permission errors.
  async function fetchSafe(path, filters) {
    try { return await fetchAll(path, filters); } catch (e) { console.warn('[PLM]', e.message); return []; }
  }

  async function mapLimit(items, limit, iteratee) {
    const out = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        out[index] = await iteratee(items[index], index);
      }
    });
    await Promise.all(workers);
    return out;
  }

  const compactDate = (ts) => (ts || '').slice(0, 10) || null;
  const normStatus = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function htmlText(s) {
    return String(s || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  function statusTargetFromDetail(detail) {
    const raw = String(detail?.raw || '');
    const html = String(detail?.html || '');
    if (!/(^|[^\w])(status|상태)([^\w]|$)/i.test(htmlText(raw + ' ' + html))) return null;

    const italicTargets = [...html.matchAll(/<i>([\s\S]*?)<\/i>/g)]
      .map((m) => htmlText(m[1]))
      .filter(Boolean);
    if (italicTargets.length) return italicTargets[italicTargets.length - 1];

    let m = raw.match(/상태.*?에서\s*(.+?)\(으\)로/);
    if (m) return m[1].trim();
    m = raw.match(/상태.*?이\(가\)\s*(.+?)\(으\)로\s*설정/);
    if (m) return m[1].trim();
    m = raw.match(/status.*?\bto\s+(.+?)(?:\.|$)/i);
    if (m) return m[1].trim();
    m = raw.match(/status.*?\bset\s+to\s+(.+?)(?:\.|$)/i);
    return m ? m[1].trim() : null;
  }

  function closedAtFromActivities(activities, closedStatusNames) {
    const closed = new Set(closedStatusNames.map(normStatus));
    const sorted = [...(activities || [])].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const activity of sorted) {
      const details = Array.isArray(activity.details) ? activity.details : [];
      const hit = details.some((detail) => closed.has(normStatus(statusTargetFromDetail(detail))));
      if (hit) return compactDate(activity.createdAt);
    }
    return null;
  }

  function userOverrideFor(resource, displayName) {
    const cfg = window.PLM_USER_OVERRIDES || {};
    const maps = [cfg.byPrincipal, cfg.byId, cfg.byLogin, cfg.byName].filter(Boolean);
    const keys = [resource?.id, resource?.login, resource?.name, displayName]
      .filter((v) => v != null && String(v).trim() !== '')
      .map(String);
    return keys.reduce((acc, key) => {
      maps.forEach((map) => { if (map[key]) Object.assign(acc, map[key]); });
      return acc;
    }, {});
  }

  function capacityFor(override) {
    const cfg = window.PLM_USER_OVERRIDES || {};
    const candidate = override && override.capacityPerWeek != null
      ? override.capacityPerWeek
      : cfg.defaultCapacityPerWeek;
    const cap = Number(candidate == null ? 40 : candidate);
    return Number.isFinite(cap) && cap > 0 ? cap : 40;
  }

  /* --------------------------------------------------------------- mappers */

  function mapStatus(s) {
    const name = escapeHtml(s.name);
    return {
      id: s.id, name,
      isClosed: !!s.isClosed,
      color: safeColor(s.color, '#8B93A7'),
      // GOTCHA — OP has NO "category" enum. We derive board buckets from name.
      // wont must be checked before generic isClosed to avoid merging into 'closed'.
      cat: s.isClosed && /won.?t|reject/i.test(s.name || '') ? 'wont'
        : s.isClosed ? 'closed'
        : /progress/i.test(s.name || '') ? 'inProgress'
        : /review/i.test(s.name || '') ? 'review'
        : /test/i.test(s.name || '') ? 'testing'
        : /hold|block/i.test(s.name || '') ? 'onHold' : 'new',
    };
  }
  const mapType = (t) => ({ id: t.id, name: escapeHtml(t.name), color: safeColor(t.color, '#8B93A7'), glyph: '•' });
  const mapPriority = (p) => ({ id: p.id, name: escapeHtml(p.name), color: safeColor(p.color, '#3B82F6') });
  const mapActivity = (a) => ({ id: a.id, name: escapeHtml(a.name), color: '#8B93A7' });

  function mapVersion(v) {
    return {
      id: v.id, name: escapeHtml(v.name),
      projectId: refId(v, 'project'),
      startDate: v.startDate || null,
      dueDate: v.effectiveDate || null,         // GOTCHA — due date is `effectiveDate`
      status: v.status,                          // open | locked | closed
    };
  }

  function mapUser(u) {
    // GOTCHA: /principals returns account login as `name` — firstName/lastName are empty.
    // NAME_TABLE maps account names → 성+이름 Korean names (see GOTCHA #13 above).
    const raw = u.name || 'Unknown';
    const displayName = NAME_TABLE[raw] || raw;
    const override = userOverrideFor(u, displayName);
    const finalDisplayName = override.name || displayName;
    const capacityPerWeek = capacityFor(override);
    // GOTCHA #14 — Locked OP accounts remain in /principals but lose the 'showUser' link.
    // Active users always have _links.showUser; permanently locked accounts do not.
    // E2E verified 2026-06-18: jykim(#25) locked → no showUser; all others have it.
    const isLocked = !u._links?.showUser;
    // initials: first 2 chars works for 3-char Korean names (e.g. 강동근 → 강동)
    const initials = finalDisplayName.slice(0, 2).toUpperCase();
    return {
      id: u.id,
      name: escapeHtml(finalDisplayName),
      initials,
      email: escapeHtml(u.email || ''), avatar: u.avatar || '', login: escapeHtml(u.login || ''),
      // GOTCHA #4 — role / title / weekly capacity DO NOT EXIST in OP core.
      // capacityPerWeek is public operating metadata from user-overrides.js.
      role: override.role ? escapeHtml(override.role) : 'Member',
      title: override.title ? escapeHtml(override.title) : '',
      capacityPerWeek,
      capacityOverride: override.capacityPerWeek != null,
      color: safeColor(override.color, '#3B82F6'),
      isLocked,
    };
  }

  function mapWorkPackage(wp) {
    return {
      id: wp.id,
      displayId: escapeHtml(wp.displayId || String(wp.id)),  // e.g. "BH-1"; fallback to numeric id
      subject: escapeHtml(wp.subject),
      projectId: refId(wp, 'project'),
      typeId: refId(wp, 'type'),
      statusId: refId(wp, 'status'),
      priorityId: refId(wp, 'priority'),
      assigneeId: refId(wp, 'assignee'),
      authorId: refId(wp, 'author'),
      versionId: refId(wp, 'version'),
      startDate: wp.startDate || null,
      dueDate: wp.dueDate || null,
      // OP milestone work packages use a single `date` field instead of start/due.
      milestoneDate: wp.date || null,
      estimatedHours: durationToHours(wp.estimatedTime),   // "PT40H" → 40
      // GOTCHA #3 — `spentTime` is a DERIVED field; absent on some instances/perms.
      //   Safest: aggregate from /time_entries (done in buildDataset below).
      spentHours: durationToHours(wp.spentTime),
      percentDone: wp.percentageDone || 0,                 // note: OP field is percentageDone
      createdAt: (wp.createdAt || '').slice(0, 10),
      updatedAt: (wp.updatedAt || '').slice(0, 10),
      // GOTCHA #5 — there is NO direct `closedAt` field. buildLiveDataset reads
      //   /work_packages/{id}/activities for exact status-close journals, then
      //   falls back to updatedAt if activities are unavailable.
      closedAt: null,                                       // filled in buildDataset
      closedAtSource: null,
    };
  }

  function mapTimeEntry(te) {
    return {
      id: te.id,
      hours: durationToHours(te.hours),                    // "PT5H" → 5
      spentOn: te.spentOn,
      workPackageId: refId(te, 'workPackage'),
      projectId: refId(te, 'project'),
      userId: refId(te, 'user'),
      activityId: refId(te, 'activity'),
    };
  }

  function mapRelation(r) {
    return {
      id: r.id,
      type: r.type,
      fromId: refId(r, 'from'),
      toId: refId(r, 'to'),
      delay: Number(r.delay || 0),
    };
  }

  /* ------------------------------------------------------------ orchestrator */

  async function buildLiveDataset() {
    // Fetch reference data + transactional data in parallel.
    // GOTCHA: /users requires admin — use /principals instead.
    // GOTCHA: /time_entries/activities is 404 on some instances — fetchSafe returns [].
    const [statuses, types, priorities, activities, users, projects, versions, memberships, relations] =
      await Promise.all([
        fetchAll('/statuses'), fetchAll('/types'), fetchAll('/priorities'),
        fetchSafe('/time_entries/activities'), fetchAll('/principals'),
        fetchAll('/projects'), fetchAll('/versions'), fetchAll('/memberships'),
        fetchSafe('/relations'),
      ]);

    // Open + closed WPs (default filter only returns open → pass empty array).
    const wpsRaw = await fetchAll('/work_packages', []);
    const timeRaw = await fetchSafe('/time_entries');

    const includeProject = (p) => !/DR.*사업본부|사업본부.*미팅/i.test(p.name || '');
    const allowedProjectIds = new Set(projects.filter(includeProject).map((p) => p.id));
    const WORK_PACKAGES = wpsRaw.map(mapWorkPackage).filter((wp) => allowedProjectIds.has(wp.projectId));
    const workPackageIds = new Set(WORK_PACKAGES.map((wp) => wp.id));
    const TIME_ENTRIES = timeRaw.map(mapTimeEntry)
      .filter((te) => allowedProjectIds.has(te.projectId) && (!te.workPackageId || workPackageIds.has(te.workPackageId)));
    const VERSIONS = versions.map(mapVersion).filter((v) => allowedProjectIds.has(v.projectId));
    const RELATIONS = relations.map(mapRelation)
      .filter((r) => workPackageIds.has(r.fromId) && workPackageIds.has(r.toId));
    const STATUSES = statuses.map(mapStatus);

    // Aggregate spent hours from time entries (reliable).
    const statusById = {}; STATUSES.forEach((s) => (statusById[s.id] = s));
    const spentByWp = {};
    TIME_ENTRIES.forEach((t) => (spentByWp[t.workPackageId] = (spentByWp[t.workPackageId] || 0) + t.hours));
    WORK_PACKAGES.forEach((wp) => {
      if (!wp.spentHours) wp.spentHours = Math.round((spentByWp[wp.id] || 0) * 10) / 10;
    });

    // Exact closedAt: read WP activities/journals only for closed WPs. If this
    // optional endpoint is unavailable, keep the updatedAt fallback explicit.
    const closedStatusNames = statuses.filter((s) => s.isClosed).map((s) => s.name);
    const closedWps = WORK_PACKAGES.filter((wp) => statusById[wp.statusId]?.isClosed);
    const closedActivityRows = await mapLimit(closedWps, 32, async (wp) => {
      const activityRows = await fetchSafe(`/work_packages/${wp.id}/activities`);
      return [wp.id, closedAtFromActivities(activityRows, closedStatusNames)];
    });
    const closedAtByWp = {};
    closedActivityRows.forEach(([id, closedAt]) => { if (closedAt) closedAtByWp[id] = closedAt; });
    WORK_PACKAGES.forEach((wp) => {
      const st = statusById[wp.statusId];
      if (st && st.isClosed) {
        wp.closedAt = closedAtByWp[wp.id] || wp.updatedAt;
        wp.closedAtSource = closedAtByWp[wp.id] ? 'activities' : 'updatedAt';
      }
    });

    // Role mapping (per OP actual roles):
    //   OP "PM"              → dashboard "PM"  (실무 PM)
    //   OP "Tech Lead"       → dashboard "TL"
    //   OP "프로젝트 관리자" → dashboard "Member" (총괄, 별도 처리)
    //   everything else      → dashboard "Member"
    // Observer / Form Reporter / guest → excluded via isObserver/isBot flags below.
    const DASH_ROLE_ORDER = { PM: 3, TL: 2, Member: 0 };
    function opRoleToDash(roleTitle) {
      if (roleTitle === 'PM') return 'PM';
      if (/tech.?lead/i.test(roleTitle)) return 'TL';
      return 'Member';
    }

    // Build per-project role maps from memberships.
    // projMemberRoles:  pid -> { uid -> bestDashRole }  — used for team table display & sort
    // projRoleSets:     pid -> { uid -> Set<dashRole> } — used for PM/TL candidate dropdowns
    // @MX:ANCHOR: [AUTO] Core PM/TL role resolution — reads all memberships, produces both maps
    // @MX:REASON: [AUTO] hydrateProject() relies on pre-populated memberRoles; roleSets needed for multi-role candidate lists
    const projMemberRoles = {};  // pid -> { uid -> bestDashRole }
    const projRoleSets    = {};  // pid -> { uid -> Set }
    memberships.forEach((m) => {
      const pid = refId(m, 'project');
      const uid = refId(m, 'principal');
      if (!pid || !uid) return;
      if (!projMemberRoles[pid]) { projMemberRoles[pid] = {}; projRoleSets[pid] = {}; }
      if (!projRoleSets[pid][uid]) projRoleSets[pid][uid] = new Set();
      // A single membership can carry multiple roles — collect all, also track best
      (m._links.roles || []).forEach((r) => {
        const d = opRoleToDash(r.title || '');
        if (d !== 'Member') projRoleSets[pid][uid].add(d);
        const prev = projMemberRoles[pid][uid];
        if (!prev || DASH_ROLE_ORDER[d] > DASH_ROLE_ORDER[prev]) {
          projMemberRoles[pid][uid] = d;
        }
      });
    });

    // Compute globalRole per user: best dash role across ALL projects.
    // Used to exclude globally-PM users from TL candidate lists in any project.
    const globalRoleMap = {};  // uid -> best dash role across all projects
    Object.values(projMemberRoles).forEach((roleMap) => {
      Object.entries(roleMap).forEach(([uid, role]) => {
        const prev = globalRoleMap[uid];
        if (!prev || DASH_ROLE_ORDER[role] > DASH_ROLE_ORDER[prev]) globalRoleMap[uid] = role;
      });
    });

    // /principals returns both User and Group entries — map ALL of them so D.U
    // lookup never returns undefined (WPs/projects may reference any principal).
    // Groups and Observers are kept in USERS for rendering but flagged so that
    // the assignee dropdown can filter them out (see board.js).
    const usersMapped = users.map((u) => ({ ...mapUser(u), isGroup: u._type === 'Group' }));
    const userById = {}; usersMapped.forEach((u) => (userById[u.id] = u));
    // Attach globalRole so views can filter TL candidates by global PM status.
    Object.entries(globalRoleMap).forEach(([uid, role]) => {
      if (userById[+uid]) userById[+uid].globalRole = role;
    });
    // Set global u.role from memberships for isObserver detection below (last membership wins).
    memberships.forEach((m) => {
      const uid = refId(m, 'principal');
      const role = refTitle(m, 'roles') || (m._links.roles && m._links.roles[0] && m._links.roles[0].title);
      if (userById[uid] && role) userById[uid].role = escapeHtml(role);
    });
    // Mark observers and bots — excluded from assignee dropdowns but kept for D.U lookup.
    usersMapped.forEach((u) => {
      if (/observer/i.test(u.role)) u.isObserver = true;
      if (/form.?reporter/i.test(u.name) || /form.?reporter/i.test(u.login)) u.isBot = true;
      // Service/admin accounts — excluded from all views but kept in D.U for lookup.
      if (/^(guest|abyz-lab|admin)$/i.test(u.name)) u.isBot = true;
      // Locked accounts (no showUser link) — fold into isBot so all view filters apply.
      if (u.isLocked) u.isBot = true;
    });
    // GOTCHA #12 — /principals may not include every WP assignee (service accounts,
    // cross-scope users, external collaborators). Use _links.assignee.title from the
    // raw HAL WP response to build a minimal stub so views show a name, not "#id".
    wpsRaw.filter((wp) => allowedProjectIds.has(refId(wp, 'project'))).forEach((wp) => {
      const uid = refId(wp, 'assignee');
      if (uid && !userById[uid] && wp._links?.assignee?.title) {
        const raw = wp._links.assignee.title;
        const displayName = NAME_TABLE[raw] || raw;
        const override = userOverrideFor({ id: uid, name: raw, login: '' }, displayName);
        const finalDisplayName = override.name || displayName;
        const initials = finalDisplayName.slice(0, 2).toUpperCase();
        const u = {
          id: uid,
          name: escapeHtml(finalDisplayName),
          initials,
          role: override.role ? escapeHtml(override.role) : '',
          title: override.title ? escapeHtml(override.title) : '',
          capacityPerWeek: capacityFor(override),
          capacityOverride: override.capacityPerWeek != null,
          color: safeColor(override.color, '#8B93A7'),
        };
        usersMapped.push(u);
        userById[uid] = u;
      }
    });
    const USERS = usersMapped;

    return {
      STATUSES,
      TYPES: types.map(mapType),
      PRIORITIES: priorities.map(mapPriority),
      ACTIVITIES: activities.map(mapActivity),
      USERS,
      // Hard-exclude "DR 사업본부 주관 미팅" type projects — never enter DB.
      PROJECTS: projects
        .filter(includeProject)
        .map((p) => {
          const rawRoles    = projMemberRoles[p.id] || {};
          const rawRoleSets = projRoleSets[p.id]    || {};
          // abyz-lab (isBot) is a real PM only in 인프라 project.
          const isInfra = /인프라/i.test(p.name);
          const filterBot = ([uid]) => !userById[+uid]?.isBot;
          const pRoles    = isInfra ? rawRoles
            : Object.fromEntries(Object.entries(rawRoles).filter(filterBot));
          const pRoleSets = isInfra ? rawRoleSets
            : Object.fromEntries(Object.entries(rawRoleSets).filter(filterBot));
          // leadId: first PM entry, else first TL, else null
          const pmEntry = Object.entries(pRoles).find(([, r]) => r === 'PM');
          const tlEntry = Object.entries(pRoles).find(([, r]) => r === 'TL');
          const leadId = pmEntry ? +pmEntry[0] : (tlEntry ? +tlEntry[0] : null);
          return {
            id: p.id,
            name: escapeHtml(p.name),
            identifier: escapeHtml(p.identifier),
            // GOTCHA #11 — OP has no nameKo/health fields; hydrateProject fills these in.
            nameKo: escapeHtml(p.name),
            health: null,
            leadId,
            memberRoles:    pRoles,    // best role per uid — for team table display & sort
            memberRoleSets: pRoleSets, // all roles per uid — for PM/TL candidate dropdowns
            startDate: null,
            dueDate: null,
          };
        }),
      VERSIONS,
      RELATIONS,
      WORK_PACKAGES,
      TIME_ENTRIES,
    };
  }

  // Expose for a future wiring step. The dashboard still boots from data.js today.
  window.OPAdapter = { USE_LIVE_API, durationToHours, refId, buildLiveDataset };
})();
