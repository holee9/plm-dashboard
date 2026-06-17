# SPEC-OPINT-001 인수 기준

## AC-PROXY (R1-R7: 인증 프록시)

- AC-PROXY-01: `GET /op/users/me` → 200 OK, `name=abyz-lab` 응답
- AC-PROXY-02: 브라우저 DevTools 네트워크 탭에서 `Authorization` 헤더 미노출
- AC-PROXY-03: 기존 `:8086` 프록시 컨테이너 무변경 (`docker ps` 확인)
- AC-PROXY-04: 대시보드 HTML이 프록시와 동일 출처로 서빙됨

## AC-ADAPTER (R8-R11: op-adapter 정규화)

- AC-ADAPTER-01: `USE_LIVE_API = true` 시 실 API 데이터로 6개 뷰 렌더
- AC-ADAPTER-02: work_packages 58개 전부 로드 (페이지네이션 완전 처리)
- AC-ADAPTER-03: `estimatedHours` 값이 숫자 (ISO8601 파싱 완료)
- AC-ADAPTER-04: `projectId`, `statusId`, `typeId` 등 id 필드가 정수

## AC-CONTRACT (R13-R15: 데이터 계약)

- AC-CONTRACT-01: `kpis(wps)` 호출 시 오류 없이 KPI 객체 반환
- AC-CONTRACT-02: `statusDistribution(wps)` 호출 시 상태별 카운트 반환
- AC-CONTRACT-03: 완료 work package의 `closedAt` 값이 null이 아님 (updatedAt 프록시)
- AC-CONTRACT-04: `userUtilization()` 호출 시 개발자별 부하 % 반환

## AC-ROBUST (R12, R16: 견고성)

- AC-ROBUST-01: API 오류 시 콘솔 에러 없이 빈 상태 UI 표시
- AC-ROBUST-02: 빈 versions 배열 시 Timeline 뷰 크래시 없음
- AC-ROBUST-03: 인증 실패 시 사용자에게 오류 메시지 표시

## AC-E2E (R19-R20: E2E 실증) [HARD]

- AC-E2E-01: Overview 뷰 — 실 데이터 기반 종합 판정 표시
- AC-E2E-02: Projects 뷰 — 11개 프로젝트 탭 렌더 (빈 탭 없음)
- AC-E2E-03: Resources 뷰 — 19명 개발자 부하 표시
- AC-E2E-04: Board 뷰 — 58개 work package 칸반 배치
- AC-E2E-05: Timeline 뷰 — 간트 렌더 (versions 0개여도 크래시 없음)
- AC-E2E-06: Risks 뷰 — 지연/임박 항목 표시
- AC-E2E-07: 6개 뷰 모두 콘솔 에러 0
- AC-E2E-08: 브라우저 DevTools 네트워크에서 토큰 값 미노출
