"""가이드 사이트(/guide)용 데이터 생성기.

공유 드라이브(읽기 전용)를 훑어 web/guide/data.json 을 만든다. 원본은 읽기만 하고 복사·수정하지 않는다.
드라이브에 자료가 추가·수정되면 이 스크립트를 다시 실행하면 가이드가 따라간다.

    python build_guide_data.py                       # 기본 경로 사용
    python build_guide_data.py --drive "G:\\내 드라이브\\skku_fds_main"

만드는 것
  files     : 드라이브 데이터 폴더 목록(크기·수정일·설명·새로 생긴 파일 표시)
  tables    : 개발자 전달 샘플 14개 파일의 컬럼 사전·행 수·미리보기
  stocks    : 샘플 11종목의 가격(일별 종가)과 재무 스냅샷, 서서히 모델 점수 격자
  journey   : 데이터 수집 단계별 실제 수치 (검증 JSON에서 읽음)
  links     : 드라이브 링크 (web/guide/drive_links.json 에서 사람이 채움)
"""
import argparse
import csv
import io
import json
import math
import sys
from datetime import datetime, date
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / 'web' / 'guide'
DEFAULT_DRIVE = Path(r'G:\내 드라이브\skku_fds_main')

SKIP_NAMES = {'desktop.ini', '.DS_Store', 'Thumbs.db'}

