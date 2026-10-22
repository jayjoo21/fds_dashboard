# FDS 작업 상태 — 2026-10-22 / Phase 3 가독성·표시 정책 보완

## 현재 Phase

두 기준 화면의 기존 분기·수식·스크롤·계보를 유지한 보완 구현 및 브라우저 검증 수행. 사용자 최종 디자인 확인 대기. 다른 화면 확장·OAuth·동기화·DB·AWS는 수행하지 않음.

## 이번 변경

- `web/dupont.js`: 개요의 선택 단계 설명을 핵심 입력/계산·처리/산출물/검증 범위로 정리. DuPont 입력에 분자·분모 및 PM/ATO 경로 표시. 직접 선택과 스크롤에 따른 분해 상태 유지. 같은 시점 비교·선택 변수 근거 링크를 수식 바로 아래에 연결.
- `web/dupont.css`: 선택 노드의 실색·굵은 경로·명확한 비선택 대비. 본문·보조 글자 크기와 대비 강화. 지도 높이/장면 간격을 줄이고 기존 큰 수식 유지. 모바일에서는 긴 내부 변수명 대신 계정 설명을 우선 노출(원래 키는 접근성 이름과 계보에 유지).
- `docs/WORK_STATUS.md`와 `docs/*-v3-*.jpg`: 현재 기록·비교 캡처.
- 이번에는 서버·계산·공시 추적 코드와 Drive 원본을 변경하지 않음. 원본 복사·다운로드·수정·삭제·인증정보 변경 없음.

## 감사 자료를 확인한 표시 정책

읽은 자료: 기존 경로의 `전체_데이터_재검증_종합보고서.md`, `스키마_키_판정기준.md`, 최종본 `검증·보완자료/데이터품질_재검증_요약.json`.

보고서 §8은 기업코드·공식 날짜·PIT·산식 차원의 검사 결과를 사용할 수 있다고 하며, 원천 의미 전체 PASS를 금지함. §4는 우전 비정상 원천과 파생 지표 제외, 대체금액 미확정을 명시함. 이 구분을 화면에 반영함:

1. 기본 화면에서 금융값의 최종 결과는 미표시. 사용자가 `검토 중 CSV 참고값 보기`를 켜면 별도 참고 영역만 열림.
2. 기존 API의 formula_matches / traces.matches_csv가 확인된 경우 `연결·산식 대조 확인 / 원천 의미 REVIEW`로 표시. 자동 의미 인증은 아님.
3. 값과 연결은 있으나 그 검사 확인이 없는 경우 `CSV 원값 기록 / 원천 의미·계산 범위 추가 검토`. 원천 fact도 회계 의미 완료로 분류하지 않음.
4. 선택 노드와 모든 상위 입력의 audit_issues, 산식 불일치 또는 합산 미확정이 있으면 선택 계산의 참고 금액을 차단. 결측·미연결은 `—`. 알려진 오류를 대체금액으로 고치지 않음.
5. 참고 영역에 기업·CFS/OFS·기간·이용 가능일, API가 CSV에서 연결한 수치와 단위를 함께 표시. 큰 표시값은 기존 nodeValue의 표시 단위/반올림이며 아래 수치가 함께 표시됨. 승인된 공식 결과가 아님을 명시함.
6. 시점 변경 시 이전 참고값을 즉시 비우고 새 계보 응답만 반영. 금액 시계열을 생성하거나 기본 결과를 검증 완료로 승격하지 않음.

이는 관측된 CSV 수치와 검사 범위를 구분하는 표시 정책임. 회계적 정상 금액 채택이나 원인 판정·대체금액 산정은 수행하지 않음. 감사의 모든 REVIEW 목록을 새로 전수 원문 검증했다는 뜻이 아님.

## 이번 실제 검증

- `node --check web/dupont.js`, `git diff --check`: 통과. 기존 README 줄바꿈 경고만 있음.
- 기존 테스트 4개 재실행 통과(11.322초): identifiers_and_counts, formulas_without_replacing_csv, asof_and_unknown_receipt_fail_closed, independent_confirmed_errors_are_flagged_not_silently_replaced. 원본은 읽기 전용. 전체 테스트/회계 의미 전수 검증을 완료한 것은 아님.
- 켐트로닉스 CFS 2019 Q3: 참고 영역에서 PM과 영업이익/매출 TTM의 실제 연결 수치·산식 확인 범위·REVIEW 표시 확인.
- 우전 052270 OFS, 접수번호 20180515000925: PM 선택 + 참고값 보기를 켜도 감사 오류 영향으로 선택 계산의 3개 금액 행 모두 차단됨을 확인.
- 켐트로닉스 CFS 2015 Q1: OpROA·ATO 결측은 `—`, 연결된 PM은 REVIEW 참고값으로 분리됨을 확인.
- PM 선택 시 분자/분모·계정/설명·선택 경로 변경 및 기본 펼침 깊이 1 확인. 개요 선택 단계의 핵심 입력·계산·산출물·검증 범위 변경 확인.
- 실제 PageDown 후 개요의 선택 단계가 바뀌는 것을 확인. 기존 스크롤 연동을 제거하지 않음. Hover와 키보드 focus는 기존 공유 강조 핸들러 유지. 이번에 독립 pointer-dwell Hover를 별도 자동화하지 않음.
- 1440×1000: 페이지 폭 1425. 390×844: 페이지 폭 375, 큰 수식 335. 가로 넘침 없음. 모바일 계정 설명의 긴 내부 키 줄바꿈을 한 번 수정 후 캡처 재확인.
- 브라우저 error/warn 로그 빈 목록. 캡처 도중 단축키 자동화 실패와 스크롤 중 클릭 실패가 각각 1회 있었으며, 화면 상태를 새로 읽은 뒤 접근성 클릭으로 정상 이동함. 같은 실패 명령을 반복하거나 원인 미확정 코드 수정을 하지 않음.

