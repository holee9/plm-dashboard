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

`plm-dash.work`는 공용 DNS에 등록된 이름이 아니라(조회 결과 존재하지 않음) PC의 hosts 파일에 한 줄을 넣어야 열립니다. 아래 BAT 파일이 이 설정을 자동으로 합니다. 설정하지 않은 PC에서도 서버 IP 주소로는 바로 접속됩니다.

### Windows PC에서 접속 — 파일 하나만 실행

아무것도 설정하지 않은 PC에서 `add-plm-dash-hosts.bat` 파일 하나만 더블클릭하면 됩니다. 메일로 받은 파일을 아무 폴더에 저장해 실행해도 되고, 다른 파일이나 저장소는 필요 없습니다.

1. 관리자 권한 확인 창이 뜨면 「예」를 누릅니다.
2. 아래 세 주소를 순서대로 2초씩 확인해 응답하는 서버를 고릅니다.
3. 그 서버 IP를 hosts 파일에 `plm-dash.work`로 등록합니다. 기존 `plm-dash.work` 줄은 교체되고, 변경 전 hosts는 `%TEMP%\hosts.plm-dash.backup`에 백업됩니다.
4. 이름이 실제로 그 IP로 풀리는지 확인한 뒤 `http://plm-dash.work/`를 엽니다.

- 실패하면 화면에 `[FAILED]` 또는 `[WARNING]`과 이유가 나오고, 대신 IP 주소로 열어 줍니다.
- Windows 10 (1803 이후) 또는 11이 필요합니다. `curl.exe`가 없으면 번호 메뉴로 망을 직접 고릅니다.
- 접속하는 망이 바뀌면(사무실과 Tailscale) hosts의 IP가 달라야 하므로 BAT를 다시 실행합니다.

| 접속 망 | 서버 IP | hosts에 들어가는 줄 |
|---------|---------|---------------------|
| 사무실 2.5G (`192.168.100.x`) | `192.168.100.50` | `192.168.100.50  plm-dash.work` |
| 사무실 유선 (`10.20.6.x`) | `10.20.6.187` | `10.20.6.187  plm-dash.work` |
| Tailscale (원격) | `100.110.194.101` | `100.110.194.101  plm-dash.work` |

**수동 설정:** 메모장을 **관리자 권한**으로 열고 `C:\Windows\System32\drivers\etc\hosts` 맨 아래에 위 표의 해당 줄을 추가한 뒤 저장합니다.

**IP로 직접 접속:** hosts 설정 없이 `http://192.168.100.50/` 처럼 위 표의 서버 IP를 브라우저에 입력해도 같은 화면이 열립니다.

### 프록시 재기동 (서버 재부팅 후)

```bash
# raspi5p에서 실행
cd ~/workspace/plm-dashboard/proxy
bash start.sh
```

> **주의**: 설정 변경(nginx conf, docker-compose) 후에는 반드시 위 `start.sh`로 재기동할 것. `docker compose restart`를 직접 실행하면 `OP_AUTH_B64`가 셸 환경변수에 없어 빈 값으로 재기동되어 OP 연동이 끊긴다 — `nginx:alpine`의 entrypoint가 재시작 때마다 `default.conf.template`을 현재 셸 환경으로 다시 `envsubst`하기 때문이다.

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

## 2. 핵심 기능

### 현재 메뉴 (2026-10-08, #94·#98)

