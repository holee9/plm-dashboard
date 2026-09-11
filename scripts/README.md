# Scripts

PLM Dashboard의 사용자 PC 설정과 로컬 실행 진입점을 모아둔 디렉터리입니다.

| 파일 | 운영체제 | 용도 |
|------|----------|------|
| `add-plm-dash-hosts.bat` | Windows | hosts 자동 설정 후 운영 대시보드 열기 |
| `add-plm-dash-hosts.sh` | macOS/Linux | hosts 자동 설정 후 운영 대시보드 열기 |
| `update-plm-dash-hosts.ps1` | Windows | BAT에서 호출하는 hosts 안전 갱신 모듈 |
| `run-local-dashboard.bat` | Windows | 저장소의 대시보드를 로컬에서 실행 |
| `run-local-dashboard.sh` | macOS/Linux | 저장소의 대시보드를 로컬에서 실행 |
| `local-dashboard-server.py` | 공통 | 정적 파일과 운영 API를 연결하는 로컬 서버 |
| `local-macos-service.sh` | macOS | 로그인 자동 실행 서비스 설치·상태·제거 |

일반 사용자 PC는 `add-plm-dash-hosts.*`, 개발·검증 PC는 `run-local-dashboard.*`를 사용합니다.
상세 옵션과 네트워크 요구사항은 루트 `README.md`를 참조하세요.
