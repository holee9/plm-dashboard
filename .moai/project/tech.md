# PLM Dashboard — 기술 스택 및 운영 (tech.md)

> 작성자: drake.lee
> 대상 프로젝트: plm-dashboard
> 문서 언어: 한국어 (코드 식별자/파일명/필드명은 영어 유지)

---

## 1. 기술 스택 개요

| 영역 | 선택 | 비고 |
|------|------|------|
| 언어 | JavaScript (ES5+, IIFE 모듈) | 모듈 시스템 없이 IIFE로 캡슐화 |
| 빌드 | 없음 (no-build) | 번들러/package.json 없음, 정적 SPA |
| 프레임워크 | 없음 (Vanilla JS) | 의존성 0 |
| CSS | CSS 변수 기반 디자인 토큰 | 테마/밀도/스타일/액센트 다차원 |
| 차트 | 인라인 SVG (`charts.js`) | 외부 차트 라이브러리 없음 |
| 폰트 | Google Fonts CDN | IBM Plex Sans KR(400/500/600/700), IBM Plex Mono |
| 상태/라우팅 | 직접 구현 | `app.js` state + `localStorage` |
| 데이터 원천 | OpenProject API v3 / 목업 | `op-adapter.js`로 정규화 |
| 브라우저 API | localStorage, fetch, postMessage, SVG DOM | `plm_state` 키 사용 |

## 2. no-build 정적 SPA 선택 근거

- 빌드 도구, 번들러, 의존성 없이 정적 파일만으로 동작하므로 어떤 정적 서버에서도 즉시 실행됩니다.
- 디자인 핸드오프 산출물로서 디자이너가 빌드 환경 없이 바로 열어 확인할 수 있습니다.
- 구현 템플릿으로서 개발자가 도구 체인 설정 부담 없이 코드를 그대로 확장할 수 있습니다.
- 의존성이 없어 공급망 위험과 버전 관리 부담이 최소화됩니다.

## 3. CSS 디자인 토큰 시스템

- `tokens/` 디렉터리에 색상, 테마, 타이포그래피, 간격, 효과를 CSS 변수로 분리합니다.
- 외관은 HTML 속성과 변수의 조합으로 결정됩니다.
  - 테마(`data-theme`): dark / light
  - 밀도(`data-density`): compact / cozy / comfortable
  - 스타일(`data-style`): telemetry / console / studio
  - 액센트(`--accent`): blue / violet / teal / amber / rose
- 한국어 본문은 `word-break: keep-all`로 자연스러운 줄바꿈을 유지합니다.

## 4. 차트 접근 (인라인 SVG)

외부 차트 라이브러리를 사용하지 않고 `charts.js`에서 순수 SVG 문자열을 생성합니다. 지원 차트 유형은 donut, sparkline, lines/area, columns, hbars입니다. 이 방식으로 의존성을 추가하지 않으면서 테마 변수와 일관된 시각화를 제공합니다.

## 5. 개발 및 실행 방법

빌드 단계가 없으므로 정적 파일을 서빙하는 것으로 실행됩니다.

- 임의의 정적 서버로 프로젝트 루트를 서빙한 뒤 `PLM Dashboard.html`을 엽니다.
  - 예: Python `http.server`, Node `http-server`, 또는 OpenProject 호스트의 정적 경로
- 파일을 직접 `file://`로 여는 방식은 fetch/CORS 제약으로 권장하지 않습니다. 항상 HTTP로 서빙하십시오.
- 실 API 연동 시에는 반드시 리버스 프록시를 경유해야 합니다(아래 7절 참조).

## 6. 실 OpenProject 환경

이 프로젝트의 연동 작업(API/어댑터)은 목업이 아니라 실제 구축된 OpenProject 인스턴스를 대상으로 수행합니다.

- URL: `plm.abyz-lab.work`
- 구축 위치: 현재 이 장비에 실제로 구축되어 있습니다.
- 계정: `abyz-lab` 계정으로 접속합니다.
- 접근 경로: 브라우저는 직접 OpenProject로 호출하지 않고 반드시 리버스 프록시를 경유합니다.
- 사전 접속 점검 [필수]: 연동 작업(API/어댑터)에 착수하기 전에, 실 OpenProject 인스턴스에 접속 가능한지를 먼저 확인해야 합니다. 접속이 불가능한 상태에서 연동 코드를 작성하는 것은 무의미하며, 완료로 간주할 수 없습니다.

### 6.1 검증된 연결 정보 (2026-06-16 점검 완료)

- 배포 형태: Docker. 컨테이너 `openproject-stack-openproject-1` (`openproject/openproject:17`), OP 컨테이너는 호스트 `:8085`로 노출(`OPENPROJECT_HOST__NAME=plm.abyz-lab.work`, `OPENPROJECT_HTTPS=true`).
- 공개 프록시: `openproject-proxy-op-proxy-1` (nginx, `network_mode: host`, `:8086`)이 Cloudflare Tunnel → OpenProject 트래픽을 중계하며 프로젝트 페이지에 칸반 사이드바를 `sub_filter`로 주입함. 단, 이 프록시는 API 인증 헤더를 주입하지 않음.
- 로컬 API 베이스: `http://localhost:8086`로 호출해야 함(올바른 `Host: plm.abyz-lab.work` 주입). `:8085` 직접 호출은 호스트 불일치로 `HTTP 400`.
- 인증: `Authorization: Basic base64(apikey:<TOKEN>)`. abyz-lab 사용자 토큰은 `~/.hermes/.env`의 `OP_API_KEY`에 보관(값은 문서에 기재하지 않음). `/api/v3/users/me` → `name=abyz-lab` 200 OK 확인.
- 실 데이터 규모(점검 시점): projects 11, work_packages 58, users(principals) 19, statuses 13, types 11, priorities 4, versions 0.
- 데이터 계약 실증 확인: `percentageDone`(정수), `spentTime`은 ISO8601 기간(`"PT0S"` 등 → `durationToHours()` 필요), `closedAt` 필드 부재(`updatedAt` 프록시 필요), 상태/유형/우선순위/담당자/프로젝트는 `_links.<rel>.href`의 말미 id로 해석(HAL). README §5 계약과 일치.

