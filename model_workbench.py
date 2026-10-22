"""New-model input views; existing financial CSVs and calculators are unchanged.

Definitions: team model summary slides 3,7,9,11-13. Raw REVIEW inputs may be
inspected, but F-Score verdicts require exact semantic audit approval. Ohlson
offers only an explicitly labelled arithmetic scenario, never an equity value.
"""
from functools import lru_cache
from data_workbench import workbench, equal_amount, public
from lineage import num


ANNUAL = {'NI': ('당기순이익', 'ytd'), 'CFO': ('영업활동현금흐름', 'ytd'),
          'A': ('총자산', 'stock'), 'CA': ('유동자산', 'stock'),
          'CL': ('유동부채', 'stock'), 'GP': ('매출총이익', 'ytd'), 'REV': ('매출액', 'ytd')}
RULES = [
    ('F1', '수익성·이익의 질', 'ROA 양수', 'NI_t / A_(t−1) > 0', ['NI0', 'A1']),
    ('F2', '수익성·이익의 질', '영업현금흐름 양수', 'CFO_t / A_(t−1) > 0', ['CFO0', 'A1']),
    ('F3', '수익성·이익의 질', 'ROA 개선', 'NI_t / A_(t−1) > NI_(t−1) / A_(t−2)', ['NI0', 'A1', 'NI1', 'A2']),
    ('F4', '수익성·이익의 질', '발생액 음수', '(NI_t − CFO_t) / A_(t−1) < 0', ['NI0', 'CFO0', 'A1']),
    ('F5', '안정성·자금조달', '장기 레버리지 감소', 'LTD_t / avg(A_t,A_(t−1)) < LTD_(t−1) / avg(A_(t−1),A_(t−2))', ['LTD0', 'LTD1', 'A0', 'A1', 'A2']),
    ('F6', '안정성·자금조달', '유동비율 개선', 'CA_t / CL_t > CA_(t−1) / CL_(t−1)', ['CA0', 'CL0', 'CA1', 'CL1']),
    ('F7', '안정성·자금조달', '보통주 신규발행 없음', '해당 연도 보통주 신규발행 없음', ['ISSUE0']),
    ('F8', '영업효율성', '매출총이익률 개선', 'GP_t / REV_t > GP_(t−1) / REV_(t−1)', ['GP0', 'REV0', 'GP1', 'REV1']),
    ('F9', '영업효율성', '자산회전율 개선', 'REV_t / avg(A_t,A_(t−1)) > REV_(t−1) / avg(A_(t−1),A_(t−2))', ['REV0', 'A0', 'A1', 'REV1', 'A2']),
]


def judge(rule, inputs):
    """Unknown is None, including equal-to-zero denominators and REVIEW facts."""
    keys = rule[4]
    if any(inputs[k]['value'] is None or inputs[k]['semantic_status'] != 'PASS' for k in keys):
        return None
    v = {k: inputs[k]['value'] for k in keys}
    try:
        # Positive assets/denominators are prerequisites, not accounting repairs.
        for k in keys:
            if (k.startswith('A') or k.startswith('CL') or k.startswith('REV')) and v[k] <= 0:
                return None
        result = {
            'F1': lambda: v['NI0'] / v['A1'] > 0,
            'F2': lambda: v['CFO0'] / v['A1'] > 0,
            'F3': lambda: v['NI0'] / v['A1'] > v['NI1'] / v['A2'],
            'F4': lambda: (v['NI0'] - v['CFO0']) / v['A1'] < 0,
            'F5': lambda: v['LTD0'] / ((v['A0'] + v['A1']) / 2) < v['LTD1'] / ((v['A1'] + v['A2']) / 2),
            'F6': lambda: v['CA0'] / v['CL0'] > v['CA1'] / v['CL1'],
            'F7': lambda: v['ISSUE0'] == 0,
            'F8': lambda: v['GP0'] / v['REV0'] > v['GP1'] / v['REV1'],
            'F9': lambda: v['REV0'] / ((v['A0'] + v['A1']) / 2) > v['REV1'] / ((v['A1'] + v['A2']) / 2),
        }[rule[0]]()
        return int(result)
    except (ZeroDivisionError, KeyError):
        return None


def ri_scenario(ni, prior_equity, rate, allowed):
    if not 0 <= rate <= 0.3:
        raise ValueError('자기자본비용 가정은 0~30% 범위입니다.')
    if not allowed or ni is None or prior_equity is None:
        return None
    return {'capital_charge': rate * prior_equity, 'residual_income': ni - rate * prior_equity,
            'status': 'REVIEW', 'equity_value': None,
            'note': '검토 중 CSV에 대한 가정 산술입니다. 검증된 RI·기업가치가 아닙니다.'}


