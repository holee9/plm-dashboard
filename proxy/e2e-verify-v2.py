"""
E2E UX 실증 검증 v2 — PLM Dashboard (#9)

기존 e2e-verify.py(AC-E2E-01~20)는 API 데이터 무결성만 확인.
이 스크립트는 실제 사용자가 브라우저에서 경험하는 UX를 검증한다:
  - 사이드바 클릭 → 의미있는 화면 표시 여부
  - 빈 화면(조용한 실패) vs 명시적 빈상태 메시지
  - 새로고침 버튼 실제 동작
  - 사이드바 접기/펼치기
  - 자동 폴링 존재 여부 명시

Run: python3 e2e-verify-v2.py
"""
import sys
import time
from playwright.sync_api import sync_playwright

BASE = "http://localhost:8088"
LOAD_TIMEOUT = 20000  # ms
PASS_SYM = "✓"
FAIL_SYM = "✗"
WARN_SYM = "⚠"

passed = 0
failed = 0
warned = 0
console_errors = {}
op_request_count = 0
current_view = "boot"


def ok(id_, msg):
    global passed
    print(f"  {PASS_SYM} {id_}: {msg}")
    passed += 1


def fail(id_, msg):
    global failed
    print(f"  {FAIL_SYM} {id_}: {msg}")
    failed += 1


def warn(id_, msg):
    global warned
    print(f"  {WARN_SYM} {id_}: {msg}")
    warned += 1


def section(s):
    print(f"\n[{s}]")


def navigate_to(page, view_key):
    page.evaluate(
        """(v) => {
            if (window.App && window.App.set) { window.App.set('view', v); return; }
            const item = document.querySelector('[data-view="' + v + '"]');
            if (item) item.click();
        }""",
        view_key,
    )
    # nav-item 클릭 fallback
    items = page.locator(f'[data-view="{view_key}"]')
    if items.count() > 0:
        items.first.click()
    page.wait_for_timeout(800)


def get_content_html(page):
    el = page.locator("#content")
    if el.count() > 0:
        return el.inner_html()
    return ""


