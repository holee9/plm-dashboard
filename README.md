# PLM Dashboard

> 📘 **[abyz-lab 프로젝트 운영 방법론 플레이북 — 바로 보기 ↗](https://holee9.github.io/plm-dashboard/)**
> · 헌장 SSOT · SPEC-First DDD · 이슈 기반 이력 관리 · E2E 완료 게이트 — abyz-lab이 수립하고 적용한 프로젝트 운영 방법론

> OpenProject 인스턴스(`plm.abyz-lab.work`)의 work package 데이터를 실시간 집계하여
> **프로젝트 건강도 · 개발 자원 부하 · 위험 요소**를 한 화면에서 모니터링하는 운영 대시보드.

의존성 0의 **바닐라 JS no-build SPA**로, 데이터 계층(목업)을 실 OpenProject API v3로
교체하면 그대로 라이브 연동됩니다. 디자인↔코드 교차검증을 위한 **데이터 계약(SSOT)**을
중심에 두고 설계되었습니다.

---

## 1. 개요

PLM/프로젝트 조직은 다수의 활성 프로젝트와 개발 인원을 동시에 운영하면서, 각 프로젝트의
진척·지연·인원 과부하를 빠르게 파악해야 합니다. OpenProject 기본 화면만으로는 프로젝트
횡단 관점(전사 건강도, 자원 부하, 위험 알림)을 얻기 어렵습니다.

PLM Dashboard는 OpenProject API v3 데이터를 정규화한 뒤 **6개 운영 관점 뷰**로 재구성하여,
관리자가 의사결정에 필요한 신호(정상/주의/위험)를 즉시 얻도록 합니다.

- **대상 규모:** 활성 프로젝트 약 12개, 개발자 15명, work package 약 250건
- **데이터 원천:** 실제 구축된 OpenProject 인스턴스 (목업은 개발/디자인 단계의 대체재)
- **대상 사용자:** PLM/프로젝트 관리자, 팀 리드, 개발 조직 운영 담당

---

## 2. 핵심 기능 (6개 뷰)

| 뷰 | 파일 | 핵심 내용 |
|----|------|-----------|
| **Overview** | `views/overview.js` | 종합 판정(정상/주의/위험), 프로젝트 건강도 분포, 지연 건수, 팀 가동률, 추세 |
| **Projects** | `views/projects.js` | 프로젝트별 건강도 카드(탭) — 진행률, 번다운, 팀 아바타, WP 테이블 |
| **Resources** | `views/resources.js` | 개발자별 부하 — 부하 %, 단기 잔여 시간, 백로그, 담당 프로젝트, 지연 WP |
| **Board** | `views/board.js` | 상태별 칸반(New → In Progress → Review → Testing → On Hold → Done), 프로젝트/담당자 필터 |
| **Timeline** | `views/timeline.js` | 간트 차트 + 스프린트 번다운, 마일스톤, WP 바, 기간 선택 |
| **Risks** | `views/risks.js` | 마감 초과·임박, 인원 과부하, 공수 초과 등 위험 항목 집계 |

---

## 3. 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 언어 | JavaScript (ES5+, IIFE 모듈) | 모듈 시스템 없이 IIFE 캡슐화 |
| 빌드 | **없음 (no-build)** | 번들러/`package.json` 없음, 정적 SPA |
| 프레임워크 | 없음 (Vanilla JS) | 의존성 0 |
| CSS | CSS 변수 기반 디자인 토큰 | 테마/밀도/스타일/액센트 다차원 |
| 차트 | 인라인 SVG (`charts.js`) | 외부 차트 라이브러리 없음 |
| 폰트 | Google Fonts CDN | IBM Plex Sans KR(400–700), IBM Plex Mono |
| 상태/라우팅 | 직접 구현 | `app.js` state + `localStorage`(`plm_state`) |
| 데이터 원천 | OpenProject API v3 / 목업 | `op-adapter.js`로 정규화 |

**no-build 선택 근거:** 빌드 도구·번들러·의존성 없이 정적 파일만으로 동작 → 어떤 정적
서버에서도 즉시 실행, 디자이너는 빌드 환경 없이 바로 확인, 공급망 위험 최소화.

---

## 4. 아키텍처 / 파일 구성

```
design_handoff_plm_dashboard/
├── PLM Dashboard.html      셸 — 폰트/스타일/스크립트 로드, TWEAK_DEFAULTS 초기값
├── styles.css              ★ 디자인 시스템 엔트리(@import 전용) — fonts + tokens
│   ├── fonts/fonts.css         IBM Plex Sans KR + Mono
│   └── tokens/                 colors·themes·typography·spacing·effects (CSS 변수 정본)
├── app.css                 대시보드 컴포넌트/레이아웃 CSS
├── data.js                 ★ 데이터 계약(SSOT) — 목업 생성(stable PRNG) + selectors
├── op-adapter.js           ★ OpenProject HAL+JSON → data.js 형태 정규화 어댑터
├── charts.js               의존성 없는 SVG 차트(donut/line/columns/hbars/sparkline)
├── ui.js                   공통 UI 헬퍼(avatar/statusChip/health/panel/kpi)
├── app.js                  상태·탭 라우팅·테마·렌더 디스패치·툴팁
├── tweaks.js               Tweaks 패널(accent/밀도/테마/스타일 방향, postMessage)
└── views/                  overview · projects · resources · board · timeline · risks

OpenProject 연동 점검.html   API v3 교차검증 리포트(필드 매핑·함정·배포)
```

**데이터 흐름:**

```
OpenProject HAL+JSON → op-adapter.js(정규화) → window.DB(평탄 형태 + selectors) → views
```

뷰는 `window.DB`의 평탄 형태만 소비합니다. 데이터 출처(목업/실 API)는 뷰와 무관합니다.

---

## 5. 데이터 계약 (Single Source of Truth) ★ 교차검증 기준점

**필드명을 바꾸거나 아래 형태를 어기면 드리프트로 간주합니다.** 전체 정의·selectors는
`data.js`, 매핑 규칙은 `op-adapter.js` 참조.

### WorkPackage (평탄 형태)

| 필드 | 타입 | 비고 |
|---|---|---|
| `id` `subject` | number / string | |
| `projectId` `typeId` `statusId` `priorityId` | number | 참조 ID |
| `assigneeId` `authorId` | number\|null | 미할당 시 null |
| `versionId` | number\|null | 스프린트 |
| `startDate` `dueDate` | string | `YYYY-MM-DD` |
| `estimatedHours` `spentHours` | **number(시간)** | ⚠ OP는 `"PT40H"` 기간 문자열 — 반드시 파싱 |
| `percentDone` | number(0–100) | ⚠ OP 필드명은 `percentageDone` |
| `createdAt` `updatedAt` | string | `YYYY-MM-DD` |
| `closedAt` | string\|null | ⚠ OP 기본 필드 없음 — updatedAt 근사 |

- **TimeEntry:** `id` · `workPackageId` · `projectId` · `userId` · `activityId` · `hours`(number, OP는 `"PT5H"`) · `spentOn`
- **User:** `id` · `name` · `initials` · `role` · `title` · `color` · `capacityPerWeek`(⚠ OP에 원천 없음 — 외부 설정)
- **Status/Type/Priority:** 실 연동 시 **하드코딩 금지 — 인스턴스에서 동적 fetch**(`op-adapter.js` 처리)

### Selectors (뷰가 의존하는 계산 함수 — 시그니처 유지)

`kpis(wps)` · `statusDistribution(wps)` · `openCloseTrend(wps,weeks)` · `backlogTrend(wps,weeks)`
· `userUtilization()` · `projectHealth()` · `burndown(version)` · `activityBreakdown(entries)`
· `isOpen/isOverdue/dueWithin`

---

## 6. 실행 방법 (no-build)

빌드가 없으므로 정적 서버로 바로 띄웁니다.

```bash
cd design_handoff_plm_dashboard
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080/PLM%20Dashboard.html 열기
```

기본은 목업 데이터(`data.js`)로 동작합니다. 실 API 연동은 §7 참조.

---

## 7. OpenProject 실연동 절차 (권장 경로)

이 대시보드는 데이터 계층만 목업 → 실 API로 교체하면 동작합니다. 상세 리포트는
`design_handoff_plm_dashboard/OpenProject 연동 점검.html`. 요약:

1. **읽기 전용 API 키 발급** — 전용 계정, `My account → Access token`
2. **리버스 프록시 1블록** — Nginx `/op → https://plm.abyz-lab.work/api/v3`,
   `Authorization: Basic base64(apikey:TOKEN)` 주입. **브라우저에 키를 두지 말 것**(CORS+보안)
3. **참조 데이터 동적 로딩** — statuses/types/priorities/activities fetch
4. **WP·time_entries 수집 + 시간 파싱 검증** — `durationToHours()`, `fetchAll()` 페이지네이션
5. **capacity 설정 입력 + closedAt 정책 결정**
6. **스왑** — `data.js` 목업 생성부를 `OPAdapter.buildLiveDataset()`로 교체. 뷰는 무수정

### ⚠ 반드시 처리할 함정 5

1. **CORS·API 키 노출**(치명) → 프록시 필수
2. **시간 = ISO8601 기간 문자열**(치명) → `"PT40H"→40` 파싱 필수
3. **spentTime/closedAt** 신뢰 어려움 → time_entries 합산 / updatedAt 근사
4. **가동률/가용량** OP에 원천 없음 → 기본 40h/주 + 관리자 설정
5. **상태·유형 인스턴스별 상이 + 페이지네이션** → 동적 fetch + offset 순회

---

## 8. 디자인 토큰

`styles.css`의 `:root` / `[data-theme]` 정의가 정본. 외관은 HTML 속성 조합으로 결정:

- **테마**(`data-theme`): dark / light
- **밀도**(`data-density`): compact / cozy / comfortable
- **스타일**(`data-style`): telemetry(r=8) / console(r=3, 각진) / studio(r=16, 그림자)
- **액센트**(`--accent`): blue / violet / teal / amber / rose (Tweaks 패널에서 전환)
- **상태색:** New `#8B93A7` · In progress `#3B82F6` · In review `#8B5CF6` · In testing `#06B6D4` · On hold `#F59E0B` · Closed `#22C55E` · Rejected `#EF4444`
- **폰트:** IBM Plex Sans KR(본문·라벨), IBM Plex Mono(수치·코드). 한글 줄바꿈 `word-break: keep-all`

---

## 9. GitHub 교차검증 루프

1. 개발 진행(연동/재구현)
2. 레포·PR·커밋 URL을 디자인 검토자에게 전달 → 실제 소스를 읽어 **§5 데이터 계약 기준으로
   드리프트 점검**(필드명 변경, 시간 파싱 누락, selector 시그니처 변형 등)
3. 디자인을 실제에 맞춰 갱신하거나 보완 가이드 회신

> 규약은 루트 `CLAUDE.md`에 고정되어, 이후 모든 검토가 동일 기준으로 진행됩니다.

---

## 10. 문서

| 문서 | 내용 |
|------|------|
| `design_handoff_plm_dashboard/README.md` | 핸드오프 상세(아키텍처·데이터 계약·연동 절차 전문) |
| `design_handoff_plm_dashboard/OpenProject 연동 점검.html` | API v3 교차검증 리포트(필드 매핑·함정·배포) |
| `.moai/project/product.md` | 제품 개요 — 배경·사용자·기능 |
| `.moai/project/tech.md` | 기술 스택 및 운영 |
| `.moai/project/structure.md` | 디렉터리 및 구조 상세 |

핵심 파일: **`data.js`(계약)** · **`op-adapter.js`(매핑)** · **`OpenProject 연동 점검.html`(연동 리포트)**