## 캡처와 비교

- 이전: `docs/overview-v2-desktop.jpg`, `docs/dupont-v2-desktop.jpg` 보존.
- 변경 후: `docs/overview-v3-desktop.jpg`, `docs/dupont-v3-desktop.jpg`.
- 모바일: `docs/overview-v3-mobile.jpg`, `docs/dupont-v3-mobile.jpg`.
- 참고 정책: `docs/dupont-v3-reference.jpg`, `docs/dupont-v3-error-policy.jpg`.

## 실행과 남은 제한

- 기존 읽기 전용 서버: http://127.0.0.1:8767/ . 실행 시 `start.ps1 -DataDir <최종 CSV 폴더> -AuditDir <감사 폴더> -Port 8767` 사용. G:를 코드의 필수 기본값으로 고정하지 않음.
- 재무금액의 의미 검증과 금액 시계열은 미완료. 실제 공시 이벤트 비교와 참고 수치 확인을 제공하며 공식 확정 분석 결과는 아님.
- 일부 로컬 XML의 이전 절대경로와 원문 회계기간은 여전히 미확인. 실제 접수번호의 공식 DART 링크 제공. 숫자·기간을 추정하여 채우지 않음.
- 사용자 확인 전 다른 화면 확장 또는 표시 정책의 검증 완료 승격을 진행하지 않음.

## 접근 확인

- 환경: Windows x64. 일반 샌드박스 조회는 권한 거부였으나 `require_escalated` 승인 절차를 통한 읽기 전용 조회 성공.
- 프로젝트 자료: `G:\내 드라이브\skku_fds_main`.
- 최종 CSV: `G:\내 드라이브\skku_fds_main\데이터\Open Dart\OpenDART_TTM_팀원전달_최종본(지해)\csv버전`.
- XML: 위 CSV 폴더의 `검증·보완자료\공시원문`. XML 이름 3개를 조회하여 파일 존재 확인. 원문 내용과 회계 의미를 전수 검증한 것은 아님.
- 검증 CSV: 위 CSV 폴더의 `검증·보완자료`.
- 별도 감사: `G:\내 드라이브\skku_fds_main\데이터\Open Dart\OpenDART_전수재검증_검토용(나현)`. `데이터품질_최종요약.json`, `전체_데이터_재검증_종합보고서.md`, `확인오류_영향범위.csv` 등의 존재 확인. 이번에는 내용·판정을 재검증하지 않음.
- API 원천: `G:\내 드라이브\skku_fds_main\데이터\Open Dart\OpenDART_보완통합본\04_전체원본계정_통합.csv`.
- 기획 PT: `G:\내 드라이브\skku_fds_main\기획PT\기획PT_261015.pdf` 및 같은 폴더의 `기업가치_훼손위험_3대모형_요약.pptx`.
- DB 폴더에는 `f1_database_v1.dump`, `fds.backup`이 있음. DB 연결이나 복원은 수행하지 않음.
- 폴더·파일 이름과 메타데이터만 조회함. 전체 다운로드·복사·원본 수정·삭제·인증정보 조회·변경 없음. 영구적인 권한 설정을 변경한 것이 아니라 각 조회 명령을 승인 절차로 실행함.



# 2026-10-22 · 독립 디자인 프리뷰 제작 / PAUSE

## 범위와 실행

- 기존 화면과 분리한 `/design-preview/overview`, `/design-preview/dupont` 추가.
- 별도 읽기 전용 서버: http://127.0.0.1:8768/design-preview/overview 및 http://127.0.0.1:8768/design-preview/dupont .
- 앞서 확인한 최종 CSV·감사 폴더를 start.ps1의 DataDir/AuditDir 인자로 재사용. 폴더 재검색·전체 다운로드·복사 없음.
- 기존 web/index.html, web/dupont.js, web/dupont.css 및 금융 계산·데이터 처리·출처 API는 이번 작업에서 수정하지 않음. server.py에는 프리뷰 HTML/CSS/JS 정적 경로 허용만 추가.

