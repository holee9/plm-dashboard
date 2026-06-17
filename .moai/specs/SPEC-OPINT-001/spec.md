---
id: OPINT-001
version: 1.0.0
status: active
priority: high
issue: 1
---

# SPEC-OPINT-001: PLM 대시보드 실 OpenProject 연동

## 목적

PLM 대시보드를 목업(`window.DB`)에서 실 OpenProject API v3 연동으로 교체한다.

## 범위

### IN (구현 대상)

- `/op` same-origin 리버스 프록시 구성 (별도 nginx 구성)
- `op-adapter.js`의 `buildLiveDataset()` 실 API fetch·정규화
- 파생 필드 하이드레이션 (`_due/_created/_closed/_start/_end`, `memberIds` 등)
- 6개 뷰 실 데이터 렌더 + graceful 처리 (빈 versions, API 오류)

### OUT (변경 금지)

- 기존 `:8086` nginx 프록시 (`openproject-proxy-op-proxy-1`) 구성 변경
- 셀렉터 시그니처 리팩토링 (`kpis/statusDistribution/...` 형태 변경)
- status/type/priority 하드코딩 (반드시 동적 fetch)
- 신규 빌드 도구·프레임워크 도입
- 토큰 값을 클라이언트 번들·네트워크 응답·문서·로그에 기재

## 실 환경 정보

- **URL**: `plm.abyz-lab.work`
- **로컬 API 베이스**: `http://localhost:8086` (Host 헤더: `plm.abyz-lab.work`)
- **인증**: `Authorization: Basic base64(apikey:<TOKEN>)` — 토큰은 `~/.hermes/.env`의 `OP_API_KEY`
- **실 데이터 규모**: projects 11, work_packages 58, users 19, statuses 13, types 11, priorities 4

## 요구사항

### R1-R7: 동일 출처 인증 프록시 (이슈 #2)

- R1: `/op` 경로를 `https://plm.abyz-lab.work/api/v3`로 포워딩하는 nginx 구성
- R2: 프록시 계층에서 `Authorization: Basic` 헤더 주입 (클라이언트 비노출)
- R3: 대시보드 정적 파일 서빙과 `/op` API 프록시를 단일 nginx에 구성
- R4: 기존 `:8086` 프록시와 충돌하지 않는 포트 사용
- R5: CORS 이슈 없이 동일 출처 요청 처리
- R6: 프록시 구성 파일을 `nginx-secret*.conf` 패턴 외 경로에 저장 (gitignore 적용)
- R7: 프록시 기동 후 `/op/users/me` 200 OK 확인

### R8-R11: op-adapter 실 API fetch·정규화 (이슈 #3)

- R8: `USE_LIVE_API` 플래그(line 19) true 시 `/op/` 경로로 실 API 호출
- R9: `fetchAll()` — `offset`+`pageSize` 페이지네이션, `body.total`로 종료 판정
- R10: `durationToHours()` — ISO8601 기간 문자열 (`"PT40H"`, `"P1DT2H"`) 파싱, 8h/day 기준
- R11: `mapWorkPackage()` — HAL `_links.<rel>.href` 말미 id 추출, `window.DB` 구조로 정규화

### R12: 견고성 — graceful 처리 (이슈 #5)

- R12: API 오류 시 뷰 크래시 없이 빈 상태 또는 오류 메시지 표시

### R13-R15: 데이터 계약 보존·파생 필드 (이슈 #4)

- R13: 셀렉터 시그니처 유지 (`kpis`, `statusDistribution`, `userUtilization` 등)
- R14: `closedAt` — `status.isClosed` true 시 `updatedAt` 프록시 사용
- R15: `capacityPerWeek` 기본 40h, `role`은 memberships 조회, `title`은 커스텀 필드

### R16: API 오류 피드백 (이슈 #5)

- R16: 네트워크 오류·인증 실패 시 사용자에게 명확한 피드백 표시

### R17-R18: 선택 기능 (이슈 #6) — Optional

- R17: journals API로 `closedAt` 정확한 값 조회
- R18: capacity 오버라이드 UI (개발자별 주간 시간 조정)

### R19-R20: E2E 실증 게이트 (이슈 #7) [HARD]

- R19: 실 OP 인스턴스 대상 20개 E2E 체크리스트 전부 통과
- R20: 토큰 미노출 검증 (브라우저 DevTools 네트워크 탭 확인)

## HARD 금지사항

- 토큰 값 출력·기재 금지. 위치(`~/.hermes/.env`의 `OP_API_KEY`)로만 참조
- 목업/단위 테스트 통과만으로 "완료" 인정 금지 — R19 E2E 20개 전부 통과 필수
- 범위 OUT 항목 수정 금지. 경계 모호 시 사용자 확인 후 진행

## 완료 정의 (DoD)

- R1~R16 전부 충족
- R19-R20 E2E 체크리스트 20개 전부 통과
- 토큰 미노출 (AC-PROXY-02/AC-E2E-02)
- 6개 뷰 콘솔 에러 0
