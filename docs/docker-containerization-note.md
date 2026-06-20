# Docker Containerization Planning Note

2026-06-20 기준 기록입니다. 이 문서는 구현 계획이 아니라, 향후 별도 기획 시 잊지 말아야 할
컨테이너 배포 후보 메모입니다.

## Current State

현재 대시보드는 이미 Docker 컨테이너를 사용합니다.

- `proxy/docker-compose.yml`은 `nginx:alpine` 컨테이너를 실행합니다.
- `design_handoff_plm_dashboard/`는 컨테이너 `/dashboard`에 read-only bind mount됩니다.
- nginx는 `/` 정적 파일과 `/op/*` OpenProject API 프록시를 함께 제공합니다.
- `OP_API_KEY`는 `~/.hermes/.env`에서 읽고, `OP_AUTH_B64`는 런타임에 생성합니다.

즉, 현재 구성은 "컨테이너 운영형"입니다. 다만 릴리즈 산출물을 이미지로 고정하는
"이미지 배포형"은 아닙니다.

## Future Candidate

향후 릴리즈 단위 배포가 필요하면 다음 방향을 검토합니다.

1. `Dockerfile` 추가
   - `nginx:alpine` 기반
   - `design_handoff_plm_dashboard/`를 이미지 내부 `/dashboard`에 `COPY`
   - nginx 설정 템플릿을 이미지에 포함

2. `compose.prod.yml` 추가
   - bind mount 제거
   - `image: plm-dashboard:<release-tag>` 사용
   - `restart: unless-stopped` 유지
   - 네트워크는 현재 host mode 유지 여부를 별도 판단

3. 런타임 설정 분리
   - `OP_API_KEY` 또는 `OP_AUTH_B64`는 이미지에 포함하지 않음
   - OP upstream, listen port, server name은 환경변수화 후보
   - 토큰은 컨테이너 환경 또는 secret store에서만 주입

4. 릴리즈 태그 연계
   - Git tag 예: `v0.1.0`
   - 이미지 태그 예: `plm-dashboard:v0.1.0`
   - 필요 시 `latest`는 운영 검증 후에만 갱신

## Validation Gate

이미지형 배포를 구현할 경우 최소 검증은 다음을 통과해야 합니다.

- `docker build` 성공
- `docker run` 또는 `docker compose -f compose.prod.yml up -d` 성공
- `curl -o /dev/null -w "%{http_code}" http://localhost:8088/` → `200`
- `curl http://localhost:8088/op/users/me` → OP 사용자 JSON 응답
- `python3 proxy/e2e-role-check.py`
- `python3 proxy/e2e-verify.py`
- `python3 proxy/e2e-verify-v2.py`
- 브라우저에서 `http://plm-dash.work/` 수동 확인

## Non-Goals For Now

- 이번 기록 작업에서는 `Dockerfile`을 추가하지 않습니다.
- 이번 기록 작업에서는 `compose.prod.yml`을 추가하지 않습니다.
- 이번 기록 작업에서는 CI 이미지 빌드/푸시 파이프라인을 추가하지 않습니다.
- 현재 운영 중인 `proxy/docker-compose.yml`과 `:8086` upstream 프록시 구성은 변경하지 않습니다.

## Open Questions

- 운영 배포 이미지를 로컬 레지스트리에 둘지, GitHub Container Registry에 둘지
- `network_mode: host`를 유지할지, 명시 포트 매핑으로 바꿀지
- `OP_AUTH_B64`를 계속 런타임 생성할지, secret으로 직접 주입할지
- 태그 푸시 시 자동 이미지 빌드를 할지, 수동 릴리즈 작업으로 둘지