## 현재 구현

- 개요: 공시 종이 자료, 탐지 관문, 재무/사건의 두 작업 분기, 통합→사용자 의견→반박→결과를 U자 작업면으로 연결. 단계 클릭·관련 상위 경로 강조·실제 공시 메타데이터·임시 의견 입력. 증거 단계에서는 기간 항 대신 실제 fact_id/계정을 표시.
- DuPont: ATO x축 / PM y축, 실제 CSV 공시 순서 연결, 선택 관측의 동일 OpROA 수학적 관계선, PM/ATO 축 강조, 공시 선택, 계산 입력·CSV·원천 계정·보고서 하단 시트.
- 검토용 관측은 기본 꺼짐. 명시적으로 열면 실제 REVIEW 기록만 표시. 결측 및 확인된 오류의 영향 관측 제외. 수학적 관계선은 관측이나 적정 경계가 아님을 표시. 의미 검증 완료로 승격하지 않음.
- 모바일: 개요는 선택 단계의 작업면+단계 탐색, DuPont은 평면/계산/근거 보기로 분리. 데스크톱 축소판 방식과 구분.

## 실제 확인과 중단 사유

- 독립 서버 및 두 경로를 실제 브라우저에서 열었음.
- 켐트로닉스 CFS 기준 21개 공시 시점, 결측 제외 18개 실제 REVIEW 관측 표시 확인.
- PM 클릭 직후 분자 operating_profit_ttm, 분모 sales_ttm과 두 원천 보고서 표시 확인.
- Hover 전용 SVG 문구에 포인터를 옮기는 브라우저 클릭으로 mouseenter 설명 표시 확인. 이 대상에는 클릭 상태 변경 핸들러가 없음. 실제 CSV/의미 검증 미완료/오류 제외 설명 표시.
- 원천 시트에서 실제 접수번호, 보고서 종류, 공시일, 이용 가능일, DART 링크 표시 확인. 미확인 원문 회계기간은 미확인으로 표시.
- node --check 통과. 브라우저 첫 확인 error/warn 없음.
- **동일 오류 두 번 발생: PM 선택 뒤 계산 경로 버튼으로 이동할 때 브라우저의 자동 스크롤이 IntersectionObserver 설명 구간을 활성화해 선택 변수를 바꿈.** 첫 시도 ATO 시트, 설명을 순차 배치한 수정 후 OpROA 시트로 바뀌어 재현. PM 클릭 직후 상태 자체는 올바르지만 시트 열기까지 선택을 유지하지 못함.
- 사용자 중단 규칙에 따라 추가 구현/자동 수정 중단. 이 상태를 완성·통과로 보고하지 않음.
- 대안: 사용자 스크롤 서술 상태와 직접 선택한 분석 변수 상태를 분리하고, 설명 구간 진입이 직접 선택 상태를 덮어쓰지 않도록 우선순위를 정한 뒤 재검증. 이번 중단 뒤에는 적용하지 않음.
- 수동 Scroll 전 구간, 모바일 탭 전환, 모든 공시/기업, 오류 영향 기업, 키보드·Reduced motion의 종합 동작 검증 및 기존 회귀 테스트 재실행은 미완료. 지원 코드는 있으나 통과했다고 주장하지 않음.

## 캡처와 비교

- `docs/design-preview-overview-desktop.jpg`: 1440px 데스크톱 작업면, 마지막 기간 표기 수정 전 캡처.
- `docs/design-preview-dupont-desktop.jpg`: 1440px 실제 REVIEW 평면, 최종 스크롤 구조 수정 전 캡처.
- `docs/design-preview-overview-mobile.jpg`: 390px 현재 개요 작업면.
- `docs/design-preview-dupont-mobile-current.jpg`: 390px 중단 시점의 원천 시트(평면 모바일 전체 검증을 대체하지 않음).
- `docs/design-preview-hover.jpg`: 실제 mouseenter 설명 상태.
- `docs/design-preview-evidence.jpg`: 자동 스크롤에 의해 잘못 OpROA로 변경된 시트 상태. 오류 재현 근거이며 정상 PM 결과 캡처가 아님.
- 비교 대상 기존 `docs/overview-v3-desktop.jpg`, `docs/dupont-v3-desktop.jpg` 보존. 개요는 동일한 원형 노드 나열 대신 서로 다른 자료/분기 작업면, DuPont은 대형 글자·설명 패널 대신 수익성 좌표 평면으로 정보 구조를 변경.

## 이번 변경 파일

- web/design-preview/index.html (신규)
- web/design-preview/app.js (신규)
- web/design-preview/style.css (신규)
- server.py (프리뷰 정적 경로만 추가)
- docs/WORK_STATUS.md 및 위 캡처

사용자 확인까지 PAUSE. 다른 페이지 확장·원본 금융 자료 수정·OAuth·DB 이전·AWS 배포 없음.