def run():
    global current_view, op_request_count

    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=["--no-sandbox", "--disable-setuid-sandbox"])
        ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        # 404 응답 URL 추적 — 콘솔 에러 메시지에는 URL이 없어 응답으로 별도 추적
        known_expected_404s = {"time_entries/activities"}
        actual_404_urls: list[str] = []

        def on_response(resp):
            if resp.status == 404:
                actual_404_urls.append(resp.url)

        page.on("response", on_response)

        # 콘솔 에러 수집
        # "Failed to load resource" 에러는 예상 404라면 무시 (fetchSafe가 처리)
        def on_console(msg):
            if msg.type == "error":
                # 예상 범위 내 404 노이즈 필터 — 실 URL은 on_response에서 추적
                if "Failed to load resource" in msg.text and "404" in msg.text:
                    return
                bucket = console_errors.setdefault(current_view, [])
                bucket.append(msg.text)

        page.on("console", on_console)

        # OP API 요청 카운터
        def on_request(req):
            global op_request_count
            if "/op/" in req.url:
                op_request_count += 1

        page.on("request", on_request)

        # ===================================================== 부트 & 로딩
        section("AC-UX-07~08: 로딩 상태 & 에러 핸들링")

        page.goto(BASE, wait_until="domcontentloaded")
        loading_at_boot = page.evaluate("() => window.DB && window.DB._loading")
        req_at_boot = op_request_count

        try:
            page.wait_for_function(
                "() => window.DB && window.DB._loading === false",
                timeout=LOAD_TIMEOUT,
            )
            ok("AC-UX-07", f"라이브 데이터 로드 완료 (loading: {loading_at_boot}→false), 부트 시 OP 요청={req_at_boot}+")
        except Exception:
            db_err = page.evaluate("() => window.DB && window.DB._error")
            fail("AC-UX-07", f"{LOAD_TIMEOUT}ms 내 로딩 미완료. DB._error=\"{db_err}\"")

        # AC-UX-08: API 에러 UI 표시
        page.evaluate(
            "() => { if (window.App && window.App.showError) window.App.showError('E2E 테스트 오류 주입'); }"
        )
        page.wait_for_timeout(300)
        content_html = get_content_html(page)
        if "연동 오류" in content_html or "E2E 테스트 오류 주입" in content_html:
            ok("AC-UX-08", "API 에러 시 #content에 에러 메시지 표시됨")
        else:
            fail("AC-UX-08", f"에러 메시지가 UI에 표시되지 않음. #content 앞 120자: \"{content_html[:120]}\"")

        # 에러 상태 리셋
        page.evaluate(
            """() => {
                if (window.DB) { window.DB._error = null; window.DB._loading = false; }
                if (window.App && window.App.refresh) window.App.refresh();
            }"""
        )
        page.wait_for_timeout(500)

        # ===================================================== 뷰별 UX 검증
        section("AC-UX-01~06: 사이드바 네비게이션 → 실 데이터 표시")

        views = [
            {
                "key": "overview",
                "id": "AC-UX-01",
                "label": "Overview",
                "checks": [
                    {"sel": ".kpi-value", "min": 1, "desc": "KPI 수치 카드 ≥1개"},
                ],
            },
            {
                "key": "projects",
                "id": "AC-UX-02",
                "label": "Projects",
                "checks": [
                    {
                        "fn": lambda p: (
                            p.locator("table tr td").count() > 0
                            or p.locator(".empty").count() > 0,
                            f"tr>td={p.locator('table tr td').count()}, .empty={p.locator('.empty').count()}",
                        ),
                        "desc": "프로젝트 행 or 빈상태 메시지",
                    }
                ],
            },
            {
                "key": "resources",
                "id": "AC-UX-03",
                "label": "Resources",
                "checks": [
                    {
                        "fn": lambda p: (
                            p.locator("table tr td").count() > 0
                            or p.locator(".empty").count() > 0,
                            f"tr>td={p.locator('table tr td').count()}, .empty={p.locator('.empty').count()}",
                        ),
                        "desc": "리소스 행 or 빈상태 메시지",
                    }
                ],
            },
            {
                "key": "board",
                "id": "AC-UX-04",
                "label": "Board",
                "checks": [
                    {"sel": ".board-col", "min": 1, "desc": "칸반 컬럼 ≥1개"},
                ],
            },
            {
                "key": "timeline",
                "id": "AC-UX-05",
                "label": "Timeline",
                "checks": [
                    {
                        "fn": lambda p: (
                            p.locator(".tl-row, [class*='tl-']").count() > 0
                            or p.locator(".empty").count() > 0
                            or p.locator("table tr td").count() > 0,
                            f"tl-row={p.locator('.tl-row,[class*=tl-]').count()}, .empty={p.locator('.empty').count()}, td={p.locator('table tr td').count()}",
                        ),
                        "desc": "타임라인 행 or 빈상태 메시지",
                    }
                ],
            },
            {
                "key": "risks",
                "id": "AC-UX-06",
                "label": "Risks",
                "checks": [
                    {"sel": ".kpi-row", "min": 1, "desc": "리스크 KPI 행 존재"},
                    {
                        "fn": lambda p: (
                            p.locator("table").count() > 0
                            or p.locator(".empty").count() > 0,
                            f"table={p.locator('table').count()}, .empty={p.locator('.empty').count()}",
                        ),
                        "desc": "리스크 내용(테이블 or 빈상태) 존재 — 조용한 빈화면 금지",
                    },
                ],
            },
        ]

        for v in views:
            current_view = v["key"]
            navigate_to(page, v["key"])

            err_count = len(console_errors.get(v["key"], []))
            check_passed = True
            details = []

            for chk in v["checks"]:
                if "fn" in chk:
                    result_ok, detail = chk["fn"](page)
                    if not result_ok:
                        check_passed = False
                    details.append(f"{chk['desc']}: {'✓' if result_ok else '✗'} ({detail})")
                else:
                    count = page.locator(chk["sel"]).count()
                    result_ok = count >= chk.get("min", 1)
                    if not result_ok:
                        check_passed = False
                    details.append(f"{chk['desc']}: {'✓' if result_ok else '✗'} (count={count})")

            summary = " | ".join(details)
            if check_passed and err_count == 0:
                ok(v["id"], f"{v['label']}: {summary}")
            elif not check_passed:
                err_info = f" | 콘솔오류={err_count}" if err_count > 0 else ""
                fail(v["id"], f"{v['label']}: {summary}{err_info}")
            else:
                errs_preview = " | ".join((console_errors.get(v["key"], []))[:2])
                warn(v["id"], f"{v['label']}: 화면은 정상이나 콘솔오류={err_count}: {errs_preview}")

        # ===================================================== 인터랙션
        section("AC-UX-09~11: 인터랙션")

        # AC-UX-09: 새로고침 버튼 → API 재호출
        navigate_to(page, "overview")
        req_before = op_request_count
        refresh_btn = page.locator("[data-refresh]")
        if refresh_btn.count() > 0:
            refresh_btn.first.click()
            page.wait_for_timeout(3000)
            req_after = op_request_count
            if req_after > req_before:
                ok("AC-UX-09", f"새로고침 버튼 클릭 → OP API 재호출 발생 (요청 +{req_after - req_before}개)")
            else:
                fail("AC-UX-09", f"새로고침 버튼 클릭했으나 OP API 요청 증가 없음 (before={req_before}, after={req_after})")
        else:
            fail("AC-UX-09", "[data-refresh] 버튼을 찾을 수 없음")

        # AC-UX-10: 사이드바 접기/펼치기
        toggle_btn = page.locator("[data-toggle-sidebar]")
        if toggle_btn.count() > 0:
            sidebar = page.locator(".sidebar")
            collapsed_before = sidebar.evaluate("el => el.classList.contains('collapsed')")
            toggle_btn.first.click()
            page.wait_for_timeout(400)
            collapsed_after = sidebar.evaluate("el => el.classList.contains('collapsed')")
            if collapsed_before != collapsed_after:
                ok("AC-UX-10", f"사이드바 접기/펼치기 동작 ({collapsed_before}→{collapsed_after})")
                toggle_btn.first.click()  # 원복
                page.wait_for_timeout(300)
            else:
                fail("AC-UX-10", "사이드바 상태 변화 없음")
        else:
            fail("AC-UX-10", "[data-toggle-sidebar] 버튼을 찾을 수 없음")

        # AC-UX-11: Board 프로젝트 필터
        navigate_to(page, "board")
        board_select = page.locator("[data-board-project]")
        if board_select.count() > 0:
            options_count = board_select.locator("option").count()
            if options_count >= 2:
                board_select.select_option(index=1)
                page.wait_for_timeout(500)
                cols_after = page.locator(".board-col").count()
                ok("AC-UX-11", f"Board 프로젝트 필터 동작 (옵션={options_count}개, 필터 후 컬럼={cols_after})")
            else:
                warn("AC-UX-11", f"Board 필터 옵션 부족 (options={options_count}) — 프로젝트 데이터 확인 필요")
        else:
            fail("AC-UX-11", "[data-board-project] 셀렉트를 찾을 수 없음")

        # ===================================================== 동기화 정책
        section("AC-UX-12~13: 데이터 동기화 정책")

        has_polling = page.evaluate("() => !!(window.DB && window.DB._pollingId)")
        if not has_polling:
            warn("AC-UX-12", "자동 폴링(setInterval) 미구현 — 현재 페이지 로드 시 1회 fetch만 수행. 사용자에게 수동 새로고침 안내 필요.")
            warn("AC-UX-13", "수동 새로고침 버튼이 유일한 데이터 갱신 경로 — 장시간 화면 유지 시 stale 데이터 위험. 향후 자동 갱신 추가 권장.")
        else:
            ok("AC-UX-12", "자동 폴링 구현됨")
            ok("AC-UX-13", "자동 + 수동 갱신 경로 모두 존재")

        # ===================================================== 크로스컷
        section("AC-UX-14~15: 크로스컷")

        # AC-UX-14: 전체 콘솔 에러
        all_errors = [
            f"{vk}({len(errs)})"
            for vk, errs in console_errors.items()
            if errs
        ]
        unexpected_404s = [u for u in actual_404_urls if not any(k in u for k in known_expected_404s)]
        if not all_errors and not unexpected_404s:
            ok("AC-UX-14", "전체 뷰 순회 중 콘솔 에러 없음")
        elif not all_errors and not unexpected_404s:
            ok("AC-UX-14", "전체 뷰 순회 중 콘솔 에러 없음")
        else:
            if all_errors:
                fail("AC-UX-14", f"콘솔 에러 발생 뷰: {', '.join(all_errors)}")
                for vk, errs in console_errors.items():
                    for e in errs:
                        print(f"      [{vk}] {e}")
            else:
                ok("AC-UX-14", "전체 뷰 순회 중 JS 콘솔 에러 없음")
        if actual_404_urls:
            expected_count = sum(1 for u in actual_404_urls if any(k in u for k in known_expected_404s))
            if unexpected_404s:
                fail("AC-UX-14b", f"예상 외 404: {unexpected_404s}")
            else:
                warn("AC-UX-14b", f"예상 범위 내 404 {expected_count}건 (time_entries/activities — OP 인스턴스 미지원, fetchSafe 처리 중)")

        # AC-UX-15: 페이지 로드 시간
        nav_timing = page.evaluate(
            """() => {
                const t = performance.getEntriesByType('navigation')[0];
                return t ? Math.round(t.loadEventEnd - t.startTime) : null;
            }"""
        )
        if nav_timing is not None:
            if nav_timing <= 15000:
                ok("AC-UX-15", f"페이지 로드 완료 시간: {nav_timing}ms (≤15000ms)")
            else:
                fail("AC-UX-15", f"페이지 로드 완료 시간: {nav_timing}ms (>15000ms 초과)")
        else:
            warn("AC-UX-15", "navigation timing 수집 불가")

        browser.close()

    # ===================================================== 결과 요약
    section("결과 요약")
    print(f"\n  총 {passed + failed + warned}개 항목")
    print(f"  {PASS_SYM} 통과: {passed}개")
    print(f"  {FAIL_SYM} 실패: {failed}개")
    print(f"  {WARN_SYM} 경고: {warned}개")

    if failed == 0 and warned == 0:
        print("\n  E2E UX 실증 검증 완료 ✓ (15/15)")
    elif failed == 0:
        print("\n  기능 결함 없음 — 경고 항목 검토 권장")
    else:
        print(f"\n  {failed}개 실패 항목 수정 필요")

    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    run()
