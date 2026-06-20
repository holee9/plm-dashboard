# E2E 실증 검증 실패 이력

실증 검증 중 발견된 버그와 실패 원인을 기록한다.  
재발 방지를 위해 Anti-pattern 항목을 반드시 숙지할 것.

---

## 실패 기록

### [2026-06-17] 1차 E2E (e2e-verify.js) — 검증 부적절 판정

**문제:** `html.length > 100` 조건으로 뷰 렌더링을 판정.  
빈 테이블 Shell HTML도 100자를 초과하므로 실제 빈 화면이 통과됨.

**발견 경위:** 사용자가 브라우저에서 직접 접속해 빈 화면 확인.

**교훈/Anti-pattern:**
- `html.length` 같은 크기 기반 체크는 E2E 검증으로 부적절하다.
- 반드시 렌더링 결과물의 **의미 있는 DOM 요소** (`.kpi-value`, `.board-col`, `table td` 등)를 선택자로 확인해야 한다.

---

### [2026-06-17] 2차 E2E (e2e-verify-v2.py) 1차 실행 — 5개 실패

| AC | 실패 내용 | 근본 원인 |
|---|---|---|
| AC-UX-01 Projects | `kpi-value` 없음, `tr>td` 없음 | `state.projectTab=1` (기본값) → `D.P[1]=undefined` → 뷰 전체 크래시 |
| AC-UX-02 Board | `.board-col` 없음 | `buildBoardColsFromStatuses`가 빈 `statusIds` 컬럼 생성 → `[0]` 접근 TypeError |
| AC-UX-09 Refresh | OP 요청 0건 | `[data-refresh]` 클릭 시 `renderShell()`만 호출, `buildLiveDataset()` 재호출 없음 |
| AC-UX-14 Console | "Failed to load resource: 404" | `time_entries/activities` 엔드포인트 OP 인스턴스 미지원 |
| AC-UX-02 Board (연쇄) | board.js `D.S[col.statusIds[0]]` undefined | 위 Board 크래시의 null 안전 미비 |

**수정 내용 (커밋 88cc060):**
- `views/projects.js`: `state.projectTab` stale ID 방어 → `D.PROJECTS[0].id` 폴백
- `data.js`: `buildBoardColsFromStatuses` 빈 statusIds 컬럼 필터링
- `views/board.js`: `D.S[col.statusIds[0]]` null 안전 처리
- `app.js`: `renderContent` try-catch 추가, refresh → `buildLiveDataset()` 재호출

**E2E 스크립트 수정:**
- `time_entries/activities` 404는 `on_response` 핸들러로 추적, console "Failed to load resource" 필터링

**최종 결과:** ✓13 / ✗0 / ⚠3

**교훈/Anti-pattern:**
- localStorage에 저장된 ID(`state.projectTab`)는 OP 인스턴스 교체 시 stale 됨. 반드시 `D.P[id]` 존재 확인 후 사용.
- `buildBoardColsFromStatuses`처럼 카테고리 매핑은 실 OP 인스턴스에 없는 카테고리가 있을 수 있음 → 빈 결과 필터링 필수.
- `renderContent`에 try-catch 없으면 뷰 크래시가 빈 화면으로 침묵해 디버깅 불가.

---

### [2026-06-17] Observer/그룹 필터링 → D.U undefined 렌더링 오류

**문제:** Observer 역할 사용자와 Group을 `USERS` 배열에서 완전히 제거하자  
`D.U[assigneeId]`가 `undefined`를 반환 → `.name` 접근 시 런타임 오류.

```
렌더링 오류: Cannot read properties of undefined (reading 'name')
```

**근본 원인:** `D.U`(lookup map)는 `byId(USERS)`로 빌드됨. USERS에서 제거하면 D.U에도 없음.  
WP/프로젝트는 그 ID를 여전히 assigneeId/leadId로 참조 → undefined.

**수정 내용 (커밋 d9f9040):**
- `op-adapter.js`: USERS에서 제거하지 않고 `isGroup: true` / `isObserver: true` 플래그 부여
- `views/board.js`: 담당자 드롭다운에서만 `!isGroup && !isObserver` 필터
- `views/projects.js`: `D.U[p.leadId]?.name` null 안전 처리, 팀원 fallback 객체 추가

