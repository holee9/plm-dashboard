/**
 * E2E UX 실증 검증 v2 — PLM Dashboard (#9)
 *
 * 기존 e2e-verify.js(AC-E2E-01~20)는 API 데이터 무결성만 확인.
 * 이 스크립트는 실제 사용자가 브라우저에서 경험하는 UX를 검증한다:
 *   - 사이드바 클릭 → 의미있는 화면 표시 여부
 *   - 빈 화면(조용한 실패) vs 명시적 빈상태 메시지
 *   - 새로고침 버튼 실제 동작
 *   - 사이드바 접기/펼치기
 *   - 자동 폴링 존재 여부 명시
 *
 * Run: node e2e-verify-v2.js
 */
'use strict';
const { chromium } = require('playwright');

const BASE = 'http://localhost:8088';
const LOAD_TIMEOUT = 20000; // 20s — live OP fetch 여유
const PASS = '✓';
const FAIL = '✗';
const WARN = '⚠';

let passed = 0, failed = 0, warned = 0;

function ok(id, msg)   { console.log(`  ${PASS} ${id}: ${msg}`); passed++; }
function fail(id, msg) { console.log(`  ${FAIL} ${id}: ${msg}`); failed++; }
function warn(id, msg) { console.log(`  ${WARN} ${id}: ${msg}`); warned++; }
function section(s)    { console.log(`\n[${s}]`); }

/* ------------------------------------------------------------------ helpers */

async function navigateTo(page, viewKey) {
  await page.evaluate(
    (v) => { if (window.App && window.App.set) window.App.set('view', v); },
    viewKey,
  );
  // App.set 없으면 nav-item 클릭
  const navItem = page.locator(`[data-view="${viewKey}"]`);
  if (await navItem.count() > 0) await navItem.click();
  await page.waitForTimeout(800);
}

async function getContent(page) {
  const el = page.locator('#content');
  return el.count() > 0 ? await el.innerHTML() : '';
}

/* ------------------------------------------------------------------ runner */

