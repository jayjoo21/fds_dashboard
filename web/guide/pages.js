/* FDS 가이드 · 페이지. 숫자는 data.json(드라이브에서 생성), 문구는 여기. */
'use strict';
const dashLink = (path, q = {}) => path + '?' + new URLSearchParams(q).toString();
const chipS = ([t, c]) => `<span class="chip ${c}"><i></i>${t}</span>`;
const btn = (href, t, cls = '') => `<a class="btn ${cls}" href="${href}">${t}</a>`;

const GLOSS = [
  ['TTM', '최근 4개 분기 합. 전년 연간 + 올해 누적 − 작년 같은 기간 누적.'],
  ['PIT', '판단 날짜에 공개돼 있던 자료만 쓰는 원칙. 이후 정정공시는 과거에 반영하지 않는다.'],
  ['접수번호', 'DART 공시 한 건의 14자리 번호. 앞 8자리는 접수일.'],
  ['CFS / OFS', '연결재무제표 / 별도재무제표. 서로 대체하지 않는다.'],
  ['fact_id', '원천 데이터 한 행의 고유 번호. 숫자의 출처를 거슬러 올라가는 열쇠.'],
  ['F-Score', '재무 체크 9개. 통과 1점, 0~9점. 산 날과 지금의 차이를 본다.'],
  ['PM', '영업이익률. 매출 100원당 영업이익.'],
  ['ATO', '자산회전율. 자산 1원이 만드는 매출.'],
  ['OpROA', 'PM × ATO. 자산 대비 영업이익률.'],
  ['업종 중위수', '같은 업종 회사들의 가운데 값. PM_adj, ATO_rel의 기준. 지금은 전체 표본으로 대체.'],
  ['RI', '잔여이익. 순이익 − r × 전기 자본.'],
  ['Prem', '웃돈. 시가총액 − 장부자본.'],
  ['ω', '초과이익이 이어지는 정도. Prem에서 역산한 시장의 기대. 0~1 밖이면 유보.'],
  ['Q', 's × ω. 초과이익 창출력 × 지속 기대.'],
  ['CUSUM', '음의 초과수익을 누적하는 통계량. 꾸준한 하락을 잡는다.'],
  ['해석 유보', '계산은 했으나 값이 불안정해 판정에서 뺀 상태. 0점이나 정상으로 바꾸지 않는다.'],
  ['REVIEW', '식·금액은 맞지만 회계 의미 승인이 없는 상태.'],
  ['Toulmin', '주장·근거·전제로 생각을 나누는 틀.'],
  ['RAG', '관련 공시 문단을 먼저 찾아 근거로 쓰는 방식.'],
  ['데이터 컨트랙트', '파일별 컬럼·행 수·중복·자료형 검사 규칙.'],
];
const DECISIONS = [
  ['D01', 'F-Score 순이익 범위', '전체 순이익 vs 지배주주 귀속 순이익.'],
  ['D02', '연간 값으로 쓸 보고서', '사업보고서만 vs 반기·분기 비교열 허용. 정정 버전 처리.'],
  ['D03', '총장기부채(F5) 범위', '유동성 대체분 120억원(켐트로닉스 예) 포함 여부, 중복 합산 방지.'],
  ['D04', '전환사채 공란 처리', '공란·대시를 0으로 볼 근거.'],
  ['D05', 'F7 신주 발행 범위', '유상증자만 vs 전환권 행사 포함.'],
  ['D06', 'F7 날짜·정정·철회', '발행일 귀속, 정정·철회 처리, 발행 없음의 증거.'],
  ['D07', 'Ohlson ω 식과 가정', '업무보고서 식의 괄호 범위 불명. 가격 CSV에 시가총액 컬럼 없음.'],
  ['D08', 'ATO 자산 정의', '평균 순영업자산(현재) vs 평균 총자산(업무보고서).'],
  ['D09', '산업 비교집단', '당시 KSIC, 비교집단 크기, 동시점 중위수.'],
  ['D10', '위험점수 규칙', '변화량을 0~3점으로 바꾸는 경계와 검증.'],
];

/* ───── 데이터 단계 */
const J = () => D.journey || {};
const STEPS = [
  { id: 'select', short: '표본 고정', title: '표본 고정', status: ['완료', 'green'], key: () => '20종목',
    what: '2014년 코스닥 손실 종목에서 20개를 고르고, 이후 모든 수집을 이 표본에 맞춘다.',
    why: ['표본이 바뀌면 단계마다 숫자가 어긋난다.', '선정 기준은 selection_2015, fixed_2014_bottom20 폴더에 있다. 폴더명(bottom20)과 시트명(랜덤20)이 달라 확인이 필요하다.'],
    files: ['데이터/raw data/selection_2015', '데이터/raw data/fixed_2014_bottom20', '데이터/KRX/2014_코스닥_손실종목_랜덤20.gsheet'] },
  { id: 'prices', short: '가격·지수', title: '가격·지수 수집', status: ['완료 · 수정주가 미확인', 'amber'], key: () => J().prices?.rows ? (J().prices.rows / 1e4).toFixed(0) + '만 행' : '',
    what: '코스닥 전 종목 일별 시세를 검수하고, 20종목의 2015~2025 종가 CSV와 시장지수, 업종 비교용 ETF 후보를 만들었다.',
    why: ['시장 전체 하락과 개별 하락을 가르려면 지수가 필요하다.', 'ETF는 KSIC 업종이 아니라 비교 후보다. 적합도(높음·중간·낮음)를 따로 적었다.', '종가는 액면분할 등 조정 여부가 확인되지 않은 원본이다.'],
    files: ['데이터/KRX/1_개별종목가격.csv', '데이터/KRX/2_시장지수.csv', '데이터/KRX/3_산업ETF.csv', '데이터/KRX/4_종목별과거업종.csv', '데이터/KRX/20개종목_산업ETF_후보매핑_지엔코추가.csv', '데이터/raw data/price_review'] },
  { id: 'dart', short: '재무 수집', title: '재무제표 수집', status: ['완료 · 일부 공란', 'amber'], key: () => '590 / 800',
    what: '20종목 × 2015~2019 재무제표를 OpenDART API로 받아 응답 그대로 보존했다. 연결과 별도를 구분했다.',
    why: ['공란의 이유가 다르다: 자료 없음(013), 연결 미작성, 계정명 불일치, 공란.', '상장폐지 회사도 폐지 후 기간의 공시가 남아 있어 “폐지라서 없다”고 보지 않았다.'],
    files: ['데이터/Open Dart/OpenDART_20종목_2015-2019_확보자료', '데이터/raw data/api_original_csv_export', '데이터/raw data/dart_twenty_2015_2019'] },
  { id: 'repair', short: '빈칸 보완', title: '빈칸 보완', status: ['완료', 'green'], key: () => '7,775행',
    what: 'API가 놓친 80행을 공시 원문에서 복구하고, 통합표 빈칸 181개를 더 채웠다. 계산으로 구한 15건은 따로 표시했다.',
    why: ['계산값을 API 원본처럼 두면 출처를 믿을 수 없다. 파일을 분리했다.', '손익계산서에 중복된 순이익 72쌍은 합산하지 않았다.'],
    files: ['데이터/Open Dart/OpenDART_보완통합본', '데이터/Open Dart/OpenDART_보완통합본/17_재무항목통합_현재검토본.csv', '데이터/Open Dart/OpenDART_보완통합본/먼저읽기_번호별보완현황.txt'] },
  { id: 'ttm', short: '분기·TTM', title: '분기·TTM 변환', status: ['완료 · 전달', 'green'], key: () => '24,540행',
    what: '누적 공시를 분기 단독값과 TTM으로 바꾸고, 공시 접수일 다음 거래일부터 쓰도록 날짜를 붙였다.',
    why: ['TTM은 계절을 타는 업종도 같은 기준으로 비교한다.', '정정공시는 나온 날부터만 반영한다.'],
    files: ['데이터/Open Dart/OpenDART_TTM_팀원전달_최종본(지해)', '데이터/Open Dart/OpenDART_TTM_corp', '데이터/TTM/ttm_final1.csv'] },
  { id: 'audit', short: '전수 재검증', title: '전수 재검증', status: ['검토중 · REVIEW', 'violet'], key: () => J().audit?.raw_exact ? nf.format(J().audit.raw_exact) + '셀' : '',
    what: '결과를 독립 코드로 다시 계산해 원문과 대조했다. 확인된 오류 값은 격리했다.',
    why: ['계산이 맞는 것과 의미가 맞는 것은 다르다. 판정은 REVIEW이며 검증 완료본이 아니다.', '대시보드 근거 화면이 이 결과를 읽는다.'],
    files: ['데이터/Open Dart/OpenDART_전수재검증_검토용(나현)', '데이터/Open Dart/OpenDART_전수재검증_검토용(나현)/전체_데이터_재검증_종합보고서.md', '데이터/Open Dart/OpenDART_전수재검증_검토용(나현)/데이터품질_최종요약.json'] },
  { id: 'sample', short: '개발자 샘플', title: '개발자 샘플', status: ['완료 · 컬럼 확정', 'green'], key: () => '11종목',
    what: '필요한 값이 모두 있는 11종목으로 결측 없는 샘플 14개 파일을 만들었다. 헤더는 영문·한글 2줄이고 컬럼명은 확정이다.',
    why: ['제외 9종목: 장기차입금 없는 해(5), 상장폐지(1), 재무 미수신(2), 매출총이익 계정 없음(1).', '값을 채우지 않았다.'],
    files: ['데이터/개발자전달_샘플데이터_최종', '데이터/서서히 모델 data contract', '데이터/서서히 모델 data contract/데이터컨트랙트_설명.md'] },
  { id: 'model', short: '모델 v0', title: '모델 v0', status: ['프로토타입', 'blue'], key: () => '점수',
    what: '샘플 11종목에 F-Score, DuPont, Ohlson을 돌려 산 날과 지금의 변화를 0~3점으로 바꾸고 판정한다.',
    why: ['점수 경계와 r=8.5%는 검증 전 가설.', '모든 계산은 판단일에 공개된 자료만 쓴다.'],
    files: ['모델개발/서서히모델_v0', '모델개발/서서히모델_v0/README.md', '모델개발/서서히모델_v0/outputs'] },
];
const stepTitle = id => (STEPS.find(s => s.id === id) || {}).short || id;
const fillStat = (v, suf = '') => v == null ? '–' : `<b class="num" data-count="${v}" data-suf="${suf}">0</b>`;
function fileChips(paths) { return `<div class="files">${paths.map(p => { const f = fileByPath(p); if (!f) return ''; return `<button class="file" type="button" data-file="${esc(p)}">${iconOf(f)}<span>${esc(f.desc?.title || p.split('/').pop())}</span></button>`; }).join('')}</div>`; }
const barRows = rows => `<div class="bars">${rows.map((r, i) => `<div class="bar-row"><span>${r[0]}</span><div class="t">${r[1].map(([w, c]) => `<i style="--w:${w}%;background:${c};--d:${i * .06}s"></i>`).join('')}</div><b>${r[2]}</b></div>`).join('')}</div>`;
function funnel(rows) { const mx = Math.max(...rows.map(r => r[1])); return `<div class="funnel">${rows.map(r => `<div class="fun"><b>${r[0]}</b><div class="fun-bar" style="--w:${Math.max(8, r[1] / mx * 100)}%;background:${r[3] || 'var(--blue)'}">${nf.format(r[1])}</div></div>`).join('')}</div>`; }

