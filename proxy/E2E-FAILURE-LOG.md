# E2E 실증 검증 실패 이력

실증 검증 중 발견된 버그와 실패 원인을 기록한다.  
재발 방지를 위해 Anti-pattern 항목을 반드시 숙지할 것.

---

## 실패 기록

### [2026-06-17] 1차 E2E (e2e-verify.js) — 검증 부적절 판정

**문제:** `html.length > 100` 조건으로 뷰 렌더링을 판정.  
빈 테이블 Shell HTML도 100자를 초과하므로 실제 빈 화면이 통과됨.

**발견 경위:** 사용자가 브라우저에서 직접 접속해 빈 화면 확인.

**교훈/Anti-pattern:**
- `html.length` 같은 크기 기반 체크는 E2E 검증으로 부적절하다.
- 반드시 렌더링 결과물의 **의미 있는 DOM 요소** (`.kpi-value`, `.board-col`, `table td` 등)를 선택자로 확인해야 한다.

---

### [2026-06-17] 2차 E2E (e2e-verify-v2.py) 1차 실행 — 5개 실패

| AC | 실패 내용 | 근본 원인 |
|---|---|---|
| AC-UX-01 Projects | `kpi-value` 없음, `tr>td` 없음 | `state.projectTab=1` (기본값) → `D.P[1]=undefined` → 뷰 전체 크래시 |
| AC-UX-02 Board | `.board-col` 없음 | `buildBoardColsFromStatuses`가 빈 `statusIds` 컬럼 생성 → `[0]` 접근 TypeError |
| AC-UX-09 Refresh | OP 요청 0건 | `[data-refresh]` 클릭 시 `renderShell()`만 호출, `buildLiveDataset()` 재호출 없음 |
| AC-UX-14 Console | "Failed to load resource: 404" | `time_entries/activities` 엔드포인트 OP 인스턴스 미지원 |
| AC-UX-02 Board (연쇄) | board.js `D.S[col.statusIds[0]]` undefined | 위 Board 크래시의 null 안전 미비 |

**수정 내용 (커밋 88cc060):**
- `views/projects.js`: `state.projectTab` stale ID 방어 → `D.PROJECTS[0].id` 폴백
- `data.js`: `buildBoardColsFromStatuses` 빈 statusIds 컬럼 필터링
- `views/board.js`: `D.S[col.statusIds[0]]` null 안전 처리
- `app.js`: `renderContent` try-catch 추가, refresh → `buildLiveDataset()` 재호출

**E2E 스크립트 수정:**
- `time_entries/activities` 404는 `on_response` 핸들러로 추적, console "Failed to load resource" 필터링

**최종 결과:** ✓13 / ✗0 / ⚠3

**교훈/Anti-pattern:**
- localStorage에 저장된 ID(`state.projectTab`)는 OP 인스턴스 교체 시 stale 됨. 반드시 `D.P[id]` 존재 확인 후 사용.
- `buildBoardColsFromStatuses`처럼 카테고리 매핑은 실 OP 인스턴스에 없는 카테고리가 있을 수 있음 → 빈 결과 필터링 필수.
- `renderContent`에 try-catch 없으면 뷰 크래시가 빈 화면으로 침묵해 디버깅 불가.

---

### [2026-06-17] Observer/그룹 필터링 → D.U undefined 렌더링 오류

**문제:** Observer 역할 사용자와 Group을 `USERS` 배열에서 완전히 제거하자  
`D.U[assigneeId]`가 `undefined`를 반환 → `.name` 접근 시 런타임 오류.

```
렌더링 오류: Cannot read properties of undefined (reading 'name')
```

**근본 원인:** `D.U`(lookup map)는 `byId(USERS)`로 빌드됨. USERS에서 제거하면 D.U에도 없음.  
WP/프로젝트는 그 ID를 여전히 assigneeId/leadId로 참조 → undefined.

**수정 내용 (커밋 d9f9040):**
- `op-adapter.js`: USERS에서 제거하지 않고 `isGroup: true` / `isObserver: true` 플래그 부여
- `views/board.js`: 담당자 드롭다운에서만 `!isGroup && !isObserver` 필터
- `views/projects.js`: `D.U[p.leadId]?.name` null 안전 처리, 팀원 fallback 객체 추가

**Anti-pattern (재발 방지 규칙):**

> ❌ WRONG: USERS 배열에서 항목을 직접 제거해 D.U lookup을 무력화
> ```js
> const USERS = usersMapped.filter(u => !condition); // D.U가 비워짐
> ```
>
> ✅ CORRECT: 플래그를 부여하고 UI 레이어에서만 필터
> ```js
> usersMapped.forEach(u => { if (condition) u.isHidden = true; });
> const USERS = usersMapped; // D.U 완전 유지
> // view 드롭다운에서: D.USERS.filter(u => !u.isHidden)
> ```

**D.U 직접 접근 안전 규칙:**
- `D.U[id].name` → ❌ id가 null이거나 필터된 경우 크래시
- `D.U[id]?.name ?? '–'` → ✅ 안전
- `D.U[id] || fallback` → ✅ 렌더링 안전

---

## 재발 방지 체크리스트 (E2E 실증 전 필수 확인)

- [ ] E2E 검증은 의미 있는 DOM 선택자를 사용하는가? (`html.length` 금지)
- [ ] localStorage 저장 ID를 실 데이터 키로 조회할 때 존재 확인을 하는가?
- [ ] 동적 필터/매핑 결과에서 빈 배열 케이스를 처리하는가?
- [ ] `renderContent`류 최상위 렌더 함수에 try-catch가 있는가?
- [ ] lookup map(D.U, D.P 등)에서 가져온 값의 `.property` 접근 전 null 체크를 하는가?
- [ ] 컬렉션 필터링 시 lookup map도 함께 영향 받는지 확인했는가?