# 폴더/파일 설명. 키는 드라이브 루트 기준 경로(슬래시). 가장 긴 접두어가 이긴다.
DESCRIBE = {
    '데이터': ('모든 데이터', '', 'KRX 시세, OpenDART 재무, 검증, 개발자 전달본이 들어 있는 폴더'),
    '데이터/KRX': ('가격·지수·업종', '', '선정한 종목의 일별 가격과 시장·업종 비교 자료. 서서히 모델의 가격 탐지 입력'),
    '데이터/KRX/1_개별종목가격.csv': ('개별 종목 일별 가격', '', '20종목 2015~2025 종가. 대시보드 가격 차트의 원본'),
    '데이터/KRX/2_시장지수.csv': ('시장 지수', '', '코스닥 등 시장 지수 일별 값'),
    '데이터/KRX/3_산업ETF.csv': ('산업 ETF 가격', '', '업종 비교 후보로 본 ETF 가격(산업 분류가 아니라 참고 대안)'),
    '데이터/KRX/4_종목별과거업종.csv': ('종목별 과거 업종', '', '2015년 당시 KRX 업종명'),
    '데이터/KRX/20개종목_산업ETF_후보매핑_지엔코추가.csv': ('종목 ↔ ETF 후보 매핑', '', '종목마다 비교할 만한 ETF와 적합도(높음/중간/낮음) 검토 메모'),
    '데이터/Open Dart': ('재무·공시 (OpenDART)', '', '재무제표 수집 → 보완 → TTM 변환 → 전수 재검증 순서로 단계별 폴더가 쌓여 있음'),
    '데이터/Open Dart/OpenDART_20종목_2015-2019_확보자료': ('① 1차 수집본', '', 'API로 처음 받은 20종목 재무와 미확보 항목 목록'),
    '데이터/Open Dart/OpenDART_보완통합본': ('② 보완 통합본', '', 'API에서 빠진 값을 공시 원문에서 복구하고 한 표로 합친 폴더'),
    '데이터/Open Dart/OpenDART_TTM_corp': ('③ TTM 변환 (corp_code 추가)', '', '누적 값을 분기·최근 12개월(TTM)로 바꾼 표에 기업 고유번호를 붙인 중간본'),
    '데이터/Open Dart/OpenDART_TTM_팀원전달_최종본(지해)': ('④ TTM 팀원 전달 최종본', '','분기 변환, 일별 입력, NOA/DuPont/Ohlson 입력 표. 대시보드가 읽는 DataDir'),
    '데이터/Open Dart/OpenDART_전수재검증_검토용(나현)': ('⑤ 전수 재검증', '','4번 데이터를 독립 코드로 다시 계산·대조한 결과. 대시보드가 읽는 AuditDir'),
    '데이터/Open Dart/서서히 모델 데이터': ('서서히 모델 모형별 데이터', '', 'DuPont, F-score, Ohlson 별로 정리한 데이터 폴더'),
    '데이터/개발자전달_샘플데이터_최종': ('개발자 전달 샘플 (11종목)', '', '결측 없는 11종목을 골라 개발자가 바로 읽도록 만든 최종 샘플. 서서히 모델 v0의 입력'),
    '데이터/서서히 모델 data contract': ('데이터 컨트랙트', '', '파일마다 컬럼·행 수·중복·자료형을 검사하는 약속(Soda 형식)'),
    '데이터/raw data': ('원본·작업 기록', '', 'API 응답 원본(jsonl), 중간 점검 자료. 직접 읽기보다 근거 보존용'),
    '데이터/raw data/api_original_csv_export': ('API 응답 원본 보존', '', 'KRX·OpenDART API 응답을 가공 없이 저장한 jsonl'),
    '데이터/raw data/price_review': ('코스닥 전 종목 일별 시세 점검', '', '2014~2019 코스닥 일별 시세 152만 행 검수'),
    '데이터/raw data/selection_2015': ('종목 선정 근거', '', '2014년 손실 종목 중 20개를 고른 과정의 데이터'),
    '데이터/DB': ('DB 덤프', '', '데이터베이스 백업 파일. 복원은 아직 하지 않음'),
    '데이터/TTM': ('TTM 최종 CSV', '', 'ttm_final1.csv'),
    '모델개발': ('모델 개발', '', '모델 코드와 실행 결과'),
    '모델개발/서서히모델_v0': ('서서히 모델 v0 코드', '', 'F-Score·DuPont·Ohlson 계산과 통합 판정(Python)'),
    '모델개발/서서히모델_v0/outputs': ('v0 실행 결과', '', '매수일·평가일별 점수 CSV'),
    '서서히모델_v0': ('서서히 모델 v0 코드', '', 'F-Score·DuPont·Ohlson 계산과 통합 판정(Python)'),
    '서서히모델_v0/outputs': ('v0 실행 결과', '', '매수일·평가일별 점수 CSV'),
    '기획PT': ('기획 발표자료', '', '2026.10.15 기술 브리핑(PDF)과 3대 모형 요약(PPTX)'),
    '개발PT': ('개발 발표자료', '', ''),
    '회의록': ('회의록', '', ''),
    '주간 일지': ('주간 수행일지', '', '주차별 활동 기록'),
    'legacy': ('이전 자료', '', '초기 주제 조사와 필요 데이터 정리'),
}

# 폴더 접두어 → 데이터 여정 단계 id (journey 와 연결)
STEP_OF = [
    ('데이터/raw data/selection_2015', 'select'),
    ('데이터/KRX', 'prices'),
    ('데이터/raw data/price_review', 'prices'),
    ('데이터/raw data/krx', 'prices'),
    ('데이터/Open Dart/OpenDART_20종목', 'dart'),
    ('데이터/raw data/dart', 'dart'),
    ('데이터/raw data/api_original', 'dart'),
    ('데이터/Open Dart/OpenDART_보완통합본', 'repair'),
    ('데이터/Open Dart/OpenDART_TTM', 'ttm'),
    ('데이터/TTM', 'ttm'),
    ('데이터/Open Dart/OpenDART_전수재검증', 'audit'),
    ('데이터/개발자전달', 'sample'),
    ('데이터/서서히 모델 data contract', 'sample'),
    ('데이터/Open Dart/서서히 모델 데이터', 'sample'),
    ('모델개발', 'model'),
    ('서서히모델_v0', 'model'),
]