function stepViz(id) {
  const j = J();
  if (id === 'select') return funnel([['코스닥 시세 기록', j.select?.universe || 1045], ['고정 표본', 20, '', 'var(--violet)'], ['개발자 샘플', D.stocks.length, '', 'var(--green)']]);
  if (id === 'prices') { const y = j.prices?.yearly || {}, ys = Object.keys(y), mx = Math.max(...Object.values(y), 1); return `<div class="stats"><div class="stat">${fillStat(j.prices?.codes)}<span>종목 코드</span></div><div class="stat">${fillStat(j.prices?.dups)}<span>중복 행</span></div></div>${barRows(ys.map(k => [k, [[y[k] / mx * 100, 'var(--blue)']], nf.format(y[k])]))}`; }
  if (id === 'dart') { const it = [['매출액', 590, 729], ['영업이익', 590, 729], ['순이익', 590, 710], ['매출총이익', 556, 703], ['영업현금', 590, 723], ['총자산', 589, 726], ['장기차입금', 469, 561]]; return `<div class="legend" style="margin:0 0 10px"><span><i style="background:var(--blue)"></i>API 반환 (590조합 중)</span><span><i style="background:var(--green)"></i>보완 후 (800조합 중)</span></div>${barRows(it.map(r => [r[0], [[r[1] / 800 * 100, 'var(--blue)']], r[1]]))}<div style="height:6px"></div>${barRows(it.map(r => [r[0], [[r[2] / 800 * 100, 'var(--green)']], r[2]]))}`; }
  if (id === 'repair') return `<div class="stats"><div class="stat">${fillStat(80)}<span>복구한 API 누락 행</span></div><div class="stat">${fillStat(181)}<span>원문에서 채운 빈칸</span></div><div class="stat">${fillStat(15)}<span>계산값(분리 표시)</span></div></div>${barRows([['매출액', [[590 / 800 * 100, 'var(--blue)']], '590'], ['보완 후', [[729 / 800 * 100, 'var(--green)']], '729']])}`;
  if (id === 'ttm') {
    const rows = D.dupont_rows?.[S.stock] || [], last = rows[rows.length - 1], pick = rows.filter(x => last && (last.qs || '').split(',').includes(`${x.y}Q${x.q}`)), mx = Math.max(...pick.map(p => Math.abs(p.rq || 0)), 1);
    return `<div class="eq">TTM = 전년 연간 + 올해 누적 − 작년 동기 누적<br>4분기 = 연간 − 9개월 누적</div>${pick.length ? `<div class="small" style="margin:14px 0 4px">${esc(stockName(S.stock))} ${last.y}Q${last.q} 매출 TTM</div><div class="ttm">${pick.map((p, i) => `<i style="--h:${Math.max(6, (p.rq || 0) / mx * 100)}%;--d:${i * .12}s"><b>${won(p.rq)}</b></i>`).join('')}</div><div class="ttm-lab">${pick.map(p => `<span>${p.y}Q${p.q}</span>`).join('')}</div><div class="eq" style="margin-top:10px">${pick.map(p => won(p.rq)).join(' + ')} = <b>${won(last.rt)}</b></div>` : ''}`;
  }
  if (id === 'audit') {
    const a = j.audit || {}, row = (t, p, f, m) => { const tot = p + f + m; return `<div class="bar-row" style="grid-template-columns:96px minmax(0,1fr)"><span>${t}</span><div><div class="t"><i style="--w:${p / tot * 100}%;background:var(--green)"></i><i style="--w:${f / tot * 100}%;background:var(--red)"></i><i style="--w:${m / tot * 100}%;background:var(--line2)"></i></div><div class="small" style="margin-top:3px">${nf.format(p)}${f ? ` · 실패 ${f}` : ''}${m ? ` · 결측 ${nf.format(m)}` : ''}</div></div></div>`; };
    return `<div class="bars">${row('원문 셀', a.raw_exact || 37603, a.quarantined || 3, 0)}${row('공시일', a.dates_checked || 476, 0, 0)}${row('분기 산식', a.quarter_pass || 4728, 0, a.quarter_missing || 696)}${row('TTM 산식', a.ttm_pass || 2346, a.ttm_fail || 3, a.ttm_missing || 363)}${row('DuPont 산식', a.dupont_pass || 4214, 0, a.dupont_missing || 1210)}${row('시점 PIT', a.pit_pass || 56312, 0, 0)}</div><div class="legend"><span><i style="background:var(--green)"></i>통과</span><span><i style="background:var(--red)"></i>실패</span><span><i style="background:var(--line2)"></i>결측</span></div>`;
  }
  if (id === 'sample') return `<div class="tiles">${D.tables.filter(t => !t.error).map(t => `<button class="file big" data-file="데이터/개발자전달_샘플데이터_최종/${esc(t.file)}" type="button"><span>${esc(t.file.replace(/\.csv$/, ''))}</span><em>${nf.format(t.rows)}행 · ${t.cols.length}컬럼</em></button>`).join('')}</div>`;
  if (id === 'model') return `<div class="eq">샘플 11종목 → F-Score · DuPont · Ohlson → 0~3점 → 판정</div><div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">${btn('#/models', '모델 보기', 'ghost sm')}${btn('#/case', '따라가기', 'line sm')}</div>`;
  return '';
}

