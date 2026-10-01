/* ============================================================
   PLM Dashboard v2 — 로드맵 (product-line swimlanes, managers only)
   One timeline for every product line, 3 months back / 6 months ahead, so the
   whole portfolio schedule is visible without opening OpenProject.
   Each milestone shows its first planned date (◇, from OP journal history)
   and its current date (◆); the connecting line is the slip. Past-due = red.
   Regulatory due dates (RA work packages) appear on the regulatory lane.
   Sources: data/insights.json (milestones + product_lines), data/health.json.
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OP = 'https://plm.abyz-lab.work';
  let H = null, I = null, err = null, loading = false;
  async function load() {
    loading = true;
    try {
      const [h, i] = await Promise.all([fetch('data/health.json', { cache: 'no-store' }), fetch('data/insights.json', { cache: 'no-store' })]);
      if (!h.ok || !i.ok) throw new Error(`health ${h.status} / insights ${i.status}`);
      H = await h.json(); I = await i.json(); err = null;
    } catch (e) { err = e.message; }
    loading = false; if (window.App?.refresh) window.App.refresh();
  }
  const d2n = (s) => new Date(s + 'T00:00:00').getTime();
  const addM = (d, m) => { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; };

  window.Views.roadmap = function (state) {
    const UI = window.UI;
    if (!H && !loading && !err) { load(); return '<div class="empty">로드맵 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">로드맵 데이터를 읽지 못함: ${esc(err)} <button class="mini-btn" data-roadmap-reload>다시 읽기</button></div>`;
    if (!H || !I) return '<div class="empty">로드맵 로딩 중…</div>';
    const today = new Date(H.today + 'T00:00:00');
    const start = addM(today, -3), end = addM(today, 6);
    const span = end - start; const x = (t) => Math.max(0, Math.min(100, ((t - start) / span) * 100));
    const focus = state.roadmapFocus;
    const identOf = {}; I.project_status.forEach((p) => { identOf[p.project] = p.identifier; });
    const krOf = {}; (H.goal_health.objectives || []).forEach((o) => o.key_results.forEach((k) => (k.related || []).forEach((r) => { krOf[r.id] = k.display_id + ' ' + k.subject; })));
    // month ticks
    const ticks = []; for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m = addM(m, 1)) ticks.push(m);
    const header = `<div style="position:relative;height:22px;margin-left:200px;border-bottom:1px solid var(--line)">
      ${ticks.map((m) => `<span class="muted mono" style="position:absolute;left:${x(m)}%;font-size:10.5px;transform:translateX(-50%)">${m.getMonth() + 1}월</span>`).join('')}
      <span style="position:absolute;left:${x(today)}%;top:0;bottom:-999px;border-left:2px solid var(--accent);z-index:2"></span></div>`;
    const lanes = I.product_lines.map((line) => {
      const projs = new Set(line.projects);
      const ms = I.milestones.filter((m) => projs.has(m.project_identifier) && m.date && d2n(m.date) >= start.getTime() && d2n(m.date) <= end.getTime());
      // regulatory lane: RA work package due dates as markers
      const reg = line.regulatory ? H.items.concat([]).filter((i) => projs.has(identOf[i.project]) && i.due) : [];
      const regWps = line.regulatory ? (window.DB?.WORK_PACKAGES || []).filter((w) => { const p = window.DB.P[w.projectId]; return p && projs.has(p.identifier) && w._due && window.DB.isOpen(w); }) : [];
      const sorted = ms.slice().sort((a, b) => a.date.localeCompare(b.date));
      const marks = sorted.map((m, idx) => {
        const cur = d2n(m.date), firstRaw = m.first_planned ? d2n(m.first_planned) : null;
        const first = firstRaw && firstRaw >= start.getTime() && firstRaw <= end.getTime() ? firstRaw : null; // slip line only when the first plan is inside the window
        const labelTop = 24 + (idx % 2) * 12; // alternate label rows so close milestones stay readable
        const past = m.date < H.today; const slip = m.slip_days || 0;
        const color = past ? 'var(--c-red)' : slip > 30 ? 'var(--c-amber)' : 'var(--c-green)';
        const line1 = first && first !== cur ? `<span style="position:absolute;left:${x(Math.min(first, cur))}%;width:${Math.abs(x(cur) - x(first))}%;top:13px;border-top:2px dashed ${color};opacity:.6"></span>
          <span title="첫 계획 ${esc(m.first_planned)}" style="position:absolute;left:${x(first)}%;top:6px;transform:translateX(-50%);color:${color};opacity:.5;font-size:14px">◇</span>` : '';
        return `${line1}<a href="${OP}/work_packages/${m.id}" target="_blank" rel="noopener" title="${krOf[m.id] ? '★ ' + esc(krOf[m.id]) + ' · ' : ''}${esc(m.subject)} · 현재 ${esc(m.date)}${m.first_planned && m.first_planned !== m.date ? ` · 첫 계획 ${esc(m.first_planned)} · ${slip > 0 ? slip + '일 지연' : Math.abs(slip) + '일 당김'} · ${m.changes}회 변경` : ''}"
          style="position:absolute;left:${x(cur)}%;top:4px;transform:translateX(-50%);color:${color};font-size:16px;text-decoration:none">${krOf[m.id] ? '★' : '◆'}</a>
          <span style="position:absolute;left:${x(cur)}%;top:${labelTop}px;transform:translateX(-50%);font-size:10px;white-space:nowrap;color:${past ? 'var(--c-red)' : 'var(--text-muted)'}">${krOf[m.id] ? '★' : ''}${esc(m.subject.slice(0, 12))} ${m.date.slice(5)}</span>`;
      }).join('');
      const regSorted = regWps.slice().sort((a, b) => a._due - b._due);
      const regMarks = regSorted.map((w, idx) => `<a href="${OP}/work_packages/${w.id}" target="_blank" rel="noopener" title="${esc(w.subject)} · 마감 ${esc(w.dueDate)}" style="position:absolute;left:${x(w._due)}%;top:4px;transform:translateX(-50%);color:${w._due < today ? 'var(--c-red)' : 'var(--accent)'};font-size:14px;text-decoration:none">▲</a>
        <span style="position:absolute;left:${x(w._due)}%;top:${24 + (idx % 3) * 12}px;transform:translateX(-50%);font-size:10px;white-space:nowrap;color:var(--text-muted)">${esc((w.displayId || '') + ' ' + w.subject.slice(0, 10))} ${String(w.dueDate).slice(5)}</span>`).join('');
      const past = ms.filter((m) => m.date < H.today).length, slipped = ms.filter((m) => (m.slip_days || 0) > 30).length, starred = ms.filter((m) => krOf[m.id]).length;
      const hl = focus === line.name ? 'background:rgba(var(--accent-rgb),.08)' : '';
      return `<div style="display:flex;align-items:stretch;border-bottom:1px solid var(--line);${hl}">
        <div style="width:200px;flex:0 0 200px;padding:8px 10px"><b>${esc(line.name)}</b><div class="muted" style="font-size:11px">${esc(line.owner)} · 마일스톤 ${ms.length}${past ? ` · <span style="color:var(--c-red)">지남 ${past}</span>` : ''}${slipped ? ` · <span style="color:var(--c-amber)">30일↑ 지연 ${slipped}</span>` : ''}${starred ? ` · ★ ${starred}` : ''}</div></div>
        <div style="position:relative;flex:1;height:64px">${marks}${regMarks}${!ms.length && !regWps.length ? '<span style="position:absolute;left:8px;top:14px;font-size:11.5px;color:var(--c-amber)">⚠ 약속 없음 — 날짜 약속(마일스톤)이 없어 일정 관리 불가. 팀장이 다음 마일스톤 1개 이상 등록, 핵심은 KR로 연결</span>' : ''}</div></div>`;
    }).join('');
    return `
      <div class="tier"><span class="tier-name">DR 사업본부 목표·마일스톤 로드맵</span><span class="tier-en">${esc(H.today)} 기준 · 과거 3개월 ~ 앞 6개월 · ★ OKR(KR) 연결 · ◇ 첫 계획 → ◆ 현재(점선 = 밀린 거리) · ▲ 인허가 제출 마감 · 빨강 = 지남</span>
        <button type="button" class="tb-chip" data-roadmap-reload>다시 읽기</button><span class="rule"></span></div>
      ${UI.panel({ title: '제품군별 마일스톤', sub: '마일스톤을 누르면 OpenProject 원본 · 마우스를 올리면 첫 계획·변경 횟수', bodyStyle: 'padding:0 0 12px', body: header + lanes })}
      ${UI.panel({ title: '계획 대비 30일 이상 밀린 마일스톤', sub: 'OP 이력에서 첫 계획일과 변경 횟수를 읽음 — 예측 가능성(재조정 빈도) 지표',
        body: `<table class="tbl"><thead><tr><th>제품군</th><th>마일스톤</th><th>첫 계획</th><th>현재</th><th>지연</th><th>변경</th></tr></thead><tbody>
        ${I.milestones.filter((m) => (m.slip_days || 0) > 30).sort((a, b) => b.slip_days - a.slip_days).map((m) => { const l = I.product_lines.find((x) => x.projects.includes(m.project_identifier)); return `<tr><td>${esc(l ? l.name : m.project)}</td><td><a class="wp-id" href="${OP}/work_packages/${m.id}" target="_blank" rel="noopener">${esc(m.subject.slice(0, 30))}</a></td><td>${esc(m.first_planned)}</td><td>${esc(m.date)}</td><td style="color:var(--c-red)">${m.slip_days}일</td><td>${m.changes}회</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">없음</td></tr>'}</tbody></table>` })}`;
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-roadmap-reload]')) { H = null; I = null; load(); } });
})();
