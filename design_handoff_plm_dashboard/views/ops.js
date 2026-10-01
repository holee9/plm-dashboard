/* ============================================================
   PLM Dashboard v2 — 실행 현황 (managers only)
   Flow of work without effort estimates (Kanban Guide flow metrics: WIP, work item age,
   cycle time, throughput) + work without an owner + people listed by name.
   No ranking, no score, no overload label: OP data is not complete enough to judge a person.
   Sources: data/insights.json (flow, people, product_lines, project_status), data/health.json (generated_at).
   ============================================================ */
(function () {
  window.Views = window.Views || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const OP = 'https://plm.abyz-lab.work';
  const wpLink = (i) => `<a class="wp-id" href="${OP}/work_packages/${i.id}" target="_blank" rel="noopener">${esc(i.display_id)}</a>`;
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

  const lineOf = (project) => {
    const ident = (I.project_status.find((p) => p.project === project) || {}).identifier;
    const l = I.product_lines.find((x) => x.projects.includes(ident));
    return l ? l.name : '(제품군 밖)';
  };

  function kpis(f) {
    const UI = window.UI, w = f.wip, c = f.cycle, x = c.excl_batch;
    const active = w.in_progress + w.in_review;
    const open = I.metrics.all.open;
    const unActive = f.unassigned.filter((u) => u.status === 'In Progress' || u.status === 'In Review').length;
    return `<div class="kpi-row kpi-strip" style="--kpi-cols:5">
      ${UI.kpi({ label: 'WIP 진행 중', value: `${active}건`, foot: `진행 ${w.in_progress} · 검토 ${w.in_review} · 보류 ${w.on_hold}` })}
      ${UI.kpi({ label: '작업 나이', value: `${f.age.median}일`, foot: `진행·검토 ${f.age.n}건의 시작 후 경과 중앙값 · 가장 오래된 ${f.age.max}일` })}
      ${UI.kpi({ label: '사이클 타임', value: `${c.median}일`, foot: `시작→종료 ${c.n}건 · 85%는 ${c.p85}일 이내 · 일괄 종료일 제외 시 ${x.median}일 / ${x.p85}일` })}
      ${UI.kpi({ label: '4주 처리량', value: `${f.throughput_4w}건`, foot: `최근 90일 종료 ${c.closed_90d}건 중 ${c.batch_closed}건이 일괄 종료일 ${c.batch_days}일에 몰려 주별 추세는 표시하지 않음` })}
      ${UI.kpi({ label: '주인 없는 일감', value: `${f.unassigned.length}건`, tone: f.unassigned.length ? 'amber' : '', foot: `열린 일감 ${open}건의 ${Math.round((f.unassigned.length / open) * 100)}% · 그중 진행·검토 ${unActive}건` })}
    </div>`;
  }

  function oldest(f) {
    const UI = window.UI;
    const rows = f.open_items.filter((i) => (i.status === 'In Progress' || i.status === 'In Review') && i.start_days != null)
      .sort((a, b) => b.start_days - a.start_days).slice(0, 5);
    return UI.panel({ title: '가장 오래 끈 일 TOP 5', sub: '진행·검토 중인 일감을 처음 시작한 날부터 센 경과일 · 오래된 일감을 먼저 확인하면 흐름 정체를 찾기 쉬움',
      body: `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>제품군 / 과제</th><th>담당자</th><th>상태</th><th class="num">시작 후</th></tr></thead><tbody>
        ${rows.map((i) => `<tr><td>${wpLink(i)}</td><td>${esc(i.subject.slice(0, 44))}</td><td>${esc(lineOf(i.project))} / ${esc(i.project)}</td><td>${esc(i.assignee || '담당자 없음')}</td><td>${esc(i.status)}</td><td class="num">${i.start_days}일</td></tr>`).join('')}
        </tbody></table>` });
  }

  function unowned(f) {
    const UI = window.UI;
    const by = {};
    f.unassigned.forEach((u) => { const l = lineOf(u.project); by[l] = (by[l] || 0) + 1; });
    const sum = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${esc(l)} ${n}건`).join(' · ');
    const rows = f.unassigned.slice(0, 10);
    return UI.panel({ title: `주인 없는 일감 ${f.unassigned.length}건`, sub: `제품군별: ${sum} · 접수 오래된 순 상위 10건 · 분류 대기(Ticketed) 이슈 포함 — 팀장이 담당자와 정해 배정`,
      body: `<table class="tbl"><thead><tr><th>번호</th><th>제목</th><th>제품군 / 과제</th><th>상태</th><th class="num">접수 후</th></tr></thead><tbody>
        ${rows.map((u) => `<tr><td>${wpLink(u)}</td><td>${esc(u.subject.slice(0, 44))}</td><td>${esc(lineOf(u.project))} / ${esc(u.project)}</td><td>${esc(u.status)}</td><td class="num">${u.created_days}일</td></tr>`).join('')}
        </tbody></table>${f.unassigned.length > 10 ? `<div class="muted" style="padding:6px">외 ${f.unassigned.length - 10}건</div>` : ''}` });
  }

  function people() {
    const UI = window.UI;
    const rows = I.people.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    return UI.panel({ title: '담당자별 — 이름순', sub: '점수·순위·과부하 판정 없음. 입력 신뢰가 낮은 사람의 숫자는 참고용(회색) · 갱신율 = 열린 일감 중 7일 내 수정 비율 · 완성도 = 담당자·마감일 입력 비율 · 신뢰 기준: 갱신 50%↑ 그리고 완성 80%↑',
      body: `<table class="tbl"><thead><tr><th>담당자</th><th class="num">열린</th><th class="num">동시 진행(진행+검토)</th><th class="num">갱신율</th><th class="num">완성도</th><th>입력 신뢰</th><th class="num">최근 4주 종료</th></tr></thead><tbody>
        ${rows.map((p) => { const low = p.trust === 'low'; return `<tr style="${low ? 'color:var(--text-dim)' : ''}"><td><b>${esc(p.name)}</b></td><td class="num">${p.wip}</td><td class="num">${p.wip_active}</td>
          <td class="num">${Math.round(p.updated_7d_rate * 100)}%</td><td class="num">${Math.round(p.complete_rate * 100)}%</td><td>${low ? '⚪ 낮음 — 숫자는 참고용' : 'ok'}</td><td class="num">${p.closed_4w}</td></tr>`; }).join('')}
        </tbody></table>` });
  }

  window.Views.ops = function () {
    if (!H && !loading && !err) { load(); return '<div class="empty">실행 현황 데이터 로딩 중…</div>'; }
    if (err) return `<div class="empty" style="color:var(--c-red)">실행 현황 데이터를 읽지 못함: ${esc(err)} <button class="mini-btn" data-ops-reload>다시 읽기</button></div>`;
    if (!H || !I) return '<div class="empty">실행 현황 데이터 로딩 중…</div>';
    const f = I.flow;
    return `
      <div class="tier"><span class="tier-name">실행 현황</span>
        <span class="tier-en">기준 ${esc(new Date(H.generated_at).toLocaleString('ko-KR'))} · 일감 흐름(건수·날짜만 사용) · 관리자용</span>
        <button type="button" class="tb-chip" data-ops-reload>다시 읽기</button><span class="rule"></span></div>
      ${kpis(f)}
      <div class="muted mono" style="font-size:11px;margin:0 0 var(--grid-1)">OP에 공수(시간) 추정이 입력돼 있지 않아 건수와 날짜로만 계산한 지표입니다. 시작 = 처음 진행·검토 상태가 된 날, 종료 = 처음 종료 상태가 된 날. 사람 순위·과부하 판정은 하지 않습니다.</div>
      <div class="grid"><div class="col-12">${oldest(f)}</div><div class="col-12">${unowned(f)}</div><div class="col-12">${people()}</div></div>`;
  };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-ops-reload]')) { H = null; I = null; load(); } });
})();
