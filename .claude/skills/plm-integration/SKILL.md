---
name: plm-integration
description: PLM 대시보드 OpenProject API v3 연동 구현 가이드. op-adapter.js의 HAL+JSON 파싱, ISO8601 기간 파싱, 페이지네이션, 프록시 설정 패턴을 제공한다. "연동", "op-adapter", "fetchAll", "mapWorkPackage", "durationToHours", "프록시", "HAL", "실 API" 작업 시 사용한다.
---

# PLM Integration Skill

## 연동 아키텍처

```
브라우저 → /op/* → Nginx 프록시 → plm.abyz-lab.work/api/v3/*
                      (Authorization: Basic 주입)
```

**이유:** OP는 CORS를 허용하지 않고, API 키를 브라우저에 두면 노출된다. 프록시가 키를 서버 측에서 주입한다.

## 핵심 패턴

### 1. durationToHours() — 시간 파싱

OP의 모든 시간 필드(`estimatedTime`, `spentTime`, time-entry `hours`)는 ISO8601 기간 문자열이다.

```js
// op-adapter.js에 이미 구현된 함수 — 반드시 사용
durationToHours("PT40H")   // → 40
durationToHours("P1DT2H")  // → 10  (1일 = 8h 기준)
durationToHours("PT5H30M") // → 5.5
durationToHours(null)       // → 0
```

### 2. refId() / refTitle() — HAL 링크 파싱

OP의 모든 참조는 `_links.X.href`로 온다.

```js
// op-adapter.js에 이미 구현된 함수 — 반드시 사용
refId(wp, 'assignee')   // → 42 (또는 null, 미할당)
refId(wp, 'project')    // → 7
refId(wp, 'version')    // → null (스프린트 미지정)
refTitle(wp, 'status')  // → "In progress"
```

### 3. fetchAll() — 페이지네이션

OP는 기본 pageSize가 100~200이다. 총 WP 250건이므로 반드시 루프 사용.

```js
// op-adapter.js에 이미 구현 — 직접 사용
const wps = await fetchAll('/work_packages', [
  { "status": { "operator": "o", "values": [] } }  // 열린 것만
]);
// 전체: 필터 없이 전달
```

### 4. 참조 데이터 동적 로딩 순서

```
1. fetchAll('/statuses')     → STATUSES
2. fetchAll('/types')        → TYPES
3. fetchAll('/priorities')   → PRIORITIES
4. fetchAll('/time_entries/activities') → ACTIVITIES
5. fetchAll('/users')        → USERS
6. fetchAll('/projects')     → PROJECTS (활성만)
7. fetchAll('/versions')     → VERSIONS
8. fetchAll('/work_packages') → WORK_PACKAGES (필터링)
9. fetchAll('/time_entries')  → TIME_ENTRIES
```

참조 데이터(1-4)를 먼저 모두 가져온 뒤, WP/TE 매핑 시 활용한다.

## mapWorkPackage() 구현 패턴

```js
function mapWorkPackage(raw) {
  return {
    id:           raw.id,
    subject:      raw.subject,
    projectId:    refId(raw, 'project'),
    typeId:       refId(raw, 'type'),
    statusId:     refId(raw, 'status'),
    priorityId:   refId(raw, 'priority'),
    assigneeId:   refId(raw, 'assignee'),    // null 허용
    authorId:     refId(raw, 'author'),
    versionId:    refId(raw, 'version'),     // null 허용
    startDate:    raw.startDate || null,
    dueDate:      raw.dueDate   || null,
    estimatedHours: durationToHours(raw.estimatedTime),
    spentHours:     durationToHours(raw.spentTime),  // 불신뢰 — time_entries 합산 권장
    percentDone:  raw.percentageDone ?? 0,  // OP 필드명 주의
    createdAt:    (raw.createdAt || '').slice(0, 10),
    updatedAt:    (raw.updatedAt || '').slice(0, 10),
    closedAt:     isClosedStatus(refId(raw, 'status'))
                    ? (raw.updatedAt || '').slice(0, 10)
                    : null,
  };
}
```

## mapTimeEntry() 구현 패턴

```js
function mapTimeEntry(raw) {
  return {
    id:             raw.id,
    workPackageId:  refId(raw, 'workPackage'),
    projectId:      refId(raw, 'project'),
    userId:         refId(raw, 'user'),
    activityId:     refId(raw, 'activity'),
    hours:          durationToHours(raw.hours),  // ← 파싱 필수
    spentOn:        raw.spentOn,
  };
}
```

## capacityPerWeek 처리

OP에 가용량 원천 데이터 없음. 기본 40h/주 적용:

```js
function mapUser(raw) {
  return {
    id:               raw.id,
    name:             raw.name || `${raw.firstName} ${raw.lastName}`.trim(),
    initials:         raw.login?.slice(0, 2).toUpperCase() || '??',
    role:             refTitle(raw, 'roles') || 'Developer',
    title:            raw.title || '',
    color:            COLORS[raw.id % COLORS.length],
    capacityPerWeek:  CAPACITY_OVERRIDE[raw.id] ?? 40,  // 외부 설정으로 오버라이드
  };
}
```

## Nginx 프록시 설정 (최소 구성)

```nginx
location /op/ {
    rewrite ^/op/(.*)$ /api/v3/$1 break;
    proxy_pass https://plm.abyz-lab.work;
    proxy_set_header Authorization "Basic <base64(apikey:TOKEN)>";
    proxy_set_header Accept "application/hal+json";
    proxy_ssl_server_name on;
}
```

**보안 주의:** TOKEN을 Nginx 설정 파일에 직접 쓰지 말고 환경 변수나 별도 secret 파일 활용.

## 교체 절차 (data.js → live)

`op-adapter.js` 하단에 이미 있는 `buildLiveDataset()` 완성 후:

```js
// data.js 최하단의 buildDataset() 호출을
// (function(){ ... window.DB = buildDataset(); })()
// 아래로 교체:
if (typeof OPAdapter !== 'undefined' && OPAdapter.USE_LIVE_API) {
  OPAdapter.buildLiveDataset().then(db => { window.DB = db; App.renderShell(); });
} else {
  window.DB = buildDataset();  // 목업 폴백
}
```

뷰는 무수정이다.
