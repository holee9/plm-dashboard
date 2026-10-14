# PLM Dashboard — 프록시 운영 가이드

nginx:alpine Docker 컨테이너가 두 가지 역할을 동시에 담당합니다.

- **정적 파일 서빙** — `design_handoff_plm_dashboard/` 디렉터리를 포트 80/8088으로 제공
- **API 프록시** — `/op/*` 경로를 `plm.abyz-lab.work/api/v3/*`로 중계하고 서버 측에서 인증 헤더 주입

현재 compose는 릴리즈 이미지를 빌드하지 않고, 로컬 워크트리의 대시보드 디렉터리를
컨테이너에 bind mount하는 운영형 구성입니다. Dockerfile 기반 이미지형 배포는 아직 구현하지
않았으며, 향후 기획 후보로만 기록합니다.

## 접속 URL

```
http://plm-dash.work/
```

> 접속 전 PC의 `hosts` 파일에 한 줄 추가 필요 (루트 README 상단 참조)

## 기동

```bash
cd ~/workspace/plm-dashboard/proxy
bash start.sh
```

`start.sh`가 하는 일:
1. `~/.hermes/.env`에서 `OP_API_KEY` 로드
2. `OP_AUTH_B64=$(printf "apikey:%s" "$OP_API_KEY" | base64 -w 0)` 생성
3. `docker compose up -d` 실행

## macOS 로컬 라이브 서비스

Docker와 로컬 API 토큰 없이 Tailscale 운영 프록시를 사용하는 macOS 클라이언트는 다음처럼
로그인 자동 시작 서비스를 설치할 수 있습니다. 서비스는 `127.0.0.1`에만 바인딩됩니다.

```bash
cd ~/workspace/plm-dashboard
./scripts/local-macos-service.sh install
open http://127.0.0.1:8080/
```

```bash
./scripts/local-macos-service.sh status
./scripts/local-macos-service.sh uninstall
```

기본 upstream은 `http://100.110.194.101`입니다. 다른 주소는 설치 시
`PLM_DASHBOARD_UPSTREAM=http://...` 환경변수로 지정합니다.

## 주요 과제 선택용 쓰기 경로 (#110)

대시보드는 읽기 전용 마운트(`/dashboard:ro`)지만, 「주요 과제 선택」 설정 파일 하나만 쓸 수 있도록 별도 마운트를 둔다.

- `docker-compose.yml`: `../design_handoff_plm_dashboard/data/config` 를 `/dashboard/data/config:rw` 로 마운트한다.
- `nginx/default.conf.template`: 정확히 `/data/config/tracked-projects.json` 한 경로에만 `dav_methods PUT`을 켠다. 본문은 64k로 제한하고, 쓰기는 `/op/`와 같은 내부망(127.0.0.1, 192.168.100.0/24, 10.20.6.0/24, 100.64.0.0/10)에서만 허용한다. DELETE·POST 등 다른 방법과 다른 경로의 PUT은 거부된다(시험: 405·404·413·403).
- **호스트 준비(처음 한 번, 컨테이너를 만들기 전)**: `start.sh`가 아래를 자동으로 하고, 직접 `docker compose`를 쓸 때만 손으로 한다. 마운트 지점이 읽기 전용 트리 안이라 폴더가 미리 있어야 한다. nginx 컨테이너는 uid 101로 쓰므로 그 계정에 ACL을 준다.

```bash
mkdir -p ../design_handoff_plm_dashboard/data/config
setfacl -m u:101:rwx ../design_handoff_plm_dashboard/data/config
```

- 저장된 파일은 `rw-r--r--`로 만들어져 호스트 계정도 읽을 수 있다. `data/`는 git이 추적하지 않으므로 설정 파일은 저장소에 들어가지 않는다.
- 적용: 설정 템플릿과 마운트가 바뀌었으므로 컨테이너를 재생성한다(`docker compose up -d --force-recreate`). nginx 설정 변경 뒤에는 reload가 아니라 재시작을 쓴다.
- 되돌리기: 이 PR을 revert하고 컨테이너를 재생성한다. `data/config/tracked-projects.json`을 지우면 전체 과제 표시로 돌아간다.

## 파일 구성

```
proxy/
├── docker-compose.yml              nginx:alpine 서비스 (network_mode: host)
├── nginx/default.conf.template     nginx 설정 템플릿 (envsubst로 처리)
├── start.sh                        토큰 로드 + 컨테이너 기동
├── e2e-verify.js                   AC-E2E-01..20 Playwright 검증 (Node.js, 최신)
├── e2e-verify-v2.js                v2 Playwright 스크립트 (Node.js)
├── e2e-verify.py                   초기 Playwright 검증 (Python)
├── e2e-verify-v2.py                v2 Playwright 스크립트 (Python)
├── e2e-role-check.py               PM/TL 역할 + 제외 프로젝트 정책 검증 (Python)
└── E2E-FAILURE-LOG.md              E2E 실패 이력 및 Anti-pattern 재발방지 문서
```

## 환경변수