**Anti-pattern (재발 방지 규칙):**

> ❌ WRONG: USERS 배열에서 항목을 직접 제거해 D.U lookup을 무력화
> ```js
> const USERS = usersMapped.filter(u => !condition); // D.U가 비워짐
> ```
>
> ✅ CORRECT: 플래그를 부여하고 UI 레이어에서만 필터
> ```js
> usersMapped.forEach(u => { if (condition) u.isHidden = true; });
> const USERS = usersMapped; // D.U 완전 유지
> // view 드롭다운에서: D.USERS.filter(u => !u.isHidden)
> ```

**D.U 직접 접근 안전 규칙:**
- `D.U[id].name` → ❌ id가 null이거나 필터된 경우 크래시
- `D.U[id]?.name ?? '–'` → ✅ 안전
- `D.U[id] || fallback` → ✅ 렌더링 안전

---

### [2026-06-17] userUtilization()에서 그룹·Observer 미필터

**문제:** `data.js`의 `userUtilization()`이 `USERS.map()` — 필터 없이 전체 순회.  
그룹(팀/파트)과 Observer 계정이 Resources 뷰 가동률 차트·테이블에 노출됨.

**근본 원인:** `op-adapter.js`에서 USERS 배열에 `isGroup`/`isObserver` 플래그를 부여했으나,  
`data.js`의 `userUtilization()` 함수가 해당 플래그를 확인하지 않고 전체를 처리했음.

**수정 내용 (커밋 2668be5):**
- `data.js`: `userUtilization()` → `USERS.filter(!isGroup && !isObserver).map()`
- `resources.js`: MEMBERS KPI 카운트 동일 필터 적용

**Anti-pattern:**
> ❌ WRONG: 플래그를 op-adapter에만 부여하고 selector 함수에서 미필터  
> ✅ CORRECT: 사용자 목록을 소비하는 모든 함수(드롭다운 + selector)에 일관 필터 적용

---

### [2026-06-17] form-reporter 봇 계정 — 프로젝트로 잘못 처리

**문제:** form-reporter가 담당자 목록에 노출됨.  
초기 수정 시 프로젝트 필터로 잘못 처리(op-adapter PROJECTS 필터에 추가).

**근본 원인:** form-reporter는 OP의 자동화 봇 계정(principal)이며,  
프로젝트가 아닌 USERS 목록에 포함됨.

**수정 내용 (커밋 5b66e2d):**
- `op-adapter.js`: 잘못된 PROJECTS 필터 제거, `isBot` 플래그 추가 (name/login regex: `/form.?reporter/i`)
- `data.js`, `board.js`, `overview.js`, `resources.js`: `!u.isBot` 필터 전체 적용

**Anti-pattern:**
> ❌ WRONG: 봇/서비스 계정을 프로젝트로 착각해 PROJECTS 필터에 추가  
> ✅ CORRECT: OP principals 목록에서 봇 계정에 `isBot` 플래그 부여 후 USERS 필터 적용

---

### [2026-06-17] WP ID displayId 미적용 — 글로벌 시퀀스 ID 노출

**문제:** WP ID가 "BH-1" 대신 "#540" 형태(글로벌 DB 시퀀스)로 표시됨.

**근본 원인:** OP API v3는 WP에 `displayId: "BH-1"` 필드를 별도 제공하나,  
`op-adapter.js`의 `mapWorkPackage()`에서 `displayId` 필드를 매핑하지 않음.  
`UI.wpLink(id)`가 numeric id만 받아 `#540` 형태로 렌더링.

**확인 방법:**
```bash
curl http://localhost:8088/op/work_packages/520 | python3 -m json.tool | grep displayId
# → "displayId": "BH-1"
```

**수정 내용 (커밋 9c6a740):**
- `op-adapter.js`: `mapWorkPackage`에 `displayId: wp.displayId || String(wp.id)` 추가
- `ui.js`: `wpLink(wp)` — WP 객체 받아 `wp.displayId` 라벨 사용, URL은 numeric id
- 모든 뷰: `UI.wpLink(w.id)` → `UI.wpLink(w)` 전달

**Anti-pattern:**
> ❌ WRONG: OP numeric id를 직접 표시 ID로 사용  
> ✅ CORRECT: `displayId` 필드를 UI 라벨로, numeric `id`를 URL 경로로 분리 사용

