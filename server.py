"""Local, read-only OpenDART dashboard. Python 3.10+, no external packages."""
from __future__ import annotations
import argparse
import csv
import hashlib
import html.entities
import json
import math
import os
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = Path(os.environ.get('DART_DATA_DIR', str(ROOT / 'OpenDART_보완통합본' / 'OpenDART_TTM_팀원전달_최종본')))
WEB = Path(__file__).parent / 'web'
METRICS = {
    'sales_ttm': ['매출액 TTM', '억원', '최근 4분기 매출액 합계', 'sales_ttm_source_receipts', ['매출액']],
    'operating_profit_ttm': ['영업이익 TTM', '억원', '최근 4분기 영업이익 합계', 'operating_profit_ttm_source_receipts', ['영업이익']],
    'NOA_t': ['NOA', '억원', '총자산 − 유동부채 (팀 정의)', 'NOA_source_receipts', ['총자산', '유동부채']],
    'ATO': ['ATO', '배', '매출액 TTM ÷ 평균 NOA', 'sales_ttm_source_receipts|NOA_source_receipts', ['매출액', '총자산', '유동부채']],
    'PM': ['PM', '%', '영업이익 TTM ÷ 매출액 TTM', 'sales_ttm_source_receipts|operating_profit_ttm_source_receipts', ['매출액', '영업이익']],
    'OpROA': ['OpROA', '%', 'PM × ATO', 'sales_ttm_source_receipts|operating_profit_ttm_source_receipts|NOA_source_receipts', ['매출액', '영업이익', '총자산', '유동부채']],
    'parent_equity_t': ['지배기업 귀속 자본', '억원', '연결 재무상태표의 지배기업 소유주 귀속 자본', 'parent_equity_source_receipt', []],
    'ni_owner_ttm': ['지배기업 귀속 순이익 TTM', '억원', '지배기업 소유주 귀속 순이익 최근 4분기 합계', 'ni_owner_ttm_source_receipts', []],
}
STATUS = {'verified_existing_value': '기존 금액 일치', 'verified_new_value': '신규 금액 확인', 'verified_not_reported': '원문 미표시', 'not_applicable': '해당 없음', 'semantic_review_required': '의미 검토 보류', 'source_unavailable': '원문 미확보'}

def price_csv_path():
    # Explicit process-local source override; preserve the historical default.
    configured = os.environ.get('DART_PRICE_CSV')
    return Path(configured) if configured else ROOT / 'KRX_20종목_2015-2025_확보자료' / '01_종목가격_2015-2025_수정주가미확인.csv'


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (ValueError, TypeError):
        return None

def split(value):
    return [v for v in value.split('|') if v]

def selected(row, keys):
    return {k: row.get(k, '') for k in keys.split()}

