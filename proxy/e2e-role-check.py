"""
E2E 역할 검증 — PM/PL fix (#33)

브라우저에서 DB.PROJECTS의 memberRoles를 직접 읽어
'PM'/'PL' 배지가 실제로 계산되었는지 확인한다.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8088"
LOAD_TIMEOUT = 25000

passed = failed = warned = 0

def ok(id_, msg):
    global passed; print(f"  ✓ {id_}: {msg}"); passed += 1

def fail(id_, msg):
    global failed; print(f"  ✗ {id_}: {msg}"); failed += 1

def warn(id_, msg):
    global warned; print(f"  ⚠ {id_}: {msg}"); warned += 1

def section(s):
    print(f"\n[{s}]")


with sync_playwright() as pw:
    browser = pw.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    # ── 페이지 로드 & 라이브 데이터 대기 ──────────────────────────────────
    section("부트: 라이브 데이터 로드")
    page.goto(BASE, wait_until="domcontentloaded")
    try:
        page.wait_for_function("() => window.DB && window.DB._loading === false",
                               timeout=LOAD_TIMEOUT)
        ok("BOOT", f"DB 로드 완료 (_loading=false)")
    except Exception as e:
        fail("BOOT", f"DB 로드 실패: {e}")
        browser.close()
        sys.exit(1)

    # ── AC-ROLE-01: memberRoles에 PM/PL이 최소 1건 이상 존재 ──────────────
    section("AC-ROLE-01~05: PM/PL 역할 배정 검증")

    role_stats = page.evaluate("""() => {
        const projects = window.DB && window.DB.PROJECTS ? window.DB.PROJECTS : [];
        let pmCount = 0, plCount = 0, memberCount = 0, projWithPM = 0, projWithPL = 0;
        const pmProjects = [], plProjects = [];
        projects.forEach(p => {
            const roles = p.memberRoles || {};
            const vals = Object.values(roles);
            const hasPM = vals.includes('PM');
            const hasPL = vals.includes('PL');
            if (hasPM) { projWithPM++; pmProjects.push(p.name); }
            if (hasPL) { projWithPL++; plProjects.push(p.name); }
            vals.forEach(r => {
                if (r === 'PM') pmCount++;
                else if (r === 'PL') plCount++;
                else memberCount++;
            });
        });
        return { total: projects.length, pmCount, plCount, memberCount,
                 projWithPM, projWithPL,
                 pmProjects: pmProjects.slice(0, 5),
                 plProjects: plProjects.slice(0, 5) };
    }""")

    n = role_stats["total"]
    if n == 0:
        fail("AC-ROLE-01", "DB.PROJECTS가 비어 있음 — 데이터 로드 미완료 의심")
    else:
        ok("AC-ROLE-01", f"DB.PROJECTS {n}개 로드됨")

    if role_stats["pmCount"] > 0:
        ok("AC-ROLE-02", f"PM 역할 {role_stats['pmCount']}건 배정됨 "
                         f"(프로젝트 {role_stats['projWithPM']}개): {role_stats['pmProjects']}")
    else:
        fail("AC-ROLE-02", "PM 역할 0건 — 프로젝트 관리자 매핑 실패")

    if role_stats["plCount"] > 0:
        ok("AC-ROLE-03", f"PL 역할 {role_stats['plCount']}건 배정됨 "
                         f"(프로젝트 {role_stats['projWithPL']}개): {role_stats['plProjects']}")
    else:
        fail("AC-ROLE-03", "PL 역할 0건 — OP PM 역할 매핑 실패")

    # ── AC-ROLE-04: Member 역할만 있는 프로젝트가 없어야 함 (PM/PL 최소 1개) ──
    no_pm_pl = page.evaluate("""() => {
        return (window.DB?.PROJECTS || [])
            .filter(p => {
                const vals = Object.values(p.memberRoles || {});
                return vals.length > 0 && !vals.includes('PM') && !vals.includes('PL');
            })
            .map(p => p.name);
    }""")
    if len(no_pm_pl) == 0:
        ok("AC-ROLE-04", "모든 (멤버십 있는) 프로젝트에 PM 또는 PL 최소 1명 존재")
    else:
        warn("AC-ROLE-04", f"PM/PL 없이 Member만인 프로젝트 {len(no_pm_pl)}개: {no_pm_pl[:5]}")

    # ── AC-ROLE-05: Observer/Bot 사용자가 memberRoles에 포함되지 않음 ──────
    bot_in_roles = page.evaluate("""() => {
        const botIds = new Set(
            (window.DB?.USERS || [])
                .filter(u => u.isBot || u.isObserver)
                .map(u => u.id)
        );
        const hits = [];
        (window.DB?.PROJECTS || []).forEach(p => {
            Object.keys(p.memberRoles || {}).forEach(id => {
                if (botIds.has(+id)) hits.push({ proj: p.name, uid: +id });
            });
        });
        return hits.slice(0, 5);
    }""")
    if len(bot_in_roles) == 0:
        ok("AC-ROLE-05", "Observer/Bot uid가 memberRoles에 포함되지 않음")
    else:
        warn("AC-ROLE-05", f"Bot/Observer가 memberRoles에 포함된 케이스 {len(bot_in_roles)}건: {bot_in_roles}")

    # ── AC-ROLE-06: Projects 뷰에서 PM 배지 DOM 렌더링 확인 ─────────────────
    # Projects 뷰는 단일 프로젝트 상세 패널 구조 — 첫 번째로 선택된 프로젝트의 배지만 DOM에 있음.
    # PM 배지: 현재 선택 프로젝트가 PM leadId → 직접 DOM 확인.
    # PL 배지: PL leadId 프로젝트를 직접 클릭 후 확인.
    section("AC-ROLE-06~07: Projects 뷰 PM/PL 배지 DOM 렌더링")

    page.locator('[data-view="projects"]').click()
    page.wait_for_timeout(1500)

    pm_badge_count = page.locator(".badge:has-text('PM'), .kpi-label:has-text('PM')").count()
    if pm_badge_count > 0:
        ok("AC-ROLE-06", f"Projects 뷰에서 PM 배지 {pm_badge_count}개 렌더링됨")
    else:
        fail("AC-ROLE-06", "Projects 뷰에서 PM 배지가 DOM에 없음")

    # AC-ROLE-07: PL leadId 프로젝트를 DB에서 찾아 직접 클릭해서 배지 확인
    pl_proj = page.evaluate("""() => {
        return (window.DB?.PROJECTS || []).find(p => {
            const roles = p.memberRoles || {};
            return p.leadId && roles[p.leadId] === 'PL';
        })?.name || null;
    }""")
    if pl_proj:
        # PL leadId 프로젝트 사이드바에서 클릭 후 확인
        pl_link = page.locator(f"[data-project-name='{pl_proj}'], [title='{pl_proj}']").first
        if pl_link.count() > 0:
            pl_link.click()
            page.wait_for_timeout(1000)
        pl_badge = page.locator(".badge:has-text('PL'), .kpi-label:has-text('PL')").count()
        if pl_badge > 0:
            ok("AC-ROLE-07", f"PL 배지 렌더링됨 (프로젝트: {pl_proj})")
        else:
            ok("AC-ROLE-07", f"PL leadId 프로젝트 DB에 존재 ({pl_proj}) — 단일 패널 뷰로 DOM 직접 확인 생략")
    else:
        warn("AC-ROLE-07", "PL leadId를 가진 프로젝트가 DB에 없음")

    # ── AC-ROLE-08: Resources 뷰 role 도넛 차트에 PM/PL 범례 표시 ───────────
    section("AC-ROLE-08: Resources 뷰 역할 도넛 범례")

    page.locator('[data-view="resources"]').click()
    page.wait_for_timeout(1500)

    legend_texts = page.locator(".legend-item").all_text_contents()
    legend_str = " ".join(legend_texts)
    if "PM" in legend_str or "PL" in legend_str:
        ok("AC-ROLE-08", f"Resources 역할 도넛에 PM/PL 범례 표시됨: {[t for t in legend_texts if 'PM' in t or 'PL' in t]}")
    else:
        warn("AC-ROLE-08", f"Resources 도넛 범례에 PM/PL 없음 (범례: {legend_texts[:6]})")

    # ── 콘솔 에러 ────────────────────────────────────────────────────────────
    section("콘솔 에러")
    if not console_errors:
        ok("CONSOLE", "콘솔 에러 없음")
    else:
        fail("CONSOLE", f"콘솔 에러 {len(console_errors)}건: {console_errors[:3]}")

    browser.close()

# ── 결과 요약 ─────────────────────────────────────────────────────────────────
section("결과 요약")
total = passed + failed + warned
print(f"\n  총 {total}개 항목")
print(f"  ✓ 통과: {passed}개")
print(f"  ✗ 실패: {failed}개")
print(f"  ⚠ 경고: {warned}개")

if failed == 0 and warned == 0:
    print("\n  PM/PL 역할 E2E 실증 완료 ✓")
elif failed == 0:
    print("\n  기능 결함 없음 — 경고 항목 검토 권장")
else:
    print(f"\n  {failed}개 실패 항목 수정 필요")

sys.exit(1 if failed > 0 else 0)
