# Handoff: PLM Monitoring Dashboard (OpenProject 연동)

> 이 패키지는 **개발 착수 + GitHub 교차검증 루프**를 위한 핸드오프 문서입니다.
> 사내 OpenProject(`plm.abyz-lab.work`)를 모니터링하는 대시보드를 실제 코드베이스로
> 구현/연동할 때 이 문서 하나만으로 충분하도록 작성했습니다.

---

## 1. Overview

PLM 프로젝트 운영 현황을 한 화면에서 모니터링하는 대시보드입니다. OpenProject API v3의
work packages / time entries / users / versions 데이터를 6개 뷰로 시각화합니다.

- **Overview** — 운영 상태 헤드라인 + 핵심 현황(과제 헬스·리스크) + 추세/분배(보조)
- **Projects** — 과제별 탭, 진행률·번다운·팀·WP
- **Resources** — 개발자별 가동률·잔여공수·할당 WP
- **Board** — 상태 칸반(New→Done), 과제/담당자 필터
- **Timeline** — 간트·마일스톤·스프린트
- **Risks** — 마감초과·임박·과부하·공수초과

대상 규모: 활성 과제 12개, 개발자 15명, WP 약 250건.

---

## 2. About the Design Files

이 번들의 HTML/JS는 **디자인 레퍼런스(프로토타입)** 입니다 — 의도한 모양·동작·데이터
구조를 보여주는 참고물이지, 그대로 프로덕션에 올리는 코드가 아닙니다.

**개발 작업의 의미는 두 갈래입니다 (택1, 권장은 A):**

- **A. 현 코드를 그대로 라이브 연동** — 이 대시보드는 의존성 없는 바닐라 JS라, 데이터
  계층만 목업 → 실 API로 교체하면 바로 동작합니다. **가장 빠른 경로.** (§6 참조)
- **B. 기존 코드베이스로 재구현** — React/Vue 등 사내 환경이 있으면, 이 HTML을 비주얼
  스펙으로 삼아 그 환경의 패턴·라이브러리로 재현합니다. 이때도 **§5 데이터 계약은 그대로
  유지**하세요 — 그래야 디자인과 코드가 같은 기준을 공유해 교차검증이 됩니다.

---

## 3. Fidelity

**High-fidelity (hifi).** 최종 색상·타이포·간격·인터랙션이 모두 확정된 목업입니다.
Grafana/Datadog 계열 고밀도 데이터 대시보드 톤. 다크/라이트 테마, accent 색상, 정보 밀도,
스타일 방향(3종)이 토큰화되어 Tweaks로 전환됩니다. UI는 픽셀 단위로 재현하되, 재구현(B)
시에는 사내 컴포넌트로 매핑하세요.

---

## 4. 파일 구성 (아키텍처)

```
PLM Dashboard.html      셸 — 폰트/스타일/스크립트 로드, TWEAK_DEFAULTS 초기값
├─ styles.css           ★ 디자인 시스템 엔트리(@import 전용) — fonts + tokens
│   ├─ fonts/fonts.css      IBM Plex Sans KR + Mono (Google Fonts)
│   └─ tokens/              colors·themes·typography·spacing·effects (CSS 변수 정본)
├─ app.css              대시보드 컴포넌트/레이아웃 CSS (styles.css 뒤에 링크)
├─ data.js              ★ 데이터 계약(SSOT) — 목업 생성 + selectors. 연동의 교체 지점
├─ op-adapter.js        ★ OpenProject HAL+JSON → data.js 형태 정규화 어댑터(골격)
├─ charts.js            의존성 없는 SVG 차트(donut/line/columns/hbars/sparkline)
├─ ui.js                공통 UI 헬퍼(아바타/상태칩/헬스/패널/KPI)
├─ app.js               상태·탭 라우팅·테마·렌더 디스패치·툴팁
├─ tweaks.js            Tweaks 패널(accent/밀도/테마/스타일 방향)
└─ views/
   ├─ overview.js  projects.js  resources.js
   └─ board.js     timeline.js  risks.js

OpenProject 연동 점검.html   API v3 교차검증 리포트(필드 매핑·함정·배포)
```

> **CSS 구조:** `styles.css`는 토큰만 모은 `@import` 매니페스트(디자인 시스템 정본),
> 실제 컴포넌트 스타일은 `app.css`. 대시보드는 둘을 순서대로 링크한다. 색은 의미로만
> 사용 — 기본 회색, 색은 위험/상태에만(진행률 바는 중립 회색).

**데이터 흐름:** `OpenProject HAL+JSON → op-adapter.js(정규화) → window.DB(평탄 형태 + selectors) → views`
뷰는 `window.DB`의 평탄 형태만 소비합니다. 데이터 출처(목업/실 API)는 뷰와 무관합니다.

---

## 5. 데이터 계약 (Single Source of Truth) ★ 교차검증의 기준점