| 변수 | 위치 | 설명 |
|------|------|------|
| `OP_API_KEY` | `~/.hermes/.env` | OpenProject API 토큰 (소스/커밋에 포함 금지) |
| `OP_AUTH_B64` | 런타임 생성 | `apikey:<TOKEN>` base64 인코딩 값, nginx에 주입 |

## 포트

| 포트 | 용도 |
|------|------|
| 80 | 대시보드 (기본 HTTP) |
| 8088 | 대시보드 (호환용 포트) |

## 향후 후보: 이미지형 컨테이너 배포

현재 방식은 서버의 `design_handoff_plm_dashboard/` 변경을 nginx 컨테이너가 직접 읽습니다.
향후 릴리즈 단위 배포가 필요하면 다음 구조를 별도 기획합니다.

- `Dockerfile`: `design_handoff_plm_dashboard/`와 nginx 설정을 이미지에 `COPY`
- `compose.prod.yml`: bind mount 없이 `image: plm-dashboard:<tag>` 실행
- 런타임 환경변수: `OP_API_KEY` 또는 `OP_AUTH_B64`, OP upstream, listen port
- 보안 원칙: API 토큰은 이미지에 포함하지 않고 런타임에만 주입
- 검증 게이트: `/`, `/op/users/me`, `proxy/e2e-role-check.py`, `proxy/e2e-verify.py`, `proxy/e2e-verify-v2.py`

상세 메모는 `docs/docker-containerization-note.md`를 참조하세요. 이번 기록 작업에서는
Dockerfile이나 production compose를 추가하지 않습니다.

## 네트워크 접속 주소

| 망 | 주소 |
|----|------|
| 사무실 2.5G (`192.168.100.x`) | `http://192.168.100.50/` |
| 사무실 유선 (`10.20.6.x`) | `http://10.20.6.187/` |
| Tailscale | `http://100.110.194.101/` |
| 호스트명 | `http://plm-dash.work/` (hosts 파일 설정 후) |

## E2E 검증

AC-E2E-01..20은 API/데이터 무결성, AC-OPTIONAL-01..02는 #6 선택 기능,
AC-ROLE-01..08은 PM/TL 역할과 전역 제외 프로젝트 정책,
AC-UX-01..19는 실제 브라우저 UX 검증입니다.
Playwright 필요.

**Node.js (권장):**
```bash
cd ~/workspace/plm-dashboard/proxy
npm install playwright  # 최초 1회
node e2e-verify.js
```

**Python:**
```bash
cd ~/workspace/plm-dashboard/proxy
python3 e2e-role-check.py
python3 e2e-verify.py
python3 e2e-verify-v2.py
```

주요 역할/전역 제외 검증:
- `AC-ROLE-01b`: 운영 의도상 제외 대상인 `인프라 구축`이 `DB.PROJECTS`에 남지 않는지 확인
- `AC-ROLE-05`: bot/observer 사용자가 프로젝트 `memberRoles`에 포함되지 않는지 확인
- `AC-ROLE-06~08`: Projects PM/TL 컨트롤과 Resources readiness 패널 렌더링 확인

주요 Timeline 검증:
- `AC-UX-17`: OP 마일스톤 `date` 필드가 간트 diamond marker와 Project scope에 표시되는지 확인
- `AC-UX-18`: `Active Sprints`가 제거되고 `Schedule Inspection`이 표시되는지, 마일스톤이 있는 프로젝트 행 클릭 후 Timeline scope와 marker가 함께 갱신되는지 확인

주요 Resources 검증:
- `AC-UX-19`: Data Readiness/Input Actions/Person Pressure 패널이 표시되고, desktop 8:5 grid 컬럼 비율과 상단·하단 패널 행 높이 정렬이 유지되는지 확인

선택 기능 검증:
- `AC-OPTIONAL-01`: 닫힌 WP의 `closedAt`이 `/work_packages/{id}/activities` 상태 변경 이력에서 계산되는지 확인하고, 이력이 없는 경우 `updatedAt` fallback을 허용
- `AC-OPTIONAL-02`: `user-overrides.js`의 관리자 지정 `capacityPerWeek`가 `DB.USERS`와 Resources/Risks 가동률 계산에 반영되는지 확인

최근 Timeline 실증 캡처:
- `/tmp/plm-timeline-schedule-all-bottom-visible.png`
- `/tmp/plm-timeline-schedule-bluehd-bottom-visible.png`

최근 Resources 실증 캡처:
- `/tmp/plm-resources-1440.png`
- `/tmp/plm-resources-390.png`

E2E 실패 이력 및 Anti-pattern은 `E2E-FAILURE-LOG.md` 참조.

## 상태 확인

```bash
# 컨테이너 상태
cd ~/workspace/plm-dashboard/proxy && docker compose ps

# API 프록시 동작 확인
curl http://localhost:8088/op/users/me

# 대시보드 응답 확인
curl -o /dev/null -w "%{http_code}" http://localhost/
```

## 보안

- API 토큰은 nginx 컨테이너 내부에서만 사용되며 브라우저에 전달되지 않습니다.
- nginx는 응답에서 `Authorization` 헤더를 제거합니다 (`proxy_hide_header Authorization`).
- 캐시 비활성화 (`Cache-Control: no-store`) — 토큰 정보가 캐시에 잔류하지 않습니다.
