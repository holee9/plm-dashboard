/* =============================================================================
   PLM Dashboard — shared UI helpers (window.UI)
   ========================================================================== */
(function () {
  'use strict';
  const D = window.DB;

  const HEALTH = { on_track: '정상', at_risk: '주의', off_track: '지연' };
  const HEALTH_EN = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' };

  function avatar(user, cls = '') {
    if (!user) return `<div class="avatar ${cls}" style="background:var(--text-faint)">–</div>`;
    return `<div class="avatar ${cls}" style="background:${user.color}" data-tip="${user.name} · ${user.title}" title="${user.name}">${user.initials}</div>`;
  }
  function avatarStack(userIds, max = 5) {
    const ids = userIds.slice(0, max);
    let html = ids.map((id) => avatar(D.U[id])).join('');
    if (userIds.length > max) html += `<div class="avatar" style="background:var(--panel-2);color:var(--text-dim)">+${userIds.length - max}</div>`;
    return `<div class="avatar-stack">${html}</div>`;
  }
  function statusChip(statusId) {
    const s = D.S[statusId];
    return `<span class="chip-status"><i class="dot" style="background:${s.color}"></i>${s.name}</span>`;
  }
  function healthChip(h) {
    return `<span class="health ${h}"><i class="dot" style="background:currentColor"></i>${HEALTH_EN[h]} · ${HEALTH[h]}</span>`;
  }
  function typeTag(typeId) {
    const t = D.T[typeId];
    return `<span class="tag" data-tip="${t.name}">${t.glyph} ${t.name}</span>`;
  }
  function priorityDot(priorityId) {
    const p = D.PR[priorityId];
    return `<i class="dot" style="background:${p.color}" data-tip="Priority · ${p.name}"></i>`;
  }
  function progressBar(pct, cls = '') {
    return `<div class="pbar ${cls}"><span style="width:${pct}%"></span></div>`;
  }

  // date helpers
  const fmtDate = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const fmtDateY = (s) => { const d = new Date(s + 'T00:00:00'); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`; };
  function daysFromToday(s) {
    const d = new Date(s + 'T00:00:00');
    return Math.round((d - D.TODAY) / 86400000);
  }
  function dueLabel(s) {
    const n = daysFromToday(s);
    if (n < 0) return { txt: `${-n}일 초과`, cls: 'down' };
    if (n === 0) return { txt: '오늘 마감', cls: 'warn' };
    if (n <= 3) return { txt: `D-${n}`, cls: 'warn' };
    return { txt: `D-${n}`, cls: '' };
  }

  function panel(opts) {
    const { title, sub, body, tools = '', sticky = '', cls = '', bodyStyle = '' } = opts;
    return `<div class="panel ${cls}">
      <div class="panel-head">
        <div><div class="panel-title">${title}</div>${sub ? `<div class="panel-sub">${sub}</div>` : ''}</div>
        <div class="spacer"></div>${tools}
      </div>
      <div class="panel-body" style="${bodyStyle}">${body}</div>
    </div>`;
  }

  function kpi(opts) {
    const { label, value, unit = '', foot = '', spark = '', tone = '' } = opts;
    return `<div class="kpi ${tone ? 'tone-' + tone : ''}">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}${unit ? `<small>${unit}</small>` : ''}</div>
      ${foot ? `<div class="kpi-foot">${foot}</div>` : ''}
      ${spark ? `<div class="kpi-spark">${spark}</div>` : ''}
    </div>`;
  }

  const OP_BASE = 'https://plm.abyz-lab.work';
  function wpLink(id) {
    return `<a class="wp-id" href="${OP_BASE}/work_packages/${id}" target="_blank" rel="noopener">#${id}</a>`;
  }

  window.UI = {
    HEALTH, HEALTH_EN, avatar, avatarStack, statusChip, healthChip, typeTag, priorityDot,
    progressBar, fmtDate, fmtDateY, daysFromToday, dueLabel, panel, kpi, wpLink,
  };
})();
