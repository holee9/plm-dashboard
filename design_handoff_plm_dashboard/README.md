# Handoff: PLM Monitoring Dashboard (OpenProject 연동)

> 이 문서는 **라이브 대시보드의 유지보수·재구현·GitHub 교차검증**을 위한 핸드오프입니다.
> 구현 기준: `40b0ef4` 기반 #57/#58/#60/#67 수정 / 검증일: 2026-09-11.
> 변경·배포 검증 기록은 `../docs/handoff-consistency-verification.md`를 참조한다.
> 운영 기준: `d4266fc`, `http://plm-dash.work/`, raspi5p. 2026-09-11 운영 브라우저 검증 완료.
> 후속 개선은 `../docs/remaining-issues-verification.md`의 배포 준비 기록을 따른다.
> 이번 수정에서 해소한 계약 차이와 별도 개선 백로그를 §11에 구분해 기록합니다.

---

## 1. Overview

PLM 프로젝트 운영 현황을 한 화면에서 모니터링하는 대시보드입니다. OpenProject API v3의
work packages / time entries / users / versions / relations 데이터를 6개 뷰로 시각화합니다.

- **Overview** — 운영 상태 헤드라인 · KPI 스트립(드래그 편집) · **핵심현황**(col-6 과제 헬스 + col-3 주의항목 + col-3 금주WP, 각 패널 스크롤) · **추세·분배**(Throughput/상태 분포/팀 가동률/활동별 공수)
- **Projects** — 과제별 탭, 8:5 주/보조 그리드, 진행률·KPI 레일·팀/상태·WP 우선 배치
- **Resources** — 입력 신뢰도·OP 입력 유도·인원별 일정 압박·보조 가동률
- **Board** — 상태 칸반(New→Done), 과제/담당자 필터
- **Timeline** — 간트·마일스톤·일정 점검(Schedule Inspection)
- **Risks** — KPI 스트립(6종) · 과제별 리스크 건수 표(col-6, 지연·임박·미배정·보류·마감미설정·방치) + 동반 패널(DUE SOON·방치 WP, col-6) · Zone A(즉각 조치): 마감초과·미배정 · Zone B(주의): OnHold·기한 없음 · Zone C(방치·공수): 예산초과·과부하. 과제별 표는 #38에서 도입됐고, 50% 배치는 #39에서 확정됐다.

데이터 규모는 실 API 응답과 화면의 프로젝트 숨김 상태에 따라 달라지며 고정 설계값이 아니다.
2026-09-11 로컬 라이브 확인 표본은 프로젝트 37개, 활성 인원 15명, WP 576건이었다.
`DR 사업본부 주관 미팅` 유형과 `인프라 구축` 제외 정책은 §4를 따른다.

---

## 2. About the Design Files

이 번들의 HTML/JS/CSS는 초기 디자인 레퍼런스에서 발전한 **현재 실행·배포 소스**다.
`USE_LIVE_API=true`로 OpenProject API에 연동되며 별도의 빌드 산출물 없이 정적 파일을 제공한다.

**유지보수·재구현 경로:**

- **A. 현 라이브 코드를 유지보수** — 의존성 없는 바닐라 JS와 기존 프록시·데이터 계약을 유지한다. 연동은 이미 구현돼 있다 (§6 참조).
- **B. 기존 코드베이스로 재구현** — React/Vue 등 사내 환경이 있으면, 이 HTML을 비주얼
  스펙으로 삼아 그 환경의 패턴·라이브러리로 재현합니다. 이때도 **§5 데이터 계약은 그대로
  유지**하세요 — 그래야 디자인과 코드가 같은 기준을 공유해 교차검증이 됩니다.

---

## 3. Fidelity

**High-fidelity (hifi) 실행 레퍼런스.** Grafana/Datadog 계열 고밀도 데이터 대시보드 톤을 사용한다.
다크/라이트 테마, accent 색상, 정보 밀도, 스타일 방향(3종)은 토큰화돼 있다.
일반 브라우저에서는 우상단 테마 토글을 사용하며, 전체 Tweaks는 §8의 호스트 연동 환경에서 제공한다.
재구현(B) 시 사내 컴포넌트에 매핑하되 데이터 계약과 화면의 정보 위계를 유지한다.
최초 승인 디자인의 독립 캡처 세트는 이 패키지에 없으므로, 픽셀 비교 시 커밋·뷰포트·테마·밀도·
스타일·사이드바 상태를 고정한 캡처를 별도 기준으로 남겨야 한다. `.moai/design/`의 TBD 파일은
현재 승인된 화면 명세가 아니며, 이 README와 실행 소스가 현재 대조 기준이다.

