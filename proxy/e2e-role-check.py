"""
E2E 역할 검증 — PM/TL + 제외 프로젝트 정책

브라우저에서 DB.PROJECTS의 memberRoles를 직접 읽어 PM/TL 계약과
인프라 구축 제외 정책이 실제 운영 데이터에 반영됐는지 확인한다.
"""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8088"
LOAD_TIMEOUT = 30000

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
    def on_console(msg):
        if msg.type != "error":
            return
        # time_entries/activities 404는 OP 인스턴스 미지원 엔드포인트이며 fetchSafe가 처리한다.
        if "Failed to load resource" in msg.text and "404" in msg.text:
            return
        console_errors.append(msg.text)
    page.on("console", on_console)

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

    # ── AC-ROLE-01: memberRoles에 PM/TL이 존재하고 제외 프로젝트가 빠짐 ─────
    section("AC-ROLE-01~05: PM/TL 역할 배정 및 제외 프로젝트 검증")

    role_stats = page.evaluate("""() => {
        const projects = window.DB && window.DB.PROJECTS ? window.DB.PROJECTS : [];
        let pmCount = 0, tlCount = 0, memberCount = 0, projWithPM = 0, projWithTL = 0;
        const pmProjects = [], tlProjects = [];
        const infraProjects = [];
        projects.forEach(p => {
            if (/인프라\\s*구축/i.test(p.name || '')) infraProjects.push(p.name);
            const roles = p.memberRoles || {};
            const vals = Object.values(roles);
            const hasPM = vals.includes('PM');
            const hasTL = vals.includes('TL');
            if (hasPM) { projWithPM++; pmProjects.push(p.name); }
            if (hasTL) { projWithTL++; tlProjects.push(p.name); }
            vals.forEach(r => {
                if (r === 'PM') pmCount++;
                else if (r === 'TL') tlCount++;
                else memberCount++;
            });
        });
        return { total: projects.length, pmCount, tlCount, memberCount,
                 projWithPM, projWithTL, infraProjects,
                 pmProjects: pmProjects.slice(0, 5),
                 tlProjects: tlProjects.slice(0, 5) };
    }""")

    n = role_stats["total"]
    if n == 0:
        fail("AC-ROLE-01", "DB.PROJECTS가 비어 있음 — 데이터 로드 미완료 의심")
    else:
        ok("AC-ROLE-01", f"DB.PROJECTS {n}개 로드됨")

    if len(role_stats["infraProjects"]) == 0:
        ok("AC-ROLE-01b", "인프라 구축 프로젝트가 DB.PROJECTS에서 제외됨")
    else:
        fail("AC-ROLE-01b", f"인프라 구축 프로젝트가 DB에 남아 있음: {role_stats['infraProjects']}")

    if role_stats["pmCount"] > 0:
        ok("AC-ROLE-02", f"PM 역할 {role_stats['pmCount']}건 배정됨 "
                         f"(프로젝트 {role_stats['projWithPM']}개): {role_stats['pmProjects']}")
    else:
        fail("AC-ROLE-02", "PM 역할 0건 — 프로젝트 관리자 매핑 실패")

    if role_stats["tlCount"] > 0:
        ok("AC-ROLE-03", f"TL 역할 {role_stats['tlCount']}건 배정됨 "
                         f"(프로젝트 {role_stats['projWithTL']}개): {role_stats['tlProjects']}")
    else:
        fail("AC-ROLE-03", "TL 역할 0건 — OP Tech Lead 역할 매핑 실패")

    # ── AC-ROLE-04: Member 역할만 있는 프로젝트가 없어야 함 (PM/TL 최소 1개) ──
    no_pm_tl = page.evaluate("""() => {
        return (window.DB?.PROJECTS || [])
            .filter(p => {
                const vals = Object.values(p.memberRoles || {});
                return vals.length > 0 && !vals.includes('PM') && !vals.includes('TL');
            })
            .map(p => p.name);
    }""")
    if len(no_pm_tl) == 0:
        ok("AC-ROLE-04", "모든 (멤버십 있는) 프로젝트에 PM 또는 TL 최소 1명 존재")
    else:
        warn("AC-ROLE-04", f"PM/TL 없이 Member만인 프로젝트 {len(no_pm_tl)}개: {no_pm_tl[:5]}")

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

    # ── AC-ROLE-06: Projects 뷰에서 PM/TL 컨트롤 DOM 렌더링 확인 ────────────
    # Projects 뷰는 단일 프로젝트 상세 패널 구조 — 첫 번째로 선택된 프로젝트의 배지만 DOM에 있음.
    section("AC-ROLE-06~07: Projects 뷰 PM/TL 컨트롤 렌더링")

    page.locator('[data-view="projects"]').click()
    page.wait_for_timeout(1500)

    pm_label_count = page.locator(".project-fact .kpi-label:has-text('PM')").count()
    if pm_label_count > 0:
        ok("AC-ROLE-06", f"Projects 뷰에서 PM 컨트롤 {pm_label_count}개 렌더링됨")
    else:
        fail("AC-ROLE-06", "Projects 뷰에서 PM 컨트롤이 DOM에 없음")

    # AC-ROLE-07: TL 후보가 있는 프로젝트를 선택해 TL 컨트롤 확인
    tl_proj = page.evaluate("""() => {
        const p = (window.DB?.PROJECTS || []).find(project =>
            Object.values(project.memberRoleSets || {}).some((set) => set && set.has && set.has('TL'))
        );
        return p ? { id: p.id, name: p.name } : null;
    }""")
    if tl_proj:
        tl_tab = page.locator(f"[data-project-tab='{tl_proj['id']}']").first
        if tl_tab.count() > 0:
            tl_tab.click()
            page.wait_for_timeout(1000)
        tl_label_count = page.locator(".project-fact .kpi-label:has-text('TL')").count()
        if tl_label_count > 0:
            ok("AC-ROLE-07", f"TL 컨트롤 렌더링됨 (프로젝트: {tl_proj['name']})")
        else:
            fail("AC-ROLE-07", f"TL 프로젝트 선택 후 TL 컨트롤이 없음: {tl_proj}")
    else:
        warn("AC-ROLE-07", "TL 후보가 있는 프로젝트가 DB에 없음")

    # ── AC-ROLE-08: Resources 뷰는 역할 도넛 대신 readiness 패널을 표시 ────
    section("AC-ROLE-08: Resources 뷰 readiness 패널")

    page.locator('[data-view="resources"]').click()
    page.wait_for_timeout(1500)

    readiness_count = page.locator("[data-resource-readiness]").count()
    input_gap_count = page.locator("[data-resource-input-gaps]").count()
    if readiness_count > 0 and input_gap_count > 0:
        ok("AC-ROLE-08", "Resources readiness/input action 패널이 렌더링됨")
    else:
        fail("AC-ROLE-08", f"Resources readiness/input action 패널 누락 (readiness={readiness_count}, input={input_gap_count})")

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
    print("\n  PM/TL 역할 E2E 실증 완료 ✓")
elif failed == 0:
    print("\n  기능 결함 없음 — 경고 항목 검토 권장")
else:
    print(f"\n  {failed}개 실패 항목 수정 필요")

sys.exit(1 if failed > 0 else 0)