# 2026-10-22 · 프리뷰 선택 상태 충돌 수정 완료

## 원인과 변경

- 이전 IntersectionObserver가 S.metric을 직접 변경하고 작업면 전체를 다시 그려, 버튼으로 이동하는 자동 스크롤도 직접 선택을 덮어썼음.
- selectedMetric: 직접 PM/ATO/OpROA를 선택할 때만 변경. 기업·기간·공시·스토리·패널 변경은 변수 선택을 유지.
- activeStoryScene: IntersectionObserver는 이 설명 상태를 갱신하고 현재 설명 장면 표시만 변경. DuPont 작업면 재생성이나 변수 변경 없음. 개요의 기존 장면 흐름은 유지.
- selectedObservation: stock/fs/asof/from/receipt를 묶어 선택 범위를 명시. 기업·기간 적용 시 기존 관측과 패널을 비우고 새 범위 최신 공시 선택. 공시 변경 시 기존 계보를 즉시 비우고 요청 세대를 증가시켜 이전 비동기 응답 차단.
- evidencePanelState: open/key/observation을 분리. 시트 열기는 선택 변수나 공시를 바꾸지 않음. 변수·관측·기업·기간 변경 시 열린 패널 닫고 비움. 계보 조회 완료 시 열려 있는 패널을 해당 키로 갱신. 닫기/Escape와 포커스 복귀 처리, 패널 포커스는 preventScroll 적용.

## 실제 브라우저 결과

- 1440×1000: PM → 계산 경로 시트 제목 영업이익률 및 CSV 컬럼 PM, 공시 20191113000024 유지.
- ATO → 근거 시트 제목 순영업자산 회전율 및 CSV 컬럼 ATO, 같은 공시 유지. 데스크톱 근거 버튼은 아래 겹침 문제로 Enter로 열어 확인.
- OpROA 직접 선택 → 실제 스크롤로 activeStoryScene=2(ATO 설명) 진입 → OpROA 및 같은 공시 유지.
- 엠피씨 050540 OFS / 기준일 2018-12-31 적용: PM 유지, 관측은 새 범위 최신 2018Q3/20181114001110으로 초기화. 기존 켐트로닉스 근거 제거.
- 공시 슬라이더 Home(키보드) → 2015Q1/20150515002200: 시트의 계정·공시·이용 가능일도 해당 시점으로 변경. 결측 ATO는 계산 불가·REVIEW 표시, 이전 관측 좌표를 남기지 않음.
- 390×844: PM 계산 탭 → 시트 PM 유지; ATO 근거 탭 → 시트 ATO 유지; OpROA 선택 후 실제 스크롤 장면 2에서도 OpROA 유지.
- 모바일 기업·제표·시작일/기준일 변경 후 켐트로닉스 CFS / 2018-01-01~2019-12-31 9개 공시 확인. 슬라이더 Home/End 연속 변경 뒤 PM 시트는 최종 2019Q3/20191113000024와 일치.
- 키보드 Enter로 변수·패널 선택, Escape로 닫기, range Home/End 정상. 동작 줄이기 Enter 활성화 후 computed transitionDuration=0s 및 선택 보존 확인. OS 설정 자체 변경·에뮬레이션은 수행하지 않음(기존 prefers-reduced-motion 규칙 유지).
- 원천 계보 CSV 컬럼·계정·DART 링크·공시일·이용 가능일과 원천 의미 REVIEW 유지. 미확인 회계기간을 채우지 않음.
- 브라우저 error/warn 빈 목록. 종료된 이전 브라우저 탭 핸들 1회 실패 후 새 검증 탭 사용. 근거 버튼 위 설명 겹침으로 클릭이 열리지 않은 상태를 확인한 뒤 키보드로 검증; 같은 실패 반복하지 않음.
- 기존 회귀 테스트 4개 통과: identifiers_and_counts, formulas_without_replacing_csv, asof_and_unknown_receipt_fail_closed, independent_confirmed_errors_are_flagged_not_silently_replaced (6.868s).
- node --check 통과. 작업 전 SHA-256 대비 server.py/lineage.py/provenance.py/web/index.html/web/dupont.js/web/dupont.css/프리뷰 style.css 7개 모두 동일.

## 남은 오류와 범위

- 이번 선택 충돌은 검증한 데스크톱·모바일 시나리오에서 재현되지 않음.
- **기존 레이아웃 문제:** 데스크톱에서 스토리 설명이 sticky 작업면의 우측 하단 근거 버튼을 가려 포인터 클릭이 열리지 않는 구간이 있음. Enter는 정상. 선택 상태 충돌과 별개이며 이번 UI 변경 범위를 넘기지 않기 위해 CSS·레이아웃 수정하지 않음.
- 전체 금융데이터의 의미 검증 완료를 뜻하지 않음. OS reduced-motion 실제 설정 변경 검증과 전체 기업 전수 브라우저 검증은 수행하지 않음.