메뉴는 정확히 두 화면이다. 옛 DR 사업본부 현황·실행 현황·인허가 현황·목표(OKR)·운영 규율 화면은 2026-10-08 제거했다(#98).

| 화면 | 파일 | 내용 |
|----|------|------|
| **대시보드** (첫 화면) | `views/home.js` | 한 화면, 위에서 아래로: 입력 신뢰도 한 줄 → Q1–Q5 띠 → 제품군별 상태·왜·이번 주 결정(행 클릭 시 과제·일감) → 주간 흐름(제품군별 한 표: 지난주 완료 · 지난주에서 이어짐 · 이번 주 신규 · 이번 주 마감 · 결정 필요(결정됨 표시), 숫자를 누르면 일감 목록. 주 기준은 목요일 주간 리뷰 실행 시각, 분류는 Hermes `op_weekly_flow.py` → `data/weekly.json`, #101) → 인허가(열린 요청·검토 지연·90일 안 의무, 「상세 펼치기」로 같은 자리에서 제품군 → 시리즈 → 모델 매트릭스·회사 허가·인증·갱신 의무·요청 목록, #96). 별도 인허가 화면으로 가는 링크는 없다. 규칙과 숫자는 `exec-core.js`의 `ExecCore`, 인허가 표는 `ra-panels.js`의 `RAPanels`를 쓴다(옛 현황·인허가 화면의 규칙을 그대로 옮긴 모듈, #98). 입력은 전부 OP |
| **목표·마일스톤 로드맵** | `views/roadmap.js` | 제품군별 마일스톤 타임라인, 첫 계획 대비 현재, OKR 연결 |

첫 화면의 모든 숫자는 Hermes 30분 스냅숏 하나(`health.json`·`insights.json`·`weekly.json`·`ra.json`)를 기준으로 하고 생성 시각을 상단에 한 번 표시한다(#99, 지표 정의서 §9). 합격 조건과 사용 검증 기록은 이슈 #94·#96·#98·#99·#100·#101.

주간 흐름의 「지난주 계획 중 완료」 비율은 분모가 지난 주간 리뷰 실행 때 저장한 「이번 주 마감」 일감 목록(`~/.hermes/state/weekly_flow/plan-<날짜>.json`의 `ids`)이고, 분자는 그 목록 중 그 뒤에 닫힌 일감 수다. 저장한 계획이 없는 첫 주에는 비율을 표시하지 않는다(`op_weekly_flow.py`의 `plan()`).

### 보류 현황 (#112)

OP 상태 On Hold(보류)는 일부러 멈춘 일감이라 지표로 관리하지 않고, 첫 화면 「주간 흐름」 아래 「보류 현황」에 따로 보여준다.

- **목록**: 제품군별 건수와 일감 목록(번호 링크, 제목, 과제, 담당자 또는 「담당자 없음」, 보류 일수). 색 판정이 없다. 「주요 과제 선택」에 따른다. 닫힌 상태(Won't Fix 등)는 넣지 않는다. 데이터는 `health.json` 항목 중 상태가 On Hold인 것이다.
- **지표에서 빠지는 것**: 신호등과 「왜」, 「이번 주 결정」, Q2, 열린 일감 수와 마감 지남 수(「이 숫자의 바탕」, 메뉴 배지 포함), 제품군 상세의 상태 분포·오래 끈 진행, 주간 흐름. 「이 숫자의 바탕」에는 「(보류 N건 제외)」가 붙는다.
- **Q2 결정 지연의 새 정의**: 보류 장기화가 빠지면서 Q2는 「결정 필요」 건수(마감 지남, 마감 후 갱신 없음, 이슈 분류 지연)와 최장 지연 일수, 담당자 없는 결정으로 바뀌었다. 최장 30일 초과면 🔴, 1건 이상이면 🟡, 없으면 🟢이다.
- **함께 바꾸는 곳**: Hermes(`abyz-lab-pm`의 `scripts/hermes`)가 보류에 `blocked` 표지만 붙이고 열린 일감 집계에서 뺀다. 자세한 규칙은 지표 정의서 §10이다. **반영 순서는 Hermes가 먼저, 대시보드가 나중이다.** 대시보드만 먼저 올리면 보류가 아직 열린 일감 수와 마감 지남 수에 섞여 있다. 이 경우에도 화면은 보류를 결정 목록과 Q2에서 걸러 내고, 「(보류 N건 제외)」 문구는 Hermes가 `on_hold`를 쓰기 시작한 뒤에만 표시한다.

### 주요 과제 선택 (#110)

관리하려는 주요 과제만 골라서 첫 화면에 보이게 하는 기능이다. 「제품군별 상태」 위의 「주요 과제 선택 ▸」 버튼으로 연다.

- **저장 위치**: 서버의 파일 하나 `data/config/tracked-projects.json`. 이 화면을 여는 모든 사람이 같은 선택을 본다(브라우저별 저장이 아니다). 형식은 `{"version":1,"excluded":["HVR"],"updated_at":"..."}`이며, **제외한 과제의 식별자 목록**이다.
- **처음 값**: 파일이 없으면 아무것도 제외하지 않는다(전체 표시). 목록에 없는 새 과제는 자동으로 포함된다.
- **적용 범위**: 제품군 표, 맨 위 요약 줄(Q1·Q2), 신호등, 「이 숫자의 바탕」, 「주간 흐름」, 메뉴의 마감 지남 배지가 같은 선택으로 계산된다. 선택한 과제가 하나도 없는 제품군은 표에서 사라진다. 제품군에 속하지 않은 프로젝트는 선택 대상이 아니며 항상 포함된다.
- **주간 흐름의 계산 위치**: Hermes는 지금처럼 전체 과제를 분류해 `weekly.json`에 쓰고, 화면이 선택에 맞게 항목을 걸러 합계를 다시 센다. Hermes가 선택 파일을 읽어 미리 거르는 방식과 비교한 결과, 일감 번호 목록과 합계가 77개 제외 조합에서 모두 같았다(이슈 #110 코멘트). 차이는 두 가지다. 지난주 계획 대비 완료율은 Hermes가 전체 과제로 계산하므로 화면에서 다시 셀 수 없어 제외 중에는 표시하지 않고, 과제가 모두 제외된 제품군의 빈 행은 화면에서 숨긴다(Hermes 쪽에서 거르면 빈 행으로 남는다).
- **적용되지 않는 것**: Q3(분기 목표), Q5(OP 참여도), 인허가 블록, 「목표·마일스톤 로드맵」 화면(표의 「로드맵에서 보기」 버튼이 여는 화면 포함)은 전체 기준 그대로다. 「주간 흐름」의 지난주 계획 대비 완료율은 Hermes가 전체 과제로 계산하므로, 과제를 제외한 동안에는 표시하지 않는다. 「이 숫자의 바탕」의 「7일 내 갱신」과 「갱신률 50% 아래」 문구도 과제별 값이 없어 전체 기준 그대로다.
- **안전 장치**: 파일이 깨졌거나 읽을 수 없으면 전체 과제를 보여 주고 화면에 경고를 표시한다. 모든 과제를 제외하는 저장은 화면이 거부한다. **서버도 저장 요청을 검사한다**: JSON이 아니거나 형식이 맞지 않으면 400과 이유를 돌려주고 기존 파일은 건드리지 않는다(검사 규칙은 `proxy/nginx/tracked.js`, 시험은 `proxy/e2e-tracked-save.sh`).
- **알려진 한계**: 두 사람이 동시에 저장하면 나중 저장이 이긴다(충돌 감지 없음). 다른 브라우저는 새로 고침해야 바뀐 선택이 보인다. 이름이 같은 프로젝트가 있거나 프로젝트 목록(`project_status`)에 없는 프로젝트는 일부 숫자(마감 지남 등)가 선택에 맞게 줄지 않을 수 있다.
- **쓰기 권한**: 로그인이 없으므로 내부망 접속자는 누구나 바꿀 수 있다. 서버는 이 파일 하나에만, `/op/`와 같은 내부망 허용 목록에서만 PUT을 받는다(`proxy/README.md`). 변경 시각은 서버가 찍으므로 화면의 「마지막 변경」을 클라이언트가 속일 수 없다.

### 메뉴에 없는 보조 뷰 (코드만 남음, 키로만 열림)

| 뷰 | 파일 | 핵심 내용 |
|----|------|-----------|
| **Overview** | `views/overview.js` | 종합 판정(정상/주의/위험) · KPI 스트립(드래그 편집) · **핵심현황**: 과제현황(col-6·스크롤) + 주의항목(col-3·스크롤) + 금주WP(col-3·스크롤) · **추세·분배**: Throughput + 상태 분포 + 팀 가동률 + 활동별 공수 |
| **Projects** | `views/projects.js` | 프로젝트별 상세 — 8:5 주/보조 그리드, 진행률 헤더, 편집 안전 KPI 레일, 팀/상태, WP 테이블 우선 배치 |
| **Resources** | `views/resources.js` | 리소스 입력 신뢰도 — Assignment/Estimate/Due Date 커버리지, OP 입력 유도, 인원별 일정 압박, 보조 Load |
| **Board** | `views/board.js` | 상태별 칸반(New → In Progress → Review → Testing → On Hold → Done), 프로젝트/담당자 필터 |
| **Timeline** | `views/timeline.js` | 간트 차트 + 마일스톤 marker, 선택 프로젝트 drilldown, 일정 점검(Schedule Inspection), 기간 선택 |
| **Risks** | `views/risks.js` | KPI 스트립(OVERDUE·DUE SOON·UNASSIGNED·ON HOLD·OVER BUDGET·OVERLOADED 6종) · **과제별 리스크 건수 표**(지연·임박·미배정·보류·마감미설정·방치, col-6) + 동반 패널(DUE SOON·방치 WP, col-6) · **Zone A(즉각 조치)**: 마감초과·미배정 WP · **Zone B(주의)**: OnHold·기한 없음 WP · **Zone C(방치·공수)**: 예산초과·과부하 WP |

### 대시보드 대상 데이터

현재 운영 OP 실측(2026-06-20): 대시보드 대상 프로젝트 26개, 전체 WP 374건입니다.
`DR 사업본부 주관 미팅` 유형과 `인프라 구축` 프로젝트는 운영 의도상 대시보드 집계 대상이
아니므로 `op-adapter.js`에서 `DB.PROJECTS`/`DB.WORK_PACKAGES` 진입 전에 제외합니다.

### Resources 운영 설계 기준

Resources는 "누가 과부하인가"를 단정하기 전에 OP 입력이 리소스 판단에 충분한지 먼저 보여줍니다.
현재 운영 OP는 Estimated time 입력률이 낮아 Load/Overloaded/Underutilized를 1차 판단 지표로 쓰면
업무량이 과소 표시됩니다.

현재 운영 OP 실측(2026-06-20):
- 활성 인원 11명, Open WP 194건
- Assignee 입력 108건(56%), 미배정 86건
- Estimated time 입력 4건(2%), 미입력 190건
- Due date 입력 145건(75%), 미입력 49건
- Time entries 0건, capacity override 4/11명

Resources는 네 영역으로 고정합니다.
- **Data Readiness:** Assignment/Estimate/Due Date/21D/Capacity 커버리지와 Load confidence
- **Capacity Signal:** 21일 내 estimated hours ÷ capacity. Estimate 입력률이 낮으면 보조 지표
- **Person Pressure:** 지연, 7일/21일 내 마감, 입력 누락을 합산한 인원별 점검 표
- **Input Actions:** OP 기존 필드(Assignee, Estimated time, Due date, Time entries)의 누락 입력 유도

레이아웃은 Projects와 같은 황금비 근사 `8fr / 5fr`를 사용합니다. 1440px 실측 기준
컬럼 721:451=1.600, 상단/하단 패널 높이 오차 0px로 검증했습니다(`AC-UX-19`).

### Timeline 운영 설계 기준

Timeline은 일정 전용 창입니다. Projects/Risks/Resources에 이미 있는 담당자, 가동률,
지연 상세 목록을 반복하지 않고, 간트에서 바로 판단해야 하는 일정 신호만 보여줍니다.

현재 운영 OP 실측(2026-06-20):
- `/versions`: 0건, WP `versionId` 연결 0건 → `Active Sprints`/번다운 섹션 미사용
- 날짜 있는 마일스톤: 22건 → 간트 diamond marker와 Project Milestones 패널에 표시
- Open WP: 194건, 7일 내 마감 18건, 14일 내 마감 28건
- Open non-milestone WP: 172건, Schedule Coverage 84%
- 시작일 없음 1건, 마감일 없음 27건, 시작/마감 둘 다 없음 1건
- 60일 초과 장기 span 27건
- OP `relations`: 28건, 그중 `follows` 3건 → critical path 계산 없이 의존성 참고 수치로만 표시

Timeline 하단은 두 패널로 고정합니다.
- **Project Milestones:** 선택 범위의 마일스톤명, `MM.DD`, 상태, D-day만 표시
- **Schedule Inspection:** 일정 커버리지, Due 7D/14D, Missing Due, Long Span, Deps 요약

All Projects 간트에서 프로젝트 행을 클릭하면 Projects 탭으로 이동하지 않고 Timeline 내부
프로젝트 scope로 전환됩니다. 하단 두 패널도 같은 scope로 재계산됩니다.

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
├── user-overrides.js       공개 운영 메타데이터 — 사용자별 capacityPerWeek override
├── op-adapter.js           ★ OpenProject HAL+JSON → data.js 형태 정규화 어댑터
├── charts.js               의존성 없는 SVG 차트(donut/line/columns/hbars/sparkline)
├── ui.js                   공통 UI 헬퍼(avatar/statusChip/health/panel/kpi)
├── app.js                  상태·탭 라우팅·테마·렌더 디스패치·툴팁
├── tweaks.js               Tweaks 패널(accent/밀도/테마/스타일 방향, postMessage)
├── exec-core.js            ★ 첫 화면 규칙(제품군 상태·왜·결정, Q 띠) — health.json·insights.json 기반 (#98)
├── ra-panels.js            ★ 인허가 표(제품군→시리즈→모델 매트릭스·회사 허가·인증·의무·요청) — ra.json 기반 (#98)
└── views/                  home(대시보드) · roadmap · 보조: overview · projects · resources · board · timeline · risks · people

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
| `versionId` | number\|null | OP Version 연결. 현재 운영 OP는 0건이므로 Timeline 핵심 섹션에는 사용하지 않음 |
| `startDate` `dueDate` | string\|null | 유효한 `YYYY-MM-DD`, 누락/잘못된 날짜는 null |
| `estimatedHours` `spentHours` | **number(시간)** | ⚠ OP는 `"PT40H"` 기간 문자열 — 반드시 파싱 |
| `percentDone` | number(0–100) | ⚠ OP 필드명은 `percentageDone` |
| `createdAt` `updatedAt` | string | `YYYY-MM-DD` |
| `closedAt` `closedAtSource` | string\|null / string\|null | ⚠ OP 기본 필드 없음 — `/work_packages/{id}/activities`에서 닫힘 상태 전환 시각을 계산하고, 불가 시 `updatedAt` fallback |

- **TimeEntry:** `id` · `workPackageId` · `projectId` · `userId` · `activityId` · `hours`(number, OP는 `"PT5H"`) · `spentOn`
- **Relation:** `id` · `type`(`follows` 등) · `fromId` · `toId` · `delay`. Timeline Schedule Inspection은 `follows` 건수를 의존성 참고 신호로만 사용한다.
- **User:** `id` · `name` · `initials` · `role` · `title` · `color` · `capacityPerWeek` · `capacityOverride`(⚠ OP에 원천 없음 — `user-overrides.js` 공개 운영 메타데이터)
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

### 향후 배포 후보: 릴리즈 이미지형 Docker 배포

현재 운영 방식은 `nginx:alpine` 컨테이너가 로컬 워크트리의
`design_handoff_plm_dashboard/`를 bind mount로 읽는 **운영형 Docker 프록시**입니다.
이 방식은 서버에서 즉시 반영하기 쉽지만, 릴리즈 산출물을 이미지로 고정하지는 않습니다.

향후 별도 기획 시에는 `Dockerfile`로 대시보드 정적 파일과 nginx 설정을 이미지에 포함하고,
`OP_API_KEY`/`OP_AUTH_B64` 같은 인증 값은 런타임 환경변수로만 주입하는
**릴리즈 이미지형 컨테이너 배포**를 검토합니다. 이 작업은 아직 구현하지 않았으며,
기획 메모는 [Docker 컨테이너 배포 후보 메모](docs/docker-containerization-note.md)에 남겨둡니다.

### 로컬 개발 / 목업 모드

빌드 없이 정적 서버로 실행합니다.

```bash
cd design_handoff_plm_dashboard
python3 -m http.server 8080
# http://localhost:8080/PLM%20Dashboard.html
```

`op-adapter.js`의 `USE_LIVE_API`를 `false`로 변경하면 목업 데이터로 동작합니다.

### 다른 PC에서 로컬 라이브 실행

저장소의 파일을 직접 실행하려면 Python 3.8 이상과 운영 프록시에 도달할 수 있는 사내망 또는
Tailscale 연결이 필요합니다. Docker, Node.js, OpenProject API 토큰은 필요하지 않습니다.

**Windows:**

```bat
scripts\run-local-dashboard.bat
```

**Mac / Linux:**

```bash
chmod +x scripts/run-local-dashboard.sh
./scripts/run-local-dashboard.sh
```

스크립트는 현재 망을 감지해 운영 프록시를 선택하고 `http://127.0.0.1:8080/`을 엽니다.
터미널을 닫거나 `Ctrl+C`를 누르면 종료됩니다. 직접 지정하려면 실행 전에
`PLM_DASHBOARD_UPSTREAM` 또는 `PLM_DASHBOARD_PORT` 환경변수를 설정합니다.

### macOS 로그인 자동 실행

Tailscale로 운영 프록시(`100.110.194.101`)에 접근할 수 있는 macOS에서는 로컬 정적 파일과
실데이터를 함께 확인할 수 있습니다. 다음 명령은 로그인 시 자동 실행되는 LaunchAgent를
설치하며, 서비스는 루프백 주소에만 바인딩됩니다.

```bash
./scripts/local-macos-service.sh install
open http://127.0.0.1:8080/
```

상태 확인과 제거:

```bash
./scripts/local-macos-service.sh status
./scripts/local-macos-service.sh uninstall
```

다른 운영 프록시나 포트를 사용하려면 설치 전에 `PLM_DASHBOARD_UPSTREAM` 또는
`PLM_DASHBOARD_PORT`를 지정합니다. LaunchAgent 로그는
`~/Library/Logs/plm-dashboard/`에 저장됩니다.

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
5. 파생 필드 — `_start/_due/_end` Date 객체, `memberIds`, `closedAt`(activities/journals 우선, `updatedAt` fallback)
6. BOARD_COLS — 실 OP 상태 이름에서 카테고리 추론 (`buildBoardColsFromStatuses()`)
7. **사용자 한국어 이름** — `/principals`는 계정명만 반환(`drake.lee` 등). `op-adapter.js` 상단 `NAME_TABLE`로 성+이름 매핑
8. **퇴사자/잠금 계정 자동 제외** — 영구잠금 계정은 `_links.showUser` 부재로 감지(`isLocked`), `isBot=true`로 전환해 모든 뷰에서 자동 제외. 코드 변경 없이 OP 관리자 조작만으로 적용
9. **샘플 데이터 없음** — `USER_DEFS`/`PROJECT_DEFS` 빈 배열. 페이지 로드 즉시 OP 조회, 로딩 중 "로딩 중…" 표시
10. **🔄 수동 새로고침 버튼** — 자동 폴링 없이 사용자가 명시적으로 갱신. 클릭 시 기존 데이터 화면은 유지한 채 OP 전체를 백그라운드 재조회하고, 버튼 문구가 `새로고침 → 갱신 중... → 갱신 완료 HH:mm:ss` 또는 `갱신 실패`로 바뀜. 갱신 중에는 버튼을 비활성화해 중복 요청 방지 (#40)
11. **업데이트 시각 칩** — 데이터셋을 성공적으로 수신·적용한 시각(`DB.lastReceivedAt`) 표시 전용. 메뉴/테마 변경·갱신 실패 시 유지하고, 실제 재조회 성공 시에만 변경 (#60).
12. **#6 optional 완료** — 닫힌 WP는 `/work_packages/{id}/activities` 상태 변경 이력에서 `closedAtSource="activities"`를 우선 계산하고, 사용자 주간 가용량은 `user-overrides.js`의 `capacityPerWeek`를 반영. `AC-OPTIONAL-01/02`로 E2E 검증
13. **`/op/` 접근 제어 (#54)** — 프록시 자체에는 인증이 없어 도달 가능한 누구나 주입된 OP 자격증명을 쓸 수 있었던 문제를 보완: LAN(`192.168.100.0/24`, `10.20.6.0/24`)·Tailscale(`100.64.0.0/10`)·localhost만 `allow`, 나머지 `deny`. 대시보드는 GET만 사용하므로 `limit_except GET { deny all; }`로 쓰기 메서드 차단

### OpenProject 통합 생태계 내 위치 (2026-07-01 연동 점검)

plm-dashboard는 OpenProject API의 **읽기 전용 소비자 중 하나**이며, 같은 OP 인스턴스를 아래 다른 시스템들도 각자의 방식으로 호출합니다(별도 저장소):

```
plm-dashboard  ──/op/ 프록시(GET만, LAN·Tailscale 제한)──┐
forms-stack    ──/api/projects 프록시 + n8n webhook──────┼──> OpenProject API (nginx :8086)
n8n-stack      ──여러 워크플로우(이슈 등록/조회/RA 분석)───┘
```

이번 점검에서 다른 저장소(openproject-stack, forms-stack, n8n-stack)의 보안 점검 중 하나의 OP API 토큰이 **plm-dashboard가 모르는 사이에 forms-stack의 nginx 설정에도 동일하게 하드코딩**되어 있던 것이 발견되어, 토큰 폐기 작업이 다른 시스템(forms.abyz-lab.work)에 실제 장애를 일으킨 사례가 있었습니다. plm-dashboard 자체의 `/op/` 프록시는 이번 점검에서 이 문제와 무관함을 확인했지만, **OP API 토큰을 공유하는 여러 소비자가 있다는 점**은 향후 토큰 로테이션 시 항상 염두에 둬야 합니다.

전체 통합 아키텍처 다이어그램은 `openproject-stack/README.md`의 "통합 아키텍처 전체 지도" 섹션 참고.

상세 API 분석: `design_handoff_plm_dashboard/OpenProject 연동 점검.html`

---

## 8. 디자인 토큰

`styles.css`가 가져오는 `tokens/*.css`의 `:root` / `[data-theme]` 정의가 정본. 외관은 HTML 속성 조합으로 결정:

- **테마**(`data-theme`): dark / light
- **밀도**(`data-density`): compact / cozy / comfortable
- **스타일**(`data-style`): telemetry(r=8) / console(r=3, 각진) / studio(r=16, 그림자)
- **액센트**(`--accent`): blue / violet / teal / amber / rose (Tweaks 패널에서 전환)
- **라이브 상태색:** OP `/statuses`의 색을 검증해 사용하며, 유효하지 않으면 `#8B93A7`로 대체. `tokens/colors.css`의 공통 시맨틱 팔레트와 구분한다.
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
| `docs/docker-containerization-note.md` | 향후 릴리즈 이미지형 Docker 배포 후보 메모 |
| `.moai/project/product.md` | 제품 개요 — 배경·사용자·기능 |
| `.moai/project/tech.md` | 기술 스택 및 운영 |
| `.moai/project/structure.md` | 디렉터리 및 구조 상세 |

핵심 파일: **`data.js`(계약)** · **`op-adapter.js`(매핑)** · **`proxy/start.sh`(기동)** · **`OpenProject 연동 점검.html`(연동 리포트)**