---

## 4. 파일 구성 (아키텍처)

```
PLM Dashboard.html      셸 — 폰트/스타일/스크립트 로드, TWEAK_DEFAULTS 초기값
├─ styles.css           ★ 디자인 시스템 엔트리(@import 전용) — fonts + tokens
│   ├─ fonts/fonts.css      IBM Plex Sans KR + Mono (Google Fonts)
│   └─ tokens/              colors·themes·typography·spacing·effects (CSS 변수 정본)
├─ app.css              대시보드 컴포넌트/레이아웃 CSS (styles.css 뒤에 링크)
├─ data.js              ★ 데이터 계약(SSOT) — 목업 생성 + selectors. 연동의 교체 지점
├─ user-overrides.js    공개 운영 메타데이터 — 사용자별 capacityPerWeek override
├─ op-adapter.js        ★ OpenProject HAL+JSON → data.js 형태 정규화 어댑터
├─ charts.js            의존성 없는 SVG 차트(donut/line/columns/hbars/sparkline)
├─ ui.js                공통 UI 헬퍼(아바타/상태칩/헬스/패널/KPI/wpLink)
├─ app.js               상태·탭 라우팅·테마·렌더 디스패치·툴팁
├─ tweaks.js            Tweaks 패널(accent/밀도/테마/스타일 방향)
└─ views/
   ├─ overview.js  projects.js  resources.js
   └─ board.js     timeline.js  risks.js

OpenProject 연동 점검.html   API v3 교차검증 리포트(필드 매핑·함정·배포)
```

> **CSS 구조:** `styles.css`는 토큰만 모은 `@import` 매니페스트(디자인 시스템 정본),
> 실제 컴포넌트 스타일은 `app.css`. 대시보드는 둘을 순서대로 링크한다. 색은 의미로만
> 사용 — 기본 표면은 중립색, 상태·위험·선택·진행 정보에 색을 적용한다. Overview 표의 진행률
> 막대는 중립 회색, Projects 진행률 도넛은 accent, Timeline 막대는 과제 건강도/WP 상태색을 사용한다.

**데이터 흐름:** `OpenProject HAL+JSON → op-adapter.js(정규화) → window.DB(평탄 형태 + selectors) → views`
뷰는 `window.DB`의 평탄 형태만 소비합니다. 데이터 출처(목업/실 API)는 뷰와 무관합니다.

**대상 제외 정책:** 운영 의도상 대시보드 대상이 아닌 `DR 사업본부 주관 미팅` 유형과
`인프라 구축` 프로젝트는 `op-adapter.js`의 allowed project 단계에서 제외합니다.
이 필터는 `PROJECTS`뿐 아니라 `WORK_PACKAGES`, Timeline, Board, Resources 집계 전에 적용되어야 하며,
뷰 단위 숨김으로 대체하면 안 됩니다.

---

## 5. 데이터 계약 (Single Source of Truth) ★ 교차검증의 기준점

**이 섹션이 디자인↔코드 교차검증의 앵커입니다.** 필드명을 바꾸거나 아래 형태를 어기면
드리프트로 간주합니다. 전체 정의·selectors는 `data.js`, 매핑 규칙은 `op-adapter.js` 참조.

### WorkPackage (평탄 형태)
| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | number | |
| `displayId` | string | OP 표시 ID ("BH-1" 형식). `wp.displayId \|\| String(wp.id)` |
| `subject` | string | |
| `projectId` `typeId` `statusId` `priorityId` | number | 참조 ID |
| `assigneeId` `authorId` | number\|null | 미할당 시 null |
| `versionId` | number\|null | OP Version 연결. 현재 운영 OP는 0건이므로 Timeline 핵심 섹션에는 사용하지 않음 |
| `startDate` `dueDate` | string\|null | 유효한 `YYYY-MM-DD`, 누락/잘못된 날짜는 null |
| `estimatedHours` `spentHours` | **number(시간)** | ⚠ OP는 `"PT40H"` 기간문자열 — 반드시 파싱 |
| `percentDone` | number(0–100) | ⚠ OP 필드명은 `percentageDone` |
| `createdAt` `updatedAt` | string | `YYYY-MM-DD` |
| `closedAt` `closedAtSource` | string\|null / string\|null | ⚠ OP 기본 필드 없음 — `/work_packages/{id}/activities`에서 닫힘 상태 전환 시각을 계산하고, 불가 시 `updatedAt` fallback |

### TimeEntry
`id` · `workPackageId` · `projectId` · `userId` · `activityId` · `hours`(**number**, OP는 `"PT5H"`) · `spentOn`(`YYYY-MM-DD`)

