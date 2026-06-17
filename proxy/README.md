# PLM Dashboard — 프록시 운영 가이드

nginx:alpine Docker 컨테이너가 두 가지 역할을 동시에 담당합니다.

- **정적 파일 서빙** — `design_handoff_plm_dashboard/` 디렉터리를 포트 80/8088으로 제공
- **API 프록시** — `/op/*` 경로를 `plm.abyz-lab.work/api/v3/*`로 중계하고 서버 측에서 인증 헤더 주입

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

## 네트워크 접속 주소

| 망 | 주소 |
|----|------|
| 사무실 2.5G (`192.168.100.x`) | `http://192.168.100.50/` |
| 사무실 유선 (`10.20.6.x`) | `http://10.20.6.187/` |
| Tailscale | `http://100.110.194.101/` |
| 호스트명 | `http://plm-dash.work/` (hosts 파일 설정 후) |

## E2E 검증

AC-E2E-01..20 전 항목 통과 확인용. Playwright 필요.

**Node.js (권장):**
```bash
cd ~/workspace/plm-dashboard/proxy
npm install playwright  # 최초 1회
node e2e-verify.js
```

**Python:**
```bash
cd ~/workspace/plm-dashboard/proxy
python3 e2e-verify-v2.py
```

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
