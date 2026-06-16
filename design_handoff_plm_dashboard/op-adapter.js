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

  const USE_LIVE_API = false;                 // ← keep false until the proxy is up
  const BASE = '/op';                          // proxy path → plm.abyz-lab.work/api/v3
  // Direct browser → OpenProject is blocked by CORS and would leak the API key.
  // Run a tiny same-origin proxy that injects `Authorization: Basic base64(apikey:TOKEN)`
  // and forwards to https://plm.abyz-lab.work/api/v3/*  (see §CORS in the audit).

  /* ------------------------------------------------------------------ utils */

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
      if (!res.ok) throw new Error(`OP ${path} → HTTP ${res.status}`);
      const body = await res.json();
      const els = (body._embedded && body._embedded.elements) || [];
      out.push(...els);
      if (out.length >= (body.total || 0) || els.length === 0) break;
      offset += 1;
    }
    return out;
  }

  /* --------------------------------------------------------------- mappers */

  function mapStatus(s) {
    return {
      id: s.id, name: s.name,
      isClosed: !!s.isClosed,
      color: s.color || '#8B93A7',
      // GOTCHA — OP has NO "category" enum. We derive board buckets from name.
      cat: s.isClosed ? 'closed'
        : /progress/i.test(s.name) ? 'inProgress'
        : /review/i.test(s.name) ? 'review'
        : /test/i.test(s.name) ? 'testing'
        : /hold|block/i.test(s.name) ? 'onHold' : 'new',
    };
  }
  const mapType = (t) => ({ id: t.id, name: t.name, color: t.color, glyph: '•' });
  const mapPriority = (p) => ({ id: p.id, name: p.name, color: p.color || '#3B82F6' });
  const mapActivity = (a) => ({ id: a.id, name: a.name, color: '#8B93A7' });

  function mapVersion(v) {
    return {
      id: v.id, name: v.name,
      projectId: refId(v, 'project'),
      startDate: v.startDate || null,
      dueDate: v.effectiveDate || null,         // GOTCHA — due date is `effectiveDate`
      status: v.status,                          // open | locked | closed
    };
  }

  function mapUser(u) {
    return {
      id: u.id,
      name: u.name || `${u.firstName} ${u.lastName}`.trim(),
      initials: ((u.firstName || ' ')[0] + (u.lastName || ' ')[0]).trim(),
      email: u.email, avatar: u.avatar, login: u.login,
      // GOTCHA #4 — role / title / weekly capacity DO NOT EXIST in OP core.
      //   role  → resolve from /api/v3/memberships roles (set below)
      //   title → not in API; leave blank or map from a custom field
      //   capacityPerWeek → no source; default 40 and let admins override.
      role: 'Member', title: '', capacityPerWeek: 40,
      color: '#3B82F6',
    };
  }

  function mapWorkPackage(wp) {
    return {
      id: wp.id,
      subject: wp.subject,
      projectId: refId(wp, 'project'),
      typeId: refId(wp, 'type'),
      statusId: refId(wp, 'status'),
      priorityId: refId(wp, 'priority'),
      assigneeId: refId(wp, 'assignee'),
      authorId: refId(wp, 'author'),
      versionId: refId(wp, 'version'),
      startDate: wp.startDate || null,
      dueDate: wp.dueDate || null,
      estimatedHours: durationToHours(wp.estimatedTime),   // "PT40H" → 40
      // GOTCHA #3 — `spentTime` is a DERIVED field; absent on some instances/perms.
      //   Safest: aggregate from /time_entries (done in buildDataset below).
      spentHours: durationToHours(wp.spentTime),
      percentDone: wp.percentageDone || 0,                 // note: OP field is percentageDone
      createdAt: (wp.createdAt || '').slice(0, 10),
      updatedAt: (wp.updatedAt || '').slice(0, 10),
      // GOTCHA #5 — there is NO `closedAt` field. We approximate it with updatedAt
      //   when the status is closed. For exact close dates, read the WP journals
      //   (/api/v3/work_packages/{id}/activities) — heavier, optional.
      closedAt: null,                                       // filled in buildDataset
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

  /* ------------------------------------------------------------ orchestrator */

  async function buildLiveDataset() {
    // Fetch reference data + transactional data in parallel.
    const [statuses, types, priorities, activities, users, projects, versions, memberships] =
      await Promise.all([
        fetchAll('/statuses'), fetchAll('/types'), fetchAll('/priorities'),
        fetchAll('/time_entries/activities'), fetchAll('/users'),
        fetchAll('/projects'), fetchAll('/versions'), fetchAll('/memberships'),
      ]);

    // Open + closed WPs (default filter only returns open → pass empty array).
    const wpsRaw = await fetchAll('/work_packages', []);
    const timeRaw = await fetchAll('/time_entries');

    const WORK_PACKAGES = wpsRaw.map(mapWorkPackage);
    const TIME_ENTRIES = timeRaw.map(mapTimeEntry);

    // Aggregate spent hours from time entries (reliable) + approximate closedAt.
    const statusById = {}; statuses.map(mapStatus).forEach((s) => (statusById[s.id] = s));
    const spentByWp = {};
    TIME_ENTRIES.forEach((t) => (spentByWp[t.workPackageId] = (spentByWp[t.workPackageId] || 0) + t.hours));
    WORK_PACKAGES.forEach((wp) => {
      if (!wp.spentHours) wp.spentHours = Math.round((spentByWp[wp.id] || 0) * 10) / 10;
      const st = statusById[wp.statusId];
      if (st && st.isClosed) wp.closedAt = wp.updatedAt;   // proxy; see GOTCHA #5
    });

    // Resolve user roles from memberships (first role title wins).
    const usersMapped = users.map(mapUser);
    const userById = {}; usersMapped.forEach((u) => (userById[u.id] = u));
    memberships.forEach((m) => {
      const uid = refId(m, 'principal');
      const role = refTitle(m, 'roles') || (m._links.roles && m._links.roles[0] && m._links.roles[0].title);
      if (userById[uid] && role) userById[uid].role = role;
    });

    return {
      STATUSES: statuses.map(mapStatus),
      TYPES: types.map(mapType),
      PRIORITIES: priorities.map(mapPriority),
      ACTIVITIES: activities.map(mapActivity),
      USERS: usersMapped,
      PROJECTS: projects.map((p) => ({ id: p.id, name: p.name, identifier: p.identifier })),
      VERSIONS: versions.map(mapVersion),
      WORK_PACKAGES,
      TIME_ENTRIES,
    };
  }

  // Expose for a future wiring step. The dashboard still boots from data.js today.
  window.OPAdapter = { USE_LIVE_API, durationToHours, refId, buildLiveDataset };
})();