### Relation
`id` · `type`(`follows` 등) · `fromId` · `toId` · `delay`. 건수는 실 API 응답에 따라 달라진다.
Timeline은 critical path를 계산하지 않고 Schedule Inspection에서 `follows`를 의존성 참고 신호로 표시한다.

### Timeline Schedule Inspection 계약
Timeline은 "일정이 믿을 만하게 입력됐는가"와 "가까운 일정 압박이 어디인가"만 판단한다.

| 항목 | 계산 기준 | 표시 위치 |
|---|---|---|
| `Coverage` | Open non-milestone WP 중 유효한 시작/마감일이 있고 마감일 ≥ 시작일인 비율 | Schedule Inspection metric |
| `Due 7D` / `14D` | `D.dueWithin(wp, 7/14)` | Schedule Inspection metric |
| `Missing Due` | Open non-milestone WP 중 `_due` 없음 | Schedule Inspection metric/table/feed |
| `Missing Start` | Open non-milestone WP 중 `_start` 없음 | Project scope feed |
| `Long Span` | `_due - _start > 60 days` | Schedule Inspection metric/table/feed |
| `Deps` | `RELATIONS.type === "follows"`가 같은 scope의 WP 사이에 있는 건수 | Schedule Inspection metric/table |

의도적으로 제외하는 항목: 담당자, 개인 가동률, 미배정 상세, 지연 상세 전체 목록. 이들은 Projects/Risks/Resources의 책임이다.

### Resources Data Readiness 계약
Resources는 OP 입력이 리소스 판단에 충분한지 먼저 확인하고, Load는 보조 지표로 낮춰 표시한다.
Estimated time과 Time entries 입력이 부족하면 AVG LOAD/OVERLOADED 중심 화면은 업무량을 과소 표시한다.
입력률은 고정값이 아니며 현재 scope의 실데이터로 계산한다. 2026-09-11 확인 표본은
Open WP 270건의 Estimated time 입력률 0%, Time entries 0건이었다.

| 항목 | 계산 기준 | 표시 위치 |
|---|---|---|
| `Assignment` | Open WP 중 `assigneeId` 있음 | KPI, Data Readiness |
| `Estimate` | Open WP 중 `estimatedHours > 0` | KPI, Data Readiness, Load confidence |
| `Due Date` | Open WP 중 `_due` 있음 | Data Readiness |
| `Due 21D` | 지연 포함 `_due <= TODAY + 21 days` | KPI, Data Readiness, Person Pressure |
| `Missing Assignee` | Open WP 중 `assigneeId` 없음 | KPI, Input Actions |
| `Missing Estimate` | Open WP 중 `estimatedHours` 없음 | Input Actions, Person Pressure |
| `Missing Due Date` | Open WP 중 `_due` 없음 | KPI 후보, Input Actions, Person Pressure |
| `Time Entries` | `DB.TIME_ENTRIES.length` | Input Actions, Load/Spent confidence |
| `Capacity` | active users 중 `capacityOverride=true` | Data Readiness |

Input Actions는 새 필드를 요구하지 않는다. OP에 이미 있는 `Assignee`, `Estimated time`, `Due date`,
`Time entries` 누락을 주의 표시와 툴팁으로 입력 유도한다.

### User
`id` · `name` · `initials` · `role` · `globalRole` · `title` · `color` · `capacityPerWeek` · `capacityOverride`(⚠ OP에 원천 없음 — `user-overrides.js` 공개 운영 메타데이터) · `isGroup`(boolean, `_type==="Group"`) · `isObserver`(boolean, role="Observer") · `isBot`(boolean, name/login이 "form-reporter" 패턴 또는 서비스 계정 또는 `isLocked=true`) · `isLocked`(boolean, `!_links?.showUser` — 영구잠금 계정)

> `globalRole`: 전체 프로젝트를 통틀어 PM > TL > Member 우선순위로 결정한 최고 대시 역할. `op-adapter.js`에서 계산. TL 후보 필터링 시 per-project `role`이 아닌 `globalRole` 기준으로 PM 제외.

> ⚠ `isGroup`/`isObserver`/`isBot`/`isLocked` 항목은 `D.U` lookup에서 제거하지 말 것. 담당자 WP/프로젝트 leadId가 해당 ID를 참조할 수 있다. UI 드롭다운·userUtilization()에서만 `.filter(u => !u.isGroup && !u.isObserver && !u.isBot)`로 제외한다.

