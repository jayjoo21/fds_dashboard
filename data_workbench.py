"""Bounded, read-only views of existing pipeline rows and independent audit records.

No financial formula or audit verdict is computed here. Exact source keys AND
stored values are checked before exposing an audit verdict for the current CSV.
"""
import csv
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from lineage import FILES


def equal_amount(a, b):
    if a in ('', None) or b in ('', None):
        return a in ('', None) and b in ('', None)
    try:
        return Decimal(str(a)) == Decimal(str(b))
    except InvalidOperation:
        return False


def ids(value):
    return set(filter(None, value.split('|')))


def public(row):
    result = dict(row)
    for key, value in result.items():
        if isinstance(value, str) and (':\\' in value or value.startswith('/')):
            result[key] = Path(value.replace('\\', '/')).name
    return result


class Workbench:
    def __init__(self, store):
        self.s = store

    @lru_cache(maxsize=12)
    def audit_rows(self, name):
        path = self.s.provenance().audit / name
        if not path.is_file():
            return ()
        with path.open(encoding='utf-8-sig', newline='') as handle:
            return tuple(dict(r, audit_row=str(i)) for i, r in enumerate(csv.DictReader(handle), 2))

    def event(self, stock, fs, asof, receipt):
        candidates = [r for r in self.s.groups[(stock, fs)]
                      if r['trigger_receipt'] == receipt and r['as_of_available_from'] <= asof
                      and self.s.visible(receipt, asof, stock)]
        if len(candidates) != 1:
            raise ValueError('선택 가능한 단일 공시 이벤트가 필요합니다.')
        return candidates[0]

    @lru_cache(maxsize=2)
    def daily_rows(self, stock, fs):
        path = self.s.package / FILES['daily']
        if not path.is_file():
            return ()
        columns = ('trade_date corp_code stock_code fs_div as_of_available_from trigger_receipt '
                   'latest_fiscal_year latest_quarter daily_policy published_time_verified '
                   'stock_tradability_checked sales_ttm operating_profit_ttm PM ATO OpROA '
                   'parent_equity_t ni_owner_ttm unresolved_reasons').split()
        with path.open(encoding='utf-8-sig', newline='') as handle:
            return tuple({**{k: r.get(k, '') for k in columns}, 'csv_row': i}
                         for i, r in enumerate(csv.DictReader(handle), 2)
                         if r['stock_code'] == stock and r['fs_div'] == fs)

    def daily(self, event, start, asof):
        return [r for r in self.daily_rows(event['stock_code'], event['fs_div'])
                if r['corp_code'] == event['corp_code']
                and r['trigger_receipt'] == event['trigger_receipt']
                and r['as_of_available_from'] == event['as_of_available_from']
                and start <= r['trade_date'] <= asof]

    def pipeline(self, stock, fs, start, asof, receipt, metric):
        if metric not in ('sales_ttm', 'operating_profit_ttm'):
            raise ValueError('매출액 또는 영업이익 TTM을 선택하세요.')
        event = self.event(stock, fs, asof, receipt)
        if event['as_of_available_from'] < start:
            raise ValueError('선택 공시의 이용 가능일이 조회 시작일 이전입니다.')
        graph = self.s.lineage().build(stock, fs, asof, receipt, 'OpROA')
        comparison = self.s.provenance().quarter_compare(
            stock, fs, asof, receipt, '매출액' if metric == 'sales_ttm' else '영업이익')
        quarter_facts = {fid for r in comparison['stored_quarters'] for fid in ids(r['source_fact_ids'])}
        for key in ('current_ytd', 'prior_ytd', 'direct_single'):
            if comparison[key]:
                quarter_facts.add(comparison[key]['fact_id'])
        return {'context': graph['context'], 'event': public(event), 'graph': graph,
                'quarter': comparison, 'metric': metric,
                'quarter_facts': [public(self.s.by_fact[fid]) for fid in sorted(quarter_facts)
                                  if fid in self.s.by_fact],
                'daily': self.daily(event, start, asof),
                'daily_file': FILES['daily'], 'event_file': FILES['events'],
                'scope': '원본 기록의 읽기 전용 대조 · 원천 의미 REVIEW. 일별 행은 보간하거나 생성하지 않습니다.'}

    def quality(self, stock, fs, start, asof, receipt, metric):
        event = self.event(stock, fs, asof, receipt)
        if event['as_of_available_from'] < start:
            raise ValueError('선택 공시의 이용 가능일이 조회 시작일 이전입니다.')
        if metric not in ('sales_ttm', 'operating_profit_ttm'):
            raise ValueError('매출액 또는 영업이익 TTM을 선택하세요.')
        graph = self.s.lineage().build(stock, fs, asof, receipt, 'OpROA')
        trace_ids = ids(event[metric + '_fact_ids'])
        facts = [self.s.by_fact[fid] for fid in sorted(trace_ids) if fid in self.s.by_fact]
        checks = []

        def add(key, title, file, rows, fields, scope):
            # A record keeps every relevant status dimension. No aggregate PASS.
            checks.append({'id': key, 'title': title, 'file': file, 'scope': scope,
                           'status_fields': fields, 'rows': [public(r) for r in rows],
                           'record_count': len(rows), 'link_status': 'exact' if rows else 'unlinked'})

        def identity(r):
            return all(r.get(k) == event[k] for k in ('corp_code', 'stock_code'))

        def event_key(r):
            return identity(r) and r.get('fs_div') == fs and r.get('trigger_receipt') == receipt

        codes = [r for r in self.audit_rows('기업코드_공식대조.csv') if identity(r)]
        add('codes', '기업코드 매핑', '기업코드_공식대조.csv', codes,
            ['status', 'history_status', 'historical_identity_status'], '현재 기업코드·종목코드 / 과거 이력은 별도 검사')
        version = self.s.versions[receipt]
        dates = [r for r in self.audit_rows('공시날짜_공식목록대조.csv')
                 if identity(r) and r['rcept_no'] == receipt
                 and r['stored_publication_date'] == version['publication_date']
                 and r['stored_available_from'] == version['available_from']
                 and r['stored_rcept_dt'] == version['rcept_dt']]
        add('dates', '공시일·원본 날짜 형식', '공시날짜_공식목록대조.csv', dates,
            ['status', 'format_status', 'published_time_status'], '접수번호 + 원본 공개일·이용일·rcept_dt 정확 일치')
        pit = [r for r in self.audit_rows('공시날짜_PIT_전수검증.csv')
               if identity(r) and r['rcept_no'] == receipt
               and r['publication_date'] == version['publication_date']
               and r['available_from'] == version['available_from'] and r['rcept_dt'] == version['rcept_dt']]
        add('pit', '보고서 PIT', '공시날짜_PIT_전수검증.csv', pit,
            ['status', 'official_time_status', 'rcept_dt_format_status'], '보고서 날짜 검사만 연결 / 행별 PIT 전수 PASS로 확대하지 않음')
        reproduced = []
        for r in self.audit_rows('원천계정_금액대조.csv'):
            f = self.s.by_fact.get(r['fact_id'])
            if r['fact_id'] in trace_ids and f and all(r.get(k) == f.get(k) for k in
                    ('corp_code', 'stock_code', 'fs_div', 'source_receipt', 'table_index', 'source_column',
                     'account_nm', 'metric', 'period_kind', 'fiscal_year', 'quarter', 'raw_cell', 'source_unit')) \
                    and equal_amount(r['stored'], f['amount_krw']):
                reproduced.append(r)
        add('cells', '원문 금액 재현', '원천계정_금액대조.csv', reproduced,
            ['status', 'raw_cell_status', 'semantic_period_status'], 'fact_id + 기업·기간·원문 위치·원문 셀·저장 금액 대조')
        actual_quarters = self.s.provenance().quarter_compare(stock, fs, asof, receipt,
                            '매출액' if metric == 'sales_ttm' else '영업이익')['stored_quarters']
        quarters = [r for r in self.audit_rows('03_분기산식_독립검증.csv') if event_key(r)
                    and any(all(r.get(k) == q.get(k) for k in
                        ('as_of_available_from', 'fiscal_year', 'quarter', 'metric', 'calculation', 'source_fact_ids', 'source_receipts'))
                        and equal_amount(r['single_quarter_amount_krw'], q['single_quarter_amount_krw'])
                        for q in actual_quarters)]
        add('quarters', '분기 산식', '03_분기산식_독립검증.csv', quarters,
            ['formula_status', 'source_semantics_status', 'lineage_pit_valid'], '03번 복합 키 + 저장 금액 + 원천 ID·공시 + 변환 방법 정확 일치')
        ttms = [r for r in self.audit_rows('TTM_전수재계산_대조.csv') if event_key(r)
                and r['file'] == '25' and r['asof'] == event['as_of_available_from']
                and r['fiscal_year'] == event['fiscal_year'] and r['quarter'] == event['quarter']
                and r['metric'] == metric and equal_amount(r['stored'], event[metric])
                and ids(r['source_fact_ids']) == trace_ids
                and ids(r['source_receipts']) == ids(event[metric + '_source_receipts'])]
        add('ttm', 'TTM 산식', 'TTM_전수재계산_대조.csv', ttms,
            ['status', 'source_status'], '25번 복합 키·지표·저장 금액·원천 ID·공시 집합 정확 일치')
        # The explicit F:<fact_id> relation preserves every API candidate, without
        # choosing an account by name or promoting REVIEW to semantic certification.
        api = [r for r in self.audit_rows('API_XML_원천대조.csv')
               if r['xml_source_row_id'].startswith('F:') and r['xml_source_row_id'][2:] in trace_ids
               and (f := self.s.by_fact.get(r['xml_source_row_id'][2:]))
               and r['receipt'] == f['source_receipt'] and r['fs_div'] == f['fs_div']
               and r['account_nm'] == f['account_nm'] and equal_amount(r['xml_value'], f['amount_krw'])]
        add('api', 'API·XML 후보 대조', 'API_XML_원천대조.csv', api, ['status'],
            'F:fact_id + 공시·CFS/OFS·계정명·XML 금액 / 후보를 확정 계정으로 채택하지 않음')
        add('semantics', '회계 의미·기간 검토', '원천계정_금액대조.csv', reproduced,
            ['semantic_period_status'], '금액 재현과 독립된 원천 의미·기간 검사')
        errors = [r for r in self.audit_rows('확인오류_영향범위.csv') if event_key(r)
                  and r['file'] == '25' and r['asof'] == event['as_of_available_from']
                  and ids(r['source_fact_ids']).issubset(ids(event['sales_ttm_fact_ids']) | ids(event['operating_profit_ttm_fact_ids']))]
        add('errors', '확인 오류의 영향', '확인오류_영향범위.csv', errors, ['status'],
            '선택한 25번 공시 이벤트의 명시적 영향 목록 / 빈 목록은 오류 없음 인증이 아님')
        daily = self.daily(event, start, asof)
        daily_keys = {str(r['csv_row']): r for r in daily}
        daily_audit = [r for r in self.audit_rows('일별데이터_시점검증.csv')
                       if event_key(r) and r['file'] == '26' and r['row'] in daily_keys
                       and all(r[k] == daily_keys[r['row']][k] for k in ('trade_date', 'as_of_available_from'))]
        add('daily', '일별 전파·이용 시점', '일별데이터_시점검증.csv', daily_audit,
            ['status', 'calendar_status', 'stock_tradability_status'], '26번 CSV 실제 행번호 + 기업·CFS/OFS·거래일·공시·이용일')
        linked = {r['fact_id'] for r in reproduced}
        return {'context': graph['context'], 'metric': metric, 'checks': checks, 'graph': graph,
                'facts': [public(f) for f in facts], 'daily_count': len(daily),
                'unlinked_fact_ids': sorted(trace_ids - linked),
                'unlinked_api_fact_ids': sorted(trace_ids - {r['xml_source_row_id'][2:] for r in api}),
                'missing_inputs': [n['id'] for n in graph['nodes'] if n['kind'] == 'variable' and n['value'] is None],
                'scope': '전체 상태 REVIEW. 각 상태는 연결된 감사 파일의 해당 검사 열에만 적용합니다. 검증 시각이 없는 행은 미기록입니다.'}


@lru_cache(maxsize=2)
def workbench(store):
    return Workbench(store)
