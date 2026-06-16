---
name: plm-validation
description: PLM 대시보드 데이터 계약 교차 검증 가이드. design_handoff_plm_dashboard/README.md §5를 기준으로 드리프트를 감지한다. "드리프트 점검", "교차 검증", "데이터 계약 확인", "계약 위반", "필드 검증", "selector 시그니처 확인" 작업 시 사용한다.
---

# PLM Validation Skill

## 검증 원칙

검증의 기준은 단 하나: `design_handoff_plm_dashboard/README.md §5 데이터 계약` + `data.js`.
필드명·타입·selector 시그니처가 이 기준과 다르면 전부 드리프트다.

## 검증 범위 및 기법

### 1. 시간 필드 파싱 (High 영향)

```bash
# "PT"로 시작하는 문자열을 그대로 사용하는지 검색
grep -r '"PT' design_handoff_plm_dashboard/
grep -r "'PT" design_handoff_plm_dashboard/
grep -r 'estimatedTime\|spentTime' design_handoff_plm_dashboard/ --include="*.js"
```

**통과 기준:** `estimatedHours`, `spentHours`에 할당되는 값이 `durationToHours()` 반환값인가.
**실패 패턴:** `wp.estimatedTime` 또는 `raw.spentTime`을 직접 숫자 연산에 사용.

### 2. percentageDone vs percentDone 혼동 (High 영향)

```bash
grep -r 'percentageDone' design_handoff_plm_dashboard/ --include="*.js"
```

**통과 기준:** `op-adapter.js`에서만 `percentageDone`이 나오고, 변환 후 `percentDone`으로 저장.
**실패 패턴:** 뷰에서 `wp.percentageDone` 직접 접근.

### 3. Selector 시그니처 검증 (High 영향)

`data.js`에서 다음 함수 시그니처를 확인:

| Selector | 기대 시그니처 |
|---|---|
| `kpis` | `(wps)` |
| `statusDistribution` | `(wps)` |
| `openCloseTrend` | `(wps, weeks)` |
| `backlogTrend` | `(wps, weeks)` |
| `userUtilization` | `()` |
| `projectHealth` | `()` |
| `burndown` | `(version)` |
| `activityBreakdown` | `(entries)` |
| `isOpen` | `(wp)` |
| `isOverdue` | `(wp)` |
| `dueWithin` | `(wp, n)` |

```bash
grep -E '^\s*(const|function)\s+(kpis|statusDistribution|openCloseTrend|userUtilization|projectHealth|burndown|activityBreakdown|isOpen|isOverdue|dueWithin|backlogTrend)' design_handoff_plm_dashboard/data.js
```

### 4. Status/Type/Priority 하드코딩 검사 (Mid 영향)

```bash
# 상태 ID 숫자 비교
grep -rn 'statusId\s*===\s*[0-9]' design_handoff_plm_dashboard/views/
grep -rn "isClosed\|statusId.*6\|statusId.*7" design_handoff_plm_dashboard/views/
# 상태 이름 하드코딩
grep -rn "'Closed'\|'New'\|'In progress'" design_handoff_plm_dashboard/views/
```

**통과 기준:** 뷰에서 `D.isOpen(wp)`, `D.isOverdue(wp)` 등 selector를 사용.
**실패 패턴:** `wp.statusId === 6` 직접 비교.

### 5. CORS·보안 검사 (High 영향)

```bash
grep -rn 'plm\.abyz-lab\.work' design_handoff_plm_dashboard/ --include="*.js"
grep -rn 'Authorization\|apikey\|token' design_handoff_plm_dashboard/ --include="*.js"
```

**통과 기준:** `op-adapter.js`에만 BASE URL이 있고, 뷰에는 없음. Authorization은 프록시에서만.
**실패 패턴:** 뷰 또는 app.js에서 직접 fetch.

### 6. window.DB 소비 패턴 검사 (Mid 영향)

```bash
grep -rn 'fetch\|XMLHttpRequest\|axios' design_handoff_plm_dashboard/views/ --include="*.js"
grep -rn 'window\.DB\.' design_handoff_plm_dashboard/views/ --include="*.js"
```

**통과 기준:** 뷰는 `D.*` (data.js selectors)와 `D.WORK_PACKAGES` 등 DB 속성만 접근.
**실패 패턴:** 뷰에서 직접 fetch 호출.

## 보고서 형식

```markdown
## PLM 데이터 계약 검증 리포트
**기준:** design_handoff_plm_dashboard/README.md §5
**검증 일시:** YYYY-MM-DD

### ✅ 통과 (N개)
- 시간 파싱: durationToHours() 일관 사용 확인
- ...

### ⚠️ 드리프트 (N개)
| # | 항목 | 계약 기준 | 실 구현 | 위치 | 영향 |
|---|------|----------|---------|------|------|
| 1 | percentDone | number(0-100) | string '%' 포함 | views/overview.js:42 | High |

### 🔒 보안 이슈 (N개)
- ...

### 🔧 수정 우선순위
1. [High] ...
2. [Mid] ...
3. [Low] ...
```

## 재구현(Path B) 교차 검증

React/Vue 등 프레임워크로 재구현 시에도 동일한 검증 기준을 적용한다.
추가 검사 항목: 상태 관리 레이어에서 `window.DB` 역할을 하는 store의 shape이 data.js와 일치하는가.
