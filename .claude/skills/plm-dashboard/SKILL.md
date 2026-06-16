---
name: plm-dashboard
description: PLM 대시보드 오케스트레이터. OpenProject 연동, 데이터 계약 검증, 뷰 수정 등 PLM 대시보드의 모든 개발 작업을 조율한다. "연동", "adapter", "OpenProject", "드리프트 점검", "데이터 계약", "뷰 수정", "op-adapter", "실 API", "목업 교체", "재실행", "다시 검증" 등의 표현에 반응한다.
---

# PLM Dashboard 오케스트레이터

## Phase 0: 컨텍스트 확인

작업 시작 전 이전 산출물 존재 여부를 확인한다:

- `_workspace/` 존재 + 부분 수정 요청 → **부분 재실행** (해당 에이전트만 재호출)
- `_workspace/` 존재 + 새 요청 → **새 실행** (기존을 `_workspace_prev/`로 이동)
- `_workspace/` 없음 → **초기 실행**

## Phase 1: 요청 라우팅

사용자 요청을 분석하여 실행 모드를 결정한다.

| 요청 유형 | 실행 모드 | 에이전트 |
|---|---|---|
| "OpenProject 연동", "op-adapter 완성", "실 API 교체", "프록시 설정" | 서브 에이전트 | plm-integrator |
| "드리프트 점검", "데이터 계약 검증", "교차 검증" | 서브 에이전트 | plm-validator |
| "연동 후 검증", "연동 + 검증", "전체 연동 워크플로우" | 파이프라인 | plm-integrator → plm-validator |
| "Overview 뷰 수정", "Board 필터 추가", "차트 변경" | 직접 구현 | (에이전트 없이 직접 처리) |

## Phase 2: 실행

### 서브 에이전트 패턴 (단일 작업)

```
Agent({
  subagent_type: "plm-integrator" 또는 "plm-validator",
  model: "opus",
  prompt: "[아래 컨텍스트 포함]"
})
```

**에이전트 프롬프트에 반드시 포함할 컨텍스트:**
- 사용자가 요청한 구체적 작업 범위
- 핵심 파일 경로: `design_handoff_plm_dashboard/op-adapter.js`, `design_handoff_plm_dashboard/data.js`
- 현재 `USE_LIVE_API` 상태 (op-adapter.js에서 확인)
- 이전 `_workspace/` 산출물이 있으면 경로 전달

### 파이프라인 패턴 (연동 + 검증)

1. plm-integrator로 연동 구현 → 완료 후 `_workspace/integration-report.md`에 결과 저장 요청
2. plm-validator로 드리프트 검증 → `_workspace/validation-report.md`에 결과 저장 요청
3. 두 리포트를 종합하여 사용자에게 요약 보고

### 뷰 직접 수정

에이전트 없이 직접 처리. CLAUDE.md의 "Key Implementation Rules" 준수:
- 뷰는 `window.DB`와 selectors만 소비
- 차트는 `charts.js` 함수만 사용
- 툴팁은 `data-tip` attribute 방식

## Phase 3: 결과 보고

```markdown
## PLM Dashboard 작업 완료

### 수행 작업
- ...

### 산출물
- _workspace/integration-report.md (있는 경우)
- _workspace/validation-report.md (있는 경우)

### 다음 권장 작업
- ...
```

## 테스트 시나리오

**정상 흐름:**
사용자: "op-adapter.js의 fetchAll과 mapWorkPackage를 완성해줘"
→ plm-integrator 에이전트 호출 → op-adapter.js 수정 → 구현 설명 반환

**에러 흐름:**
op-adapter.js 수정 중 durationToHours 누락 발견
→ plm-integrator가 경고 포함하여 수정 → plm-validator로 재검증 권고

## 주의

- plm-validator는 읽기 전용 에이전트다. 코드 수정이 필요하면 plm-integrator로 전달한다
- `USE_LIVE_API = true` 전환은 Nginx 프록시 설정이 완료된 후에만 수행한다
- `design_handoff_plm_dashboard/` 내 파일들은 디자인 레퍼런스다. 뷰·UI 로직을 수정할 때는 별도 구현 디렉토리를 확인한다