---

### [2026-06-19] 수동 새로고침 중 화면 로딩 고정 — Board 필터 E2E 실패 (#40)

**문제:** `e2e-verify-v2.py`의 AC-UX-11에서 `[data-board-project]` 셀렉트를 찾지 못함.
새로고침 버튼 클릭 후 OP 재조회가 3초 이상 걸리는 동안 `DB._loading=true`가 유지되고,
`renderContent()`가 모든 뷰를 `OpenProject 데이터 로딩 중…`으로 덮어 Board 화면이 사라졌다.

**근본 원인:** 초기 부트 로딩과 수동 새로고침 로딩을 같은 UI 정책으로 처리했다.
초기 부트에는 로딩 화면이 맞지만, 이미 데이터가 있는 상태의 수동 갱신은 기존 화면을 유지해야 한다.

**수정 내용:**
- `app.js`: `D._loading && !D.WORK_PACKAGES.length`일 때만 콘텐츠 로딩 화면 표시
- `app.js`: 새로고침 버튼을 `tb-chip`으로 바꾸고 `새로고침 → 갱신 중... → 갱신 완료 HH:mm:ss` 상태 표시
- `app.js`: 갱신 중 버튼 비활성화로 중복 요청 방지

**검증:**
- Playwright 직접 확인: 버튼 문구 `새로고침 → 갱신 중... → 갱신 완료 HH:mm:ss`
- `python3 proxy/e2e-verify-v2.py` 결과: 실패 0

**Anti-pattern:**
> ❌ WRONG: 기존 데이터가 있어도 수동 새로고침 중 전체 콘텐츠를 로딩 화면으로 교체
> ✅ CORRECT: 초기 부트만 로딩 화면, 수동 갱신은 기존 화면 유지 + 버튼 상태 메시지로 피드백

---

### [2026-06-20] Projects KPI 편집 버튼 가림 — 편집 상태 미검증 (#42)

**문제:** Projects 뷰 우측 KPI 레일의 `KPI 편집`을 누르면 KPI 카드가 7개로 늘어나며
편집 strip 높이가 rail 높이를 초과했다. `취소`와 `KPI 편집 완료` 버튼이 Team 패널 아래로
밀려 실제 클릭 지점이 Team panel-body에 잡혔다.

**근본 원인:** 기본 표시 상태만 Playwright 캡처/좌표 검증했고, 편집 모드 전환 후의
상호작용 상태는 검증하지 않았다. 고정 row 높이를 쓰는 영역에서 편집 모드 콘텐츠 증가량을
별도로 처리하지 않았다.

**수정 내용:**
- `views/projects.js`: KPI namespace root에 `kpi-editing`, 액션 영역에 `kpi-actions` 클래스 추가
- `app.css`: Projects KPI edit mode에서 KPI strip은 rail 내부 스크롤, 취소/완료 액션은 rail 하단 고정
- `e2e-verify-v2.py/js`: AC-UX-16 추가 — Projects KPI 편집 진입 후 취소/완료 버튼이 rail 내부에 있고 `elementFromPoint()` 기준 실제 클릭 가능하며, 두 버튼 모두 edit mode를 종료하는지 검증

**검증:**
- Playwright 직접 확인: `topAtCancel=BUTTON`, `topAtDone=BUTTON`, `actionsInsideRail=true`
- `python3 proxy/e2e-verify-v2.py`: AC-UX-16 통과

**Anti-pattern:**
> ❌ WRONG: 기본 화면 캡처만으로 “실증 검증 완료” 판단
> ✅ CORRECT: 편집/필터/드롭다운 등 상태 전환 후 버튼 hit-test와 실제 클릭 종료까지 검증

---

## 2026-06-20 — Timeline Active Sprints 빈 개념 노출 (#46)

**증상:** Timeline 하단에 `Active Sprints` 패널이 있었지만 운영 OP에는 `/versions`가 0건이고
WP `versionId` 연결도 0건이었다. 결과적으로 Timeline에서 가장 중요한 하단 상세 영역이
실제 점검 가치가 없는 스프린트 표로 남았다.

