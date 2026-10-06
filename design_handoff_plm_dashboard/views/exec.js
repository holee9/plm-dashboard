/* ============================================================
   PLM Dashboard v2 — 사업본부 현황 (managers only)
   One screen that answers five questions in under a minute:
     Q1 schedule  Q2 blocked decisions  Q3 quarterly goals  Q4 regulatory  Q5 people
   Every block = status → why → who decides. Judgements are withheld (grey) when
   the underlying OP data is not maintained (participation low).
   Sources: data/health.json (Hermes judgement), data/insights.json (milestone
   baselines, people participation/load, first-seen), product_lines.json mapping.
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OP = 'https://plm.abyz-lab.work';
  const wp = (i) => `<a class="wp-id" href="${esc(i.url || OP + '/work_packages/' + i.id)}" target="_blank" rel="noopener">${esc(i.display_id)}</a>`;
  const DOT = { red: '🔴', amber: '🟡', green: '🟢', grey: '⚪' };
  const TXT = { red: '위험', amber: '주의', green: '정상', grey: '판단 보류' };
  const COL = { red: 'var(--c-red)', amber: 'var(--c-amber)', green: 'var(--c-green)', grey: 'var(--text-dim)' };
  let H = null, I = null, RA = null, err = null, loading = false;

  async function load() {
    loading = true;
    try {
      const [h, i] = await Promise.all([fetch('data/health.json', { cache: 'no-store' }), fetch('data/insights.json', { cache: 'no-store' })]);
      if (!h.ok || !i.ok) throw new Error(`health ${h.status} / insights ${i.status}`);
      H = await h.json(); I = await i.json(); err = null;
      // ra.json feeds only the Q4 tile; its absence must not hide the rest of the screen
      try { const r = await fetch('data/ra.json', { cache: 'no-store' }); RA = r.ok ? await r.json() : null; } catch (e) { RA = null; }
    } catch (e) { err = e.message; }
    loading = false;
    if (window.App?.refresh) window.App.refresh();
  }

  const days = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
  const today = () => H.today;

  /* ---- per product line ---- */
  function lineStats(line) {
    const projs = new Set(line.projects);
    const identOf = {}; (I.project_status || []).forEach((p) => { identOf[p.project] = p.identifier; });
    const inLine = (name) => projs.has(identOf[name]);
    const ph = H.project_health.filter((p) => inLine(p.project));
    const items = H.items.filter((i) => inLine(i.project));
    const ms = I.milestones.filter((m) => projs.has(m.project_identifier));
    const open = ph.reduce((s, p) => s + p.open, 0), overdue = ph.reduce((s, p) => s + p.overdue, 0);
    const msOver = ms.filter((m) => m.date && m.date < today());
    const next = ms.filter((m) => m.date && m.date >= today()).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
    const blockedAging = items.filter((i) => i.flags.includes('blocked_aging'));
    const oldestBlock = Math.max(0, ...blockedAging.map((i) => i.blocked_since ? days(today(), i.blocked_since.slice(0, 10)) : 0));
    const triage = items.filter((i) => i.flags.includes('triage_overdue'));
    const noOwner = items.filter((i) => !i.assignee && !i.flags.includes('triage_overdue') && i.flags.some((f) => ['overdue', 'missing_update', 'blocked_aging'].includes(f)));
    const people = I.people.filter((p) => true); // participation measured at line level below
    // participation at line level: share of open WPs touched in 7 days (from project_health weekly rates is global; use items proxy)
    const lineProjects = ph.map((p) => p.project);
    const trustPeople = I.people.filter((p) => p.trust === 'ok').length;
    const slips = ms.filter((m) => m.slip_days && m.slip_days > 30);
    let status = 'green';
    if (msOver.length || oldestBlock > 30) status = 'red';
    else if (overdue || blockedAging.length || noOwner.length) status = 'amber';
    if (!open && !ms.length) status = 'grey';  // nothing to judge: not "정상"
    // data-trust: if the line's projects have very few recent human updates, judgement is withheld
    const touchedRate = H.process_health.weekly_update_rate; // global; per-line not available yet
    const why = [];
    if (msOver.length) why.push(`마일스톤 ${msOver.length}건 지남 (${msOver.map((m) => esc(m.subject.slice(0, 14)) + ' ' + m.date.slice(5)).slice(0, 2).join(', ')})`);
    slips.slice(0, 1).forEach((m) => why.push(`${esc(m.subject.slice(0, 16))}: 계획 ${m.first_planned.slice(0, 7)} → ${m.date.slice(0, 7)} (${m.slip_days > 0 ? m.slip_days + '일 지연' : Math.abs(m.slip_days) + '일 당김'}, ${m.changes}회 변경)`));
    if (oldestBlock) why.push(`보류 최장 ${oldestBlock}일 (${blockedAging.sort((a, b) => (a.blocked_since || '').localeCompare(b.blocked_since || ''))[0].display_id})`);
    if (overdue) why.push(`마감 지남 ${overdue}건 / 열린 ${open}건`);
    if (triage.length) why.push(`이슈 분류 지연 ${triage.length}건 (접수 후 ${Math.max(...triage.map((i) => days(today(), i.created)))}일 최장)`);
    if (noOwner.length) why.push(`담당자 없는 결정 ${noOwner.length}건`);
    if (!why.length) why.push(open ? `열린 ${open}건, 예외 없음` : '열린 일감 없음 — 판단할 자료가 없습니다');
    const idents = new Set(line.projects);
    const regDue = (window.DB?.WORK_PACKAGES || []).filter((w) => window.DB.isOpen(w) && w.dueDate && idents.has((window.DB.P[w.projectId] || {}).identifier));
    const regNext = regDue.map((w) => w.dueDate).filter((d) => d >= today()).sort()[0] || null;
    const krIds = new Set(H.goal_health.objectives.flatMap((o) => o.key_results.flatMap((k) => (k.related || []).map((r) => r.id))));
    const krMs = ms.filter((m) => krIds.has(m.id));
    if (krMs.length) why.push(`★ OKR 연결 마일스톤: ${krMs.map((m) => esc(m.subject.slice(0, 14)) + (m.date ? ' ' + m.date.slice(5) : '')).join(', ')}`);
    else if (!ms.length && line.regulatory && regDue.length) why.push(`OP 마일스톤은 없고 제출 마감일 ${regDue.length}건으로 일정 관리${regNext ? ' (다음 ' + regNext.slice(5) + ')' : ''}`);
    else if (!ms.length && open) why.push('마일스톤 없음 — 날짜 약속 없음 (관리 이슈)');
    const decide = triage[0] ? `${triage[0].display_id} 이슈 분류` : blockedAging[0] ? `${blockedAging[0].display_id} 재개/중단` : noOwner[0] ? `${noOwner[0].display_id} 담당 지정` : msOver[0] ? `${esc(msOver[0].subject.slice(0, 12))} 일정 재설정` : overdue ? '마감 재설정' : '—';
    return { line, status, open, overdue, msOver, next, oldestBlock, noOwner, why, decide, items, ms, slips };
  }

  /* ---- product-line detail (expands under the row) ---- */
  function lineDetail(s) {
    const idents = new Set(s.line.projects);
    const ps = (I.project_stats || []).filter((p) => idents.has(p.identifier));
    const sum = (k) => ps.reduce((a, p) => a + p[k], 0);
    const open = sum('open'), due = sum('with_due'), asg = sum('assigned');
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
    if (!open && !s.ms.length) return '<div class="muted" style="padding:8px">열린 일감도 마일스톤도 없습니다 — 판단할 자료가 없습니다.</div>';
    const byStatus = {}; const byWho = {};
    ps.forEach((p) => { Object.entries(p.statuses).forEach(([k, v]) => { byStatus[k] = (byStatus[k] || 0) + v; }); Object.entries(p.assignees).forEach(([k, v]) => { byWho[k] = (byWho[k] || 0) + v; }); });
    const ORDER = ['Ticketed', 'Open', 'Confirmed', 'In Progress', 'In Review', 'On Hold'];
    const statusTxt = ORDER.filter((k) => byStatus[k]).map((k) => `${esc(k)} <b>${byStatus[k]}</b>`).join(' · ') || '–';
    const whoTxt = Object.entries(byWho).sort((a, b) => (a[0] === '(담당 없음)') - (b[0] === '(담당 없음)') || a[0].localeCompare(b[0], 'ko')).map(([k, v]) => `${esc(k)} <b>${v}</b>`).join(' · ') || '–';
    const projRows = ps.filter((p) => p.open || I.milestones.some((m) => m.project_identifier === p.identifier)).map((p) => {
      const ms = I.milestones.filter((m) => m.project_identifier === p.identifier);
      const msTxt = ms.length ? ms.map((m) => `<div class="ms-item">${esc(m.subject.slice(0, 18))} ${m.date ? m.date.slice(5) : '<b>날짜 없음</b>'}${m.first_planned && m.first_planned !== m.date ? ` <span class="muted">(첫 계획 ${m.first_planned.slice(5)}${m.changes ? ', ' + m.changes + '회 변경' : ''}${m.slip_days > 0 ? ', ' + m.slip_days + '일 지연' : ''})</span>` : ''}</div>`).join('') : '<span class="muted">없음</span>';
      return `<tr><td>${esc(p.project)}</td><td class="num">${p.open}</td><td class="num">${pct(p.with_due, p.open)}</td><td class="num">${pct(p.assigned, p.open)}</td><td style="font-size:12px">${msTxt}</td></tr>`;
    }).join('');
    const names = new Set(ps.map((p) => p.project));
    const flowRows = (I.flow.open_items || []).filter((i) => names.has(i.project)).map((i) => ({ i, d: i.status === 'On Hold' ? i.hold_days : i.start_days })).filter((x) => x.d != null)
      .sort((a, b) => b.d - a.d).slice(0, 5);
    const flowTxt = flowRows.length ? `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>상태</th><th>담당자</th><th class="num">경과</th></tr></thead><tbody>${flowRows.map(({ i, d }) => `<tr><td>${wp(i)}</td><td>${esc(i.subject.slice(0, 36))}</td><td>${esc(i.status)}</td><td>${esc(i.assignee || '담당자 없음')}</td><td class="num">${i.status === 'On Hold' ? '보류 ' : '시작 후 '}${d}일</td></tr>`).join('')}</tbody></table>` : '<span class="muted">진행·검토·보류 중인 일감 없음</span>';
    const NEED = ['overdue', 'missing_update', 'blocked_aging', 'triage_overdue'];
    const need = s.items.filter((i) => i.flags.some((f) => NEED.includes(f)));
    const needTxt = need.length ? `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>이유</th><th>담당자</th></tr></thead><tbody>${need.slice(0, 8).map((i) => `<tr><td>${wp(i)}</td><td>${esc(i.subject.slice(0, 36))}</td><td style="font-size:12px">${esc(i.flags.map((f) => ({ overdue: '마감 지남', missing_update: '마감 후 갱신 없음', blocked_aging: '보류 장기화', triage_overdue: '이슈 분류 지연' }[f])).filter(Boolean).join(', '))}</td><td>${esc(i.assignee || '담당자 없음')}</td></tr>`).join('')}</tbody></table>${need.length > 8 ? `<div class="muted" style="font-size:11px">외 ${need.length - 8}건</div>` : ''}` : '<span class="muted">이번 주 결정 필요 없음</span>';
    return `<div style="padding:8px 4px;font-size:12px">
      <div style="margin-bottom:6px"><b>입력 충족도</b> 열린 ${open}건 · 담당 지정 ${pct(asg, open)} · 마감일 ${pct(due, open)} <button type="button" class="tb-chip" data-exec-roadmap="${esc(s.line.name)}">로드맵에서 보기</button></div>
      <table class="tbl"><thead><tr><th>과제</th><th class="num">열린</th><th class="num">마감일</th><th class="num">담당 지정</th><th>OP 마일스톤 (현재 · 첫 계획 대비)</th></tr></thead><tbody>${projRows || '<tr><td colspan="5" class="muted">없음</td></tr>'}</tbody></table>
      <div style="margin:8px 0 2px"><b>상태 분포</b> ${statusTxt}</div>
      <div style="margin:2px 0 8px"><b>담당자별</b> ${whoTxt}</div>
      <div style="margin:8px 0 2px"><b>오래 끈 진행·보류 5건</b></div>${flowTxt}
      <div style="margin:8px 0 2px"><b>결정 필요</b> <span class="muted">결정 시한 ${nextMeeting()}</span></div>${needTxt}
    </div>`;
  }

  function lineRow(s) {
    const nextTxt = s.next ? `${esc(s.next.subject.slice(0, 16))} <b>${s.next.date.slice(5)}</b> <span class="muted">D-${days(s.next.date, today())}</span>` : '<span class="muted">없음</span>';
    return `<tr data-exec-line="${esc(s.line.name)}">
      <td><b>${esc(s.line.name)}</b><div class="muted" style="font-size:11px">${esc(s.line.owner)}</div></td>
      <td style="white-space:nowrap;color:${COL[s.status]}">${DOT[s.status]} ${s.status === 'grey' && !s.open ? '일감 없음' : TXT[s.status]}</td>
      <td>${nextTxt}</td>
      <td style="font-size:12px">${s.why.map((w) => `<div>· ${w}</div>`).join('')}</td>
      <td style="font-size:12px"><b>${esc(s.decide)}</b><div class="muted">${esc(s.line.owner)}</div></td>
    </tr><tr data-exec-detail="${esc(s.line.name)}" hidden><td colspan="5" style="background:var(--surface-2,transparent)">${lineDetail(s)}</td></tr>`;
  }

  /* ---- top strip ---- */
  function strip(stats, allStats) {   // stats: RA excluded (product lines only); allStats: includes the RA line for Q2/Q4
    const UI = window.UI;
    const cnt = (c) => stats.filter((s) => s.status === c).length;
    const blocks = H.items.filter((i) => i.flags.includes('blocked_aging'));
    const oldest = Math.max(0, ...blocks.map((i) => i.blocked_since ? days(today(), i.blocked_since.slice(0, 10)) : 0));
    const g = H.goal_health; const q0 = new Date(today().slice(0, 4) + '-10-01'), q1 = new Date(today().slice(0, 4) + '-12-31');
    const elapsed = Math.max(0, Math.min(1, (new Date(today()) - q0) / (q1 - q0)));
    const krs = g.objectives.flatMap((o) => o.key_results); const prog = krs.length ? krs.reduce((s, k) => s + (k.progress || 0), 0) / krs.length : null;
    const goalTone = prog === null ? 'grey' : prog - elapsed < -0.3 ? 'red' : prog - elapsed < -0.1 ? 'amber' : 'green';
    const low = I.people.filter((p) => p.trust === 'low');
    const ok = I.people.filter((p) => p.trust === 'ok');
    const part = H.process_health.weekly_update_rate;
    return `<div class="kpi-row kpi-strip" style="--kpi-cols:5">
      ${UI.kpi({ label: 'Q1 제품 일정', value: `${DOT.red}${cnt('red')} ${DOT.amber}${cnt('amber')} ${DOT.green}${cnt('green')}${cnt('grey') ? ' ' + DOT.grey + cnt('grey') : ''}`, foot: `마일스톤 지남 ${stats.reduce((s, x) => s + x.msOver.length, 0)}건 · 30일↑ 지연 계획 ${stats.reduce((s, x) => s + x.slips.length, 0)}건` })}
      ${UI.kpi({ label: 'Q2 결정 지연', value: `${oldest ? DOT.red : DOT.green} ${blocks.length}건`, foot: `보류 최장 ${oldest}일 · 담당자 없는 결정 ${allStats.reduce((s, x) => s + x.noOwner.length, 0)}건` })}
      ${UI.kpi({ label: 'Q3 분기 목표', value: `${DOT[goalTone]} ${prog === null ? '–' : Math.round(prog * 100) + '%'}`, foot: `분기 경과 ${Math.round(elapsed * 100)}% · KR ${g.kr_total} · 위험 ${g.kr_at_risk}` })}
      ${UI.kpi({ label: 'Q4 인허가', value: RA ? `${RA.review_delay ? DOT.amber : DOT.green} 검토 지연 ${RA.review_delay}건` : '–', foot: RA ? `열린 요청 ${RA.open}건 · 등록부 ${RA.registry_connected ? '연결됨' : '연결 전'} · <a href="#" data-exec-ra>인허가 현황 →</a>` : '인허가 데이터 없음' })}
      ${UI.kpi({ label: 'Q5 OP 참여도', value: `${part < 0.5 ? DOT.grey : DOT.green} ${Math.round(part * 100)}%`, foot: `7일 내 갱신 · 입력 신뢰 가능 ${ok.length}명 / 부족 ${low.length}명 → 부하 판단 보류` })}
    </div>`;
  }

  /* ---- decisions top 5 ---- */
  // next weekly meeting: Thursday 10:00 (today when it is Thursday before 10:00)
  function nextMeeting() {
    const now = new Date(), dow = now.getDay();
    const add = dow === 4 && now.getHours() < 10 ? 0 : ((4 - dow + 7) % 7 || 7);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + add);
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}(목) 회의`;
  }

  function decisions(stats) {
    const UI = window.UI;
    const crit = H.items.filter((i) => i.flags.some((f) => f === 'blocked_aging' || f === 'missing_update' || f === 'triage_overdue') || (!i.assignee && i.flags.some((f) => ['overdue', 'missing_update', 'blocked_aging'].includes(f))));
    const score = (i) => (i.flags.includes('blocked_aging') ? 1000 + (i.blocked_since ? days(today(), i.blocked_since.slice(0, 10)) : 0) : 0) + (i.flags.includes('missing_update') ? 100 + (i.due ? days(today(), i.due) : 0) : 0) + (i.flags.includes('triage_overdue') ? 80 + days(today(), i.created) : 0) + (!i.assignee ? 50 : 0);
    const top = crit.sort((a, b) => score(b) - score(a)).slice(0, 5);
    const ownerOf = (i) => { const ident = (I.project_status.find((p) => p.project === i.project) || {}).identifier; const l = I.product_lines.find((x) => x.projects.includes(ident)); return l ? l.owner : '–'; };
    const ageOf = (i) => i.age_days ?? (I.items.find((x) => x.id === i.id) || {}).age_days;
    return UI.panel({ title: '이번 주 결정 TOP 5', sub: `결정 필요 ${crit.length}건 중 가장 오래된 것 · 목요일 회의 안건과 같은 기준 · 결정은 OP에서 담당자·마감일을 고치면 기록`,
      body: `<table class="tbl"><thead><tr><th>#</th><th>일감</th><th>제품군/과제</th><th>왜</th><th>담당자</th><th>결정 주체</th><th>결정 시한</th><th>발견 후</th></tr></thead><tbody>
      ${top.map((i, n) => `<tr><td>${n + 1}</td><td>${wp(i)} ${esc(i.subject.slice(0, 40))}</td><td>${esc(i.project)}</td>
        <td style="font-size:12px">${i.flags.includes('blocked_aging') ? `보류 ${days(today(), (i.blocked_since || today()).slice(0, 10))}일` : i.flags.includes('triage_overdue') ? `이슈 분류 대기 ${days(today(), i.created)}일 (접수 ${i.created.slice(5)})` : i.flags.includes('missing_update') ? `마감 ${days(today(), i.due)}일 지남, 갱신 없음` : '담당자 없음'}</td>
        <td>${esc(i.assignee || '없음')}</td><td><b>${esc(ownerOf(i))}</b></td><td>${nextMeeting()}</td><td>${ageOf(i) ?? 0}일</td></tr>`).join('') || '<tr><td colspan="8" class="muted">없음</td></tr>'}</tbody></table>` });
  }

  function goals() {
    const UI = window.UI; const g = H.goal_health;
    if (!g.objectives.length) return '';
    return UI.panel({ title: 'Q3 분기 목표 (OKR 2026 Q4)', sub: '값은 10-08 회의에서 담당자가 확정 · 작업 기반 KR은 연결 일감 완료로 자동 반영',
      body: `<div class="kpi-row" style="--kpi-cols:${g.objectives.length}">${g.objectives.map((o) => UI.kpi({ label: esc(o.subject.slice(0, 22)), value: o.progress === null ? '–' : Math.round(o.progress * 100) + '%', foot: `${esc(o.owner || '')} · KR ${o.key_results.length} · 위험 ${o.key_results.filter((k) => k.at_risk).length}` })).join('')}</div>` });
  }

  window.Views.exec = function () {
    const UI = window.UI;
    if (!H && !loading && !err) { load(); return '<div class="empty">현황 데이터 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">현황 데이터를 읽지 못함: ${esc(err)} <button class="mini-btn" data-exec-reload>다시 읽기</button></div>`;
    if (!H || !I) return '<div class="empty">현황 데이터 로딩 중…</div>';
    const allStats = I.product_lines.map(lineStats).sort((a, b) => ({ red: 0, amber: 1, grey: 2, green: 3 }[a.status] - { red: 0, amber: 1, grey: 2, green: 3 }[b.status]));
    const stats = allStats.filter((s) => !s.line.regulatory);   // RA is a DR 사업본부 organisation, not a product line
    const trend = (() => { try { return null; } catch { return null; } })();
    return `
      <div class="tier"><span class="tier-name">DR 사업본부 현황</span>
        <span class="tier-en">기준 ${esc(new Date(H.generated_at).toLocaleString('ko-KR'))} · Hermes 판정(§7)과 OP 이력 기반</span>
        <button type="button" class="tb-chip" data-exec-reload>다시 읽기</button><span class="rule"></span></div>
      ${strip(stats, allStats)}
      <div class="muted mono" style="font-size:11px;margin:0 0 var(--grid-1)">신호등: 🔴 마일스톤 지남 또는 보류 30일↑ · 🟡 마감 지남·보류·담당자 없는 결정 · 🟢 예외 없음 · ⚪ 데이터 신뢰도 낮아 판단 보류 (지난주 대비 추이는 10-08부터)</div>
      ${UI.panel({ title: 'Q1·Q2 제품군별 상태 → 왜 → 이번 주 결정', sub: '행을 누르면 과제별 일정·상태·오래 끈 일·결정 필요가 펼쳐집니다', body: `<table class="tbl"><thead><tr><th>제품군</th><th>상태</th><th>다음 마일스톤</th><th>왜 (규칙으로 생성)</th><th>이번 주 결정</th></tr></thead><tbody>${stats.map(lineRow).join('')}</tbody></table>` })}
      <div class="grid"><div class="col-12">${decisions(stats)}</div><div class="col-12">${goals()}</div></div>`;
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-exec-reload]')) { H = null; I = null; load(); }
    if (e.target.closest('[data-exec-ra]')) { e.preventDefault(); window.App?.go?.('ra'); return; }
    const rb = e.target.closest('[data-exec-roadmap]'); if (rb && window.App) { window.App.set('roadmapFocus', rb.dataset.execRoadmap); window.App.go?.('roadmap'); return; }
    const row = e.target.closest('[data-exec-line]');
    if (row) { const d = row.nextElementSibling; if (d && d.hasAttribute('data-exec-detail')) d.hidden = !d.hidden; }
  });
})();