class Store:
    def __init__(self, package=PACKAGE):
        self.package = package
        self.companies = read_csv(package / '기업_종목_매핑표.csv')
        self.events = read_csv(package / '25_공시시점별_NOA_DuPont_Ohlson_입력_최종.csv')
        self.versions = {r['rcept_no']: r for r in read_csv(package / '01_공시버전_이용가능일_corp추가.csv')}
        self.facts = read_csv(package / '02_원문기간별금액_corp추가.csv')
        self._lineage = None
        self._provenance = None
        self.by_fact = {r['fact_id']: r for r in self.facts}
        self.owner_accounts = defaultdict(list)
        raw_path = Path(os.environ.get('DART_OWNER_ACCOUNTS', str(package.parent / '04_전체원본계정_통합.csv')))
        if raw_path.exists():
            for r in read_csv(raw_path):
                if r['account_id'] in {'ifrs_EquityAttributableToOwnersOfParent', 'ifrs-full_EquityAttributableToOwnersOfParent', 'ifrs_ProfitLossAttributableToOwnersOfParent', 'ifrs-full_ProfitLossAttributableToOwnersOfParent'}:
                    self.owner_accounts[(r['stock_code'], r['fs_div'], r['rcept_no'])].append(r)
        self.fact_index = defaultdict(list)
        for r in self.facts:
            self.fact_index[(r['stock_code'], r['fs_div'], r['source_receipt'])].append(r)
        v = package / '검증·보완자료'
        self.reviews = read_csv(v / '28_연간CFS_185건_원문검증_최종.csv')
        self.additions = read_csv(v / '신규_원천계정_보완.csv')
        self.documents = {r['rcept_no']: r for r in read_csv(v / '원문검증_근거목록.csv')}
        self.xml_files = {p.name: p for p in (v / '공시원문').glob('*.xml')}
        self.groups = defaultdict(list)
        for r in self.events:
            self.groups[(r['stock_code'], r['fs_div'])].append(r)
        for rows in self.groups.values():
            rows.sort(key=lambda r: (r['as_of_available_from'], r['trigger_receipt']))
        scores = Counter()
        for r in self.events:
            if r['fs_div'] == 'CFS' and all(number(r[m]) is not None for m in METRICS):
                scores[r['stock_code']] += 1
        # Deterministic completeness-first choice; archived XML coverage breaks ties.
        coverage = Counter(r['stock_code'] for r in self.reviews if r['verification_status'].startswith('verified_') and r.get('source_document') in self.xml_files)
        self.default = max((r['stock_code'] for r in self.companies), key=lambda s: (scores[s], coverage[s], s))
        self.scores = scores
        self.coverage = coverage
        self.prices = defaultdict(list)
        self.price_path = price_csv_path()
        self.price_source_rows = read_csv(self.price_path) if self.price_path.exists() else []
        if self.price_source_rows:
            for r in self.price_source_rows:
                if number(r['close']) is not None:
                    self.prices[r['stock_code']].append({'date':r['trade_date'], 'close':number(r['close'])})
            for rows in self.prices.values():
                rows.sort(key=lambda r:r['date'])

    def price_series(self, stock, start, asof):
        points = [r for r in self.prices[stock] if start <= r['date'] <= asof]
        return {'status':'실제 원본 관측 · 조정 여부 미확인 종가', 'unit':'원',
                'source':'제공 종목가격 CSV', 'file':self.price_path.name,
                'adjustment_status':'unverified', 'volume_status':'not_provided',
                'quality_status':'not_fully_validated', 'date_basis':'원본 trade_date · 실제 거래일',
                'observation_count':len(points), 'source_row_count':len(self.price_source_rows),
                'note':'종가 조정 여부·전체 가격 품질 미검증. 거래량 미제공. 수익률·경보·가치훼손 판정에 사용하지 않습니다.',
                'points':points}

    def lineage(self):
        if self._lineage is None:
            from lineage import Lineage
            self._lineage = Lineage(self)
        return self._lineage

    def provenance(self):
        if self._provenance is None:
            from provenance import Provenance
            self._provenance = Provenance(self)
        return self._provenance

    def source_issues(self, stock, fs, receipt, metric=None):
        return [{k:r[k] for k in ('cause','cause_detail','affected_columns','source_fact_ids','action')}
                for r in self.provenance().errors if r['stock_code']==stock and r['fs_div']==fs and r['trigger_receipt']==receipt
                and (metric is None or metric in r['affected_columns'].split('|'))]

    def project(self):
        here = Path(__file__).parent
        validation = json.loads((here/'validation.json').read_text(encoding='utf-8')) if (here/'validation.json').exists() else {}
        ui = json.loads((here/'ui-validation.json').read_text(encoding='utf-8')) if (here/'ui-validation.json').exists() else {}
        updated = max(p.stat().st_mtime for p in [Path(__file__), *WEB.glob('*')])
        return {'updated_at':datetime.fromtimestamp(updated,timezone.utc).isoformat(), 'validation':validation, 'ui_validation':ui,
                'counts':{'companies':len(self.companies),'events':len(self.events),'reviews':len(self.reviews),'xml':len(self.documents)},
                'owner':'담당자 미지정',
                'tasks':[
                    {'name':'실제 재무·공시 데이터 연결','status':'연결 구현 · 원천 오류 3건 별도 검토','criterion':'20개 기업·8개 지표 CSV 일치 및 PIT/CFS/OFS 테스트','next':'지배기업 순이익 TTM의 원천 열 선택 검토'},
                    {'name':'DART 원문·검증 결과 탐색','status':'화면 구현 · 의미 검토 잔여','criterion':'185개 검토행·51개 XML·신규 9건 연결. 기존 금액 일치 25, 신규 확인 9, 원문 미표시 11, 해당 없음 119, 의미 검토 보류 21','next':'보류 21건의 계정 범위·귀속 의미 검토'},
                    {'name':'TTM 원천 합산·재무지표','status':'CSV 산식 대조 · 원천 오류 영향 별도','criterion':'저장된 fact_id 합산 및 최종 CSV 산식 대조. 원문 의미 검증과 별도','next':'연결 범위·회계정책 변경 검토'},
                    {'name':'NOA·수정 DuPont 계보','status':'원천 규칙·금액 대조 구현','criterion':'기존 point_fact 규칙 및 기업·기간·CFS/OFS·접수번호·이용 가능일·금액 대조','next':'계정별 원문 의미·API ID 확인'},
                    {'name':'Ohlson 입력·잔여이익','status':'입력 연결 · 모형 개발 예정','criterion':'귀속 자본·순이익 CSV·공시 연결. 원천 열 선택·자본비용·전기 자본 정렬 미검증','next':'입력 계보 확정 및 자기자본비용·기대이익 가정 설계'},
                    {'name':'프로젝트 흐름·용어·단계별 설명','status':'완료' if ui.get('successful') else '검증 대기','criterion':'데스크톱·모바일 브라우저 탐색과 설명 패널 확인','next':'실제 사용자 3분 이해도 평가'},
                    {'name':'CUSUM 학습용 실험','status':'완료' if ui.get('successful') else '검증 대기','criterion':'가상 표준화 잔차와 k·h 조절 / 실제 탐지와 구분','next':'수정주가와 시장·업종 정렬 후 실제 탐지 구현'},
                    {'name':'실제 서서히·급락 탐지','status':'연구·개발 예정','criterion':'과거 정보로 회귀·임계값·오탐·지연 평가 필요','next':'수정주가·Peer 및 사건 공개시각 검증'},
                    {'name':'수정주가·시장·업종 입력','status':'종가 확보 · 조정 검증 대기','criterion':'제공 KRX 실제 종가 연결. 기업행동 조정·시장/업종 정렬은 미검증','next':'수정주가 및 수익률 입력 검증'},
                    {'name':'통합 판단·반박 모델','status':'연구·개발 예정','criterion':'Economic Warrant·RAG·전문가 평가 기준 필요','next':'근거 레코드·반론 수용 기준 설계'},
                ], 'missing':['수정주가 검증','Peer 비교 정합성','사건 최초 공개시각·뉴스 아카이브','가치훼손 정답·전문가 반박 라벨','담당자 배정']}

    def receipts(self, row, metric):
        return sorted({v for col in METRICS[metric][3].split('|') for v in split(row.get(col, ''))})

    def visible(self, receipt, asof, stock):
        v = self.versions.get(receipt)
        return bool(v and v['stock_code'] == stock and v.get('available_from') and v.get('publication_date') and v['available_from'] <= asof and v['publication_date'] <= asof)

    def value(self, row, metric, asof):
        asof = min(asof, row['as_of_available_from'])
        if row['fs_div'] != 'CFS' and metric in ('parent_equity_t', 'ni_owner_ttm'):
            return None
        receipts = self.receipts(row, metric)
        if not receipts or not all(self.visible(r, asof, row['stock_code']) for r in receipts):
            return None
        return number(row.get(metric))

    def catalog(self):
        return {'companies': [{**r, 'complete_cfs_events': self.scores[r['stock_code']], 'archived_review_rows': self.coverage[r['stock_code']]} for r in self.companies], 'default': self.default,
                'default_reason': 'CFS 8개 지표 완비 공시 시점 수 우선, 동률이면 XML 확보 검토행 수 우선',
                'metrics': {k: {'label': v[0], 'unit': v[1], 'formula': v[2]} for k, v in METRICS.items()},
                'min_date': min(r['as_of_available_from'] for r in self.events), 'max_date': max(r['as_of_available_from'] for r in self.events),
                'review_summary': dict(Counter(r['verification_status'] for r in self.reviews)), 'review_total': len(self.reviews), 'addition_total': len(self.additions), 'statuses': STATUS}

    def series(self, stock, fs, asof):
        return [{'id': r['trigger_receipt'], 'date': r['as_of_available_from'], 'year': r['fiscal_year'], 'quarter': r['quarter'],
                 'is_revision': self.versions.get(r['trigger_receipt'],{}).get('is_revision','False'),
                 'publication_date': self.versions.get(r['trigger_receipt'],{}).get('publication_date',''),
                 'source_issues':self.source_issues(stock,fs,r['trigger_receipt']),
                 'values': {m: self.value(r, m, asof) for m in METRICS}} for r in self.groups[(stock, fs)]
                if r['as_of_available_from'] <= asof and self.visible(r['trigger_receipt'], asof, stock)]

    def filing(self, receipt):
        r = self.versions[receipt]
        return {**selected(r, 'rcept_no report_nm publication_date available_from is_revision document_identity_checked analysis_xml_is_derived'),
                **self.provenance().report(receipt),
                'url': f'https://dart.fss.or.kr/dsaf001/main.do?rcpNo={receipt}',
                'xml_available': any(n.startswith(receipt + '_') for n in self.xml_files) or self.provenance().document(receipt) is not None}

    def evidence(self, stock, fs, asof, receipt, metric):
        row = next((r for r in self.groups[(stock, fs)] if r['trigger_receipt'] == receipt and r['as_of_available_from'] <= asof), None)
        if row is None or not self.visible(receipt, asof, stock):
            raise ValueError('해당 분석일에 이용 가능한 관측치가 없습니다.')
        receipts = self.receipts(row, metric)
        asof = min(asof, row['as_of_available_from'])
        safe = [r for r in receipts if self.visible(r, asof, stock)]
        raw_accounts = []
        if metric in ('parent_equity_t', 'ni_owner_ttm'):
            suffix = 'EquityAttributableToOwnersOfParent' if metric == 'parent_equity_t' else 'ProfitLossAttributableToOwnersOfParent'
            for rid in safe:
                for a in self.owner_accounts[(stock, fs, rid)]:
                    if a['account_id'].endswith(suffix):
                        raw_accounts.append({**selected(a, 'rcept_no account_id account_nm sj_div thstrm_nm thstrm_amount thstrm_add_amount frmtrm_nm frmtrm_amount frmtrm_add_amount frmtrm_q_nm frmtrm_q_amount bfefrmtrm_nm bfefrmtrm_amount currency business_year report_code'), 'note': '동일 공시·재무제표의 API 원천 후보. 비교기간 열 포함; TTM 구성항 확정 검증과 구분.'})
        facts = []
        calculation_trace = []
        # Exact TTM fact IDs; preserve their period_kind, raw amount and source column.
        exact_ids = set()
        for key in ('sales_ttm', 'operating_profit_ttm'):
            if key == metric or metric in ('ATO', 'PM', 'OpROA') and (key == 'sales_ttm' or metric != 'ATO'):
                ids = split(row.get(key + '_fact_ids', ''))
                exact_ids.update(ids)
                terms = []
                for fid in ids:
                    f = self.by_fact.get(fid)
                    if not f or f['source_receipt'] not in safe or f['fs_div'] != fs or f['stock_code'] != stock or f['available_from'] > asof:
                        terms = []
                        break
                    sign = -1 if row['quarter'] != '4' and int(f['fiscal_year']) == int(row['fiscal_year'])-1 and f['quarter'] == row['quarter'] else 1
                    terms.append({'fact_id': fid, 'sign': sign, 'amount_krw': number(f['amount_krw']), 'period': f"{f['fiscal_year']} Q{f['quarter']} {f['period_kind']}"})
                if terms and all(t['amount_krw'] is not None for t in terms):
                    total = sum(t['sign']*t['amount_krw'] for t in terms)
                    value = self.value(row, key, asof)
                    calculation_trace.append({'metric': key, 'terms': terms, 'source_sum_krw': total, 'csv_value_krw': value,
                                              'matches_csv': value is not None and math.isclose(total, value, rel_tol=1e-10, abs_tol=1)})
        for rid in safe:
            for f in self.fact_index[(stock, fs, rid)]:
                if f['available_from'] > asof or f['publication_date'] > asof:
                    continue
                exact = f['fact_id'] in exact_ids
                balance = f['metric'] in ('총자산', '유동부채') and f['metric'] in METRICS[metric][4] and f['quarter'] == row['quarter'] and int(f['fiscal_year']) in (int(row['fiscal_year']), int(row['fiscal_year'])-1)
                if exact or balance:
                    facts.append({**selected(f, 'fact_id fiscal_year quarter metric period_kind amount_krw source_receipt publication_date available_from account_nm table_index source_column source_unit raw_cell status'), 'match': '계산에 지정된 원천 행' if exact else 'NOA 원천 후보 (기간·공시 일치, 금액 대조 필요)'})
        reviews = [self.review_public(r) for r in self.reviews if r['stock_code'] == stock and r['fs_div'] == fs and r['rcept_no'] in safe and self.visible(r['rcept_no'], asof, stock) and (r['metric'] in {'parent_equity'} if metric == 'parent_equity_t' else r['metric'] in {'parent_net_income'} if metric == 'ni_owner_ttm' else r['metric'] in {'assets', 'current_liabilities', 'revenue', 'operating_profit'})]
        additions = [selected(r, 'metric amount_krw rcept_no source_account_name source_table_index source_row_index publication_date available_from verification') for r in self.additions if r['stock_code'] == stock and r['fs_div'] == fs and r['rcept_no'] in safe and r['available_from'] <= asof and ((metric == 'parent_equity_t' and r['metric'] == 'parent_equity') or (metric == 'ni_owner_ttm' and r['metric'] == 'parent_net_income'))]
        return {'metric': metric, 'trigger_receipt': receipt, 'source_issues':self.source_issues(stock,fs,receipt,metric), 'value': self.value(row, metric, asof), 'period': f"{row['fiscal_year']} Q{row['quarter']}", 'fs_div': fs,
                'available_from': row['as_of_available_from'], 'formula': METRICS[metric][2],
                'inputs': {k: number(row[k]) for k in ('assets_t', 'current_liabilities_t', 'assets_t_4q', 'current_liabilities_t_4q', 'NOA_t', 'NOA_t_4q', 'avg_noa', 'sales_ttm', 'operating_profit_ttm') if k in row} if metric in ('NOA_t', 'ATO', 'PM', 'OpROA') and len(safe) == len(receipts) else {},
                'filings': [self.filing(r) for r in safe], 'facts': facts, 'calculation_trace': calculation_trace, 'raw_accounts': raw_accounts, 'reviews': reviews, 'additions': additions,
                'status': 'CSV 값 · 원천 행 연결 (전체 원문 금액 검증과 구분)' if facts else 'CSV 값 · 공시 연결 / 계정별 계산 경로 추가 검토 필요',
                'unresolved_reasons': row['unresolved_reasons'],
                'trace_note': 'TTM 접수번호는 최종 CSV의 목록 전체입니다. 원천 행 ID가 없는 지배기업 귀속 순이익은 공시·검토 근거까지만 연결하며 분기별 산식은 검증 완료로 표시하지 않습니다. NOA 후보는 계산에 확정된 행 ID가 아닙니다.'}

    @staticmethod
    def review_public(r):
        return selected(r, 'stock_code corp_name business_year fs_div metric rcept_no publication_date available_from is_revision verification_status verified_value_krw new_value_krw target_account_id source_account_id source_account_name source_table_index source_row_index source_value_column source_unit verification_method source_document_sha256')

    def review_list(self, stock, fs, asof, status='', kind='review'):
        rows = self.reviews if kind == 'review' else self.additions
        out = []
        for r in rows:
            if r['stock_code'] != stock or r['fs_div'] != fs or not self.visible(r['rcept_no'], asof, stock) or r.get('available_from', '9999') > asof:
                continue
            if status and r.get('verification_status') != status:
                continue
            out.append(self.review_public(r) if kind == 'review' else selected(r, 'stock_code business_year fs_div metric amount_krw rcept_no source_account_name publication_date available_from source_table_index source_row_index verification'))
        return out

    @lru_cache(maxsize=64)
    def xml_tables(self, receipt):
        name = next((n for n in self.xml_files if n.startswith(receipt + '_')), None)
        if name:
            data = self.xml_files[name].read_bytes()
            expected = self.documents.get(receipt, {}).get('original_xml_sha256')
        else:
            original=self.provenance().document(receipt)
            if original is None:return None
            path,expected=original
            data=path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if not expected or digest != expected:
            raise ValueError('원문 해시를 확인할 수 없거나 검증 목록과 일치하지 않습니다.')
        # stdlib parser, reject entity-bearing documents; never render XML as HTML.
        if b'<!ENTITY' in data.upper():
            raise ValueError('엔티티가 포함된 원문은 표시하지 않습니다.')
        # DART uses display entities such as &cr; without an XML DTD.
        # Normalize only the parser input, after hashing the unmodified copy.
        encoding_note = ''
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = data.decode('cp949')
            encoding_note = 'UTF-8 선언과 달리 CP949로 해석한 사본입니다. '
        def entity(match):
            name = match.group(1)
            if name in ('amp', 'lt', 'gt', 'apos', 'quot'):
                return match.group(0)
            value = '\n' if name == 'cr' else html.entities.html5.get(name + ';')
            return ''.join(f'&#{ord(c)};' for c in value) if value else '&amp;' + name + ';'
        text = re.sub(r'&([A-Za-z][A-Za-z0-9]+);', entity, text)
        text = re.sub(r'&(?!amp;|lt;|gt;|apos;|quot;|#\d+;|#x[0-9a-fA-F]+;)', '&amp;', text)
        recovered = False
        try:
            root = ET.fromstring(text)
        except ET.ParseError:
            # Some DART copies contain malformed display markup. Recovery is
            # for text search only and is explicitly disclosed to the reader.
            try:
                from lxml import etree
            except ImportError:
                raise ValueError('이 원문은 비정형 XML입니다. lxml 설치 후 텍스트 검색 가능; 공식 DART 링크를 이용하세요.')
            parser = etree.XMLParser(recover=True, resolve_entities=False, load_dtd=False, no_network=True)
            root = etree.fromstring(text.encode('utf-8'), parser)
            recovered = True
            if root is None:
                raise ValueError('XML 텍스트를 추출할 수 없습니다. 공식 DART 원문을 이용하세요.')
        tables = []
        parent_map={child:parent for parent in root.iter() for child in parent}
        def ancestors(node):
            out=[]
            while node in parent_map:
                node=parent_map[node];out.append(node)
            return out
        contexts={};current_statement=None
        for node in root.iter():
            if node.tag in ('TITLE','P'):
                label=' '.join(''.join(node.itertext()).split())
                compact=re.sub(r'[\s\[\]【】]','',label)
                if len(compact)<55 and re.fullmatch(r'(?:\d+[.\-])*[.\-]?(?:연결|별도)?(?:재무상태표|포괄손익계산서|손익계산서|현금흐름표)',compact):
                    sj='BS' if '재무상태표' in compact else 'CF' if '현금흐름표' in compact else 'CIS' if '포괄손익' in compact else 'IS'
                    scope='CFS' if '연결' in compact else 'OFS' if '별도' in compact else None
                    if scope is None:
                        for parent in ancestors(node):
                            title=next((c for c in parent if c.tag=='TITLE'),None)
                            title_text=''.join(title.itertext()).replace(' ','') if title is not None else ''
                            if '연결재무제표' in title_text and '주석' not in title_text:scope='CFS';break
                            if re.fullmatch(r'\d+\.재무제표',title_text):scope='OFS';break
                    current_statement={'sj_div':sj,'fs_div':scope,'heading':label}
                elif node.tag=='TITLE' and ('주석' in compact or re.match(r'^[IVX]+\.',compact)):
                    current_statement=None
            if node.tag=='TABLE':contexts[id(node)]=current_statement
        for i, table in enumerate(root.iter('TABLE')):
            rows = [' | '.join(' '.join(''.join(c.itertext()).split()) for c in tr if c.tag in ('TD', 'TH', 'TE', 'TU')) for tr in table.iter('TR')]
            tables.append({'table_index': str(i), 'rows': [r for r in rows if r], 'statement_context':contexts.get(id(table))})
        return {'sha256': digest, 'tables': tables, 'recovered': recovered, 'encoding_note': encoding_note}

    def search_xml(self, stock, asof, receipt, query, table=''):
        if not self.visible(receipt, asof, stock):
            raise ValueError('분석일 이후 또는 다른 기업의 공시입니다.')
        doc = self.xml_tables(receipt)
        if doc is None:
            return {'status': 'source_unavailable', 'message': '현재 최종 패키지에 XML 사본 없음. DART 공식 원문을 이용하세요.', 'results': []}
        result = []
        for t in doc['tables']:
            if table and table != t['table_index']:
                continue
            for idx, text in enumerate(t['rows']):
                if query and query.casefold() not in text.casefold():
                    continue
                result.append({'table_index': t['table_index'], 'row_index': idx, 'text': text[:6000], 'context': t['rows'][max(0, idx-1):idx+2]})
                if len(result) >= 40:
                    break
            if len(result) >= 40:
                break
        return {'status': 'hash_verified_copy', 'sha256': doc['sha256'], 'results': result, 'limit': 40, 'note': doc['encoding_note'] + ('비정형 XML 표시 마크업을 복구한 텍스트입니다. ' if doc['recovered'] else '') + '검색 결과는 문자열 위치입니다. 회계기간·연결/별도·단위·금액 의미의 확정 검증이 아닙니다. 표 번호는 0부터 시작합니다.'}