# 스냅샷 날짜(분기말 근처 마지막 거래일)와 점수 격자에 쓰는 날짜
SNAP_DATES = ['2016-06-30', '2016-09-30', '2016-12-29', '2017-03-31', '2017-06-30', '2017-09-29', '2017-12-28',
              '2018-03-30', '2018-06-29', '2018-09-28', '2018-12-28', '2019-03-29', '2019-06-28', '2019-09-30',
              '2019-12-30']


def clean(v):
    if v is None:
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating, float)):
        v = float(v)
        return None if math.isnan(v) or math.isinf(v) else round(v, 6)
    if isinstance(v, (pd.Timestamp, datetime, date)):
        return pd.Timestamp(v).strftime('%Y-%m-%d')
    if isinstance(v, (np.bool_, bool)):
        return bool(v)
    return v


def clean_dict(d, keep=None):
    return {k: clean(v) for k, v in d.items() if keep is None or k in keep}


def human_path(p: Path, root: Path) -> str:
    return p.relative_to(root).as_posix()


def describe(rel: str):
    best = None
    for k in DESCRIBE:
        if rel == k or rel.startswith(k + '/'):
            if best is None or len(k) > len(best):
                best = k
    if best is None:
        return None
    title, owner, text = DESCRIBE[best]
    exact = best == rel
    return {'title': title if exact else '', 'owner': owner, 'text': text if exact else '', 'inherit': best}


def step_of(rel: str):
    for pre, sid in STEP_OF:
        if rel.startswith(pre):
            return sid
    return None