**근본 원인:** 상용 Gantt 패턴만 보고 "스프린트/번다운"을 좋은 항목으로 간주했지만,
운영 OP에 실제 데이터가 있는지 교차검증하지 않았다. 또한 간트 프로젝트 행 클릭이
Timeline 내부 상세를 갱신하지 않고 Projects 탭으로 이동해 상단 간트와 하단 상세가
연결되지 않았다.

**수정 내용:**
- `op-adapter.js`/`data.js`: `/relations`를 `RELATIONS`로 정규화
- `views/timeline.js`: `Active Sprints` 제거, `Schedule Inspection` 추가
- `app.js`: `data-tl-scope-project` 클릭 시 Timeline 내부 프로젝트 scope 전환
- `README.md`, `design_handoff_plm_dashboard/README.md`, `docs/index.html`, `proxy/README.md`: Timeline 설계 기준과 검증 기준 문서화
- `e2e-verify-v2.py/js`: AC-UX-18 추가

**검증:**
- 실 OP: `/versions=0`, WP `versionId=0`, 마일스톤 22건, `follows` 3건
- All Projects: `Schedule Inspection` 카드 5개, 프로젝트 점검 행 10개, `Active Sprints=false`
- Project scope: 마일스톤 있는 프로젝트 클릭 후 scope 전환 및 marker 표시
- Playwright 캡처: `/tmp/plm-timeline-schedule-all-bottom-visible.png`, `/tmp/plm-timeline-schedule-bluehd-bottom-visible.png`
- `python3 proxy/e2e-verify-v2.py`: AC-UX-18 통과

**Anti-pattern:**
> ❌ WRONG: OP에 없는 데이터 개념을 UI 핵심 패널로 유지
> ✅ CORRECT: 상용 앱 패턴 후보를 OP 실데이터와 교차검증한 뒤, 실제 존재하는 일정 신호만 채택

---

## 2026-06-20 — closedAt/가용량 optional 출처 불명확 (#6)

**증상:** `closedAt`은 OP work package 본문에 직접 필드가 없어 `updatedAt` 근사로만 표시됐고,
`capacityPerWeek`도 OP core 원천이 없어 모든 사용자가 기본 40h/주로 계산됐다.

**근본 원인:** OP에 직접 없는 값을 대시보드 계약에는 두었지만, 값의 실제 출처와 fallback을
데이터에 명시하지 않았다. 그 결과 Resources/Risks 가동률은 관리자 지정 가용량을 반영하지 못했고,
닫힌 시각은 마지막 수정 시각과 구분되지 않았다.

**수정 내용:**
- `op-adapter.js`: 닫힌 WP만 `/work_packages/{id}/activities`를 조회해 닫힘 상태 전환 시각을 `closedAt`으로 사용
- `op-adapter.js`: 이력이 없거나 권한 제한이면 `updatedAt` fallback, `closedAtSource`로 출처 표시
- `user-overrides.js`: 공개 운영 메타데이터로 `capacityPerWeek` override 관리
- `e2e-verify.py/js`: `AC-OPTIONAL-01/02` 추가

**검증 기준:**
- `closedAtSource="activities"`가 최소 1건 이상 존재해야 함. 현재 운영 OP 기준 195/197건
- `capacityOverride=true`인 실 사용자 최소 1명 이상, 모든 `capacityPerWeek > 0`

**Anti-pattern:**
> ❌ WRONG: OP에 직접 필드가 없다는 이유로 모든 값을 기본값/updatedAt 근사로 숨김 처리
> ✅ CORRECT: 보조 엔드포인트나 운영 메타데이터에서 원천을 확보하고, 불가 시 fallback과 출처 필드를 함께 둔다

---

## 2026-06-20 — Resources Load 중심 화면의 입력 신뢰도 착시 (#48)

**증상:** Resources가 AVG LOAD/OVERLOADED/UNDERUTIL 중심으로 보였지만 운영 OP는 Open WP 196건 중
Estimated time 입력 4건(2%), Time entries 0건이었다. 이 상태에서 Load를 전면에 두면 모든 인원이
여유로운 것처럼 보인다.

**근본 원인:** 상용 리소스 관리 제품의 capacity/load 패턴을 그대로 가져오면서, OP 실데이터에
capacity/load 산정에 필요한 입력이 충분한지 먼저 확인하지 않았다. 리소스 창에서 사용자를
입력 보정으로 유도할 수 있는 Assignee/Estimated time/Due date 누락도 하단 보조 정보로만 남았다.

