# FDS 가이드 (`/guide`)

프로젝트를 처음부터 끝까지 실제 데이터로 따라가는 읽기 전용 안내 사이트. 기존 화면과 API는 건드리지 않는다.

| 파일 | 역할 |
|---|---|
| `index.html`, `style.css` | 껍데기와 디자인 |
| `core.js` | 가격 차트, F-Score·DuPont·Ohlson 시각화, 찾아보기, 파일 서랍 |
| `pages.js` | 처음 / 데이터 / 모델 / 따라가기 / 현황 페이지와 설명 문구 |
| `data.json` | `build_guide_data.py`가 드라이브에서 만든 데이터 (직접 고치지 않음) |
| `drive_links.json` | 폴더·파일별 Google Drive 공유 링크 (사람이 채움) |

## 실행

```powershell
python build_guide_data.py                # 드라이브를 읽어 data.json 생성 (폴더 스캔 때문에 몇 분)
python build_guide_data.py --reuse-files  # 폴더 목록은 재사용하고 점수·가격·링크만 갱신 (빠름)
.\start.ps1 -Port 8770 ...                # 기존 서버. 이후 http://127.0.0.1:8770/guide
```

`server.py`는 `/guide*` 경로만 추가로 열어 두었고, 이 경로에 한해 CSP에서 인라인 스타일과 jsdelivr(Pretendard 폰트)를 허용한다. 스크립트는 `'self'`만 허용한다.

## 드라이브 자료가 바뀌면

1. 새 파일/폴더는 `python build_guide_data.py`를 다시 돌리면 "데이터 > 드라이브 탐색"과 "현황 > 최근에 바뀐 자료"에 나타난다 (새로 생긴 것은 NEW).
2. 폴더·파일 설명은 `build_guide_data.py`의 `DESCRIBE`에 한 줄 추가.
3. 데이터 여정 단계 문구는 `pages.js`의 `STEPS`, 용어는 `GLOSS`, 팀 결정은 `DECISIONS`, 일정·진행률은 `WEEKS`/`WS`.
4. 단계 숫자(가격 행 수, 검증 건수 등)는 드라이브의 검증 JSON에서 자동으로 읽는다.
5. 새 모델이 확정되면 `pages.js`의 `MODELS`에 항목을 추가하고 `vis` 함수를 연결.

## 드라이브 링크 연결

`drive_links.json`의 `paths`에 `"데이터/KRX": "https://drive.google.com/drive/folders/..."` 형식으로 추가하고 `--reuse-files`로 다시 생성하면, 그 경로와 하위 항목의 "Drive에서 열기" 버튼이 해당 링크로 바뀐다. 등록 전에는 루트 폴더로 연결하고 경로 복사 버튼을 제공한다.

## 알려진 한계

- 가격은 조정 여부 미확인 원본 종가. 가격만 크게 뛰고 시가총액은 그대로인 날은 "가격 단위 변경 의심"으로 표시하고 수익률은 시가총액 기준을 함께 보여준다.
- 점수 경계, r=8.5%는 검증 전 가설. 가격 탐지(CUSUM·급락) 시연은 시장 조정 없는 단순 버전이다.
- 점수·판정은 `서서히모델_v0`가 계산한 값을 그대로 쓴다(JS로 다시 구현하지 않음).