def make_handler(store):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
                return self.send_json({'error': '로컬 호스트에서만 접근할 수 있습니다.'}, 403)
            parsed = urlparse(self.path)
            args = {k: v[0] for k, v in parse_qs(parsed.query).items()}
            try:
                if parsed.path == '/api/data-status':
                    return self.send_json(data_status())
                if parsed.path.startswith('/api/') and store is None:
                    return self.send_json({'error': '필수 데이터 파일이 없습니다. 수정 DuPont 화면의 누락 파일 목록을 확인하세요.', 'status': 'REVIEW'}, 503)
                if parsed.path == '/api/catalog':
                    return self.send_json(store.catalog())
                if parsed.path == '/api/project':
                    return self.send_json(store.project())
                if parsed.path.startswith('/api/'):
                    stock = args.get('stock', store.default)
                    fs = args.get('fs', 'CFS')
                    asof = args.get('asof', '2019-12-31')
                    date.fromisoformat(asof)
                    if stock not in {r['stock_code'] for r in store.companies} or fs not in ('CFS', 'OFS'):
                        raise ValueError('기업 또는 재무제표 구분이 잘못되었습니다.')
                    if parsed.path == '/api/model-inputs':
                        from model_workbench import model_inputs
                        start = args.get('from', '2015-01-01')
                        date.fromisoformat(start)
                        if start > asof:
                            raise ValueError('시작일과 기준일 순서를 확인하세요.')
                        reader = model_inputs(store)
                        model = args.get('model', '')
                        if model == 'ohlson':
                            return self.send_json(reader.ohlson(stock, fs, start, asof, args.get('receipt', ''), float(args.get('rate', '.085'))))
                        if model == 'fscore':
                            return self.send_json(reader.fscore(stock, fs, start, asof, args.get('receipt', '')))
                        raise ValueError('지원하지 않는 금융모형입니다.')
                    if parsed.path in ('/api/pipeline-detail', '/api/audit-detail'):
                        from data_workbench import workbench
                        start = args.get('from', '2015-01-01')
                        date.fromisoformat(start)
                        if start > asof:
                            raise ValueError('시작일과 기준일 순서를 확인하세요.')
                        reader = workbench(store)
                        method = reader.pipeline if parsed.path == '/api/pipeline-detail' else reader.quality
                        return self.send_json(method(stock, fs, start, asof, args.get('receipt', ''), args.get('metric', 'sales_ttm')))
                    if parsed.path == '/api/series':
                        return self.send_json(store.series(stock, fs, asof))
                    if parsed.path == '/api/lineage':
                        return self.send_json(store.lineage().build(stock, fs, asof, args.get('receipt',''), args.get('metric','OpROA')))
                    if parsed.path == '/api/schema':
                        return self.send_json(store.lineage().schema())
                    if parsed.path == '/api/files':
                        return self.send_json(store.provenance().files())
                    if parsed.path == '/api/file-profile':
                        return self.send_json(store.provenance().profile(args.get('file','')))
                    if parsed.path == '/api/column':
                        return self.send_json(store.provenance().column(args.get('file',''),args.get('column',''),stock,fs,asof))
                    if parsed.path == '/api/pipeline-quality':
                        return self.send_json(store.provenance().quality())
                    if parsed.path == '/api/quarter-compare':
                        return self.send_json(store.provenance().quarter_compare(stock,fs,asof,args.get('receipt',''),args.get('metric','매출액')))
                    if parsed.path == '/api/reports':
                        return self.send_json(store.provenance().reports(stock,fs,asof,args.get('report_code',''),args.get('year',''),args.get('revision',''),args.get('q','')))
                    if parsed.path == '/api/source-fact':
                        f=store.by_fact.get(args.get('fact_id',''))
                        if not f or f['stock_code']!=stock or f['fs_div']!=fs or not store.visible(f['source_receipt'],asof,stock) or f['available_from']>asof:
                            raise ValueError('선택 조건에서 이용 가능한 원천 행이 없습니다.')
                        context=store.provenance().account_context(f)
                        return self.send_json({'fact':{**selected(f,'fact_id corp_code stock_code fs_div fiscal_year quarter metric period_kind amount_krw source_receipt available_from publication_date account_nm table_index source_column source_file header_text source_unit raw_cell status header_date_check source_collection_method analysis_xml_is_derived'), **store.provenance().fact_period(f)},
                            'filing':store.filing(f['source_receipt']), **context})
                    if parsed.path == '/api/prices':
                        start = args.get('from','2015-01-01')
                        date.fromisoformat(start)
                        return self.send_json(store.price_series(stock,start,asof))
                    if parsed.path == '/api/evidence':
                        metric = args.get('metric', 'sales_ttm')
                        if metric not in METRICS:
                            raise ValueError('알 수 없는 지표입니다.')
                        return self.send_json(store.evidence(stock, fs, asof, args.get('receipt', ''), metric))
                    if parsed.path == '/api/reviews':
                        return self.send_json(store.review_list(stock, fs, asof, args.get('status', ''), args.get('kind', 'review')))
                    if parsed.path == '/api/xml':
                        return self.send_json(store.search_xml(stock, asof, args.get('receipt', ''), args.get('q', '')[:100], args.get('table', '')))
                    return self.send_json({'error': '없는 API입니다.'}, 404)
                if parsed.path == '/reference/plan.pdf':
                    return self.respond((ROOT/'기획PT_261015.pdf').read_bytes(), 'application/pdf')
                files = {'/': ('index.html', 'text/html'), '/app.js': ('app.js', 'text/javascript'), '/platform.js': ('platform.js', 'text/javascript'), '/story.js': ('story.js', 'text/javascript'), '/lineage.js': ('lineage.js', 'text/javascript'), '/pipeline.js': ('pipeline.js','text/javascript'), '/pipeline.css': ('pipeline.css','text/css'), '/dupont.js': ('dupont.js','text/javascript'), '/dupont.css': ('dupont.css','text/css'), '/flow-vendor.js': ('flow-vendor.js','text/javascript'), '/flow-vendor.css': ('flow-vendor.css','text/css'), '/motion-vendor.js': ('motion-vendor.js', 'text/javascript'), '/style.css': ('style.css', 'text/css')}
                # Isolated design prototypes; existing pages and API handlers are unchanged.
                files.update({
                    '/research/ohlson': ('model-lab/index.html', 'text/html'),
                    '/research/fscore': ('model-lab/index.html', 'text/html'),
                    '/research/model-lab.js': ('model-lab/app.js', 'text/javascript'),
                    '/research/model-lab.css': ('model-lab/style.css', 'text/css'),
                    '/research/pipeline': ('data-workbench/index.html', 'text/html'),
                    '/research/quality': ('data-workbench/index.html', 'text/html'),
                    '/research/data-workbench.js': ('data-workbench/app.js', 'text/javascript'),
                    '/research/data-workbench.css': ('data-workbench/style.css', 'text/css'),
                    '/research/company': ('research/index.html', 'text/html'),
                    '/research/lineage': ('research/index.html', 'text/html'),
                    '/research/app.js': ('research/app.js', 'text/javascript'),
                    '/research/style.css': ('research/style.css', 'text/css'),
                    '/design-preview/overview': ('design-preview/index.html', 'text/html'),
                    '/design-preview/dupont': ('design-preview/index.html', 'text/html'),
                    '/design-preview/style.css': ('design-preview/style.css', 'text/css'),
                    '/design-preview/app.js': ('design-preview/app.js', 'text/javascript'),
                })
                if parsed.path not in files:
                    return self.send_json({'error': '파일 접근이 허용되지 않습니다.'}, 404)
                file, mime = files[parsed.path]
                self.respond((WEB / file).read_bytes(), mime + '; charset=utf-8')
            except (ValueError, KeyError) as e:
                self.send_json({'error': str(e)}, 400)
            except Exception:
                self.send_json({'error': '서버 처리 오류. 로컬 데이터 구성을 확인하세요.'}, 500)

        def send_json(self, value, code=200):
            self.respond(json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8'), 'application/json; charset=utf-8', code)

        def respond(self, data, mime, code=200):
            self.send_response(code)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

    return Handler

def data_status():
    from lineage import FILES
    required = list(FILES.values()) + [
        '검증·보완자료/28_연간CFS_185건_원문검증_최종.csv',
        '검증·보완자료/신규_원천계정_보완.csv',
        '검증·보완자료/원문검증_근거목록.csv',
    ]
    missing = [name for name in required if not (PACKAGE / name).is_file()]
    return {'ready': not missing, 'status': 'REVIEW', 'missing': missing,
            'location': 'DART_DATA_DIR 또는 저장소 상위/OpenDART_보완통합본/OpenDART_TTM_팀원전달_최종본',
            'note': '파일 존재 여부만 확인합니다. 금액·회계 의미의 검증 완료를 뜻하지 않습니다.'}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(Store() if data_status()['ready'] else None))
    print(f'OpenDART dashboard: http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()