**수정 내용:**
- `views/resources.js`: 기본 KPI를 MEMBERS/ASSIGNMENT/ESTIMATE/DUE 21D/UNASSIGNED로 교체
- `views/resources.js`: Data Readiness, Capacity Signal, Person Pressure, Input Actions 4패널 구조로 재설계
- `app.css`: Resources 전용 `8fr / 5fr` grid, desktop 고정 행 높이, 모바일 단일 컬럼/내부 스크롤 적용
- `e2e-verify-v2.py/js`: `AC-UX-19` 추가 — 리소스 패널 존재, 8:5 비율, 상단/하단 행 높이 정렬 검증

**검증:**
- `python3 proxy/e2e-verify-v2.py`: AC-UX-19 통과, top/detail 높이 오차 0px, 컬럼 비율 1.60
- Playwright 실측: desktop 1440px 컬럼 721:451, page/body 가로 overflow 0
- Playwright 캡처: `/tmp/plm-resources-1440.png`, `/tmp/plm-resources-390.png`

**Anti-pattern:**
> ❌ WRONG: 입력률이 낮은 estimated/time entry 기반 Load를 확정 리소스 판단처럼 전면 배치
> ✅ CORRECT: 입력 신뢰도와 OP 입력 유도 항목을 먼저 보여주고, Load는 confidence와 함께 보조 지표로 표시

---

## 재발 방지 체크리스트 (E2E 실증 전 필수 확인)

- [ ] E2E 검증은 의미 있는 DOM 선택자를 사용하는가? (`html.length` 금지)
- [ ] localStorage 저장 ID를 실 데이터 키로 조회할 때 존재 확인을 하는가?
- [ ] 동적 필터/매핑 결과에서 빈 배열 케이스를 처리하는가?
- [ ] `renderContent`류 최상위 렌더 함수에 try-catch가 있는가?
- [ ] lookup map(D.U, D.P 등)에서 가져온 값의 `.property` 접근 전 null 체크를 하는가?
- [ ] 컬렉션 필터링 시 lookup map도 함께 영향 받는지 확인했는가?
- [ ] userUtilization() 등 USERS를 소비하는 모든 selector에 isGroup/isObserver/isBot 필터가 적용되어 있는가?
- [ ] OP principals 중 봇/서비스 계정(form-reporter 등)에 isBot 플래그가 부여되어 있는가?
- [ ] WP 표시 ID는 displayId를 사용하는가? (numeric id 직접 노출 금지)
- [ ] 과제 선택(hiddenProjects)이 모든 뷰(Overview/Board/Timeline/Projects)에 연동되어 있는가?
- [ ] 수동 새로고침 중 기존 데이터가 있는 경우 화면 탐색이 유지되는가?
- [ ] 새로고침 버튼이 진행/완료/실패 상태를 사용자가 볼 수 있게 표시하는가?
- [ ] 레이아웃 변경은 Playwright 스크린샷과 `getBoundingClientRect()` 좌표로 검증했는가? (겹침·화면 밖 요소·텍스트 잘림 0건)
- [ ] 편집 모드/드롭다운/필터 등 상태 전환 후 주요 버튼이 `elementFromPoint()` 기준 실제 클릭 가능한가?
- [ ] 새 패널 후보는 OP 실데이터에 실제 원천 필드가 있는지 확인했는가? (`/versions`, `versionId`, `relations`, `date` 등)
- [ ] 간트/타임라인에서 선택한 항목이 같은 화면의 상세 패널을 갱신하는가?
- [ ] 다른 창(Risks/Resources/Projects)에 이미 있는 상세 목록을 Timeline에서 중복 노출하지 않는가?
- [ ] OP 본문에 직접 없는 값은 보조 엔드포인트/운영 메타데이터/fallback 출처를 필드로 명시했는가?
- [ ] Resources/리소스 화면에서 Load를 쓰기 전 Estimated time·Time entries 입력률을 함께 표시하는가?
- [ ] 모바일 폭에서 버튼/정렬 컨트롤이 화면 밖으로 밀리지 않고 내부 스크롤 또는 줄바꿈되는가?