def walk(root: Path, max_depth=3):
    """드라이브 목록. 깊이 제한을 넘는 폴더는 파일 수·용량만 요약."""
    rows = []
    base = root

    def rec(folder: Path, depth: int):
        try:
            entries = sorted(folder.iterdir(), key=lambda e: (e.is_file(), e.name))
        except OSError:
            return
        for e in entries:
            if e.name in SKIP_NAMES or e.name.startswith('.'):
                continue
            rel = human_path(e, base)
            try:
                st = e.stat()
            except OSError:
                continue
            if e.is_dir():
                count, size, latest = 0, 0, st.st_mtime
                for f in e.rglob('*'):
                    if f.is_file() and f.name not in SKIP_NAMES:
                        try:
                            s = f.stat()
                        except OSError:
                            continue
                        count += 1
                        size += s.st_size
                        latest = max(latest, s.st_mtime)
                rows.append({'path': rel, 'kind': 'dir', 'depth': depth, 'files': count, 'size': size,
                             'mtime': datetime.fromtimestamp(latest).strftime('%Y-%m-%d')})
                if depth < max_depth:
                    rec(e, depth + 1)
            else:
                ext = e.suffix.lower().lstrip('.')
                rows.append({'path': rel, 'kind': 'file', 'ext': ext, 'depth': depth, 'size': st.st_size,
                             'mtime': datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d')})

    rec(base, 0)
    for r in rows:
        d = describe(r['path'])
        if d:
            r['desc'] = d
        s = step_of(r['path'])
        if s:
            r['step'] = s
    return rows


def read_two_header_csv(path: Path):
    """헤더 2줄(영문/한글) CSV 읽기. 값은 문자열 그대로."""
    with open(path, encoding='utf-8-sig', newline='') as f:
        r = csv.reader(f)
        en = next(r)
        ko = next(r)
        data = list(r)
    return en, ko, data


def table_cards(sample_dir: Path):
    cards = []
    for p in sorted(sample_dir.glob('*.csv')):
        try:
            en, ko, data = read_two_header_csv(p)
        except Exception as e:  # 형식이 다른 파일은 건너뜀
            cards.append({'file': p.name, 'error': str(e)})
            continue
        if not p.name[:2].isdigit() or p.name.startswith('00_') or p.name.startswith('07_'):
            # 안내용 표는 컬럼만
            cards.append({'file': p.name, 'rows': len(data), 'cols': [{'en': a, 'ko': b} for a, b in zip(en, ko)],
                          'preview': data[:4], 'size': p.stat().st_size})
            continue
        cards.append({'file': p.name, 'rows': len(data), 'cols': [{'en': a, 'ko': b} for a, b in zip(en, ko)],
                      'preview': [r for r in data[:5]], 'size': p.stat().st_size})
    return cards


def load_model(drive: Path):
    mdir = next((p for p in (drive / '모델개발' / '서서히모델_v0', drive / '서서히모델_v0') if p.exists()), drive / '서서히모델_v0')
    sys.path.insert(0, str(mdir))
    from seoseohi.data import load_all
    from seoseohi import models as M
    from seoseohi.scoring import evaluate
    d = load_all(drive / '데이터' / '개발자전달_샘플데이터_최종')
    return d, M, evaluate


def fs_pair(d, M, stock, t):
    """연도 t 와 t-1 의 F-Score 구성 비율. M.fscore_for_year 로 신호를 그대로 받고 전기 비율은 t-1 호출로 얻음."""
    cur = M.fscore_for_year(d, stock, t)
    prev = M.fscore_for_year(d, stock, t - 1)
    if cur is None:
        return None
    keys = ['ROA', 'CFO_ratio', 'ACCRUAL', 'LEVER', 'CURRENT_RATIO', 'GROSS_MARGIN', 'ASSET_TURN']
    out = {'year': t, 'rcept_no': cur['rcept_no'], 'disclosed': clean(cur['disclosed_date']),
           'signals': [cur[k] for k in ['F1_ROA', 'F2_CFO', 'F3_dROA', 'F4_ACCRUAL', 'F5_dLEVER', 'F6_dLIQUID', 'F7_EQ_OFFER', 'F8_dMARGIN', 'F9_dTURN']],
           'score': cur['F_SCORE'], 'cur': {k: clean(cur[k]) for k in keys}, 'ltd': clean(cur['LTD']),
           'offer_dates': cur['equity_offer_dates'],
           'prev': {k: clean(prev[k]) for k in keys} if prev else None}
    # 전기 ROA 는 (t-1) 호출에서만 나옴; LEVER_prev 는 cur 에 이미 있음
    out['prev_lever_from_cur'] = clean(cur['LEVER_prev'])
    return out


def snapshots(d, M):
    stocks = d['stocks']
    out = {}
    for _, s in stocks.iterrows():
        code = s.stock_code
        snaps = {}
        for ds in SNAP_DATES:
            asof = pd.Timestamp(ds)
            f = M.fscore_asof(d, code, asof)
            fsd = None
            if 'fiscal_year' in f:
                fsd = fs_pair(d, M, code, int(f['fiscal_year']))
            du = M.dupont_asof(d, code, asof)
            oh = M.ohlson_asof(d, code, asof)
            snaps[ds] = {
                'f': fsd if fsd else {'note': f.get('note', '')},
                'd': clean_dict(du, keep={'period', 'rcept_no', 'available_date', 'PM_pct', 'ATO', 'ind_PM_median', 'ind_ATO_median', 'PM_adj', 'ATO_rel', 'peer_basis', 'peer_fallback', 'note'}),
                'o': clean_dict(oh, keep={'bsns_year', 'rcept_no', 'disclosed_date', 'mktcap_date', 'MKTCAP', 'BV', 'BV_prev', 'NI', 'Prem', 'RI', 'omega', 's', 'Q', 'flags', 'unstable', 'note'}),
            }
        out[code] = snaps
    return out


def score_grid(d, evaluate):
    """매수일 < 평가일 모든 조합의 점수·판정. 점수 계산을 JS로 다시 구현하지 않고 v0 코드가 낸 값을 그대로 쓴다."""
    grid = {}
    for code in d['stocks'].stock_code:
        g = {}
        for i, b in enumerate(SNAP_DATES):
            for n in SNAP_DATES[i + 1:]:
                if (pd.Timestamp(n) - pd.Timestamp(b)).days < 120:
                    continue
                res, _ = evaluate(d, code, b, n)
                g[f'{b}|{n}'] = {k: clean(res[k]) for k in ['F_buy', 'F_now', 'dF', 'score_F', 'dPM_adj_pp', 'dATO_rel_pct', 'score_DP',
                                                              'd_omega', 'd_s', 'd_Q', 'score_OH', 'OH_held', 'total_score', 'verdict', 'notes']}
        grid[code] = g
    return grid


def price_series(d):
    out = {}
    p = d['price']
    for code, g in p.groupby('ISU_CD'):
        g = g.sort_values('BAS_DD')
        out[code] = {'d': [int(x.strftime('%y%m%d')) for x in g.BAS_DD], 'c': [int(x) for x in g.TDD_CLSPRC],
                     'm': [int(round(x / 1e8)) for x in g.MKTCAP]}  # 시가총액 억원
    return out


def dupont_rows(d):
    """분기 단독·TTM 매출/영업이익과 PM·ATO. TTM이 4개 분기 합이라는 것을 실제 값으로 보여주기 위한 원자료."""
    out = {}
    for code, g in d['dupont'].sort_values(['bsns_year', 'quarter']).groupby('stock_code'):
        out[code] = [{'y': int(r.bsns_year), 'q': int(r.quarter), 'rq': clean(r.ifrs_Revenue_q), 'oq': clean(r.dart_OperatingIncomeLoss_q),
                      'rt': clean(r.ifrs_Revenue_ttm), 'ot': clean(r.dart_OperatingIncomeLoss_ttm), 'a': clean(r.ifrs_Assets_t),
                      'a4': clean(r.ifrs_Assets_t_4q), 'pm': clean(r.PM_pct), 'ato': clean(r.ATO), 'rc': r.rcept_no,
                      'qs': r.ttm_quarters} for _, r in g.iterrows()]
    return out


def journey_numbers(drive: Path):
    """단계별 실제 수치. 파일이 없거나 바뀌어도 있는 것만 채운다."""
    n = {}
    dd = drive / '데이터'

    def load(p):
        try:
            return json.loads((dd / p).read_text(encoding='utf-8-sig'))
        except Exception:
            return None

    sel = load('raw data/selection_2015/quality.json')
    if sel:
        n['select'] = {'universe': sel.get('source_rows'), 'days': sel.get('daily_dates')}
    pr = load('raw data/price_review/audit_summary.json')
    if pr:
        n['prices'] = {'rows': pr.get('total_rows_checked'), 'codes': pr.get('distinct_codes'), 'dups': pr.get('duplicate_rows'),
                       'yearly': {y: v.get('rows') for y, v in (pr.get('yearly') or {}).items()}}
    rp = load('Open Dart/OpenDART_보완통합본/검증결과.json')
    if rp:
        n['repair'] = {k: rp.get(k) for k in ['filing_versions', 'downloaded_documents', 'statement_facts', 'usable_statement_facts',
                                              'new_recollected_source_metric_backfills', 'single_quarter_event_rows', 'daily_rows_20_stocks',
                                              'core_ready_daily_rows']}
    au = load('Open Dart/OpenDART_전수재검증_검토용(나현)/데이터품질_최종요약.json')
    if au:
        n['audit'] = {
            'status': au.get('status'),
            'corp_pass': (au.get('corporate_mapping') or {}).get('PASS'),
            'raw_exact': (au.get('source_cells') or {}).get('raw_exact_matches'),
            'quarantined': (au.get('source_cells') or {}).get('semantic_invalid_quarantined'),
            'dates_checked': (au.get('official_filing_dates') or {}).get('checked'),
            'quarter_pass': (au.get('quarter_formula') or {}).get('PASS'),
            'quarter_missing': (au.get('quarter_formula') or {}).get('MISSING'),
            'ttm_pass': (au.get('TTM_arithmetic') or {}).get('PASS'),
            'ttm_fail': (au.get('TTM_arithmetic') or {}).get('FAIL'),
            'ttm_missing': (au.get('TTM_arithmetic') or {}).get('MISSING'),
            'dupont_pass': (au.get('DuPont_formula') or {}).get('PASS'),
            'dupont_missing': (au.get('DuPont_formula') or {}).get('MISSING'),
            'pit_pass': (au.get('explicit_fact_PIT') or {}).get('PASS'),
            'quarter_cmp': (au.get('quarter_comparisons') or {}).get('total'),
            'monetary_diff': (au.get('quarter_comparisons') or {}).get('monetary_differences'),
            'lineage_reports': (au.get('lineage') or {}).get('reports'),
            'lineage_rows': (au.get('lineage') or {}).get('source_rows'),
            'result_nodes': (au.get('lineage') or {}).get('result_nodes'),
            'changed_cells': au.get('changed_cells_logged'),
            'not_ready': au.get('not_ready_for_team_verified_delivery'),
        }
    return n


def stock_meta(d):
    s = d['stocks'].copy()
    ks = d['ksic'].set_index('stock_code')
    rows = []
    for _, r in s.iterrows():
        rows.append({'code': r.stock_code, 'name': r.stock_name_2014, 'latest': r.latest_stock_name, 'delist': r.delisting_status,
                     'industry': r.krx_industry_name, 'fs': r.fs_div, 'corp': r.corp_code,
                     'ksic': ks.loc[r.stock_code].induty_code if r.stock_code in ks.index else None})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--drive', default=str(DEFAULT_DRIVE))
    ap.add_argument('--out', default=str(OUT_DIR))
    ap.add_argument('--reuse-files', action='store_true', help='드라이브 전체 스캔(몇 분 걸림)을 건너뛰고 이전 files 목록을 재사용')
    a = ap.parse_args()
    drive, out = Path(a.drive), Path(a.out)
    if not (drive / '데이터').exists():
        sys.exit(f'드라이브 경로를 찾을 수 없습니다: {drive}')
    out.mkdir(parents=True, exist_ok=True)

    prev_paths = set()
    prev_file = out / 'data.json'
    prev_time = None
    if prev_file.exists():
        try:
            old = json.loads(prev_file.read_text(encoding='utf-8'))
            prev_paths = {f['path'] for f in old.get('files', [])}
            prev_time = old.get('generated')
        except Exception:
            pass

    if a.reuse_files and prev_file.exists():
        files = json.loads(prev_file.read_text(encoding='utf-8'))['files']
    else:
        files = walk(drive)
        for f in files:
            f['new'] = bool(prev_paths) and f['path'] not in prev_paths

    d, M, evaluate = load_model(drive)
    links_file = out / 'drive_links.json'
    if not links_file.exists():
        root_url = ''
        try:
            root_url = (drive / 'url.txt').read_text(encoding='utf-8').strip().splitlines()[0]
        except Exception:
            pass
        links_file.write_text(json.dumps({'root': root_url, 'paths': {}, 'note': '"paths"에 "데이터/KRX": "https://drive.google.com/..." 형식으로 폴더·파일별 링크를 추가하면 가이드의 "드라이브에서 열기" 버튼이 그 링크로 연결됩니다.'}, ensure_ascii=False, indent=2), encoding='utf-8')
    links = json.loads(links_file.read_text(encoding='utf-8'))

    data = {
        'generated': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'previous': prev_time,
        'drive_root': str(drive),
        'links': links,
        'files': files,
        'tables': table_cards(drive / '데이터' / '개발자전달_샘플데이터_최종'),
        'stocks': stock_meta(d),
        'dates': SNAP_DATES,
        'prices': price_series(d),
        'dupont_rows': dupont_rows(d),
        'snaps': snapshots(d, M),
        'grid': score_grid(d, evaluate),
        'journey': journey_numbers(drive),
    }
    text = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    (out / 'data.json').write_text(text, encoding='utf-8')
    new = sum(1 for f in files if f.get('new'))
    print(f'생성 완료: {out / "data.json"} ({len(text) / 1e6:.2f} MB), 파일 {len(files)}개, 새 항목 {new}개')


if __name__ == '__main__':
    main()