## 이번 변경 파일과 캡처

- web/design-preview/app.js (선택/설명/관측/패널 상태 분리만)
- docs/WORK_STATUS.md
- docs/preview-fix-baseline.json (보존 확인용 SHA-256)
- docs/preview-fix-pm-desktop.jpg, docs/preview-fix-pm-mobile.jpg (PM 유지 실제 캡처)

주소: http://127.0.0.1:8768/design-preview/overview / http://127.0.0.1:8768/design-preview/dupont . 기존 운영 화면·금융 계산·CSV·출처 API·디자인 CSS 변경 없음. 디자인 최종 승인 대기, 다른 페이지 확장 없음.

# 2026-10-22 · Phase 3 계산·근거 탐색 UX 수정 완료

## 이번 변경

- DuPont 작업면의 sticky 겹침을 제거하고 설명 구간과 정상 문서 흐름으로 분리. 수익성 평면 좌표·계산·데이터는 유지. 스크롤한 설명 구간에서 근거 버튼으로 돌아와 마우스로 여는 동작 확인.
- 첫 화면은 선택 변수 → 실제 계산식 → 기록값/입력값 → 검증 상태 → 접힌 입력 항목 순서. 기본적으로 보고서 나열을 숨기고 입력을 펼칠 때 TTM 가감 구성·fact_id·원천 계정이 단계적으로 나타남.
- CSV 컬럼 → fact_id → 원천 계정 → 공시 보고서 경로 표시. 입력/원천 fact 선택에 따라 연결 보고서 우선 정렬·강조. 다른 입력 보고서는 구분하여 낮은 대비로 표시. 원문 회계기간·사본 상태는 보고서의 추가 펼침으로 제공.
- 숫자는 기존 value()/blocked()/eligible() 정책과 API 응답을 재사용. 새로운 계산값 생성·원천 금액 보정 없음. 식의 실제 컬럼을 읽기 쉬운 입력명으로 바꾸고 기존 기록값을 대입해 표시(금융 재계산 없음).
- 모바일은 390×844 화면 전체를 사용하는 계산·근거 시트. 상단 닫기 고정, 본문 자체 스크롤, 배경 스크롤 차단, 공시 보고서로 이동 버튼 제공. 접근성은 네이티브 dialog의 배경 비활성화를 사용하되 시각적으로 전체 화면 탐색 UI.
- 패널 열기/닫기가 선택 변수·기업·기간·관측을 바꾸지 않음. 기존 선택/설명 분리 유지. 닫기 후 호출 버튼으로 포커스 복귀. 비동기 계보 갱신 시 최초 호출 포커스를 덮어쓰지 않음. Tab/Shift+Tab 순환은 접힌 details 내부를 제외.

## 실제 검증

- 데스크톱 1440×1000: PM→계산 경로 마우스 열기, PM→원천 근거 마우스 열기, 설명 구간까지 실제 스크롤 후 근거 버튼 마우스 열기 모두 성공. 마지막 패널 PM/20191113000024 유지.
- 첫 화면에서 TTM 구성/보고서 목록을 접고 시작함 확인. 영업이익 TTM 펼치면 실제 2019 Q3 ytd (+), 2018 Q3 ytd (−), 2018 Q4 ytd (+)와 F030167/F030169/F030464 표시.
- F030167 선택: 20191113000024를 연결 보고서로 최상단 강조, 20190401003890은 다른 입력 근거로 분리. 실제 공시일 2019-11-13 / 이용 가능일 2019-11-14 확인. 계정·제표 ID의 미확인은 추정하지 않음.
- 실제 참고값 열기: PM 252.34억 원 ÷ 3,789.84억 원 → 기록값 6.66%, F030167 원천 22,993,384,704원 모두 검토용 CSV 기록/REVIEW로 표시. 기본 참고값 끔에서는 숫자 미표시 유지.
- ATO→평균 NOA→당기 NOA→총자산/유동부채 단계 확장 확인. 확정 프로젝트 NOA 정의 및 평균 정의 유지.
- 오류 영향 정책: 우전앤한단 052270 OFS, 2018Q1/20180515000925. 참고값 켜도 sales_ttm·PM 및 펼친 원천 금액은 차단. 독립 재검증 오류 영향/원본 CSV 유지/REVIEW 상태 유지.
- 모바일 390×844: 전체 화면 시트 높이 844, 가로 넘침 없음. 입력 펼침·보고서 이동 후 내부 스크롤 및 보고서 영역 포커스 확인. 마우스/터치 방식 닫기 후 calculation-open으로 복귀, PM·같은 관측·기업·기간 유지.
- 키보드 Enter 입력 펼침·fact 선택, Escape 닫기, Tab/Shift+Tab 시트 안 순환 확인. 접힌 입력 안의 숨은 버튼은 순환 대상에서 제외. 동작 감소 설정에서 전환 0s 확인. OS 설정 자체는 변경하지 않음.
- 포커스 테스트에서 초기 역방향 Tab이 문서 쪽으로 이동하는 동작을 발견해 명시적 순환 처리 추가. 숨은 details 후손 제외 후 최종 Shift+Tab은 마지막 ATO summary, Tab은 닫기 버튼으로 복귀. 동일 원인 오류를 반복한 자동 수정 없음.
- 브라우저 error/warn 빈 목록. node --check 통과.
- 기존 회귀 테스트 4개 통과(3.987s): identifiers_and_counts, formulas_without_replacing_csv, asof_and_unknown_receipt_fail_closed, independent_confirmed_errors_are_flagged_not_silently_replaced.
- 작업 전 SHA-256 대비 server.py/lineage.py/provenance.py/web/index.html/web/dupont.js/web/dupont.css 6개 동일. 이번 작업은 원천 CSV/XML 수정 및 서버 API 수정 없음.
- 읽기 전용 로컬 API를 셸로 조회하려던 1회는 샌드박스 소켓 WinError 10013으로 차단. 같은 명령 반복하지 않고 기존 lineage.py 구조와 실제 브라우저 UI로 확인. 편집 중 1회 텍스트 읽기 인코딩 실패는 encoding=utf-8을 명시하여 해결. 금융 자료 접근 오류나 인증 변경 없음.