async function run() {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const ctx    = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page   = await ctx.newPage();

  // --- 콘솔 에러 수집 ---
  const consoleErrors = {};
  let currentView = 'boot';
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const bucket = consoleErrors[currentView] || (consoleErrors[currentView] = []);
      bucket.push(msg.text());
    }
  });

  // --- 네트워크 요청 카운터 (새로고침 검증용) ---
  let opRequestCount = 0;
  page.on('request', (req) => {
    if (req.url().includes('/op/')) opRequestCount++;
  });

  /* ======================================================= 부트 & 로딩 */
  section('AC-UX-07~08: 로딩 상태 & 에러 핸들링');

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });

  // AC-UX-07: 로딩 중 _loading=true 감지 후 완료 전환
  const loadingAtBoot = await page.evaluate(() => window.DB && window.DB._loading);
  const reqAtBoot = opRequestCount;

  // 라이브 API 완전 로드 대기
  try {
    await page.waitForFunction(
      () => window.DB && window.DB._loading === false,
      { timeout: LOAD_TIMEOUT },
    );
    ok('AC-UX-07', `라이브 데이터 로드 완료 (loading: ${loadingAtBoot} → false), OP 요청=${reqAtBoot}+`);
  } catch {
    const dbErr = await page.evaluate(() => window.DB && window.DB._error);
    fail('AC-UX-07', `${LOAD_TIMEOUT}ms 내 로딩 미완료. DB._error="${dbErr}"`);
  }

  // AC-UX-08: API 에러 시 UI 표시
  await page.evaluate(() => {
    if (window.App && window.App.showError) window.App.showError('E2E 테스트 오류 주입');
  });
  await page.waitForTimeout(300);
  const contentHtml = await getContent(page);
  if (contentHtml.includes('연동 오류') || contentHtml.includes('E2E 테스트 오류 주입')) {
    ok('AC-UX-08', 'API 에러 시 #content에 에러 메시지 표시됨');
  } else {
    fail('AC-UX-08', `에러 메시지가 UI에 표시되지 않음. #content 앞 100자: "${contentHtml.slice(0, 100)}"`);
  }
  // 에러 상태 리셋
  await page.evaluate(() => {
    if (window.DB) { window.DB._error = null; window.DB._loading = false; }
    if (window.App && window.App.refresh) window.App.refresh();
  });
  await page.waitForTimeout(500);

  /* ======================================================= 뷰별 UX 검증 */
  section('AC-UX-01~06: 사이드바 네비게이션 → 실 데이터 표시');

  const VIEWS = [
    {
      key: 'overview',
      id: 'AC-UX-01',
      label: 'Overview',
      // KPI 카드 안의 숫자값 (.kpi-value)
      checks: [
        { sel: '.kpi-value', minCount: 1, desc: 'KPI 수치 카드 ≥1개' },
      ],
    },
    {
      key: 'projects',
      id: 'AC-UX-02',
      label: 'Projects',
      checks: [
        // 프로젝트 행 또는 "데이터 없음" 빈상태 메시지
        {
          fn: async (page) => {
            const rows = await page.locator('table tr td').count();
            const empty = await page.locator('.empty').count();
            return { ok: rows > 0 || empty > 0, detail: `tr>td=${rows}, .empty=${empty}` };
          },
          desc: '프로젝트 행 or 빈상태 메시지',
        },
      ],
    },
    {
      key: 'resources',
      id: 'AC-UX-03',
      label: 'Resources',
      checks: [
        {
          fn: async (page) => {
            const rows = await page.locator('table tr td').count();
            const empty = await page.locator('.empty').count();
            return { ok: rows > 0 || empty > 0, detail: `tr>td=${rows}, .empty=${empty}` };
          },
          desc: '리소스 행 or 빈상태 메시지',
        },
      ],
    },
    {
      key: 'board',
      id: 'AC-UX-04',
      label: 'Board',
      checks: [
        // 칸반 컬럼 헤더는 항상 존재해야 함 (데이터 없어도)
        { sel: '.board-col', minCount: 1, desc: '칸반 컬럼 헤더 ≥1개' },
      ],
    },
    {
      key: 'timeline',
      id: 'AC-UX-05',
      label: 'Timeline',
      checks: [
        {
          fn: async (page) => {
            const rows  = await page.locator('.tl-row, [class*="tl-"]').count();
            const ganttRows = await page.locator('.gantt-row').count();
            const milestones = await page.locator('[data-timeline-milestone]').count();
            const empty = await page.locator('.empty').count();
            const tables = await page.locator('table tr td').count();
            return {
              ok: rows > 0 || ganttRows > 0 || milestones > 0 || empty > 0 || tables > 0,
              detail: `tl-row=${rows}, gantt-row=${ganttRows}, milestone=${milestones}, .empty=${empty}, td=${tables}`,
            };
          },
          desc: '타임라인 행 or 빈상태 메시지',
        },
      ],
    },
    {
      key: 'risks',
      id: 'AC-UX-06',
      label: 'Risks',
      checks: [
        // KPI 행(kpi-row)은 항상 렌더링 + 내용(리스크 or 빈상태) 있어야 함
        { sel: '.kpi-row', minCount: 1, desc: '리스크 KPI 행 존재' },
        {
          fn: async (page) => {
            const tables = await page.locator('table').count();
            const empty  = await page.locator('.empty').count();
            // 조용한 빈화면: table도 없고 .empty도 없으면 실패
            return { ok: tables > 0 || empty > 0, detail: `table=${tables}, .empty=${empty}` };
          },
          desc: '리스크 내용(테이블 or 빈상태 메시지) 존재 — 조용한 빈화면 금지',
        },
      ],
    },
  ];

  for (const v of VIEWS) {
    currentView = v.key;
    await navigateTo(page, v.key);

    const errCount = (consoleErrors[v.key] || []).length;
    let checkPassed = true;
    const details = [];

    for (const chk of v.checks) {
      if (chk.fn) {
        const result = await chk.fn(page);
        if (!result.ok) { checkPassed = false; }
        details.push(`${chk.desc}: ${result.ok ? '✓' : '✗'} (${result.detail})`);
      } else {
        const count = await page.locator(chk.sel).count();
        const ok_ = count >= (chk.minCount || 1);
        if (!ok_) checkPassed = false;
        details.push(`${chk.desc}: ${ok_ ? '✓' : '✗'} (count=${count})`);
      }
    }

    const summary = details.join(' | ');
    if (checkPassed && errCount === 0) {
      ok(v.id, `${v.label}: ${summary}`);
    } else if (!checkPassed) {
      fail(v.id, `${v.label}: ${summary}${errCount > 0 ? ` | 콘솔오류=${errCount}` : ''}`);
    } else {
      // 콘솔 에러만 있는 경우
      warn(v.id, `${v.label}: 화면은 정상이나 콘솔오류=${errCount}: ${(consoleErrors[v.key] || []).slice(0, 2).join(' | ')}`);
    }
  }

  /* ======================================================= 인터랙션 */
  section('AC-UX-09~17: 인터랙션');

  // AC-UX-09: 새로고침 버튼 → API 재호출
  await navigateTo(page, 'overview');
  const reqBefore = opRequestCount;
  const refreshBtn = page.locator('[data-refresh]');
  if (await refreshBtn.count() > 0) {
    await refreshBtn.click();
    await page.waitForTimeout(2000); // 재로드 대기
    const reqAfter = opRequestCount;
    if (reqAfter > reqBefore) {
      ok('AC-UX-09', `새로고침 버튼 클릭 → OP API 재호출 발생 (요청 +${reqAfter - reqBefore}개)`);
    } else {
      fail('AC-UX-09', `새로고침 버튼 클릭했으나 OP API 요청 증가 없음 (before=${reqBefore}, after=${reqAfter})`);
    }
  } else {
    fail('AC-UX-09', '[data-refresh] 버튼을 찾을 수 없음');
  }

  // AC-UX-10: 사이드바 접기/펼치기
  const toggleBtn = page.locator('[data-toggle-sidebar]');
  if (await toggleBtn.count() > 0) {
    const sidebar = page.locator('.sidebar');
    const collapsedBefore = await sidebar.evaluate((el) => el.classList.contains('collapsed'));
    await toggleBtn.click();
    await page.waitForTimeout(400);
    const collapsedAfter = await sidebar.evaluate((el) => el.classList.contains('collapsed'));
    if (collapsedBefore !== collapsedAfter) {
      ok('AC-UX-10', `사이드바 접기/펼치기 동작 (${collapsedBefore} → ${collapsedAfter})`);
      // 원복
      await toggleBtn.click();
      await page.waitForTimeout(300);
    } else {
      fail('AC-UX-10', '사이드바 상태 변화 없음');
    }
  } else {
    fail('AC-UX-10', '[data-toggle-sidebar] 버튼을 찾을 수 없음');
  }

  // AC-UX-11: Board 프로젝트 필터 동작
  await navigateTo(page, 'board');
  const boardSelect = page.locator('[data-board-project]');
  if (await boardSelect.count() > 0) {
    const options = await boardSelect.locator('option').count();
    if (options >= 2) {
      // "전체" 외 첫 번째 프로젝트 선택
      await boardSelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);
      const colsAfter = await page.locator('.board-col').count();
      ok('AC-UX-11', `Board 프로젝트 필터 동작 (옵션=${options}개, 필터 후 컬럼=${colsAfter})`);
    } else {
      warn('AC-UX-11', `Board 필터 옵션 부족 (options=${options}) — 프로젝트 데이터 확인 필요`);
    }
  } else {
    fail('AC-UX-11', '[data-board-project] 셀렉트를 찾을 수 없음');
  }

  // AC-UX-16: Projects KPI 편집 컨트롤 가시성/클릭 가능성
  await navigateTo(page, 'projects');
  const projKpiEdit = page.locator('[data-kpi-ns="proj"] [data-toggle-kpi-edit]');
  if (await projKpiEdit.count() > 0) {
    await projKpiEdit.last().click();
    await page.waitForTimeout(500);
    const editControls = await page.evaluate(() => {
      const rail = document.querySelector('.project-kpi-rail');
      const actions = document.querySelector('.project-kpi-rail .kpi-actions');
      const cancel = document.querySelector('[data-cancel-kpi-edit]');
      const done = Array.from(document.querySelectorAll('[data-toggle-kpi-edit]'))
        .find((el) => (el.innerText || '').includes('완료'));
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom };
      };
      const topMatches = (el) => {
        const b = box(el);
        if (!b) return false;
        const top = document.elementFromPoint(b.x + Math.min(8, Math.max(1, b.w - 1)), b.y + Math.min(8, Math.max(1, b.h - 1)));
        return top === el || el.contains(top);
      };
      const rb = box(rail);
      const ab = box(actions);
      return {
        hasCancel: !!cancel,
        hasDone: !!done,
        actionsInsideRail: !!(rb && ab && ab.bottom <= rb.bottom + 1),
        cancelClickable: topMatches(cancel),
        doneClickable: topMatches(done),
      };
    });
    const visible = Object.values(editControls).every(Boolean);
    if (visible) {
      await page.locator('[data-cancel-kpi-edit]').click();
      await page.waitForTimeout(300);
      const cancelClosed = await page.locator('[data-cancel-kpi-edit]').count() === 0;
      await projKpiEdit.last().click();
      await page.waitForTimeout(300);
      await page.locator('button[data-toggle-kpi-edit]', { hasText: '완료' }).click();
      await page.waitForTimeout(300);
      const doneClosed = await page.locator('[data-cancel-kpi-edit]').count() === 0;
      if (cancelClosed && doneClosed) {
        ok('AC-UX-16', 'Projects KPI 편집 취소/완료 버튼이 가려지지 않고 클릭 가능');
      } else {
        fail('AC-UX-16', `Projects KPI 편집 종료 실패 (cancelClosed=${cancelClosed}, doneClosed=${doneClosed})`);
      }
    } else {
      fail('AC-UX-16', `Projects KPI 편집 버튼 가시성/클릭성 실패: ${JSON.stringify(editControls)}`);
    }
  } else {
    fail('AC-UX-16', 'Projects KPI 편집 버튼을 찾을 수 없음');
  }

  // AC-UX-17: OP 마일스톤 date 필드 → Timeline 간트 marker 표시
  await navigateTo(page, 'timeline');
  const milestoneInfo = await page.evaluate(() => {
    const D = window.DB;
    const isMilestone = (wp) => /milestone|마일스톤/i.test(D.T[wp.typeId]?.name || '');
    const milestoneDate = (wp) => wp._milestoneDate || wp._due || wp._start || null;
    const dated = D.WORK_PACKAGES.filter((w) => isMilestone(w) && milestoneDate(w));
    return {
      dated: dated.length,
      firstProjectId: dated.length ? dated[0].projectId : null,
    };
  });
  if (milestoneInfo.dated === 0) {
    warn('AC-UX-17', 'OP에 날짜 있는 마일스톤이 없어 marker 표시 검증 생략');
  } else {
    const allMarkerCount = await page.locator('[data-timeline-milestone]').count();
    const firstTip = allMarkerCount ? await page.locator('[data-timeline-milestone]').first().getAttribute('data-tip') : '';
    await page.selectOption('[data-tl-project]', String(milestoneInfo.firstProjectId));
    await page.waitForTimeout(500);
    const projectMarkerCount = await page.locator('[data-timeline-milestone]').count();
    const projectTip = projectMarkerCount ? await page.locator('[data-timeline-milestone]').first().getAttribute('data-tip') : '';
    if (allMarkerCount > 0 && projectMarkerCount > 0 && (firstTip || '').includes('◇') && (projectTip || '').includes('◇')) {
      ok('AC-UX-17', `Timeline 마일스톤 marker 표시 (all=${allMarkerCount}, project=${projectMarkerCount})`);
    } else {
      fail('AC-UX-17', `Timeline 마일스톤 marker 누락 (dated=${milestoneInfo.dated}, all=${allMarkerCount}, project=${projectMarkerCount})`);
    }
  }

  // AC-UX-18: Timeline 하단은 스프린트 빈 표가 아니라 일정 점검 패널이어야 함
  await navigateTo(page, 'timeline');
  await page.selectOption('[data-tl-project]', 'all');
  await page.waitForTimeout(500);
  const scheduleCount = await page.locator('[data-schedule-inspection]').count();
  const scheduleCards = await page.locator('.schedule-card').count();
  const hasActiveSprints = (await getContent(page)).includes('Active Sprints');
  let targetPid = await page.evaluate(() => {
    const D = window.DB;
    const isMilestone = (wp) => /milestone|마일스톤/i.test(D.T[wp.typeId]?.name || '');
    const milestoneDate = (wp) => wp._milestoneDate || wp._due || wp._start || null;
    const p = D.PROJECTS.find((project) =>
      D.WORK_PACKAGES.some((w) => w.projectId === project.id && isMilestone(w) && milestoneDate(w)));
    return p ? String(p.id) : null;
  });
  const projectRow = targetPid
    ? page.locator(`.gantt-row[data-tl-scope-project="${targetPid}"]`).first()
    : page.locator('.gantt-row[data-tl-scope-project]').first();
  if (await projectRow.count() === 0) {
    fail('AC-UX-18', 'Timeline 간트에서 클릭 가능한 프로젝트 행을 찾을 수 없음');
  } else {
    targetPid = await projectRow.getAttribute('data-tl-scope-project');
    await projectRow.click();
    await page.waitForTimeout(600);
    const selectedPid = await page.locator('[data-tl-project]').evaluate((el) => el.value);
    const scopedScheduleCount = await page.locator('[data-schedule-inspection]').count();
    const scopedProjectMarkers = await page.locator('[data-timeline-milestone]').count();
    if (
      scheduleCount > 0 &&
      scopedScheduleCount > 0 &&
      scheduleCards >= 5 &&
      !hasActiveSprints &&
      selectedPid === targetPid &&
      scopedProjectMarkers > 0
    ) {
      ok('AC-UX-18', `Timeline 일정 점검 패널 및 프로젝트 행 scope 전환 동작 (project=${selectedPid}, markers=${scopedProjectMarkers})`);
    } else {
      fail(
        'AC-UX-18',
        `Timeline 일정 점검/프로젝트 scope 전환 실패 (schedule=${scheduleCount}, scoped=${scopedScheduleCount}, cards=${scheduleCards}, activeSprints=${hasActiveSprints}, target=${targetPid}, selected=${selectedPid})`,
      );
    }
  }

  /* ======================================================= 동기화 정책 */
  section('AC-UX-12~13: 데이터 동기화 정책');

  // AC-UX-12: 자동 폴링 코드 부재 확인
  const hasPolling = await page.evaluate(() => {
    // setInterval이 오버라이드된 적 있는지 또는 DB._pollingId가 있는지 확인
    return !!(window.DB && window.DB._pollingId);
  });
  if (!hasPolling) {
    warn('AC-UX-12', '자동 폴링(setInterval) 미구현 — 현재 페이지 로드 시 1회 fetch만 수행. 사용자에게 수동 새로고침 안내 필요.');
  } else {
    ok('AC-UX-12', '자동 폴링 구현됨');
  }

  // AC-UX-13: 수동 새로고침이 유일한 갱신 경로임을 확인
  const manualRefreshOnly = !hasPolling;
  if (manualRefreshOnly) {
    warn('AC-UX-13', '수동 새로고침 버튼이 유일한 데이터 갱신 경로 — 장시간 화면 유지 시 stale 데이터 위험. 향후 자동 갱신 추가 권장.');
  } else {
    ok('AC-UX-13', '자동 + 수동 갱신 경로 모두 존재');
  }

  /* ======================================================= 크로스컷 */
  section('AC-UX-14~15: 크로스컷');

  // AC-UX-14: 전체 뷰 순회 콘솔 에러 누적
  const allErrors = Object.entries(consoleErrors)
    .filter(([, errs]) => errs.length > 0)
    .map(([view, errs]) => `${view}(${errs.length})`);
  if (allErrors.length === 0) {
    ok('AC-UX-14', '전체 뷰 순회 중 콘솔 에러 없음');
  } else {
    fail('AC-UX-14', `콘솔 에러 발생 뷰: ${allErrors.join(', ')}`);
    Object.entries(consoleErrors).forEach(([view, errs]) => {
      if (errs.length) errs.forEach((e) => console.log(`      [${view}] ${e}`));
    });
  }

  // AC-UX-15: 페이지 전체 로드 시간 (navigation timing)
  const navTiming = await page.evaluate(() => {
    const t = performance.getEntriesByType('navigation')[0];
    return t ? Math.round(t.loadEventEnd - t.startTime) : null;
  });
  if (navTiming !== null) {
    if (navTiming <= 15000) {
      ok('AC-UX-15', `페이지 로드 완료 시간: ${navTiming}ms (≤15000ms)`);
    } else {
      fail('AC-UX-15', `페이지 로드 완료 시간: ${navTiming}ms (>15000ms 초과)`);
    }
  } else {
    warn('AC-UX-15', 'navigation timing 수집 불가');
  }

  await browser.close();

  /* ======================================================= 결과 */
  section('결과 요약');
  console.log(`\n  총 ${passed + failed + warned}개 항목`);
  console.log(`  ${PASS} 통과: ${passed}개`);
  console.log(`  ${FAIL} 실패: ${failed}개`);
  console.log(`  ${WARN} 경고: ${warned}개`);

  if (failed === 0 && warned === 0) console.log('\n  E2E UX 실증 검증 완료 ✓');
  else if (failed === 0)            console.log('\n  기능 결함 없음 — 경고 항목 검토 권장');
  else                              console.log(`\n  ${failed}개 실패 항목 수정 필요`);

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error('E2E 스크립트 오류:', err); process.exit(1); });