## 7. 리버스 프록시 설정 개요

API 키 노출과 CORS 문제를 막기 위해 브라우저는 동일 출처의 프록시 경로로만 호출합니다.

- 프록시 매핑: `/op` → `https://plm.abyz-lab.work/api/v3`
- 인증: 프록시 계층에서 `Authorization: Basic` 헤더를 주입합니다. API 키는 절대 클라이언트 코드에 노출하지 않습니다.
- `op-adapter.js`의 `USE_LIVE_API` 플래그(line 19)를 켜면 프록시 경로를 통해 실 데이터를 가져옵니다.
- [미구축] 현재 장비의 `openproject-proxy`(`:8086`)는 공개 트래픽 중계 + HTML 주입 전용으로, **API 인증 헤더를 주입하지 않습니다.** 대시보드용으로는 `/op` 경로에서 `Authorization: Basic`을 주입해 `api/v3`로 포워딩하는 **별도의 동일 출처 프록시가 추가로 필요**합니다(대시보드 정적 파일 서빙 + `/op` API 프록시를 한 nginx에 구성하는 방식 권장).

## 8. 데이터 계약 핵심

데이터 계약은 README §5를 단일 기준(SSOT)으로 합니다. OP는 OpenProject 원본 필드를 의미합니다.

- WorkPackage: `id`, `subject`, `projectId`, `typeId`, `statusId`, `priorityId`, `assigneeId`, `authorId`, `versionId`, `startDate`, `dueDate`, `estimatedHours`(OP: `"PT40H"`), `spentHours`, `percentDone`(OP: `percentageDone`), `createdAt`, `updatedAt`, `closedAt`
- TimeEntry: `id`, `workPackageId`, `projectId`, `userId`, `activityId`, `hours`(OP: ISO8601 duration), `spentOn`
- User: `id`, `name`, `initials`, `role`, `title`, `color`, `capacityPerWeek`(OP 무출처, 기본 40h)
- 참조 데이터: Status / Type / Priority / Activity / Project / Version — OP 엔드포인트에서 동적 fetch
- 셀렉터 시그니처 (리팩토링 금지):
  - `kpis(wps)`, `statusDistribution(wps)`, `openCloseTrend(wps, weeks)`, `backlogTrend(wps, weeks)`
  - `userUtilization()`, `projectHealth()`, `burndown(version)`, `activityBreakdown(entries)`
  - `isOpen(wp)`, `isOverdue(wp)`, `dueWithin(wp, days)`

## 9. 연동 시 5가지 핵심 주의점 (README §6)

1. CORS / API 키 노출: 직접 호출 금지. 반드시 리버스 프록시(`/op` → `https://plm.abyz-lab.work/api/v3`)를 경유하고 `Authorization: Basic`을 프록시에서 주입합니다.
2. 시간 형식: OP의 시간은 ISO8601 기간 문자열(`"PT40H"`, `"PT5H30M"`, `"P1DT2H"`)입니다. `durationToHours()`로 파싱하며 8h/day 기준을 적용합니다.
3. spentTime / closedAt 불안정: `spentTime`은 `time_entries` 집계로 계산하고, `closedAt`은 `status.isClosed`일 때 `updatedAt`을 프록시 값으로 사용합니다.
4. capacityPerWeek / role / title 무출처: OP에 직접 출처가 없으므로 `capacityPerWeek`는 기본 40h, `role`은 memberships 조회, `title`은 커스텀 필드로 보완합니다.
5. status / type / priority / activity 인스턴스 종속: 인스턴스마다 다르므로 하드코딩하지 말고 항상 동적 fetch합니다. 페이지네이션은 `offset` + `pageSize`(OP는 약 200 cap)로 처리하며 `body.total`로 종료를 판정합니다.

## 10. 완료 정의 (Definition of Done) [HARD]

[HARD] 실 OpenProject 인스턴스를 대상으로 한 E2E 실증 테스트 없이는 어떤 작업도 "완료"로 처리할 수 없습니다.

- 다음만으로는 완료가 아닙니다: 단위 테스트 통과, 코드 작성 완료, 로컬 목업에서의 동작 확인.
- 완료로 인정되는 조건: 실 API 연동 → 데이터 흐름(`op-adapter.js` 정규화 → `window.DB`) → 뷰 렌더링까지, 실제 환경에서 end-to-end로 검증되어야 합니다.
- 연동 작업 착수 전 실 OP 접속 가능 여부를 먼저 확인하고(6절), 작업 종료 시 실 환경 E2E 검증 결과를 근거로만 완료를 선언합니다.