## 변경 전후와 파일

- 변경 전: docs/evidence-ux-before-desktop.jpg (기존 큰 계정·보고서 나열 화면).
- 변경 후 첫 화면: docs/evidence-ux-after-desktop.jpg.
- 입력/fact 선택 후: docs/evidence-ux-after-desktop-expanded.jpg.
- 모바일 전체 화면: docs/evidence-ux-after-mobile.jpg.
- 모바일 보고서 이동: docs/evidence-ux-after-mobile-reports.jpg.
- 오류 영향 정책: docs/evidence-ux-review-policy.jpg.
- 코드 변경: web/design-preview/app.js, web/design-preview/style.css.
- 기록: docs/WORK_STATUS.md, docs/evidence-ux-baseline.json 및 위 캡처.

최신 주소: http://127.0.0.1:8768/design-preview/dupont . 검증한 범위에서 버튼 가림·선택 충돌·닫기 포커스 오류 재현 없음. 원천 의미 검증 미완료와 일부 원문 회계기간 미확인은 기존대로 남음. 전체 기업/보조기기 전수 검증은 아님. 이번 범위를 완료하고 디자인 승인까지 대기. 다른 화면 확장·OAuth·DB 이전·AWS 배포 없음.

# 2026-10-22 · 디자인 기준 v1 확장 / 첫 번째 묶음 완료

## 구현 범위와 경로

- 실제 기업 분석: http://127.0.0.1:8769/research/company
- 데이터 계보·공시 근거: http://127.0.0.1:8769/research/lineage
- 승인된 두 기준 화면을 덮어쓰지 않고 별도 신규 자산으로 구현. /design-preview의 개요·DuPont JS/CSS/HTML은 이번 작업에서 수정하지 않음.
- 기존 start.ps1과 WORK_STATUS에 기록된 DataDir/AuditDir을 재사용하여 8769에 읽기 전용 서버 실행. Drive 재검색·전체 복사·인증·동기화 없음.

## 화면과 실제 데이터 연결

- 기업 분석: 공통 시간 구간의 두 범위 조절기, 수익성/영업 규모/공시 시점 질문 선택. PM·ATO·OpROA 또는 실제 매출·영업이익·NOA를 각각의 단위/축에서 공시 이용 가능일의 점으로 표시. 분기 재무를 일별 값으로 보간하지 않음. 실제 공시 이용일 층과 선택 커서를 공유.
- 가격층: 기존 /api/prices를 사용하되 이번 실행에서는 선택 기업/기간의 points가 0건. 화면에 실제 가격 관측 없음으로 명시. 가격 대체값·수익률·급락/가치훼손 판정 생성 없음. 기존 서버가 기대하는 가격 위치는 프로젝트 상위 ROOT/KRX_20종목_2015-2025_확보자료/01_종목가격_2015-2025_수정주가미확인.csv. 위치 재검색·경로 어댑터·서버 계산 수정은 이번 묶음에서 수행하지 않음.
- 계보: 결과 CSV 컬럼 → 선택 계산 입력 → 저장된 fact_id/TTM 가감 구성 → 다대다 DART 보고서의 독립 경로 그래프. Hover는 관련 경로 강조, 원천 행/보고서 선택은 문서면의 실제 계정·표/열·금액·출처를 변경. 모바일은 그래프를 축소하지 않고 계층별 세로 탐색으로 배치.
- 기존 /api/catalog, /api/series, /api/lineage, /api/prices, /api/source-fact, /api/xml 재사용. 감사 영향 상태도 lineage/series 응답의 audit_issues/source_issues를 사용. API 본문 변경 없음.
- 모든 재무 참고값은 기본 꺼짐. 명시적 REVIEW 선택 후에만 표시하며, 확인된 오류 영향과 결측은 차단. 검색 일치·산식 일치를 회계 의미 검증 완료로 승격하지 않음.
- 기업·재무제표·기간·공시·지표·참고값 보기·질문·시간 구간과 선택 입력/fact/보고서를 두 신규 화면의 URL 맥락으로 전달. 새로고침·화면 왕복에서도 해당 관측에 유효한 선택만 복원. 기업·기간 적용 시 관측은 해당 범위 최신으로 초기화하고, 변수 선택은 유지. 이전 요청은 세대 식별자로 무효화.
- 원문은 /api/xml의 실제 응답만 표시. 검증한 20190401003890은 source_unavailable로 응답하여 공식 DART 링크와 사본 없음 메시지를 표시. 원문 회계기간·행·계정/제표 ID가 없으면 미확인. 실제 텍스트 인용을 만들지 않음.