**이 섹션이 디자인↔코드 교차검증의 앵커입니다.** 필드명을 바꾸거나 아래 형태를 어기면
드리프트로 간주합니다. 전체 정의·selectors는 `data.js`, 매핑 규칙은 `op-adapter.js` 참조.

### WorkPackage (평탄 형태)
| 필드 | 타입 | 비고 |
|---|---|---|
| `id` | number | |
| `subject` | string | |
| `projectId` `typeId` `statusId` `priorityId` | number | 참조 ID |
| `assigneeId` `authorId` | number\|null | 미할당 시 null |
| `versionId` | number\|null | 스프린트 |
| `startDate` `dueDate` | string | `YYYY-MM-DD` |
| `estimatedHours` `spentHours` | **number(시간)** | ⚠ OP는 `"PT40H"` 기간문자열 — 반드시 파싱 |
| `percentDone` | number(0–100) | ⚠ OP 필드명은 `percentageDone` |
| `createdAt` `updatedAt` | string | `YYYY-MM-DD` |
| `closedAt` | string\|null | ⚠ OP 기본 필드 없음 — updatedAt 근사 |

### TimeEntry
`id` · `workPackageId` · `projectId` · `userId` · `activityId` · `hours`(**number**, OP는 `"PT5H"`) · `spentOn`(`YYYY-MM-DD`)

### User
`id` · `name` · `initials` · `role` · `title` · `color` · `capacityPerWeek`(⚠ OP에 원천 없음 — 외부 설정)

### Project / Version / Status / Type / Priority / Activity
`data.js` 상단 enum 및 PROJECT/VERSION 정의 참조. **실 연동 시 Status/Type/Priority는
하드코딩 금지 — 인스턴스에서 fetch해 동적 구성**(`op-adapter.js`가 처리).

### Selectors (뷰가 의존하는 계산 함수 — 시그니처 유지)
`kpis(wps)` · `statusDistribution(wps)` · `openCloseTrend(wps,weeks)` · `backlogTrend(wps,weeks)`
· `userUtilization()` · `projectHealth()` · `burndown(version)` · `activityBreakdown(entries)`
· `isOpen/isOverdue/dueWithin`

---

## 6. 실연동 절차 (권장 경로 A)

`OpenProject 연동 점검.html`에 상세 리포트가 있습니다. 요약:

1. **읽기 전용 API 키 발급** (전용 계정, `My account → Access token`)
2. **리버스 프록시 1블록** — Nginx에서 `/op → https://plm.abyz-lab.work/api/v3`,
   `Authorization: Basic base64(apikey:TOKEN)` 주입. **브라우저에 키를 두지 말 것**(CORS+보안).
3. **참조 데이터 동적 로딩** — statuses/types/priorities/activities fetch
4. **WP·time_entries 수집 + 시간 파싱 검증** — `op-adapter.js`의 `durationToHours()`,
   `fetchAll()` 페이지네이션 사용
5. **capacity 설정 입력 + closedAt 정책 결정**
6. **스왑** — `data.js`의 목업 생성부를 `OPAdapter.buildLiveDataset()`로 교체. 뷰는 무수정.

### ⚠ 반드시 처리할 함정 5 (점검 리포트 §3)
1. **CORS·API 키 노출**(치명) → 프록시 필수
2. **시간 = ISO8601 기간 문자열**(치명) → `"PT40H"→40` 파싱 필수
3. **spentTime/closedAt** 신뢰 어려움 → time_entries 합산 / updatedAt 근사
4. **가동률/가용량** OP에 원천 없음 → 기본 40h/주 + 관리자 설정
5. **상태·유형 인스턴스별 상이 + 페이지네이션** → 동적 fetch + offset 순회

---

## 7. Design Tokens

`styles.css`의 `:root` / `[data-theme]` 정의가 정본. 핵심만 발췌:

- **폰트:** `IBM Plex Sans KR`(본문·라벨), `IBM Plex Mono`(수치·코드)
- **상태색:** New `#8B93A7` · In progress `#3B82F6` · In review `#8B5CF6` ·
  In testing `#06B6D4` · On hold `#F59E0B` · Closed `#22C55E` · Rejected `#EF4444`
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
- **테마 토글:** 우상단 + Tweaks. dark/light 즉시 전환
- **Tweaks 패널:** 툴바에서 on/off(호스트 postMessage 프로토콜). accent·density·theme·style 변경
- **드릴다운:** Overview 콜아웃/테이블 행 클릭 → 해당 뷰로 이동(`data-nav`, `data-nav-project`)
- **필터:** Board 과제/담당자 select, Resources 정렬, Timeline 범위 select
- **툴팁:** `data-tip` 속성 → 단일 전역 툴팁(app.js)
- **차트:** 전부 인라인 SVG, hover 시 data-tip

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