class ModelInputs:
    def __init__(self, store):
        self.s = store
        self.w = workbench(store)

    def observations(self, stock, fs, start, asof, model):
        rows = [r for r in self.s.groups[(stock, fs)]
                if start <= r['as_of_available_from'] <= asof
                and self.s.visible(r['trigger_receipt'], asof, stock)
                and (model != 'fscore' or r['quarter'] == '4')]
        return [{'receipt': r['trigger_receipt'], 'available_from': r['as_of_available_from'],
                 'year': r['fiscal_year'], 'quarter': r['quarter'],
                 'publication_date': self.s.versions[r['trigger_receipt']]['publication_date']}
                for r in rows]

    def event(self, stock, fs, start, asof, receipt, model):
        choices = self.observations(stock, fs, start, asof, model)
        if not choices:
            return None, choices
        if receipt and receipt not in {r['receipt'] for r in choices}:
            raise ValueError('선택 범위에서 이용 가능한 공시를 선택하세요.')
        receipt = receipt or choices[-1]['receipt']
        return self.w.event(stock, fs, asof, receipt), choices

    def ohlson(self, stock, fs, start, asof, receipt, rate):
        event, choices = self.event(stock, fs, start, asof, receipt, 'ohlson')
        if event is None:
            return {'observations': [], 'inputs': {}, 'scenario': None, 'status': 'MISSING'}
        cutoff = event['as_of_available_from']
        graph = self.s.lineage().build(stock, fs, cutoff, event['trigger_receipt'], 'parent_equity_t')
        nodes = {n['id']: n for n in graph['nodes']}
        prior_rows = [r for r in self.s.groups[(stock, fs)]
                      if r['fiscal_year'] == str(int(event['fiscal_year']) - 1)
                      and r['quarter'] == event['quarter'] and r['as_of_available_from'] <= cutoff
                      and self.s.visible(r['trigger_receipt'], cutoff, stock)]
        prior = max(prior_rows, key=lambda r: (r['as_of_available_from'], r['trigger_receipt'])) if prior_rows else None
        prior_node = None
        if prior:
            pg = self.s.lineage().build(stock, fs, cutoff, prior['trigger_receipt'], 'parent_equity_t')
            prior_node = next(n for n in pg['nodes'] if n['id'] == 'parent_equity_t')
        def wrap(n, row, label):
            return {'label': label, 'value': n['value'] if n else None, 'status': 'REVIEW' if n and n['value'] is not None else 'MISSING' if fs == 'CFS' else 'NOT_APPLICABLE',
                    'year': row['fiscal_year'] if row else None, 'quarter': row['quarter'] if row else None,
                    'receipt': row['trigger_receipt'] if row else None, 'available_from': row['as_of_available_from'] if row else None,
                    'node': n, 'fact_ids': [],
                    'note': '25번 귀속 입력을 그대로 읽습니다. 명시적 fact_id가 없는 귀속 계정은 전체 자본·순이익으로 대체하지 않습니다.'}
        inputs = {'equity': wrap(nodes['parent_equity_t'], event, '지배기업 귀속 자본'),
                  'ni': wrap(nodes['ni_owner_ttm'], event, '지배기업 귀속 순이익 TTM'),
                  'prior': wrap(prior_node, prior, '1년 전 지배기업 귀속 자본')}
        allowed = fs == 'CFS' and prior is not None and all(v['value'] is not None for v in inputs.values())
        allowed = allowed and not any((v['node'] or {}).get('audit_issues') for v in inputs.values())
        return {'observations': choices, 'receipt': event['trigger_receipt'], 'cutoff': cutoff,
                'context': graph['context'], 'inputs': inputs, 'rate': rate,
                'scenario': ri_scenario(inputs['ni']['value'], inputs['prior']['value'], rate, allowed),
                'status': 'REVIEW', 'valuation': None, 'owner_sign_review': event.get('owner_ni_sign_review', ''),
                'prior_policy': '선택 TTM의 전년 동분기 25번 이벤트 중 선택 공시 이용 가능일에 알려진 최신 버전. 비교기간은 1년 전이며 직전 분기로 대체하지 않습니다.',
                'unresolved': ['귀속 계정의 원천 열·회계 의미 REVIEW', 'clean surplus 미검증',
                               '미래 RI·지속성 계수·기타 정보·할인 구조 미확정', '시장 내재 지속성·시가총액·Q·기업가치 미산출'],
                'definition': '팀 금융모형 요약 3·7·9쪽 / 기획 PT 7쪽. 8.5%는 프로토타입 초기 가정.'}

    def annual_input(self, stock, fs, year, cutoff, symbol):
        if symbol not in ANNUAL:
            return {'symbol': symbol, 'year': year, 'value': None, 'semantic_status': 'MISSING', 'facts': [],
                    'note': '장기차입금·사채·관련 유동성 대체분의 전체 범위 미연결' if symbol == 'LTD' else '해당 연도 보통주 신규발행 근거 미연결. 자본금·주식수 변화로 대신 판정하지 않음.'}
        metric, kind = ANNUAL[symbol]
        facts = [f for f in self.s.facts if f['stock_code'] == stock and f['fs_div'] == fs
                 and f['fiscal_year'] == str(year) and f['quarter'] == '4'
                 and f['metric'] == metric and f['period_kind'] == kind and f['status'] == 'usable'
                 and f['available_from'] and f['publication_date']
                 and f['available_from'] <= cutoff and f['publication_date'] <= cutoff
                 and self.s.visible(f['source_receipt'], cutoff, stock)]
        if facts:
            latest = max((f['available_from'], f['source_receipt']) for f in facts)
            facts = [f for f in facts if (f['available_from'], f['source_receipt']) == latest]
        values = {num(f['amount_krw']) for f in facts}
        value = next(iter(values)) if len(values) == 1 and None not in values else None
        checks = []
        for f in facts:
            audit = [r for r in self.w.audit_rows('원천계정_금액대조.csv')
                     if r['fact_id'] == f['fact_id'] and all(r.get(k) == f.get(k) for k in
                         ('corp_code', 'stock_code', 'fs_div', 'source_receipt', 'fiscal_year', 'quarter',
                          'metric', 'period_kind', 'account_nm', 'table_index', 'source_column', 'raw_cell', 'source_unit'))
                     and equal_amount(r['stored'], f['amount_krw'])]
            checks.append({'fact_id': f['fact_id'], 'rows': [public(r) for r in audit]})
        failed = any(r.get('status') == 'FAIL' or r.get('semantic_period_status') == 'FAIL'
                     for c in checks for r in c['rows'])
        status = 'MISSING' if value is None else 'FAIL' if failed else 'PASS' if checks and all(
            c['rows'] and all(r.get('status') == 'PASS' and r.get('semantic_period_status') == 'PASS'
                              for r in c['rows']) for c in checks) else 'REVIEW'
        return {'symbol': symbol, 'metric': metric, 'year': year, 'value': value, 'semantic_status': status,
                'facts': [{'row': public(f), 'filing': self.s.filing(f['source_receipt'])} for f in facts],
                'audits': checks, 'note': '연간 원천 후보를 그대로 보존. 같은 최종 버전의 금액이 충돌하면 값 미선택. 원천 의미 REVIEW는 점수 판정에 사용하지 않음.'}

    def fscore(self, stock, fs, start, asof, receipt):
        event, choices = self.event(stock, fs, start, asof, receipt, 'fscore')
        if event is None:
            return {'observations': [], 'conditions': [], 'score': None, 'status': 'MISSING'}
        year = int(event['fiscal_year']); cutoff = event['as_of_available_from']
        inputs = {symbol + str(offset): self.annual_input(stock, fs, year - offset, cutoff, symbol)
                  for symbol, offsets in {'NI': [0, 1], 'CFO': [0], 'A': [0, 1, 2], 'CA': [0, 1],
                                          'CL': [0, 1], 'GP': [0, 1], 'REV': [0, 1], 'LTD': [0, 1], 'ISSUE': [0]}.items()
                  for offset in offsets}
        conditions = []
        for rule in RULES:
            point = judge(rule, inputs)
            unresolved = [k for k in rule[4] if inputs[k]['semantic_status'] != 'PASS' or inputs[k]['value'] is None]
            conditions.append({'id': rule[0], 'group': rule[1], 'label': rule[2], 'formula': rule[3],
                               'inputs': rule[4], 'point': point, 'unresolved_inputs': unresolved,
                               'status': '미판정' if point is None else '충족' if point == 1 else '미충족'})
        judged = [c for c in conditions if c['point'] is not None]
        return {'observations': choices, 'receipt': event['trigger_receipt'], 'year': year, 'prior_year': year - 1,
                'cutoff': cutoff, 'context': {k: event[k] for k in ['corp_code', 'stock_code', 'fs_div', 'trigger_receipt', 'as_of_available_from']},
                'inputs': inputs, 'conditions': conditions, 'judged_count': len(judged), 'unjudged_count': 9 - len(judged),
                'judged_points': sum(c['point'] for c in judged) if judged else None,
                'score': sum(c['point'] for c in judged) if len(judged) == 9 else None, 'status': 'REVIEW',
                'definition': '팀 금융모형 요약 11~13쪽. 연간 t vs t−1; A_(t−2)는 전기 ROA·평균자산에 필요. 개선은 엄격한 부등호.',
                'scope': '재무제표 구분·이용 가능일을 고정한 연간 원천 탐색. 미판정은 0점이 아니며 DuPont NOA 기반 ATO를 재사용하지 않습니다.'}


@lru_cache(maxsize=2)
def model_inputs(store):
    return ModelInputs(store)