## 실제 브라우저 검증

- 데스크톱 1440×1000, 모바일 390×844 두 화면 렌더링 확인. 모바일 document.scrollWidth 375 < innerWidth 390, 가로 넘침 없음. 모바일 타임라인은 별도 440 단위 viewBox, 계보는 세로 계층.
- 기업 화면 수익성↔영업 규모 질문 선택에 따라 실제 표시 지표 변경. 구간 시작/끝 키보드 Arrow 이동으로 공통 시간 구간과 관측 개수 변경. 공시 선택 20180814000443 후 재무/출처/시간 커서 동기화 확인.
- 켐트로닉스 CFS 전체 구간은 21개 공시 시점. 선택한 2019Q3/20191113000024의 PM 6.66%는 실제 CSV 참고 관측으로만 표시.
- 계보에서 실제 TTM 원천 F030167/F030169/F030464 확인. F030464 선택 시 20190401003890 사업보고서가 우선 강조되고, 문서면은 원천 9,397,971,114원/표47/열1과 공시일2019-04-01/이용가능일2019-04-02로 변경. 의미는 REVIEW.
- CSV 파일명 Hover 전용 요소를 실제 포인터 클릭으로 진입시켜 mouseenter 툴팁 확인(해당 요소에는 선택 클릭 동작 없음). 관련 노드6개/경로8개 강조 확인. 재무 점의 키보드 focus/Enter에서도 실제 날짜·지표·값·REVIEW 툴팁 확인.
- 모바일에서 2018Q2/20180814000443, 구간2015-08-18~2019-08-14 맥락이 계보로 전달됨 확인. F030758 선택은 새로고침과 기업 화면 왕복 뒤에도 복원. 반복 렌더링 후 키보드 포커스가 선택 원천에 남도록 처리.
- 스크롤 설명은 두 신규 화면에서 scene=1로 전환되고 선택 공시/REVIEW 설명 및 강조가 바뀜. 선택 지표·공시는 스크롤이 변경하지 않음. 동시에 진입한 설명은 뒤 장면을 우선하여 빠른 스크롤에도 일관되게 처리.
- 동작 줄이기에서 새 노드 transitionDuration=0s 확인. OS 설정 자체 변경 없음. 기본 CSS의 prefers-reduced-motion도 유지.
- 우전 052270 OFS / 2018Q1/20180515000925: 참고값을 켜도 PM 결과와 원천 금액/원문 셀 차단 확인. 기업 화면의 해당 오류 영향 재무 좌표 개수0 확인. 원본 CSV 값은 수정하지 않음.
- 참고값 끄면 그래프·원천 금액·원문 셀이 모두 숨겨지고 숫자 인용 검색도 비활성화됨.
- 최종 브라우저 error/warn 빈 목록. 포커스를 받지 않는 h2에 키를 보내려던 자동화 1회 실패 후 현재 스크롤 위치를 읽고 페이지 키로 확인. 같은 실패 명령 반복 없음. 데이터 권한·인증 오류 없음.

## 테스트와 보존

- node --check web/research/app.js 통과.
- 기존 회귀 테스트 5개 통과(10.840s): identifiers_and_counts, formulas_without_replacing_csv, asof_and_unknown_receipt_fail_closed, independent_confirmed_errors_are_flagged_not_silently_replaced, fact_links_and_ttm_multiple_receipts.
- 작업 전 SHA-256 대비 기존 금융·원천 코드 및 UI 8개 파일 동일. server.py는 신규 정적 경로4개만 추가. API 처리부 SHA-256은 이전 기록과 동일한 5638e3581c9530ca7f6eec2f6758168c83fd7d63c573bcc972436ee10f762aaf.
- 원본 CSV/XML/감사 자료 변경·복사 없음. 금융 계산식/서버 API/기존 화면 수정 없음. 전체 금융 검증 완료나 전체 기업 전수 브라우저 검증을 뜻하지 않음.

