# 교육용 노트북 인계

2026-10-22: 기존 개발 코드 및 문서는 7cab801에, 남은 캡처와 검증 기록은 8898800에 커밋되어 있다. 이번 인계에서는 UI 및 금융 계산을 변경하지 않는다.

저장소 루트( server.py와 start.ps1이 있는 폴더 )에서 PowerShell로 실행한다.

```powershell
git switch main
git pull --ff-only origin main
# 이 노트북에서 읽기 가능한 원본 폴더/파일로 입력한다.
$financeDir = Read-Host '재무 최종본 CSV 폴더'
$auditDir = Read-Host '독립 감사 자료 폴더'
$priceCsv = Read-Host '1_개별종목가격.csv 전체 경로'
.\start.ps1 -Port 8770 -DataDir $financeDir -AuditDir $auditDir -PriceCsv $priceCsv
```

Python 3.10 이상이 필요하며, start.ps1은 Codex Python이 없으면 PATH의 python을 사용한다. 제공된 UI 번들로 일반 실행할 때 npm 설치는 필요 없다.

브라우저: http://127.0.0.1:8770/research/company
프로젝트 개요: http://127.0.0.1:8770/design-preview/overview
DuPont: http://127.0.0.1:8770/design-preview/dupont
계보: http://127.0.0.1:8770/research/lineage

데이터는 Git에 포함하지 않는다. 교육용 노트북에서 같은 읽기 전용 자료에 접근 가능해야 한다. 기존 실제 경로 및 검증 내역은 WORK_STATUS.md를 참고한다. 가격은 조정 여부 미확인 종가, 거래량 미제공, 재무 원천 의미 REVIEW 정책을 유지한다.

.gitignore에 로컬 인증정보·환경변수 파일·DB/백업·원본 CSV/XML·의존성·실행 캐시 제외 규칙을 추가했다. 기존에 추적되던 node_modules와 pyc는 이 인계에서 삭제하거나 추적 해제하지 않았다. ignore 규칙은 이미 추적되는 파일에 소급 적용되지 않는다.