> ⚠ `name` 필드는 한국어 성+이름이 아닌 **계정명**(`drake.lee` 등)으로 반환됨. `op-adapter.js` 상단 `NAME_TABLE`에 계정명→한국어 이름 매핑을 유지해야 한다. 신규 입사자 추가 시 NAME_TABLE을 함께 갱신할 것.

### Project / Version / Status / Type / Priority / Activity
`data.js` 상단 enum 및 PROJECT/VERSION 정의 참조. **실 연동 시 Status/Type/Priority는
하드코딩 금지 — 인스턴스에서 fetch해 동적 구성**(`op-adapter.js`가 처리).

### Selectors (뷰가 의존하는 계산 함수 — 시그니처 유지)
`kpis(wps)` · `statusDistribution(wps)` · `openCloseTrend(wps,weeks)` · `backlogTrend(wps,weeks)`
· `userUtilization()` · `projectHealth()` · `burndown(version)` · `activityBreakdown(entries)`
· `isOpen/isOverdue/dueWithin`

---

## 6. 현재 실연동 구조와 재구성 절차

`OpenProject 연동 점검.html`에 상세 리포트가 있습니다. 요약:

1. **읽기 전용 API 키 발급** (전용 계정, `My account → Access token`)
2. **리버스 프록시 1블록** — Nginx에서 `/op → https://plm.abyz-lab.work/api/v3`,
   `Authorization: Basic base64(apikey:TOKEN)` 주입. **브라우저에 키를 두지 말 것**(CORS+보안).
   현재 운영 주소: `http://plm-dash.work/` (포트 80/8088 동시 서비스, 상세는 `proxy/README.md` 참조).
3. **참조 데이터 동적 로딩** — statuses/types/priorities/activities fetch
4. **WP·time_entries 수집 + 시간 파싱 검증** — `op-adapter.js`의 `durationToHours()`,
   `fetchAll()` 페이지네이션 사용
5. **capacity 설정 + closedAt 정책** — `user-overrides.js`의 관리자 지정 `capacityPerWeek`, WP activities/journals 기반 `closedAt`
6. **라이브 데이터 주입(구현 완료)** — `data.js`가 `OPAdapter.buildLiveDataset()`을 호출하고,
   `DB.reload(ds)`로 컬렉션을 갱신한 뒤 화면을 다시 그린다. 다른 환경으로 재구성할 때도 이 계약을 유지한다.