## 변경 파일과 캡처

- 신규 web/research/index.html
- 신규 web/research/app.js
- 신규 web/research/style.css
- server.py: /research/company, /research/lineage, /research/app.js, /research/style.css 정적 허용 경로만 추가
- docs/WORK_STATUS.md, docs/batch1-baseline.json
- docs/batch1-company-desktop.jpg / docs/batch1-company-mobile.jpg
- docs/batch1-lineage-desktop.jpg / docs/batch1-lineage-mobile.jpg
- docs/batch1-lineage-source-desktop.jpg / docs/batch1-review-blocked.jpg

가격 관측과 일부 XML은 현 API에서 미연결이므로 실제 값/인용을 채우지 않았으며 화면에 상태를 남겼음. 신규 두 화면끼리의 선택 전달을 검증했으며 기존 독립 DuPont 진입 동작은 변경하지 않음. 첫 번째 묶음 구현과 검증을 마치고 사용자 확인 대기. 나머지 화면·OAuth·자동 동기화·DB 이전·AWS 배포는 시작하지 않음.

## 2026-10-22 가격 데이터 제한적 연결 완료

- 직접 원인: /api/prices가 현재 PC에 없는 기존 로컬 기본 CSV를 참조. DART_PRICE_CSV 환경변수 / start.ps1 -PriceCsv 인자로 읽기 전용 경로를 주입하도록 추가. 기존 기본 경로 유지, 코드에 Drive 절대 경로 하드코딩 없음.
- 승인 원본: G:\내 드라이브\skku_fds_main\데이터\KRX\1_개별종목가격.csv. 원본 수정·변환·복사 없음.
- 원본 50,317행 / 20종목. 종목 매핑 일치, 코드 앞자리 0 보존. 필수 결측·중복 종목/날짜·역순·잘못된 날짜·비양수/비유한 종가 0건. 전체 종가의 기존 숫자 파싱 결과와 원문 십진값 정확히 일치.
- 켐트로닉스 089010 전체 2,700건, 2015-01-02~2025-12-30. 2015~2019 선택 구간 CSV/API/화면 각 1,227건.
- CSV/API/UI 대조: 2015-01-02=9,650원; 2017-06-28=6,540원; 2019-12-30=18,050원. 2019-12-29는 가격 관측 없음, 2010년 구간은 API/화면 0건. 비관측일을 생성하거나 연결 보간하지 않음.
- API의 기존 date/close points 계약 유지. 출처 파일명, observation_count/source_row_count, adjustment_status=unverified, volume_status=not_provided, quality_status=not_fully_validated를 추가. daily_change_pct는 읽은 원본 행에만 보존하고 API 포인트/화면 분석값으로 사용하지 않음.
- UI 종가(원)/실제 거래일, 조정 여부 미확인 종가, 거래량 미제공, 전체 가격 품질 미검증 명시. 가격 선택은 재무 receipt와 분리. 공시일/이용가능일은 기존 날짜 유지.
- 브라우저 데스크톱 1440×1000 / 모바일 390×844 검증. 모바일 scrollWidth375로 넘침 없음. Hover/Click/기간 브러시 키보드/날짜 조회/결측 표시 확인. 입력 중 날짜가 비동기 재렌더링으로 초기화되는 문제 1회 발견 후 draft 상태 분리; 재렌더링을 유발한 뒤 날짜 확인 및 6,540원 표시 정상. 같은 오류 재발 없음.
- 계보 왕복 시 price_date=2017-06-28, receipt=20191113000024 유지. PM→operating_profit_ttm→F030167→DART 20191113000024, 공시2019-11-13/이용2019-11-14 및 REVIEW 상태 유지. 브라우저 error/warn 0건.
- 회귀/가격 연결 테스트 7개 통과(11.941초), node --check 통과. 결과 price-readonly-audit.json / price-api-check.json / price-ui-check.json, 실제 캡처 price-connected-desktop.jpg / price-connected-mobile.jpg.
- 읽기 전후 원본 SHA256 동일: fbdfa5eaddf5dde2855301c89876e96919eff0498d8f316c6a22aff702dd4755.
- 미검증: 수정주가 여부, 기업행동/분할, 공식 거래소 가격 대조, 거래소 휴장·정지 캘린더, 극단 가격 신뢰성 및 전체 가격 품질. 날짜 합집합 비교는 공식 거래일 캘린더 검증이 아님. 거래량은 원본에 미제공. 금융 계산식과 금융 원천 파일 변경 없음.
- 실행: 기존 DataDir/AuditDir 인자에 -PriceCsv '<승인 CSV 절대 경로>'를 추가하거나 DART_PRICE_CSV를 프로세스 환경변수로 지정. 최신 로컬 확인 http://127.0.0.1:8770/research/company . 사용자 확인까지 다른 화면 확장 중단.
