# PLM Dashboard — 디렉터리 및 구조 (structure.md)

> 작성자: drake.lee
> 대상 프로젝트: plm-dashboard
> 문서 언어: 한국어 (코드 식별자/파일명/필드명은 영어 유지)

---

## 1. 디렉터리 트리

```
design_handoff_plm_dashboard/
├── PLM Dashboard.html        # 단일 진입점(SPA). 폰트 → CSS → 스크립트 순서 로드
├── data.js                   # window.DB — 목업 데이터(stable PRNG) + 전체 셀렉터 (데이터 계약 SSOT)
├── op-adapter.js             # OpenProject HAL+JSON → 평탄화 어댑터 (USE_LIVE_API 플래그)
├── app.js                    # 루트 컨트롤러 — state, applyChrome, renderShell, 렌더 디스패치, 이벤트 라우팅
├── ui.js                     # 공용 UI 헬퍼 — avatar, statusChip, healthChip, progressBar, panel, kpi 등
├── charts.js                 # 순수 인라인 SVG 차트 — donut, sparkline, lines/area, columns, hbars
├── tweaks.js                 # 실시간 테마 에디터 (postMessage 프로토콜)
├── styles.css                # 디자인 시스템 @import 매니페스트
├── app.css                   # 컴포넌트/레이아웃 CSS (약 22K)
├── fonts/
│   └── fonts.css             # IBM Plex 폰트 정의
├── tokens/                   # 디자인 토큰 (CSS 변수)
│   ├── colors.css            # 색상 팔레트
│   ├── themes.css            # 테마(dark/light) 변수
│   ├── typography.css        # 타이포그래피 스케일
│   ├── spacing.css           # 간격/밀도 변수
│   └── effects.css           # 그림자/모션 등 효과
└── views/                    # 6개 운영 뷰 (합계 약 670L)
    ├── overview.js           # 종합 판정, 건강도 분포, 지연 건수, 가동률, 추세
    ├── projects.js           # 프로젝트별 건강도 카드(탭)
    ├── resources.js          # 개발자별 부하/백로그/지연
    ├── board.js              # 상태별 칸반 + 필터
    ├── timeline.js           # 간트 + 번다운 + 마일스톤
    └── risks.js              # 지연/임박/과부하/과추정 알림
```

## 2. 핵심 파일 역할

- `PLM Dashboard.html`: 단일 진입점. 빌드 도구 없이 정적으로 폰트, 스타일, 스크립트를 순서대로 로드합니다.
- `data.js`: `window.DB`를 정의하며, 목업 데이터(재현 가능한 stable PRNG)와 전체 셀렉터를 보유한 데이터 계약의 SSOT입니다.
- `op-adapter.js`: OpenProject API v3의 HAL+JSON 응답을 `window.DB` 형태로 평탄화합니다. 주요 함수는 `durationToHours`(30-36), `mapWorkPackage`(115-139), `buildLiveDataset`(156-202), 그리고 페이지네이션을 처리하는 `fetchAll`입니다. `USE_LIVE_API` 플래그(line 19)로 목업/실 API를 전환합니다.
- `app.js`: 루트 컨트롤러. `state`(51-58) 객체를 관리하고 `applyChrome`, `renderShell`, 렌더 디스패치, 이벤트 라우팅을 담당합니다.
- `ui.js`: 공용 UI 헬퍼 모음 — `avatar`, `avatarStack`, `statusChip`, `healthChip`, `typeTag`, `priorityDot`, `progressBar`, `panel`, `kpi` 및 날짜 헬퍼.
- `charts.js`: 외부 라이브러리 없이 순수 SVG 문자열을 생성하는 차트 함수 모음.
- `tweaks.js`: 호스트와 `postMessage`로 통신하는 실시간 테마 에디터.

## 3. 모듈 관계

- `data.js`는 모든 뷰가 의존하는 데이터/셀렉터 계층입니다.
- `op-adapter.js`는 실 API 사용 시 `data.js`의 `window.DB` 구조를 동일하게 채워 뷰가 데이터 출처를 의식하지 않도록 합니다.
- `ui.js`와 `charts.js`는 뷰가 공유하는 표현 계층입니다.
- `views/*`는 데이터를 소비해 HTML 템플릿 문자열을 생성하고, `app.js`가 이를 DOM에 반영한 뒤 이벤트를 바인딩합니다.

## 4. 부트스트랩 로드 순서

`PLM Dashboard.html`에서 스크립트는 다음 순서로 로드됩니다. 이 순서는 의존성 때문에 변경하면 안 됩니다.

```
폰트(Google Fonts CDN) → styles.css → app.css
→ data.js → charts.js → ui.js → views/* → app.js → tweaks.js
```

- `data.js`가 먼저 로드되어 `window.DB`를 준비합니다.
- `charts.js`, `ui.js`가 표현 헬퍼를 등록합니다.
- `views/*`가 렌더 함수를 정의합니다.
- `app.js`가 모든 것을 묶어 최초 렌더와 이벤트 라우팅을 수행합니다.
- `tweaks.js`가 마지막에 테마 에디터를 연결합니다.

## 5. 데이터 흐름

```
OpenProject(실 API) 또는 목업
  → op-adapter.js (HAL+JSON 정규화)
  → window.DB
     (STATUSES / TYPES / PRIORITIES / USERS / PROJECTS / VERSIONS
      / WORK_PACKAGES / TIME_ENTRIES + 셀렉터)
  → 6개 뷰가 소비
  → HTML 템플릿 문자열 렌더
  → DOM
  → app.js 이벤트 바인딩
```

## 6. 상태 관리

상태와 라우팅은 외부 라이브러리 없이 직접 구현되어 있습니다.

- `app.js`의 `state` 객체가 현재 뷰, 필터, 선택 항목 등 런타임 상태를 보유합니다.
- 사용자 설정은 `localStorage`의 `plm_state` 키에 동기화되어 새로고침 후에도 유지됩니다.
- `plm_state`에 저장되는 대표 항목: 현재 활성 뷰, 테마(`data-theme`), 밀도(`data-density`), 스타일(`data-style`), 액센트 색상(`--accent`), 그리고 뷰별 필터 선택값.

## 7. 테마 시스템 (3차원 + 액센트)

테마는 HTML 속성과 CSS 변수의 조합으로 구성되며, `tweaks.js`에서 `postMessage`로 실시간 조정할 수 있습니다.

- 테마(`data-theme`): dark / light
- 밀도(`data-density`): compact / cozy / comfortable
- 스타일(`data-style`): telemetry / console / studio
- 액센트(`--accent`): blue / violet / teal / amber / rose

이 속성과 변수는 `tokens/` 디렉터리의 CSS 변수와 결합해 화면 전체 외관을 결정합니다.