### ⚠ 반드시 처리할 함정 (점검 리포트 §3)
1. **CORS·API 키 노출**(치명) → 프록시 필수
2. **시간 = ISO8601 기간 문자열**(치명) → `"PT40H"→40` 파싱 필수
3. **spentTime/closedAt** 신뢰 어려움 → time_entries 합산 / activities 상태 변경 이력 우선, `updatedAt` fallback
4. **가동률/가용량** OP에 원천 없음 → 기본 40h/주 + `user-overrides.js` 관리자 설정
5. **상태·유형 인스턴스별 상이 + 페이지네이션** → 동적 fetch + offset 순회
6. **D.U lookup 안전 규칙** — `D.U[id]` 직접 `.property` 접근 금지. 반드시 `D.U[id]?.property ?? fallback` 형태로 사용. USERS 배열 필터링 시 D.U도 같이 비워지므로 컬렉션 자체 제거 대신 플래그(`isGroup`, `isObserver`, `isBot`) 방식을 사용할 것.
7. **봇/서비스 계정** — form-reporter 등 OP 자동화 계정이 principals에 포함됨. `isBot` 플래그로 담당자 UI 및 userUtilization()에서 제외 필요.
8. **WP displayId vs numeric id** — OP API는 `displayId: "BH-1"` 필드를 별도 제공. UI 표시에는 `displayId` 사용, URL 링크(`/work_packages/{id}`)에는 numeric `id` 사용.
9. **Live data 누락 필드** — op-adapter.js project에서 `nameKo`·`health`·`leadId`·`startDate`·`dueDate`를 명시한다 (#11). 필드가 존재하는 것과 값이 유효한 것은 구분한다. 건강도 누락은 `unknown`(미평가)으로, 일정 누락은 null로 보존한다. 프로젝트 기간은 유효한 하위 일정에서만 집계하며, 마일스톤은 별도 표시한다 (#57/#58). 신규 필드는 `hydrateProject()`에도 명시할 것.
10. **계정명 ≠ 실명** — `/principals` `name` 필드는 OP 관리자 패널에서 성·이름을 설정해도 계정명(`drake.lee` 등)을 반환한다. `firstName`/`lastName`은 비어 있음. 해결: `op-adapter.js` 상단 `NAME_TABLE`에 `계정명 → 성+이름` 정적 매핑 유지. 신규 입사자 등록 시 반드시 함께 갱신.
11. **퇴사자·잠금 계정 감지** — OP 영구잠금 계정은 `/principals`에 남지만 `_links.showUser`가 사라진다. `isLocked = !u._links?.showUser`로 감지 후 `isBot = true` 처리. OP 관리자가 잠금만 해도 다음 새로고침부터 자동 제외 — 코드 변경 불필요.
12. **샘플 데이터 플래시** — `USE_LIVE_API=true` 이후에도 `USER_DEFS`/`PROJECT_DEFS`에 샘플을 남기면 새로고침 시 순간 표시됨. 반드시 빈 배열로 유지하고 `renderContent()`에 `D._loading` 가드 필수.
13. **수동 새로고침 UX 착시** — 자동 폴링은 의도적으로 사용하지 않는다. 새로고침 중 기존 화면을 유지하면 데이터가 같은 경우 갱신 여부가 보이지 않으므로, 버튼 자체에 `갱신 중...`/`갱신 완료 HH:mm:ss`/`갱신 실패` 상태를 표시하고 갱신 중 버튼을 비활성화해야 한다 (#40).
14. **Projects 전체폭 헤더 + 별도 KPI 줄은 WP 테이블을 밀어낸다** — Projects 뷰에서 헤더와 KPI를 모두 전체폭 행으로 두면 가장 중요한 Work Packages가 첫 화면 하단으로 밀린다. 실측 후 `8fr / 5fr` 주/보조 그리드로 나누고, 홀수 KPI는 마지막 카드를 전체폭 처리해 빈칸을 없앨 것 (#42).
15. **Projects KPI 편집 상태는 별도 검증 필수** — 기본 표시 상태만 캡처하면 `KPI 편집` 클릭 후 늘어난 카드가 action 버튼을 아래 패널 뒤로 밀어내는 문제를 놓친다. edit mode에서는 KPI strip을 rail 내부 스크롤로 제한하고 `취소`/`KPI 편집 완료`는 rail 하단 고정. E2E는 `elementFromPoint()` hit-test와 실제 클릭 종료를 모두 확인할 것 (#42, AC-UX-16).
16. **Resources Load는 Estimate/Time entry 입력률 없이는 보조 지표다** — 입력이 부족할 때 AVG LOAD/OVERLOADED를 전면에 두면 모든 인력이 여유로워 보이는 착시가 생긴다. Resources는 Assignment/Estimate/Due Date 커버리지와 Missing Assignee/Estimate/Due 입력 유도를 먼저 보여주고, 입력률이 낮으면 Capacity Signal의 낮은 신뢰도를 안내한다 (#48, AC-UX-19). 산출 불가와 실제 0%의 추가 구분은 #65에서 추적한다.
17. **운영 제외 프로젝트는 DB 진입 전에 제거한다** — `인프라 구축`처럼 의도적으로 대시보드에서 제외한 프로젝트를 한 화면에서만 숨기면 Board/Timeline/Resources 집계에 남는다. `op-adapter.js`에서 allowed project id를 먼저 만들고, `PROJECTS`와 `WORK_PACKAGES`를 같은 set으로 필터링해야 한다 (#50, AC-ROLE-01b).

---

## 7. Design Tokens

`styles.css`가 가져오는 `tokens/*.css`의 `:root` / `[data-theme]` 정의가 정본. 핵심만 발췌:

- **폰트:** `IBM Plex Sans KR`(본문·라벨), `IBM Plex Mono`(수치·코드)
- **라이브 상태색:** OP `/statuses`의 `color`를 `mapStatus()`에서 검증해 사용한다. 유효한 색이 없으면 `#8B93A7`로 대체한다. 상태명·유형·색은 인스턴스 설정에 따라 달라지므로 상태별 고정 팔레트를 강제하지 않는다.
- **시맨틱 상태 토큰:** `tokens/colors.css`의 기본 팔레트는 공통 의미색과 차트 시리즈 등에 사용한다. 라이브 상태칩/상태 분포의 OP 색과 구분한다.
- **헬스/시맨틱:** green `#22C55E` · amber `#F59E0B` · red `#EF4444` · blue `#3B82F6`
- **accent 프리셋:** blue/violet/teal/amber/rose (Tweaks에서 전환)
- **다크 표면:** bg `#0B0E14` · panel `#11161F` · panel2 `#161C27` · border `#1E2530`
- **밀도(density):** compact/cozy/comfortable → `--grid-1` `--pad` `--row-h` 스케일
- **스타일 방향:** telemetry(r=8) / console(r=3, 각진) / studio(r=16, 그림자)
- **반경:** `--r` (스타일별 3/8/16px)

언어: 라벨 영어 + 본문 한국어. 한글 줄바꿈은 `word-break: keep-all`.

---

## 8. Interactions & Behavior

- **탭 네비:** 좌측 사이드바, 섹션 그룹(MONITOR/WORK), collapse 가능. 상태는 localStorage(`plm_state`)
- **테마 토글:** 일반 브라우저의 우상단 버튼으로 dark/light 즉시 전환. 호스트 연동 환경에서는 Tweaks에서도 변경 가능.
- **Tweaks 패널:** `__activate_edit_mode` / `__deactivate_edit_mode` postMessage를 보내는 호스트가 패널을 열고 닫는다. accent·density·theme·style을 변경한다. 일반 브라우저 단독 실행에는 별도 Tweaks 진입 버튼이 없으며, 호스트 툴바는 대시보드 자체 UI에 포함되지 않는다.
- **드릴다운:** Overview 콜아웃/테이블 행 클릭 → 해당 뷰로 이동(`data-nav`, `data-nav-project`)
- **필터:** Board 과제/담당자 select, Resources 정렬, Timeline 범위 select
- **Resources 입력 신뢰도:** KPI 기본값은 MEMBERS·ASSIGNMENT·ESTIMATE·DUE 21D·UNASSIGNED. `AVG LOAD`·`OVERLOADED`·`UNDERUTIL`·`TOTAL SPENT`는 선택 가능하지만 Estimate/Time entries 입력률에 따라 보조 지표로 해석한다.
- **Resources 레이아웃:** Projects와 같은 황금비 근사 `8fr / 5fr` 주/보조 그리드. 좌측은 Data Readiness + Person Pressure, 우측은 Capacity Signal + Input Actions. 폭의 절대값은 스크롤바·사이드바 등에 따라 달라지며 8:5 비율과 좌우 행 정렬을 기준으로 삼는다. 2026-09-11, 1440px·light·사이드바 펼침 실측은 715.06:446.92≈1.600, 상단 312px·하단 432px, 좌우 높이 오차 0px였다. 모바일은 단일 컬럼으로 접고 정렬 버튼·표는 내부 스크롤 처리한다 (#48, AC-UX-19).
- **Timeline 프로젝트 drilldown:** All Projects 간트에서 프로젝트 행을 클릭하면 Projects 탭으로 이동하지 않고 Timeline 내부 scope가 해당 프로젝트로 전환된다. 하단 `Project Milestones`와 `Schedule Inspection`도 같은 scope로 재계산된다.
- **Timeline 일정 점검:** 운영 OP에 `/versions`와 WP `versionId` 연결이 없으므로 `Active Sprints` 표는 사용하지 않는다. 대신 선택 범위의 Open WP 기준 일정 커버리지, 7일/14일 내 마감, 시작일/마감일 누락, 60일 초과 장기 span, `follows` 관계 수를 표시한다. 담당자·가동률·상세 리스크 목록은 Projects/Risks/Resources와 중복되므로 Timeline에서 반복하지 않는다 (#46).
- **Timeline 검증 기준:** `AC-UX-17`은 OP `date` 마일스톤이 간트 marker와 Project scope에 표시되는지 검증한다. `AC-UX-18`은 `Active Sprints` 문구가 사라졌고, `Schedule Inspection`이 있으며, 마일스톤이 있는 프로젝트 행 클릭 후 Timeline scope와 marker가 함께 갱신되는지 검증한다.
- **과제 선택/숨김:** Overview 편집 모드에서 칩 우측 × 버튼 클릭으로 숨김. 비편집 모드에서는 칩 클릭 기능 없음. `state.hiddenProjects`로 localStorage 유지
- **과제 순서 드래그:** Overview 편집 모드에서 칩 드래그로 과제 순서 변경 → Projects 탭·**Timeline 간트 행** 순서 실시간 동기화. `state.projOrder`로 localStorage 유지. 신규 추가 과제는 자동으로 순서 끝에 편입됨
- **Overview 편집 모드:** "편집" 버튼 → 취소/완료 버튼 표시. 취소는 편집 진입 시점 스냅샷(`hiddenProjects`·`projOrder`)으로 복원. 완료는 변경사항 확정
- **PM/TL 다중 선택:** Projects 뷰 과제 헤더의 PM·TL 셀 → 체크박스 멀티셀렉트 패널. 복수 선택 시 아바타 스택으로 표시. `state.projPmOverrides[pid]`·`state.projTlOverrides[pid]`(number[])로 저장. TL 후보는 전역 PM 유저(globalRole=PM) 자동 제외
- **Projects 8:5 그리드:** Projects 뷰는 황금비(φ≈1.618)의 실무 근사인 `8fr / 5fr` 레이아웃. 좌측 주 영역은 과제 헤더 + Work Packages 테이블, 우측 보조 영역은 KPI 레일 + Team + Status + Burndown 순서. Desktop 1440px 실측 기준 컬럼 비율 721:451=1.600, 12px 줄 단위 높이 `264 + 12 + 684`로 좌우 시작선·하단선 정렬
- **KPI 스트립 편집:** "KPI 편집" 버튼 → 표시/숨김 토글 + 드래그 재정렬. 총 8종(total·open·spent·closeRate·dueWeek·overdue·remaining·avgProgress) 중 선택. `state.kpiSections`로 localStorage 유지. Projects 우측 KPI rail은 edit mode에서 카드 영역만 내부 스크롤하고 `취소`/`KPI 편집 완료` 액션은 rail 하단에 고정해 Team 패널에 가려지지 않게 한다
- **핵심현황 레이아웃:** col-6(과제현황 표) + col-3(주의항목 피드) + col-3(금주WP 피드). 각 패널은 max-height 340px 고정 + 내부 스크롤(항목 전체 표시, slice 없음)
- **WP ID 배지(계약):** 모든 WP ID는 `displayId`(BH-1 형식)를 우선 사용하고, 없으면 numeric id로 대체한다. 배지 클릭 시 numeric id를 사용한 OpenProject 해당 WP 페이지를 새 탭으로 연다. Timeline WP 행도 동일한 공통 배지·링크를 사용한다 (#67, §11).
- **🔄 수동 새로고침 버튼:** 자동 폴링 없이 사용자가 명시적으로 갱신. 클릭 시 기존 데이터 화면을 유지한 채 OP 전체 재조회(`buildLiveDataset()`)를 수행하고, 버튼 문구가 `새로고침 → 갱신 중... → 갱신 완료 HH:mm:ss` 또는 `갱신 실패`로 바뀐다. 갱신 중에는 버튼이 비활성화된다. **업데이트 HH:MM 칩**은 표시 전용이며 마지막 수신 성공 시각을 나타내야 한다. `DB.lastReceivedAt`은 데이터셋 적용 성공 시에만 갱신한다. 화면 전환·테마 변경·갱신 실패 시 유지하며, 이전 날짜이면 날짜도 표시한다. 최초 수신 전에는 수신 이력 없음, 실패 시에는 기존 데이터/수신 시각을 유지하고 갱신 실패를 안내한다 (#60).
- **툴팁:** `data-tip` 속성 → 단일 전역 툴팁(app.js). KPI 카드, 차트, 업데이트·새로고침 버튼 등 주요 UI 요소 마우스오버 시 상세 설명 표시
- **차트:** 전부 인라인 SVG, hover 시 data-tip
- **패널 행 높이 정렬:** 같은 grid 행의 패널들은 CSS만으로는 높이가 맞지 않는다. `UI.panel({ bodyStyle: 'min-height:XXXpx' })` 또는 desktop 전용 `grid-template-rows`를 명시해 pixel-perfect 정렬한다. 값은 Playwright `getBoundingClientRect()` 실측 후 산출한다. Resources는 `8fr/5fr` + 고정 행 높이로 `AC-UX-19`에서 top/detail 높이 오차를 검증한다.

---

## 9. GitHub 교차검증 루프 (이 핸드오프의 목적)

1. 이 레포를 GitHub에 등록
2. 개발 진행(연동/재구현)
3. 레포·PR·커밋 URL을 디자인 검토자에게 전달 → 실제 소스를 읽어 **§5 데이터 계약 기준으로
   드리프트 점검**(필드명 변경, 시간 파싱 누락, selector 시그니처 변형 등)
4. 디자인을 실제에 맞춰 갱신하거나 보완 가이드 회신

> 규약은 루트 `CLAUDE.md`에 고정되어 있어, 이후 모든 검토가 동일 기준으로 진행됩니다.

---

## 10. Files

구현/검토 시 참조할 프로젝트 파일: 위 §4 전체. 특히 **`data.js`(계약)** 와
**`op-adapter.js`(매핑)**, 그리고 **`OpenProject 연동 점검.html`(연동 리포트)** 가 핵심입니다.

---

## 11. 구현 계약 검증과 개선 백로그 (2026-09-11)

### 문서 동기화 완료

- Risks: #38/#39의 과제별 건수 표와 50% 배치를 반영했다. 과거 2×2 영향도×긴급도 설명은 폐기한다.
- 상태색: 라이브 OP 색과 공통 시맨틱 토큰의 역할을 구분했다.
- Tweaks: 호스트 전용 진입 조건과 일반 브라우저 테마 버튼을 구분했다.
- 파일 역할: 별도 목업이 아닌 실행·배포 소스로 명시했다. 데이터 규모는 확인일이 있는 표본으로 기술한다.
- 레이아웃: 8:5 비율·행 정렬과 환경에 따라 달라지는 절대 폭을 구분했다.

### 이번 수정에서 해소한 계약 차이

| 기준 | 수정 결과 | 추적 |
|---|---|---|
| 건강도 누락과 정상 판정 구분 | `unknown`/미평가 및 공통 회색 배지. 실제 지연 신호는 유지하고 미평가 집계를 추가 | [#57](https://github.com/holee9/plm-dashboard/issues/57) |
| 실제 입력된 일정과 미등록 구분 | 누락/한쪽 날짜/역전/달력 오류를 구분. 실제 기간만 막대로 표시하고 미등록 행·마일스톤 유지 | [#58](https://github.com/holee9/plm-dashboard/issues/58) |
| 마지막 수신 성공 시각 표시 | 데이터셋 적용 성공 시만 기록. 실패 시 기존 데이터와 시각 유지 | [#60](https://github.com/holee9/plm-dashboard/issues/60) |
| Timeline WP ID 배지·OP 링크 | displayId 우선, numeric id fallback, numeric id 상세 URL의 새 탭 링크 | [#67](https://github.com/holee9/plm-dashboard/issues/67) |

건강도를 자동 산정하는 운영 정책은 이번 범위에 포함하지 않는다. 명시된 건강도 값이 없으면 미평가다.
프로젝트의 기간은 전체 확정 계획이 아닌 등록된 하위 일정의 범위이며, Projects 헤더에 WP 일정 등록 건수를 함께 표시한다.
각 WP/Version에 유효한 기간이 하나도 없다면 서로 다른 WP의 한쪽 날짜를 합쳐 막대를 만들지 않는다.
마일스톤만 있는 프로젝트는 기간을 만들지 않고 마일스톤을 표시한다. 잘못된 Version 기간은 번다운을 그리지 않는다.

### 후속 개선 상태

#59/#61/#62/#63/#65/#66은 후속 개선 계약에 따라 구현·검증했다. 운영 반영 여부는
`../docs/remaining-issues-verification.md`를 따른다. #64는 사용자 요청으로 제외했다.

### 검증 범위

회귀 테스트는 `node --test tests/handoff-consistency.test.cjs`로 실행한다.
로컬 라이브의 6개 화면과 Projects KPI 편집 진입/취소, Timeline 선택 범위 전환,
Resources 1440px 패널 치수와 390px 단일 컬럼을 확인했다. 모든 테마·밀도·스타일 조합,
드래그 순서의 저장/복원, PM/TL 복수 선택은 당시 검증 범위에 포함하지 않았다. 원격 정적 파일은 이후 d4266fc 배포에서 추가 검증했다.
확인하지 않은 항목은 일치/불일치로 단정하지 않는다.

## 후속 개선 계약 (#59/#61/#62/#63/#65/#66)

- 완료율은 현재 스냅샷의 완료 WP 비율이다. 이전 기간 비교가 없으면 증감을 표시하지 않는다.
- 전역 기간 필터는 제공하지 않는다. 가짜 Last 90d 버튼을 제거한다. 시간 범위는 각 지표의 제목·설명(이번 주, 7/21일, 전체 WP)에 따른다.
- Board의 필터 결과, Timeline의 선택 과제 WP, Risks의 기한 없는 WP는 전체를 스크롤로 탐색한다.
- 내비게이션은 이름이 있는 버튼이며 Tab/Enter/Space로 전환한다. 현재 화면과 포커스를 표시한다.
- 21일 부하율은 담당자의 모든 미완료 공수 작업(마일스톤 제외)에 유효한 마감일·양수 예상 시간이 있고 주간 용량이 양수인 경우만 확정 계산한다. 부족한 경우 산출 불가이며 실제 0%와 구분한다. Time entry 부재만으로 예상 부하율을 무효화하지 않는다.
- 집계 부하율·과부하 총인원은 일부 인원 산출 불가 시 확정 0을 표시하지 않는다. 알려진 과부하 및 기존 일정 압박은 별도 유지한다.
- 동일한 name/nameKo는 한 번만 표시한다. 빈 번다운·마일스톤 패널은 압축하며 8:5 주/보조 배치와 정상 차트는 유지한다.
- #64 모바일 툴바 재설계는 사용자 지시로 제외한다.
