# PLM Dashboard

> 📘 **[abyz-lab 프로젝트 운영 방법론 플레이북 — 바로 보기 ↗](https://holee9.github.io/plm-dashboard/)**
> · 헌장 SSOT · SPEC-First DDD · 이슈 기반 이력 관리 · E2E 완료 게이트 — abyz-lab이 수립하고 적용한 프로젝트 운영 방법론

> OpenProject 인스턴스(`plm.abyz-lab.work`)의 work package 데이터를 실시간 집계하여
> **프로젝트 건강도 · 개발 자원 부하 · 위험 요소**를 한 화면에서 모니터링하는 운영 대시보드.

의존성 0의 **바닐라 JS no-build SPA**로, 데이터 계층(목업)을 실 OpenProject API v3로
교체하면 그대로 라이브 연동됩니다. 디자인↔코드 교차검증을 위한 **데이터 계약(SSOT)**을
중심에 두고 설계되었습니다.

---

## 빠른 접속 (운영 중)

대시보드 서버는 **raspi5p** (`192.168.100.50`)에서 상시 운영 중입니다.

### URL

```
http://plm-dash.work/
```

### 접속 전 1회 설정 — PC의 hosts 파일에 한 줄 추가

접속하는 PC가 연결된 망에 따라 아래 중 해당 줄을 추가합니다.

| 접속 망 | 추가할 내용 |
|---------|-----------|
| 사무실 2.5G (`192.168.100.x`) | `192.168.100.50  plm-dash.work` |
| 사무실 유선 (`10.20.6.x`) | `10.20.6.187  plm-dash.work` |
| Tailscale (원격) | `100.110.194.101  plm-dash.work` |

**Windows** — 메모장을 **관리자 권한**으로 열고 아래 파일 편집:
```
C:\Windows\System32\drivers\etc\hosts
```

**Mac / Linux:**
```bash
sudo nano /etc/hosts
```

저장 후 브라우저에서 `http://plm-dash.work/` 접속.

> hosts 파일은 1회만 설정하면 이후 자동으로 동작합니다.

### 프록시 재기동 (서버 재부팅 후)

```bash
# raspi5p에서 실행
cd ~/workspace/plm-dashboard/proxy
bash start.sh
```

---

## 1. 개요

PLM/프로젝트 조직은 다수의 활성 프로젝트와 개발 인원을 동시에 운영하면서, 각 프로젝트의
진척·지연·인원 과부하를 빠르게 파악해야 합니다. OpenProject 기본 화면만으로는 프로젝트
횡단 관점(전사 건강도, 자원 부하, 위험 알림)을 얻기 어렵습니다.

PLM Dashboard는 OpenProject API v3 데이터를 정규화한 뒤 **6개 운영 관점 뷰**로 재구성하여,
관리자가 의사결정에 필요한 신호(정상/주의/위험)를 즉시 얻도록 합니다.

- **대상 규모:** 활성 프로젝트 약 23개, 개발자 10명+, work package 다수
- **데이터 원천:** 실제 구축된 OpenProject 인스턴스 (샘플 데이터 없음, 페이지 로드 시 OP API에서 직접 조회)
- **대상 사용자:** PLM/프로젝트 관리자, 팀 리드, 개발 조직 운영 담당

---

## 2. 핵심 기능 (6개 뷰)

| 뷰 | 파일 | 핵심 내용 |
|----|------|-----------|
| **Overview** | `views/overview.js` | 종합 판정(정상/주의/위험) · KPI 스트립(드래그 편집) · **핵심현황**: 과제현황(col-6·스크롤) + 주의항목(col-3·스크롤) + 금주WP(col-3·스크롤) · **추세·분배**: Throughput + 상태 분포 + 팀 가동률 + 활동별 공수 |
| **Projects** | `views/projects.js` | 프로젝트별 건강도 카드(탭) — 진행률, 번다운, 팀 아바타, WP 테이블 |
| **Resources** | `views/resources.js` | 개발자별 부하 — 부하 %, 단기 잔여 시간, 백로그, 담당 프로젝트, 지연 WP |
| **Board** | `views/board.js` | 상태별 칸반(New → In Progress → Review → Testing → On Hold → Done), 프로젝트/담당자 필터 |
| **Timeline** | `views/timeline.js` | 간트 차트 + 스프린트 번다운, 마일스톤, WP 바, 기간 선택 |
| **Risks** | `views/risks.js` | KPI 스트립(OVERDUE·DUE SOON·UNASSIGNED·ON HOLD·OVER BUDGET·OVERLOADED 6종) · **매트릭스 패널**(2×2 impact×urgency, col-6) + 동반 패널(DUE SOON·방치 WP, col-6) · **Zone A(즉각 조치)**: 마감초과·미배정 WP · **Zone B(주의)**: OnHold·기한 없음 WP · **Zone C(방치·공수)**: 예산초과·과부하 WP |

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

## 6. 실행 방법

### 운영 환경 (현재 기동 중)

raspi5p에서 nginx Docker 프록시가 상시 실행 중입니다. 상단 **빠른 접속** 섹션을 참조하세요.

```
proxy/
├── docker-compose.yml          nginx:alpine 서비스 정의 (network_mode: host)
├── nginx/default.conf.template 포트 80/8088, /op/ → OP API v3 프록시
└── start.sh                    토큰 로드 + 컨테이너 기동 스크립트
```

프록시 구조:

```
브라우저 → http://plm-dash.work/          → nginx:80  → 정적 파일 서빙
브라우저 → http://plm-dash.work/op/*      → nginx:80  → plm.abyz-lab.work/api/v3/*
                                                          (Authorization 헤더 서버 측 주입)
```

API 키는 `~/.hermes/.env`의 `OP_API_KEY`에만 존재하며 브라우저에 노출되지 않습니다.

### 로컬 개발 / 목업 모드

빌드 없이 정적 서버로 실행합니다.

```bash
cd design_handoff_plm_dashboard
python3 -m http.server 8080
# http://localhost:8080/PLM%20Dashboard.html
```

`op-adapter.js`의 `USE_LIVE_API`를 `false`로 변경하면 목업 데이터로 동작합니다.

---

## 7. OpenProject 실연동 구조

실 연동은 완료되어 운영 중입니다 (`USE_LIVE_API = true`). 구조 요약:

| 파일 | 역할 |
|------|------|
| `proxy/nginx/default.conf.template` | `/op/` 경로를 OP API v3로 중계, 토큰 주입 |
| `design_handoff_plm_dashboard/op-adapter.js` | HAL+JSON → 평탄 형태 정규화 |
| `design_handoff_plm_dashboard/data.js` | `reload()` 함수로 실 데이터 수신 후 in-place 갱신 |

**주요 처리 사항:**

1. `/principals` 사용 (`/users`는 관리자 전용)
2. ISO8601 기간 파싱 — `"PT40H" → 40`, `"PT5H30M" → 5.5` (`durationToHours()`)
3. 페이지네이션 — `fetchAll()` offset 순회 (pageSize=200)
4. 오류 허용 fetch — `fetchSafe()` (404/권한 오류 시 `[]` 반환)
5. 파생 필드 — `_start/_due/_end` Date 객체, `memberIds`, `closedAt`(updatedAt 근사)
6. BOARD_COLS — 실 OP 상태 이름에서 카테고리 추론 (`buildBoardColsFromStatuses()`)
7. **사용자 한국어 이름** — `/principals`는 계정명만 반환(`drake.lee` 등). `op-adapter.js` 상단 `NAME_TABLE`로 성+이름 매핑
8. **퇴사자/잠금 계정 자동 제외** — 영구잠금 계정은 `_links.showUser` 부재로 감지(`isLocked`), `isBot=true`로 전환해 모든 뷰에서 자동 제외. 코드 변경 없이 OP 관리자 조작만으로 적용
9. **샘플 데이터 없음** — `USER_DEFS`/`PROJECT_DEFS` 빈 배열. 페이지 로드 즉시 OP 조회, 로딩 중 "로딩 중…" 표시
10. **🔄 새로고침 버튼** — 클릭 즉시 로딩 상태 전환 후 OP 전체 재조회. 업데이트 시각·새로고침 역할 차이는 버튼 툴팁으로 안내

상세 API 분석: `design_handoff_plm_dashboard/OpenProject 연동 점검.html`

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
| `proxy/README.md` | 프록시 운영 가이드 (기동·토큰 관리·E2E 검증) |
| `.moai/project/product.md` | 제품 개요 — 배경·사용자·기능 |
| `.moai/project/tech.md` | 기술 스택 및 운영 |
| `.moai/project/structure.md` | 디렉터리 및 구조 상세 |

핵심 파일: **`data.js`(계약)** · **`op-adapter.js`(매핑)** · **`proxy/start.sh`(기동)** · **`OpenProject 연동 점검.html`(연동 리포트)**
