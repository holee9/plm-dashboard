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
  let H = null, I = null, err = null, loading = false;

  async function load() {
    loading = true;
    try {
      const [h, i] = await Promise.all([fetch('data/health.json', { cache: 'no-store' }), fetch('data/insights.json', { cache: 'no-store' })]);
      if (!h.ok || !i.ok) throw new Error(`health ${h.status} / insights ${i.status}`);
      H = await h.json(); I = await i.json(); err = null;
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
    const noOwner = items.filter((i) => !i.assignee && i.flags.some((f) => ['overdue', 'missing_update', 'blocked_aging'].includes(f)));
    const people = I.people.filter((p) => true); // participation measured at line level below
    // participation at line level: share of open WPs touched in 7 days (from project_health weekly rates is global; use items proxy)
    const lineProjects = ph.map((p) => p.project);
    const trustPeople = I.people.filter((p) => p.trust === 'ok').length;
    const slips = ms.filter((m) => m.slip_days && m.slip_days > 30);
    let status = 'green';
    if (msOver.length || oldestBlock > 30) status = 'red';
    else if (overdue || blockedAging.length || noOwner.length) status = 'amber';
    // data-trust: if the line's projects have very few recent human updates, judgement is withheld
    const touchedRate = H.process_health.weekly_update_rate; // global; per-line not available yet
    const why = [];
    if (msOver.length) why.push(`마일스톤 ${msOver.length}건 지남 (${msOver.map((m) => esc(m.subject.slice(0, 14)) + ' ' + m.date.slice(5)).slice(0, 2).join(', ')})`);
    slips.slice(0, 1).forEach((m) => why.push(`${esc(m.subject.slice(0, 16))}: 계획 ${m.first_planned.slice(0, 7)} → ${m.date.slice(0, 7)} (${m.slip_days > 0 ? m.slip_days + '일 지연' : Math.abs(m.slip_days) + '일 당김'}, ${m.changes}회 변경)`));
    if (oldestBlock) why.push(`보류 최장 ${oldestBlock}일 (${blockedAging.sort((a, b) => (a.blocked_since || '').localeCompare(b.blocked_since || ''))[0].display_id})`);
    if (overdue) why.push(`마감 지남 ${overdue}건 / 열린 ${open}건`);
    if (noOwner.length) why.push(`담당자 없는 결정 ${noOwner.length}건`);
    if (!why.length) why.push(`열린 ${open}건, 예외 없음`);
    const decide = blockedAging[0] ? `${blockedAging[0].display_id} 재개/중단` : noOwner[0] ? `${noOwner[0].display_id} 담당 지정` : msOver[0] ? `${esc(msOver[0].subject.slice(0, 12))} 일정 재설정` : overdue ? '마감 재설정' : '—';
    return { line, status, open, overdue, msOver, next, oldestBlock, noOwner, why, decide, items, ms, slips };
  }

  function lineRow(s) {
    const nextTxt = s.next ? `${esc(s.next.subject.slice(0, 16))} <b>${s.next.date.slice(5)}</b> <span class="muted">D-${days(s.next.date, today())}</span>` : '<span class="muted">없음</span>';
    return `<tr data-exec-line="${esc(s.line.name)}">
      <td><b>${esc(s.line.name)}</b><div class="muted" style="font-size:11px">${esc(s.line.owner)}</div></td>
      <td style="white-space:nowrap;color:${COL[s.status]}">${DOT[s.status]} ${TXT[s.status]}</td>
      <td>${nextTxt}</td>
      <td style="font-size:12px">${s.why.map((w) => `<div>· ${w}</div>`).join('')}</td>
      <td style="font-size:12px"><b>${esc(s.decide)}</b><div class="muted">${esc(s.line.owner)}</div></td>
    </tr>`;
  }

  /* ---- top strip ---- */
  function strip(stats) {
    const UI = window.UI;
    const cnt = (c) => stats.filter((s) => s.status === c).length;
    const blocks = H.items.filter((i) => i.flags.includes('blocked_aging'));
    const oldest = Math.max(0, ...blocks.map((i) => i.blocked_since ? days(today(), i.blocked_since.slice(0, 10)) : 0));
    const g = H.goal_health; const q0 = new Date(today().slice(0, 4) + '-10-01'), q1 = new Date(today().slice(0, 4) + '-12-31');
    const elapsed = Math.max(0, Math.min(1, (new Date(today()) - q0) / (q1 - q0)));
    const krs = g.objectives.flatMap((o) => o.key_results); const prog = krs.length ? krs.reduce((s, k) => s + (k.progress || 0), 0) / krs.length : null;
    const goalTone = prog === null ? 'grey' : prog - elapsed < -0.3 ? 'red' : prog - elapsed < -0.1 ? 'amber' : 'green';
    const reg = stats.find((s) => s.line.regulatory);
    const regItems = reg ? reg.items : [];
    const regNext = reg && reg.ms.length ? reg.ms[0] : null;
    const regDue = reg ? (H.items.filter((i) => reg.line.projects.includes((I.project_status.find((p) => p.project === i.project) || {}).identifier)).map((i) => i.due).filter(Boolean).sort()[0]) : null;
    const low = I.people.filter((p) => p.trust === 'low');
    const ok = I.people.filter((p) => p.trust === 'ok');
    const part = H.process_health.weekly_update_rate;
    return `<div class="kpi-row kpi-strip" style="--kpi-cols:5">
      ${UI.kpi({ label: 'Q1 제품 일정', value: `${DOT.red}${cnt('red')} ${DOT.amber}${cnt('amber')} ${DOT.green}${cnt('green')}`, foot: `마일스톤 지남 ${stats.reduce((s, x) => s + x.msOver.length, 0)}건 · 30일↑ 지연 계획 ${stats.reduce((s, x) => s + x.slips.length, 0)}건` })}
      ${UI.kpi({ label: 'Q2 결정 지연', value: `${oldest ? DOT.red : DOT.green} ${blocks.length}건`, foot: `보류 최장 ${oldest}일 · 담당자 없는 결정 ${stats.reduce((s, x) => s + x.noOwner.length, 0)}건` })}
      ${UI.kpi({ label: 'Q3 분기 목표', value: `${DOT[goalTone]} ${prog === null ? '–' : Math.round(prog * 100) + '%'}`, foot: `분기 경과 ${Math.round(elapsed * 100)}% · KR ${g.kr_total} · 위험 ${g.kr_at_risk}` })}
      ${UI.kpi({ label: 'Q4 인허가', value: `${reg ? DOT[reg.status] : DOT.grey} ${reg ? TXT[reg.status] : '–'}`, foot: reg ? `예외 ${regItems.length}건 · 다음 마감 ${regDue ? regDue.slice(5) : '–'}` : '제품군 정의 없음' })}
      ${UI.kpi({ label: 'Q5 OP 참여도', value: `${part < 0.5 ? DOT.grey : DOT.green} ${Math.round(part * 100)}%`, foot: `7일 내 갱신 · 입력 신뢰 가능 ${ok.length}명 / 부족 ${low.length}명 → 부하 판단 보류` })}
    </div>`;
  }

  /* ---- decisions top 5 ---- */
  function decisions(stats) {
    const UI = window.UI;
    const crit = H.items.filter((i) => i.flags.some((f) => f === 'blocked_aging' || f === 'missing_update') || (!i.assignee && i.flags.some((f) => ['overdue', 'missing_update', 'blocked_aging'].includes(f))));
    const score = (i) => (i.flags.includes('blocked_aging') ? 1000 + (i.blocked_since ? days(today(), i.blocked_since.slice(0, 10)) : 0) : 0) + (i.flags.includes('missing_update') ? 100 + (i.due ? days(today(), i.due) : 0) : 0) + (!i.assignee ? 50 : 0);
    const top = crit.sort((a, b) => score(b) - score(a)).slice(0, 5);
    const ownerOf = (i) => { const ident = (I.project_status.find((p) => p.project === i.project) || {}).identifier; const l = I.product_lines.find((x) => x.projects.includes(ident)); return l ? l.owner : '–'; };
    const ageOf = (i) => i.age_days ?? (I.items.find((x) => x.id === i.id) || {}).age_days;
    return UI.panel({ title: '이번 주 결정 TOP 5', sub: `결정 필요 ${crit.length}건 중 가장 오래된 것 · 목요일 회의 안건과 같은 기준 · 결정은 OP에서 담당자·마감일을 고치면 기록`,
      body: `<table class="tbl"><thead><tr><th>#</th><th>일감</th><th>제품군/과제</th><th>왜</th><th>담당자</th><th>결정 주체</th><th>발견 후</th></tr></thead><tbody>
      ${top.map((i, n) => `<tr><td>${n + 1}</td><td>${wp(i)} ${esc(i.subject.slice(0, 40))}</td><td>${esc(i.project)}</td>
        <td style="font-size:12px">${i.flags.includes('blocked_aging') ? `보류 ${days(today(), (i.blocked_since || today()).slice(0, 10))}일` : i.flags.includes('missing_update') ? `마감 ${days(today(), i.due)}일 지남, 갱신 없음` : '담당자 없음'}</td>
        <td>${esc(i.assignee || '없음')}</td><td><b>${esc(ownerOf(i))}</b></td><td>${ageOf(i) ?? 0}일</td></tr>`).join('') || '<tr><td colspan="7" class="muted">없음</td></tr>'}</tbody></table>` });
  }

  /* ---- people (participation first) ---- */
  function people() {
    const UI = window.UI;
    const rows = I.people.slice().sort((a, b) => b.wip - a.wip);
    return UI.panel({ title: 'Q5 사람 — 참여도 먼저, 부하는 신뢰도 ok일 때만', sub: '갱신율 = 열린 일감 중 7일 내 수정 비율 · 완성도 = 담당자·마감일 입력 비율 · 신뢰 기준: 갱신 50%↑ 또는 완성 80%↑ 둘 다',
      body: `<table class="tbl"><thead><tr><th>담당자</th><th>갱신율</th><th>완성도</th><th>신뢰</th><th>열린</th><th>겸임</th><th>마감 지남</th><th>4주 처리</th><th>판단</th></tr></thead><tbody>
      ${rows.map((p) => { const low = p.trust === 'low';
        const judge = low ? '⚪ 입력 부족 — 부하 판단 보류 (리더가 입력 요청)' : p.wip >= 20 || p.projects >= 5 ? '🔴 과부하·겸임 과다' : p.flow < 0.1 && p.wip >= 10 ? '🟡 흐름 정체' : '🟢 양호';
        return `<tr style="${low ? 'color:var(--text-dim)' : ''}"><td><b>${esc(p.name)}</b></td><td>${Math.round(p.updated_7d_rate * 100)}%</td><td>${Math.round(p.complete_rate * 100)}%</td><td>${low ? '낮음' : 'ok'}</td>
          <td class="num">${p.wip}</td><td class="num">${p.projects}</td><td class="num">${p.overdue}</td><td class="num">${p.closed_4w}</td><td style="font-size:12px">${judge}</td></tr>`; }).join('')}</tbody></table>` });
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
    const stats = I.product_lines.map(lineStats).sort((a, b) => ({ red: 0, amber: 1, grey: 2, green: 3 }[a.status] - { red: 0, amber: 1, grey: 2, green: 3 }[b.status]));
    const trend = (() => { try { return null; } catch { return null; } })();
    return `
      <div class="tier"><span class="tier-name">사업본부 현황</span>
        <span class="tier-en">기준 ${esc(new Date(H.generated_at).toLocaleString('ko-KR'))} · Hermes 판정(§7)과 OP 이력 기반 · 관리자용</span>
        <button type="button" class="tb-chip" data-exec-reload>다시 읽기</button><span class="rule"></span></div>
      ${strip(stats)}
      <div class="muted mono" style="font-size:11px;margin:0 0 var(--grid-1)">신호등: 🔴 마일스톤 지남 또는 보류 30일↑ · 🟡 마감 지남·보류·담당자 없는 결정 · 🟢 예외 없음 · ⚪ 데이터 신뢰도 낮아 판단 보류 (지난주 대비 추이는 10-08부터)</div>
      ${UI.panel({ title: 'Q1·Q2·Q4 제품군별 상태 → 왜 → 이번 주 결정', sub: '행을 누르면 로드맵에서 해당 제품군 강조', body: `<table class="tbl"><thead><tr><th>제품군</th><th>상태</th><th>다음 마일스톤</th><th>왜 (규칙으로 생성)</th><th>이번 주 결정</th></tr></thead><tbody>${stats.map(lineRow).join('')}</tbody></table>` })}
      <div class="grid"><div class="col-12">${decisions(stats)}</div><div class="col-12">${goals()}</div><div class="col-12">${people()}</div></div>`;
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-exec-reload]')) { H = null; I = null; load(); }
    const row = e.target.closest('[data-exec-line]'); if (row && window.App) { window.App.set('roadmapFocus', row.dataset.execLine); window.App.go?.('roadmap'); }
  });
})();