/* ═════════ 큰 그림 ═════════ */
const FLOW = [
  { k: 'in', t: '입력', st: ['설계', ''], role: '종목, 산 날, 보유 이유를 받는다.', models: [['따라가기에서 체험', '#/case']] },
  { k: 'detect', t: '탐지', st: ['시연', 'blue'], role: '시장 효과를 뺀 뒤에도 이어지는 하락과, 갑작스러운 급락을 찾는다.', models: [['서서히 모델 · 가격 탐지', '#/models/detect'], ['급락 모델', '#/models/crash']] },
  { k: 'analyze', t: '분석', st: ['동작', 'green'], role: '산 날과 지금의 재무 변화를 세 관점으로 계산한다.', models: [['F-Score', '#/models/fscore'], ['DuPont', '#/models/dupont'], ['Ohlson', '#/models/ohlson']] },
  { k: 'evidence', t: '증거', st: ['일부', 'amber'], role: '계산 결과, 공시 원문, 공개 시점을 한 묶음으로 남긴다. 모든 숫자는 접수번호로 거슬러 올라간다.', models: [['숫자 출처 따라가기', '#/case']] },
  { k: 'rebut', t: '반박', st: ['설계', ''], role: '증거로 사용자의 보유 이유를 시험한다. 결과는 지지, 반박, 전제 약화, 판단 유보 중 하나.', models: [['반박 모델', '#/models/rebut']] },
];
let FSEL = 2;
function changeVis(host) {
  const pair = [['083650', '악화'], ['089010', '개선']].map(([c, w]) => { const b = snap(c, '2017-06-30')?.f, n = snap(c, '2019-12-30')?.f; return b?.score != null && n?.score != null ? { c, w, b: b.score, n: n.score } : null; }).filter(Boolean);
  if (pair.length < 2) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="chg">${pair.map((p, i) => `<div class="chg-row"><div class="chg-name">${esc(stockName(p.c))}<small>2017-06-30 → 2019-12-30</small></div>
    <div class="chg-track"><i class="chg-seg ${p.n < p.b ? 'bad' : 'good'}" style="--a:${Math.min(p.b, p.n) / 9 * 100}%;--w:${Math.abs(p.n - p.b) / 9 * 100}%"></i><span class="chg-pt hollow" style="--x:${p.b / 9 * 100}%"><em>${p.b}</em></span><span class="chg-pt ${p.n < p.b ? 'bad' : 'good'}" style="--x:${p.n / 9 * 100}%"><em>${p.n}</em></span></div>
    <div class="chg-d ${p.n < p.b ? 'hl-r' : 'hl-g'}">${sgn(p.n - p.b, 0)}</div></div>`).join('')}</div>`;
}
function pageHome(v) {
  v.innerHTML = `<section class="wrap hero2"><div class="rv in"><h1 class="h-xl">내가 이 종목을 갖는 이유,<br>근거와 맞는가</h1><p class="sub">손실 중인 종목의 보유 이유를 데이터와 공시로 점검하는 시스템.</p></div>
    <div class="flow rv in" style="--d:.1s"><div class="flow-line">${[0, 1, 2, 3].map(i => `<i style="--d:${i * .9}s"></i>`).join('')}</div><div class="flow-nodes">${FLOW.map((f, i) => `<button class="fn" type="button" data-i="${i}" aria-pressed="${i === FSEL}"><span class="fn-dot">${i + 1}</span><b>${f.t}</b>${chipS(f.st)}</button>`).join('')}</div></div>
    <div class="fpanel" id="fpanel"></div></section>
  <section class="wrap sec"><div class="rv"><h2 class="h-lg">사례 하나로 따라가면</h2></div>
    <div class="case3 rv" style="--d:.08s"><div class="c3-col"><div class="c3-lab">사용자</div><div class="c3-card claim"><small>비에이치아이 · 2017-06-30 매수 (예시)</small><b>“해외 성장성과 경쟁력이 높아서 장기 보유”</b></div></div>
      <div class="c3-arrow"><i></i></div><div class="c3-col"><div class="c3-lab">증거 · 서서히 모델</div><div class="c3-ev" id="c3ev"></div></div>
      <div class="c3-arrow"><i></i></div><div class="c3-col"><div class="c3-lab">반박 모델</div><div class="c3-card tbd"><b>설계 단계</b><small>증거로 위 주장을 시험한다</small></div></div></div></section>
  <section class="wrap sec"><div class="rv"><h2 class="h-lg">점수가 아니라 변화</h2><p class="lead">F-Score 7은 위험한가. 값 자체로는 알 수 없고, 산 날 대비 어디로 움직였는지로 본다.</p></div><div class="vis rv" style="margin-top:26px;--d:.08s" id="chgvis"></div></section>
  <section class="wrap sec"><div class="rv"><h2 class="h-lg">11종목 한눈에</h2><p class="lead">같은 산 날, 같은 지금. 종목마다 얼마나 달랐나. 줄을 누르면 아래에서 그 종목을 본다.</p></div><div class="vis rv" style="margin-top:26px;--d:.08s" id="hzvis"></div></section>
  <section class="wrap sec"><div class="rv"><h2 class="h-lg">분석 단계를 만져 보기</h2><p class="lead">산 날을 끌면 세 모델의 계산이 바뀐다.</p></div>
    <div class="stage rv" style="--d:.1s"><div class="stage-top"><div><div class="live-name" id="stName"></div><div class="live-big" id="stBig"></div></div><div class="pills" id="stPills" role="group" aria-label="종목"></div></div><div id="stChart"></div><div id="stNote"></div><div id="stDials"></div></div></section>`;
  const showFlow = i => {
    FSEL = i; $$('.fn', v).forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i)); const f = FLOW[i], p = $('#fpanel'); p.classList.remove('in');
    p.innerHTML = `<div class="fp-in"><div class="fp-head"><span class="mono">${i + 1} / 5</span><h2>${f.t}</h2>${chipS(f.st)}</div><p>${f.role}</p><div class="fp-links">${f.models.map(m => `<a class="btn ghost sm" href="${m[1]}">${m[0]} →</a>`).join('')}</div></div>`; requestAnimationFrame(() => p.classList.add('in'));
  };
  $$('.fn', v).forEach(b => b.onclick = () => showFlow(+b.dataset.i)); showFlow(FSEL);
  const ev = $('#c3ev'), sb = snap('083650', '2017-06-30'), sn = snap('083650', '2019-12-30'), g = D.grid['083650']?.['2017-06-30|2019-12-30'];
  if (g) ev.innerHTML = [['F-Score', `${g.F_buy} → ${g.F_now}`, g.score_F], ['OpROA', sb?.d?.PM_pct != null ? `${(sb.d.PM_pct * sb.d.ATO).toFixed(1)} → ${(sn.d.PM_pct * sn.d.ATO).toFixed(1)}%` : '–', g.score_DP], ['ω', g.OH_held ? '해석 유보' : `${sb.o.omega?.toFixed(2)} → ${sn.o.omega?.toFixed(2)}`, g.OH_held ? null : g.score_OH]].map(([n, val, sc], i) => `<div class="c3-chip" style="--d:${.4 + i * .25}s"><small>${n}</small><b>${val}</b>${sc != null ? meterHTML(sc) : '<span class="chip violet">유보</span>'}</div>`).join('');
  changeVis($('#chgvis'));
  const draw = () => {
    const s = D.byCode[S.stock]; $('#stName').innerHTML = `${esc(s.name)} <span class="mono">${s.code}</span> · ${esc(s.industry)}`;
    $('#stPills').innerHTML = D.stocks.map(x => `<button class="pill" type="button" data-s="${x.code}" aria-pressed="${x.code === S.stock}">${esc(x.name)}</button>`).join('');
    $$('.pill', $('#stPills')).forEach(b => b.onclick = () => { S.stock = b.dataset.s; saveS(); draw(); });
    const dials = heroDials($('#stDials')); const big = { r: 0 }; if (!draw.hz) draw.hz = horizonVis($('#hzvis'), c => { S.stock = c; saveS(); draw(); $('.stage').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    const upd = r => { if (!$('#stBig .ret')) { $('#stBig').innerHTML = `<span class="ret num"></span><small></small>`; big.o = odo($('#stBig .ret')); } $('#stBig .ret').className = 'ret num ' + (r.ret < 0 ? 'hl-r' : 'hl-g'); big.o.set(sgn(r.ret * 100, 1, '%')); $('#stBig small').textContent = `${nf.format(r.buyP)}원 → ${nf.format(r.nowP)}원 · ${S.buy} 산 날`; $('#stNote').innerHTML = adjNote(r); dials.update(); draw.hz.update(); };
    const r0 = stageChart($('#stChart'), upd); upd(r0);
  };
  draw(); observe(v);
}

/* ═════════ 데이터 ═════════ */
let STEP_SEL = 0;
function pageData(v, sub) {
  const si = STEPS.findIndex(s => s.id === sub); if (si >= 0) STEP_SEL = si;
  v.innerHTML = `<section class="wrap sec tight"><h1 class="h-xl rv in">데이터</h1><p class="lead rv in">수집부터 모델 입력까지 8단계. 단계를 누른다.</p>
    <div class="pipe rv in" style="--d:.1s"><div class="pipe-in"><div class="pipe-line">${[0, 1, 2, 3].map(i => `<i style="--d:${i * .9}s"></i>`).join('')}</div><div class="pipe-nodes" id="pipeNodes">${STEPS.map((s, i) => `<button class="pn" type="button" data-i="${i}" aria-pressed="${i === STEP_SEL}"><span class="pn-dot">${i + 1}</span><b>${s.short}</b><em>${s.key()}</em></button>`).join('')}</div></div></div>
    <div class="spanel" id="sp"></div></section><section class="wrap sec"><div class="rv in"><h2 class="h-lg">공시 시점</h2><p class="lead">숫자는 기간이 끝나고 한참 뒤에 공개된다. 모델은 이용 가능일 이후의 값만 쓴다.</p></div><div class="pills" id="pitPills" style="margin-top:22px"></div><div class="vis rv in" style="margin-top:18px" id="pitvis"></div></section><section class="wrap sec" id="xpwrap"><div id="xp"></div></section>`;
  const pitDraw = () => { $('#pitPills').innerHTML = D.stocks.filter(s => D.dupont_rows?.[s.code]).map(x => `<button class="pill" type="button" data-s="${x.code}" aria-pressed="${x.code === S.stock}">${esc(x.name)}</button>`).join(''); $$('#pitPills .pill').forEach(b => b.onclick = () => { S.stock = b.dataset.s; saveS(); pitDraw(); }); pitVis($('#pitvis')); };
  const show = i => {
    STEP_SEL = i; $$('.pn', v).forEach(b => b.setAttribute('aria-pressed', +b.dataset.i === i)); const s = STEPS[i], sp = $('#sp'); sp.classList.remove('in'); sp.innerHTML = `<div class="sp-in"><div class="sp-head">${chipS(s.status)}<h2 class="h-md">${i + 1}. ${s.title}</h2><div class="sp-nav"><button type="button" data-d="-1" aria-label="이전" ${i === 0 ? 'disabled' : ''}>←</button><button type="button" data-d="1" aria-label="다음" ${i === STEPS.length - 1 ? 'disabled' : ''}>→</button></div></div>
      <p class="sp-what">${s.what}</p><div class="sp-body"><div class="sp-viz">${stepViz(s.id)}</div><div><div class="small" style="font-weight:700;color:var(--ink)">자료</div>${fileChips(s.files)}<details class="why"><summary>이유</summary><ul>${s.why.map(w => `<li>${w}</li>`).join('')}</ul></details></div></div></div>`;
    requestAnimationFrame(() => { sp.classList.add('in'); $$('[data-count]', sp).forEach(countUp); }); $$('[data-d]', sp).forEach(b => b.onclick = () => show(clamp(STEP_SEL + +b.dataset.d, 0, STEPS.length - 1)));
    const pn = $$('.pn', v)[i]; pn?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  };
  $$('.pn', v).forEach(b => b.onclick = () => show(+b.dataset.i)); show(STEP_SEL); pitDraw(); drawExplorer($('#xp')); observe(v);
}
let XF = { q: '', step: '', recent: false, sel: null };
function drawExplorer(host) {
  const rows = D.files.filter(f => { if (f.depth > 3) return false; if (XF.step && f.step !== XF.step) return false; if (XF.recent && !(Date.now() - Date.parse(f.mtime) < 4 * 864e5)) return false; if (XF.q) return (f.path + (f.desc?.title || '') + (f.desc?.text || '')).toLowerCase().includes(XF.q.toLowerCase()); return f.depth <= 2 || XF.step; }).slice(0, 220);
  host.innerHTML = `<h2 class="h-lg rv in">드라이브</h2><p class="lead rv in">폴더와 파일 ${nf.format(D.files.length)}개. 항목을 누르면 설명과 Drive 버튼이 나온다. 갱신 ${D.generated}</p>
    <div class="xp rv in"><div><div class="xp-tools"><input class="search" id="xq" type="search" placeholder="검색" value="${esc(XF.q)}" aria-label="파일 검색"><select class="sel" id="xs" aria-label="단계"><option value="">전체</option>${STEPS.map(s => `<option value="${s.id}" ${XF.step === s.id ? 'selected' : ''}>${s.short}</option>`).join('')}</select><button class="pill" id="xr" type="button" aria-pressed="${XF.recent}">최근 4일</button></div>
      <div class="tree">${rows.map(f => `<button class="tr" type="button" data-p="${esc(f.path)}" aria-pressed="${XF.sel === f.path}" style="padding-left:${16 + f.depth * 18}px"><span class="n">${iconOf(f)}<span>${esc(f.path.split('/').pop())}</span>${f.new ? '<span class="new">NEW</span>' : ''}</span><span class="m">${f.kind === 'dir' ? `${nf.format(f.files)}개 · ` : ''}${fsize(f.size)}</span></button>`).join('') || '<div class="empty">결과 없음</div>'}</div></div><div class="detail" id="xd">${XF.sel ? '' : '<div class="empty" style="padding:60px 10px">항목을 선택</div>'}</div></div>`;
  $('#xq').oninput = e => { XF.q = e.target.value; clearTimeout(drawExplorer.t); drawExplorer.t = setTimeout(() => { drawExplorer(host); const q = $('#xq'); q.focus(); q.setSelectionRange(XF.q.length, XF.q.length); }, 220); };
  $('#xs').onchange = e => { XF.step = e.target.value; drawExplorer(host); }; $('#xr').onclick = () => { XF.recent = !XF.recent; drawExplorer(host); };
  $$('.tr', host).forEach(b => b.onclick = () => { XF.sel = b.dataset.p; $$('.tr', host).forEach(x => x.setAttribute('aria-pressed', x === b)); fillDetail(); }); if (XF.sel) fillDetail();
}
function fillDetail() {
  const f = fileByPath(XF.sel); if (!f) return; const dl = driveLink(f.path), card = D.tables.find(t => f.path.endsWith('/' + t.file) && f.path.includes('개발자전달')), kids = f.kind === 'dir' ? D.files.filter(x => x.path.startsWith(f.path + '/') && x.depth === f.depth + 1).slice(0, 8) : [];
  $('#xd').innerHTML = `<span class="chip ${f.kind === 'dir' ? 'blue' : ''}">${f.kind === 'dir' ? '폴더' : (f.ext || '파일').toUpperCase()}</span>${f.step ? ' ' + chipS([stepTitle(f.step), 'green']) : ''}
    <h3 class="h-md" style="margin-top:12px">${esc(f.desc?.title || f.path.split('/').pop())}</h3>${f.desc?.text ? `<p style="margin-top:8px;color:var(--ink2)">${esc(f.desc.text)}</p>` : f.desc ? `<p style="margin-top:8px;color:var(--ink2)">${esc(inheritText(f.desc))}</p>` : ''}
    <dl class="kv"><dt>경로</dt><dd class="mono" style="font-size:12.5px">${esc(f.path)}</dd><dt>크기</dt><dd>${fsize(f.size)}${f.kind === 'dir' ? ` · ${nf.format(f.files)}개` : ''}</dd><dt>수정일</dt><dd>${f.mtime}</dd></dl>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:18px">${dl.url ? `<a class="btn sm" href="${esc(dl.url)}" target="_blank" rel="noopener">${dl.exact ? 'Drive에서 열기' : 'Drive 루트 열기'}</a>` : ''}<button class="btn line sm" data-copy="${esc(f.path)}" type="button">경로 복사</button></div>
    ${kids.length ? `<div class="small" style="margin-top:18px;font-weight:700;color:var(--ink)">내용</div>${kids.map(k => `<button class="file" style="margin:6px 6px 0 0" data-file="${esc(k.path)}" type="button">${iconOf(k)}<span>${esc(k.path.split('/').pop())}</span></button>`).join('')}` : ''}${card ? `<div style="margin-top:18px">${tableHTML(card)}</div>` : ''}`;
}

/* ═════════ 모델 ═════════ */
function roleVis(host, cfg) {
  host.innerHTML = `<div class="role"><div class="role-col"><div class="role-lab">받는 것</div>${cfg.inputs.map(x => `<div class="role-box">${x}</div>`).join('')}</div><div class="role-arrow"><i></i></div>
    <div class="role-col main"><div class="role-lab">${cfg.name}</div><div class="role-box big"><b>${cfg.job}</b></div><div class="role-box tbd">세부 방법 · 미정</div></div><div class="role-arrow"><i></i></div>
    <div class="role-col"><div class="role-lab">내보내는 것</div>${cfg.outputs.map(x => `<div class="role-box">${x}</div>`).join('')}</div></div>`;
  return { set() { } };
}
const MODELS = [
  { id: 'fscore', g: 0, name: 'F-Score', tag: '확정', q: '체력이 작년보다 나빠졌나', cap: '아홉 칸이 켜져 있으면 통과. 위 점은 산 날의 상태.', formula: 'F = F1 + … + F9 · ΔF = F지금 − F산날', limits: ['F5·F7 정의는 팀 결정 대기(임시 규칙).', '연간 값이라 반영이 늦다.'], scene: sceneF, scrub: true, link: ['/research/fscore', 'F-Score 작업면'] },
  { id: 'dupont', g: 0, name: 'DuPont', tag: '확정', q: '영업으로 버는 힘이 약해졌나', cap: '가로 ATO × 세로 PM = 넓이 OpROA. 점선은 산 날의 넓이.', formula: 'OpROA = PM × ATO · PM_adj = PM − 업종 PM 중위수', limits: ['비교기업 3곳 미만이면 전체 표본 중위수로 대체(D09).', 'ATO 자산 정의 확정 전(D08).'], scene: sceneD, scrub: true, link: ['/design-preview/dupont', 'DuPont 평면'] },
  { id: 'ohlson', g: 0, name: 'Ohlson', tag: '확정', q: '시장은 초과이익이 이어진다고 보나', cap: '장부자본 위에 얹힌 웃돈에서 ω를 역산. 바늘이 초록 구간(0~1) 밖이면 유보.', formula: 'RI = NI − r·BV₋₁ · ω = (1+r)·Prem / (Prem+RI) · Q = ω·s', limits: ['r = 8.5%는 초기 가정.', '가격이 떨어지면 ω도 낮게 역산된다. ΔQ만으로 원인을 단정하지 않는다.'], scene: sceneO, scrub: true, link: ['/research/ohlson', 'Ohlson 작업면'] },
  { id: 'detect', g: 0, name: '가격 탐지', tag: '시연', q: '시장 탓인가, 이 종목 탓인가', cap: '재생하면 통이 차오르고, 넘치면 경보.', formula: 'C⁻ₜ = max(0, C⁻ₜ₋₁ − zₜ − k) · 경보: C⁻ > h', limits: ['시장·업종 조정이 없는 단순 버전.', '경보는 가치 훼손의 판정이 아니다.'], scene: sceneP, scrub: false },
  { id: 'crash', g: 1, name: '급락 모델', tag: '역할만', q: '갑자기 빠진 이유가 무엇인가', cap: '비정상적인 급락을 찾고, 그 시점의 사건을 연결해 증거로 넘긴다.', formula: null, limits: ['탐지 기준과 사건 조사 방식은 아직 정하지 않았다.'], scene: h => roleVis(h, { name: '급락 모델', job: '급락을 찾고 사건과 연결한다', inputs: ['가격·거래량·지수', '공시·뉴스'], outputs: ['증거 레코드'] }), scrub: false },
  { id: 'rebut', g: 2, name: '반박 모델', tag: '역할만', q: '보유 이유가 증거와 맞나', cap: '증거로 사용자의 보유 이유를 시험한다. 결과는 지지, 반박, 전제 약화, 판단 유보.', formula: null, limits: ['검증 방식과 판정 기준은 아직 정하지 않았다.', '평가용 정답 라벨이 부족하다.'], scene: h => { roleVis(h, { name: '반박 모델', job: '보유 이유를 증거로 시험한다', inputs: ['사용자의 보유 이유', '증거 레코드'], outputs: ['지지', '반박', '전제 약화', '판단 유보'] }); const d = document.createElement('div'); d.style.marginTop = '26px'; h.appendChild(d); sceneR(d); return { set() { } }; }, scrub: false },
];
const MGROUP = ['서서히 모델', '급락 모델', '반박 모델'];
let MSEL = 'fscore', SCR = null;
function pageModels(v, sub) {
  if (sub && MODELS.some(m => m.id === sub)) MSEL = sub;
  v.innerHTML = `<section class="wrap sec tight"><h1 class="h-xl rv in">모델</h1><p class="lead rv in">탐지와 분석으로 증거를 만들고, 반박이 그 증거로 보유 이유를 시험한다.</p><div class="rv in" style="--d:.08s"><div class="pills" id="mPills" style="margin-top:26px"></div>
    <div class="mgroups">${MGROUP.map((gn, gi) => `<div class="mgroup"><div class="mg-lab">${gn}</div><div class="mtabs" role="tablist">${MODELS.filter(m => m.g === gi).map(m => `<button class="mtab" role="tab" type="button" data-m="${m.id}" aria-selected="${m.id === MSEL}"><b>${m.name}</b><span>${m.tag}</span></button>`).join('')}</div></div>`).join('')}</div></div><div id="mpanel" class="mpanel"></div></section>`;
  $('#mPills').innerHTML = D.stocks.map(x => `<button class="pill" type="button" data-s="${x.code}" aria-pressed="${x.code === S.stock}">${esc(x.name)}</button>`).join('');
  $$('#mPills .pill').forEach(b => b.onclick = () => { S.stock = b.dataset.s; saveS(); $$('#mPills .pill').forEach(x => x.setAttribute('aria-pressed', x === b)); drawModel(); });
  $$('.mtab', v).forEach(b => b.onclick = () => { MSEL = b.dataset.m; $$('.mtab', v).forEach(x => x.setAttribute('aria-selected', x === b)); history.replaceState(null, '', '#/models/' + MSEL); drawModel(); });
  drawModel(); observe(v);
}
function drawModel() {
  const m = MODELS.find(x => x.id === MSEL), p = $('#mpanel'); SCR?.stop?.(); const dataModel = m.g === 0;
  $('#mPills').style.display = dataModel ? '' : 'none';
  p.innerHTML = `<div class="m-head"><h2 class="q">${m.q}</h2><span class="chip ${m.tag === '확정' ? 'green' : m.tag === '시연' ? 'blue' : ''}">${dataModel ? esc(stockName(S.stock)) + ' · ' : ''}${m.tag}</span></div><div class="vis" id="mvis"></div>${m.scrub ? '<div class="vis scrub-box" id="mscrub"></div>' : ''}
    <div class="m-foot"><div>${m.cap ? `<p class="cap">${m.cap}</p>` : ''}${m.formula ? `<div class="eq">${m.formula}</div>` : ''}</div><div><details class="why"><summary>${m.formula ? '한계' : '아직 정해지지 않은 것'}</summary><ul>${m.limits.map(l => `<li>${l}</li>`).join('')}</ul></details>${m.link ? `<a class="link" style="margin-top:10px" href="${m.link[0]}?stock=${S.stock}" target="_blank" rel="noopener">대시보드 ${m.link[1]} ↗</a>` : ''}</div></div>`;
  const sc = m.scene($('#mvis'));
  if (m.id === 'dupont') { const w = document.createElement('div'); w.className = 'vis'; w.style.marginTop = '14px'; w.innerHTML = '<div class="vis-h"><h4>OpROA 변화 분해 · ' + S.buy + ' → ' + S.now + '</h4></div><div id="mwf"></div>'; $('#mscrub').after(w); waterfallVis($('#mwf')); }
  if (m.scrub) { const bi = D.dates.indexOf(S.buy), ni = D.dates.indexOf(S.now); sc.set(S.buy); SCR = scrubber($('#mscrub'), { value: bi, onInput: i => sc.set(D.dates[i]) }); setTimeout(() => { if (SCR && document.body.contains($('#mscrub'))) SCR.set(ni); }, 1000); }
}

/* ═════════ 따라가기 ═════════ */
const CH = [['pick', '입력'], ['price', '가격'], ['f', 'F-Score'], ['d', 'DuPont'], ['o', 'Ohlson'], ['score', '증거 요약'], ['rebut', '반박'], ['trace', '출처']];
const CLAIMS = [
  { text: '해외 성장성과 경쟁력이 높아서 장기 보유', claim: '장기 보유가 타당하다', grounds: '해외 성장성과 경쟁력이 높다', warrant: '성장·경쟁력이 유지되면 수익 창출 능력이 좋아진다' },
  { text: '손실이니 언젠가 오를 것', claim: '언젠가 오를 것이다', grounds: null, warrant: null },
];
let CLAIM = 0;
function sceneToggle(host, factory) {
  host.innerHTML = `<div class="tog" role="group"><button type="button" data-w="buy" aria-pressed="true">산 날 ${S.buy}</button><button type="button" data-w="now" aria-pressed="false">지금 ${S.now}</button></div><div class="scene"></div>`;
  const sc = factory($('.scene', host)), bs = $$('.tog button', host); const go = w => { bs.forEach(b => b.setAttribute('aria-pressed', b.dataset.w === w)); sc.set(w === 'buy' ? S.buy : S.now); }; go('buy'); bs.forEach(b => b.onclick = () => go(b.dataset.w));
  host.addEventListener('seen', () => setTimeout(() => go('now'), 900), { once: true });
}
function rebutDemo(host) {
  const c = CLAIMS[CLAIM], g = gridOf();
  const ev = g ? [['F-Score', `${g.F_buy} → ${g.F_now}`], ['OpROA', (() => { const b = snap(S.stock, S.buy)?.d, n = snap(S.stock, S.now)?.d; return b?.PM_pct != null && n?.PM_pct != null ? `${(b.PM_pct * b.ATO).toFixed(1)} → ${(n.PM_pct * n.ATO).toFixed(1)}%` : '자료 없음'; })()], ['ω', g.OH_held ? '해석 유보' : g.d_omega == null ? '–' : sgn(g.d_omega, 2)]] : [];
  host.innerHTML = `<div class="rb rv"><div class="rb-col"><div class="role-lab">사용자의 보유 이유</div><div class="role-box"><small>주장</small><b>${esc(c.claim)}</b></div><div class="role-box ${c.grounds ? '' : 'tbd'}"><small>근거</small><b>${c.grounds ? esc(c.grounds) : '없음'}</b></div><div class="role-box ${c.warrant ? '' : 'tbd'}"><small>전제</small><b>${c.warrant ? esc(c.warrant) : '없음'}</b></div></div>
    <div class="role-arrow"><i></i></div><div class="rb-col"><div class="role-lab">증거 (서서히 모델)</div>${c.warrant ? ev.map(e => `<div class="role-box"><small>${e[0]}</small><b>${esc(e[1])}</b></div>`).join('') : '<div class="role-box tbd">연결할 전제가 없다</div>'}</div>
    <div class="role-arrow"><i></i></div><div class="rb-col"><div class="role-lab">반박 모델</div><div class="role-box tbd"><b>${c.warrant ? '증거와 전제를 대조 · 판정은 구현 후' : '근거 부족 · 추가 설명 요청'}</b></div><div class="role-box tbd"><small>가능한 결과</small><b>지지 · 반박 · 전제 약화 · 판단 유보</b></div></div></div>
    <div class="note-line"><span class="chip">설계 시연</span>보유 이유는 기획 PT·계획서의 예시 문장이다. 아직 판정하지 않고, 어떤 증거가 어떤 전제와 연결되는지만 보여준다.</div>`;
  observe(host);
}
function pageCase(v) { if (matchMedia('(min-width:960px)').matches) return pageCaseScroll(v); return pageCaseInline(v); }
function pageCaseInline(v) {
  v.innerHTML = `<section class="wrap sec tight"><h1 class="h-xl rv in">따라가기</h1><p class="lead rv in">보유 이유를 정하고 증거가 만들어지는 순서를 따라간다.</p>
    <div class="case-grid"><nav class="rail" aria-label="단계">${CH.map((c, i) => `<a href="#/case" data-ch="${c[0]}"><b>${i + 1}</b>${c[1]}</a>`).join('')}</nav><div>
    <div class="chp" id="c-pick"><div id="cb"></div><div class="pills" id="clp" style="margin-top:14px"></div><div id="cstock" class="note-line"></div></div>
    <div class="chp" id="c-price"></div><div class="chp" id="c-f"></div><div class="chp" id="c-d"></div><div class="chp" id="c-o"></div><div class="chp" id="c-score"></div><div class="chp" id="c-rebut"></div><div class="chp" id="c-trace"></div></div></div></section>`;
  const draw = () => {
    const s = D.byCode[S.stock], sb = snap(S.stock, S.buy), sn = snap(S.stock, S.now);
    $('#clp').innerHTML = `<span class="small" style="align-self:center">보유 이유</span>` + CLAIMS.map((c, i) => `<button class="pill" type="button" data-c="${i}" aria-pressed="${i === CLAIM}">${esc(c.text)}</button>`).join('');
    $$('#clp .pill').forEach(b => b.onclick = () => { CLAIM = +b.dataset.c; $$('#clp .pill').forEach(x => x.setAttribute('aria-pressed', x === b)); rebutDemo($('#v-r')); });
    $('#cstock').innerHTML = `${esc(s.name)} · ${esc(s.industry)} · ${s.fs === 'CFS' ? '연결' : '별도'}재무제표 · ${esc(s.delist)}`;
    $('#c-price').innerHTML = `<h2 class="h-md">2. ${S.buy}, 샀다</h2><div class="vis rv" id="cchart"></div>`; const rt = lineChart($('#cchart'), { h: 340 });
    $('#cchart').insertAdjacentHTML('afterend', `<div class="legend"><span>${nf.format(rt.buyP)}원 → ${nf.format(rt.nowP)}원 (${sgn(rt.ret * 100, 1, '%')} · 시가총액 ${sgn(rt.mret * 100, 1, '%')})</span><span>그날 공개된 가장 최근 공시</span>${rcept(sb?.f?.rcept_no)}${rcept(sb?.d?.rcept_no)}</div>${adjNote(rt)}`);
    ['f', 'd', 'o'].forEach((k, i) => { $('#c-' + k).innerHTML = `<h2 class="h-md">${i + 3}. ${['F-Score', 'DuPont', 'Ohlson'][i]}</h2><div class="vis rv" id="cs-${k}"></div>`; sceneToggle($('#cs-' + k), { f: sceneF, d: sceneD, o: sceneO }[k]); });
    $('#c-score').innerHTML = `<h2 class="h-md">6. 증거 요약</h2><div class="vis" id="v-s"></div>`; scoreVis($('#v-s'));
    $('#c-rebut').innerHTML = `<h2 class="h-md">7. 반박</h2><div class="vis" id="v-r"></div>`; rebutDemo($('#v-r'));
    const dq = { stock: S.stock, fs: s.fs, asof: S.now };
    $('#c-trace').innerHTML = `<h2 class="h-md">8. 숫자의 출처</h2><div class="vis" id="v-t"></div><div class="tools"><a class="tool" href="${dashLink('/research/lineage', { ...dq, receipt: sn?.d?.rcept_no || sn?.f?.rcept_no || '' })}" target="_blank" rel="noopener"><b>데이터 계보 ↗</b><span>계산 입력에서 원천 fact까지</span></a><a class="tool" href="${dashLink('/research/company', dq)}" target="_blank" rel="noopener"><b>기업 분석 ↗</b><span>가격·재무·공시 시점</span></a><a class="tool" href="#/data/sample"><b>샘플 파일 →</b><span>컬럼 사전과 미리보기</span></a></div>`; traceVis($('#v-t'));
    observe(v);
  };
  casebar($('#cb'), draw); draw();
  const rail = $$('.rail a'), io2 = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const id = e.target.id.slice(2); rail.forEach(a => a.classList.toggle('on', a.dataset.ch === id)); } }), { rootMargin: '-30% 0px -60% 0px' });
  CH.forEach(c => { const el = $('#c-' + c[0]); el && io2.observe(el); }); rail.forEach(a => a.onclick = e => { e.preventDefault(); $('#c-' + a.dataset.ch)?.scrollIntoView({ behavior: 'smooth' }); });
}
function casebar(host, onChange) {
  const draw = () => { host.innerHTML = `<div class="casebar"><label class="fld">종목<select class="sel" data-k="stock">${D.stocks.map(s => `<option value="${s.code}" ${s.code === S.stock ? 'selected' : ''}>${esc(s.name)} ${s.code}</option>`).join('')}</select></label><label class="fld">산 날<select class="sel" data-k="buy">${buyOptions().map(d => `<option ${d === S.buy ? 'selected' : ''}>${d}</option>`).join('')}</select></label><label class="fld">지금<select class="sel" data-k="now">${nowOptions().map(d => `<option ${d === S.now ? 'selected' : ''}>${d}</option>`).join('')}</select></label></div>`; $$('select', host).forEach(s => s.onchange = () => { S[s.dataset.k] = s.value; if (s.dataset.k === 'buy') fixNow(); saveS(); draw(); onChange(); }); };
  draw();
}

/* ═════════ 현황 ═════════ */
const WEEKS = [['10.12–10.16', '주제·범위 확정'], ['10.19–10.23', '데이터 수집·정리'], ['10.26–10.30', '전처리·기초 분석'], ['11.02–11.06', '분석·AI 적용'], ['11.09–11.13', '서비스 구현'], ['11.16–11.20', '검증·보완'], ['11.23–11.27', '최종 정리·발표']];
const WS = [
  ['데이터', 85, [['KRX 가격·지수 수집', 'd'], ['OpenDART 수집·보완·TTM', 'd'], ['전수 재검증(기계 검사)', 'd'], ['의미 검증 완료본', 'p'], ['정정공시·수정주가', 'p']]],
  ['서서히 모델', 60, [['F-Score·DuPont·Ohlson v0', 'd'], ['점수·통합 판정', 'd'], ['정의 결정 D01~D10', 'p'], ['가격 탐지(CUSUM) 구현', 'p'], ['업종 비교집단', 'p']]],
  ['검증 대시보드', 70, [['개요·DuPont·기업 분석·계보', 'd'], ['데이터 처리·품질', 'd'], ['Ohlson·F-Score 작업면', 'd'], ['급락·반박·개발 현황', 'p']]],
  ['급락·반박 모델', 10, [['급락 이론 조사', 'p'], ['Toulmin·RAG 설계', 'p'], ['평가용 정답 라벨', 'p']]],
  ['서비스', 5, [['포트폴리오·알림', 'p'], ['2D 방·퀴즈', 'p']]],
];
function pageStatus(v) {
  const rec = D.files.filter(f => f.kind === 'file' && f.ext !== 'ini').sort((a, b) => b.mtime.localeCompare(a.mtime) || a.path.localeCompare(b.path)).slice(0, 12), now = 1;
  v.innerHTML = `<section class="wrap sec tight"><h1 class="h-xl rv in">현황</h1><p class="lead rv in">${D.generated} 기준. 진행률은 문서를 읽고 정리한 대략의 값.</p>
    <div class="road rv">${WEEKS.map((w, i) => `<div class="wk ${i < now ? 'done' : i === now ? 'now' : ''}"><span class="d">${i + 1}주차 · ${w[0]}</span><b>${w[1]}</b></div>`).join('')}</div>
    <div class="ws">${WS.map(w => `<div class="card rv"><h3>${w[0]}</h3><div class="pg"><i style="--w:${w[1]}%"></i></div><ul>${w[2].map(x => `<li class="${x[1]}">${x[0]}</li>`).join('')}</ul></div>`).join('')}</div></section>
    <section class="wrap sec"><h2 class="h-lg rv">미정 결정 10가지</h2><div style="margin-top:22px">${DECISIONS.map(d => `<details class="dec rv"><summary><span class="chip violet mono">${d[0]}</span>${d[1]}</summary><div class="b">${d[2]}</div></details>`).join('')}</div></section>
    <section class="wrap sec"><div class="split" style="align-items:start"><div><h2 class="h-md rv">최근 바뀐 자료</h2><p class="small" style="margin-top:6px">생성 ${D.generated}</p></div><ul class="recent rv">${rec.map(f => `<li><span class="dte">${f.mtime}</span><button data-file="${esc(f.path)}" type="button" title="${esc(f.path)}">${esc(f.path.split('/').pop())}</button>${f.new ? '<span class="new">NEW</span>' : `<span class="small">${fsize(f.size)}</span>`}</li>`).join('')}</ul></div></section>
    <section class="wrap sec"><h2 class="h-md rv">갱신</h2><div class="code rv" style="margin-top:18px"><span class="c"># 드라이브를 읽어 data.json 재생성 (몇 분)</span>
python build_guide_data.py
<span class="c"># 폴더 목록 재사용 (빠름)</span>
python build_guide_data.py --reuse-files</div><div class="tools" style="margin-top:28px">${[['/', '운영 화면'], ['/design-preview/overview', '프로젝트 개요'], ['/design-preview/dupont', 'DuPont'], ['/research/company', '기업 분석'], ['/research/lineage', '데이터 계보'], ['/research/pipeline', '데이터 처리'], ['/research/quality', '데이터 품질'], ['/research/ohlson', 'Ohlson'], ['/research/fscore', 'F-Score']].map(t => `<a class="tool" href="${t[0]}" target="_blank" rel="noopener"><b>${t[1]} ↗</b><span class="mono" style="font-size:12px">${t[0]}</span></a>`).join('')}</div></section>`;
  observe(v);
}

/* ═════════ 라우터 ═════════ */
const ROUTES = { home: pageHome, data: pageData, models: pageModels, case: pageCase, status: pageStatus };
function route() {
  const h = (location.hash || '#/').replace(/^#\/?/, ''), [r0, sub] = h.split('/'), r = ROUTES[r0 || 'home'] ? (r0 || 'home') : 'home', v = $('#view');
  SCR?.stop?.(); $$('#nav a').forEach(a => a.setAttribute('aria-current', a.dataset.r === r ? 'page' : 'false')); v.innerHTML = ''; ROUTES[r](v, sub);
  if (!(r === 'data' && sub)) window.scrollTo({ top: 0, behavior: 'auto' }); document.title = (r === 'home' ? '' : $('#nav a[data-r="' + r + '"]').textContent + ' · ') + 'FDS 가이드';
}
addEventListener('hashchange', route);
addEventListener('scroll', () => { const h = document.documentElement; $('#progress').style.transform = `scaleX(${h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)})`; }, { passive: true });
$('#findBtn').onclick = () => openFinder();
(async () => {
  try {
    await loadData(); $('#fresh').textContent = `자료 ${D.generated}`; $('#footMeta').textContent = `항목 ${nf.format(D.files.length)}개 · 생성 ${D.generated}`;
    buildKB([...GLOSS.map(g => ({ type: '용어', title: g[0], body: g[1], tags: g[0], go: () => openFinder(g[0]) })), ...STEPS.map((s, i) => ({ type: '데이터', title: `${i + 1}. ${s.title}`, body: s.what, tags: s.short, go: () => { location.hash = '#/data/' + s.id; } })), ...DECISIONS.map(d => ({ type: '결정', title: `${d[0]} ${d[1]}`, body: d[2], tags: d[0], go: () => { location.hash = '#/status'; } })), ...MODELS.map(m => ({ type: '모델', title: m.name, body: m.cap + ' ' + m.formula, tags: m.id, go: () => { MSEL = m.id; location.hash = '#/models/' + m.id; } }))]);
    route();
  } catch (e) { $('#view').innerHTML = `<div class="boot"><b>데이터를 불러오지 못했다.</b><br><span class="mono">python build_guide_data.py</span> 실행 후 새로고침.<br><span class="small">${esc(e.message)}</span></div>`; }
})();

/* ═════════ 따라가기: 왼쪽 장면은 고정, 오른쪽 설명이 지나가면 장면이 바뀐다 ═════════ */
const STEPS_SC = [
  { k: 'price', t: '산 날', d: '그날 샀고, 지금까지 이만큼 움직였다. 점은 사업보고서가 공개된 날과 그때의 F-Score.' },
  { k: 'f', t: 'F-Score', d: '아홉 칸의 통과 여부. 산 날에서 지금으로 넘어가면 칸이 뒤집힌다.' },
  { k: 'd', t: 'DuPont', d: '영업이익률 × 자산회전율의 넓이. 산 날 넓이(점선)와 지금 넓이를 비교한다.' },
  { k: 'w', t: 'OpROA 분해', d: '넓이가 변한 이유를 이익률과 회전으로 나눈다.' },
  { k: 'o', t: 'Ohlson', d: '장부 위에 얹힌 웃돈과 ω. 바늘이 초록 밖이면 해석을 유보한다.' },
  { k: 'score', t: '증거 요약', d: '세 모델의 변화가 0~3점으로 바뀌고, 합쳐서 판정이 나온다.' },
  { k: 'rebut', t: '반박', d: '이 증거가 보유 이유의 어떤 전제와 연결되는지. 판정은 구현 후.' },
  { k: 'trace', t: '출처', d: '점수를 눌러 펼치면 공시 접수번호까지 내려간다.' },
];
function pageCaseScroll(v) {
  v.innerHTML = `<section class="wrap sec tight"><h1 class="h-xl rv in">따라가기</h1><p class="lead rv in">보유 이유를 정하고, 증거가 만들어지는 순서를 따라간다.</p>
    <div class="rv in" style="margin-top:34px;--d:.08s"><div id="cb"></div><div class="pills" id="clp" style="margin-top:14px"></div><div id="cstock" class="note-line"></div></div>
    <div class="sc-grid"><div class="sc-pin"><div class="vis" id="pin"></div></div><div class="sc-steps" id="steps">${STEPS_SC.map((s, i) => `<div class="sc-step" data-k="${s.k}"><span class="no">${i + 1} / ${STEPS_SC.length}</span><h2>${s.t}</h2><p>${s.d}</p>${s.k === 'trace' ? '<div class="fp-links" id="trlinks"></div>' : ''}</div>`).join('')}</div></div></section>`;
  let cur = null, timer = null;
  const mount = k => {
    if (k === cur) return; cur = k; clearTimeout(timer); const pin = $('#pin'); pin.classList.add('swap');
    setTimeout(() => {
      pin.classList.remove('swap'); pin.innerHTML = '';
      const timeScene = f => { pin.innerHTML = `<div class="tog" role="group"><button type="button" data-w="buy" aria-pressed="true">산 날 ${S.buy}</button><button type="button" data-w="now" aria-pressed="false">지금 ${S.now}</button></div><div class="scene"></div>`; const sc = f($('.scene', pin)), bs = $$('.tog button', pin); const go = w => { bs.forEach(b => b.setAttribute('aria-pressed', b.dataset.w === w)); sc.set(w === 'buy' ? S.buy : S.now); }; go('buy'); bs.forEach(b => b.onclick = () => go(b.dataset.w)); timer = setTimeout(() => go('now'), 900); };
      if (k === 'price') { const rt = lineChart(pin, { h: 420 }); pin.insertAdjacentHTML('beforeend', `<div class="legend"><span>${nf.format(rt.buyP)}원 → ${nf.format(rt.nowP)}원 (${sgn(rt.ret * 100, 1, '%')} · 시가총액 ${sgn(rt.mret * 100, 1, '%')})</span></div>${adjNote(rt)}`); }
      else if (k === 'f') timeScene(sceneF); else if (k === 'd') timeScene(sceneD); else if (k === 'o') timeScene(sceneO);
      else if (k === 'w') { pin.innerHTML = '<div id="pw"></div>'; waterfallVis($('#pw')); }
      else if (k === 'score') scoreVis(pin);
      else if (k === 'rebut') rebutDemo(pin);
      else if (k === 'trace') lineageVis(pin);
      observe(pin);
    }, cur === k && !$('#pin').innerHTML ? 0 : 220);
  };
  const draw = () => {
    const s = D.byCode[S.stock]; cur = null;
    $('#clp').innerHTML = `<span class="small" style="align-self:center">보유 이유</span>` + CLAIMS.map((c, i) => `<button class="pill" type="button" data-c="${i}" aria-pressed="${i === CLAIM}">${esc(c.text)}</button>`).join('');
    $$('#clp .pill').forEach(b => b.onclick = () => { CLAIM = +b.dataset.c; $$('#clp .pill').forEach(x => x.setAttribute('aria-pressed', x === b)); if (cur === 'rebut') { const k = cur; cur = null; mount(k); } });
    $('#cstock').innerHTML = `${esc(s.name)} · ${esc(s.industry)} · ${s.fs === 'CFS' ? '연결' : '별도'}재무제표 · ${esc(s.delist)}`;
    const sn = snap(S.stock, S.now), dq = { stock: S.stock, fs: s.fs, asof: S.now };
    $('#trlinks').innerHTML = `<a class="btn ghost sm" href="${dashLink('/research/lineage', { ...dq, receipt: sn?.d?.rcept_no || sn?.f?.rcept_no || '' })}" target="_blank" rel="noopener">데이터 계보 ↗</a><a class="btn ghost sm" href="${dashLink('/research/company', dq)}" target="_blank" rel="noopener">기업 분석 ↗</a>`;
    const active = $('.sc-step.on'); mount(active ? active.dataset.k : 'price');
  };
  casebar($('#cb'), draw); draw();
  const first = $('.sc-step'); first.classList.add('on'); mount('price');
  const io3 = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $$('.sc-step').forEach(x => x.classList.toggle('on', x === e.target)); mount(e.target.dataset.k); } }), { rootMargin: '-42% 0px -42% 0px' });
  $$('.sc-step').forEach(s => io3.observe(s));
}
