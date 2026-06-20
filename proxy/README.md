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
