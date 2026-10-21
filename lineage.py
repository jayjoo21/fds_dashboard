"""Read-only, explicit provenance for the delivered CSVs. Never rewrites inputs."""
import csv
import math
from collections import defaultdict

FILES = {
    'versions': '01_공시버전_이용가능일_corp추가.csv',
    'facts': '02_원문기간별금액_corp추가.csv',
    'quarters': '03_공시시점별_분기변환_corp추가.csv',
    'core': '08_공시시점별_핵심지표_corp추가.csv',
    'events': '25_공시시점별_NOA_DuPont_Ohlson_입력_최종.csv',
    'daily': '26_일별_NOA_DuPont_Ohlson_입력_최종.csv',
    'companies': '기업_종목_매핑표.csv',
}
# Explicit variable -> delivered column mappings, not name similarity joins.
DEFS = {
 'sales_ttm': ('매출액 TTM', '최근 4분기 매출액', [], '원'),
 'operating_profit_ttm': ('영업이익 TTM', '최근 4분기 영업이익', [], '원'),
 'assets_t': ('당기 총자산', '원문 기말 잔액', [], '원'),
 'current_liabilities_t': ('당기 유동부채', '원문 기말 잔액', [], '원'),
 'assets_t_4q': ('4분기 전 총자산', '원문 전년 동분기 기말 잔액', [], '원'),
 'current_liabilities_t_4q': ('4분기 전 유동부채', '원문 전년 동분기 기말 잔액', [], '원'),
 'NOA_t': ('당기 NOA', 'assets_t − current_liabilities_t', ['assets_t','current_liabilities_t'], '원'),
 'NOA_t_4q': ('4분기 전 NOA', 'assets_t_4q − current_liabilities_t_4q', ['assets_t_4q','current_liabilities_t_4q'], '원'),
 'avg_noa': ('평균 NOA', '(NOA_t + NOA_t_4q) ÷ 2', ['NOA_t','NOA_t_4q'], '원'),
 'ATO': ('자산회전율 ATO', 'sales_ttm ÷ avg_noa', ['sales_ttm','avg_noa'], '배'),
 'PM': ('영업이익률 PM', 'operating_profit_ttm ÷ sales_ttm', ['operating_profit_ttm','sales_ttm'], '비율'),
 'OpROA': ('영업수익성 OpROA', 'PM × ATO', ['PM','ATO'], '비율'),
 'parent_equity_t': ('지배기업 귀속 자본', '연결 재무상태표의 지배기업 소유주 귀속 자본', [], '원'),
 'ni_owner_ttm': ('지배기업 귀속 순이익 TTM', '지배기업 소유주 귀속 순이익 최근 4분기', [], '원'),
}

def num(v):
    try:
        v=float(v)
        return v if math.isfinite(v) else None
    except (TypeError,ValueError):
        return None

def parts(v):
    return [x for x in v.split('|') if x]

def near(a,b):
    return a is not None and b is not None and math.isclose(a,b,rel_tol=1e-10,abs_tol=1)

class Lineage:
    def __init__(self, store):
        self.s=store
        self.schemas={}
        for key,name in FILES.items():
            with (store.package/name).open(encoding='utf-8-sig',newline='') as f:
                self.schemas[key]={'file':name,'columns':next(csv.reader(f))}
        self.balances=defaultdict(list)
        for f in store.facts:
            if f['status']=='usable' and f['period_kind']=='stock':
                self.balances[(f['corp_code'],f['stock_code'],f['fs_div'],f['fiscal_year'],f['quarter'],f['metric'])].append(f)
        with (store.package/FILES['quarters']).open(encoding='utf-8-sig',newline='') as f:
            self.quarters=list(csv.DictReader(f))
        self.quarter_index=defaultdict(list)
        for r in self.quarters:
            self.quarter_index[(r['corp_code'],r['stock_code'],r['fs_div'],r['fiscal_year'],r['quarter'],r['metric'])].append(r)

    def schema(self):
        return {'files':list(self.schemas.values()),'mapping':[
            {'variable':k,'label':v[0],'file':FILES['events'],'column':k,'formula':v[1],'unit':v[3],
             'display_variable':{'sales_ttm':'TTM(매출액)','NOA_t':'NOA','NOA_t_4q':'4분기 전 NOA','avg_noa':'평균 NOA'}.get(k,v[0])}
            for k,v in DEFS.items()],
            'notes':['03번의 실제 공시 키는 trigger_receipt입니다. README의 rcept_no 표기와 구분합니다.',
                     '08번 operating_margin은 단독 분기 값이며 25번 TTM PM과 대체 연결하지 않습니다.',
                     '26번은 일별 전달 파일입니다. 이 화면은 25번 이벤트 행을 사용하며 일별 행을 임의로 혼합하지 않습니다.',
                     '02번에 account_id·sj_div 컬럼은 없습니다. 계정명만 보고 API 계정 ID를 추정하지 않습니다.']}

    def build(self, stock, fs, asof, receipt, metric):
        if metric not in DEFS:
            raise ValueError('지원하지 않는 계산 변수입니다.')
        s=self.s
        row=next((r for r in s.groups[(stock,fs)] if r['trigger_receipt']==receipt and r['as_of_available_from']<=asof),None)
        if not row or not s.visible(receipt,asof,stock) or s.versions[receipt]['corp_code']!=row['corp_code']:
            raise ValueError('분석일에 이용 가능한 공시 행이 없습니다.')
        cutoff=min(asof,row['as_of_available_from'])
        nodes={}; edges=[]; traces={}; quarter_views={}
        keys={k:row[k] for k in ['corp_code','stock_code','fs_div','fiscal_year','quarter','trigger_receipt','as_of_available_from']}

        def visible(rid):
            return s.visible(rid,cutoff,stock) and s.versions[rid]['corp_code']==row['corp_code']

        def safe_fact(f):
            return bool(f and f['corp_code']==row['corp_code'] and f['stock_code']==stock and f['fs_div']==fs
                        and f['publication_date'] and f['publication_date']<=cutoff and f['available_from'] and f['available_from']<=cutoff
                        and visible(f['source_receipt']))

        def add_fact(f, target, sign=1, method='저장된 fact_id'):
            fid=f['fact_id']
            nodes[fid]={'id':fid,'kind':'fact','label':f['account_nm'],'value':num(f['amount_krw']),'unit':'원',
                'formula':f['metric']+' / '+f['period_kind'],'status':'원천 행 연결 · 원문 의미 검증 별도',
                'file':FILES['facts'],'column':'amount_krw','row':{k:f[k] for k in ['fact_id','corp_code','stock_code','fs_div','fiscal_year','quarter','source_receipt','available_from']},
                'data_type':'원천값','account':{k:f[k] for k in ['account_nm','period_kind','raw_cell','source_unit','table_index','source_column','header_text','source_file','source_collection_method','analysis_xml_is_derived','status']},
                'account_id':None,'sj_div':None,'account_note':'02번에는 account_id·sj_div가 없어 미확인으로 유지합니다.',
                'period_dates':s.provenance().fact_period(f),
                'filings':[s.filing(f['source_receipt'])], 'method':method}
            edges.append({'source':fid,'target':target,'sign':sign})

        for key,(label,formula,parents,unit) in DEFS.items():
            refs = s.receipts(row,key) if key in ('sales_ttm','operating_profit_ttm','NOA_t','ATO','PM','OpROA','parent_equity_t','ni_owner_ttm') else parts(row['NOA_source_receipts'])
            all_visible=bool(refs) and all(visible(r) for r in refs)
            refs=[r for r in refs if visible(r)]
            value=num(row[key]) if all_visible else None
            if fs!='CFS' and key in ('parent_equity_t','ni_owner_ttm'): value=None
            nodes[key]={'id':key,'kind':'variable','label':label,'formula':formula,'value':value,'unit':unit,
                'file':FILES['events'],'column':key,'row':keys,'data_type':'계산값' if parents or key.endswith('ttm') else '변환값',
                'parents':parents,'status':'CSV 값 · 원천 연결 검토 중' if value is not None else '결측 · 계산 불가',
                'filings':[s.filing(r) for r in refs],'method':'최종 CSV 값을 그대로 읽음. 입력 원본 수정·재계산 저장 없음.'}
            for p in parents: edges.append({'source':p,'target':key})

        # Reproduce the original point_fact selection, then check the stored value.
        for key in ['assets_t','current_liabilities_t','assets_t_4q','current_liabilities_t_4q']:
            year=str(int(row['fiscal_year'])-(1 if key.endswith('_4q') else 0))
            name='총자산' if key.startswith('assets') else '유동부채'
            candidates=[f for f in self.balances[(row['corp_code'],stock,fs,year,row['quarter'],name)] if safe_fact(f)]
            if candidates:
                latest=max(f['available_from'] for f in candidates)
                candidates=[f for f in candidates if f['available_from']==latest]
                preferred=[f for f in candidates if f['source_receipt']==receipt]
                if not key.endswith('_4q') and preferred: candidates=preferred
                rid=max(f['source_receipt'] for f in candidates)
                candidates=[f for f in candidates if f['source_receipt']==rid]
                values={num(f['amount_krw']) for f in candidates}
                if len(values)==1 and near(next(iter(values)),nodes[key]['value']) and rid in parts(row['NOA_source_receipts']):
                    for f in candidates: add_fact(f,key,method='기존 생성 코드 point_fact: 동일 기업·CFS/OFS·기간 → 최신 이용 가능일 → 당기 기준 공시 우선 → 최신 접수번호 → 단일 금액 → 최종 CSV 대조')
                    nodes[key]['status']='생성 규칙·금액 대조 일치 · 원문 의미 검증 별도'
                    nodes[key]['filings']=[s.filing(rid)]
                else: nodes[key]['status']='원천 선택 또는 금액 대조 미확정'

        for key in ['sales_ttm','operating_profit_ttm']:
            ids=parts(row[key+'_fact_ids']); terms=[]
            for fid in ids:
                f=s.by_fact.get(fid)
                expected_periods={(row['fiscal_year'],row['quarter']),(str(int(row['fiscal_year'])-1),'4'),(str(int(row['fiscal_year'])-1),row['quarter'])} if row['quarter']!='4' else {(row['fiscal_year'],'4')}
                if not safe_fact(f) or f['source_receipt'] not in parts(row[key+'_source_receipts']) or f['metric']!=('매출액' if key=='sales_ttm' else '영업이익') or (f['fiscal_year'],f['quarter']) not in expected_periods or f['period_kind']!='ytd':
                    terms=[]; break
                # Annual + current YTD - prior same YTD, exactly as delivered.
                sign=-1 if row['quarter']!='4' and int(f['fiscal_year'])==int(row['fiscal_year'])-1 and f['quarter']==row['quarter'] else 1
                terms.append((f,sign))
            total=sum(sign*num(f['amount_krw']) for f,sign in terms) if terms and all(num(f['amount_krw']) is not None for f,_ in terms) else None
            matches=near(total,nodes[key]['value'])
            traces[key]={'matches_csv':matches,'sum_krw':total,'csv_value':nodes[key]['value'],
                'terms':[{'fact_id':f['fact_id'],'sign':sign,'value':num(f['amount_krw']),'period':f['fiscal_year']+' Q'+f['quarter']+' '+f['period_kind']} for f,sign in terms]}
            for f,sign in terms: add_fact(f,key,sign,'25번의 명시적 '+key+'_fact_ids / 기업·기간·재무제표·공시·이용 가능일 검사')
            nodes[key]['status']='지정 원천 합산·CSV 일치 · 원문 의미 검증 별도' if matches else '합산 경로 미확정'
            # Show actual stored quarter conversions, never invent allocations of YTD.
            qnum=int(row['fiscal_year'])*4+int(row['quarter'])-1
            quarter_rows=[]
            for pos in range(qnum-3,qnum+1):
                y,q=divmod(pos,4); q+=1
                rows=[r for r in self.quarter_index[(row['corp_code'],stock,fs,str(y),str(q),'매출액' if key=='sales_ttm' else '영업이익')]
                    if r['as_of_available_from']<=cutoff and num(r['single_quarter_amount_krw']) is not None
                    and parts(r['source_fact_ids']) and all(safe_fact(s.by_fact.get(fid)) for fid in parts(r['source_fact_ids']))
                    and visible(r['trigger_receipt']) and all(visible(rid) for rid in parts(r['source_receipts']))]
                if rows:
                    latest_key=max((r['as_of_available_from'],r['trigger_receipt']) for r in rows)
                    rows=[r for r in rows if (r['as_of_available_from'],r['trigger_receipt'])==latest_key]
                conflict=len({num(r['single_quarter_amount_krw']) for r in rows})>1
                r=rows[0] if rows and not conflict else None
                quarter_rows.append({'period':str(y)+' Q'+str(q),'value':num(r['single_quarter_amount_krw']) if r else None,
                    'file':FILES['quarters'],'column':'single_quarter_amount_krw','row':r,'status':'동일 키 분기 금액 충돌 · 미확정' if conflict else '분기 변환 CSV 값' if r else '해당 시점 값 미확보'})
            qsum=sum(r['value'] for r in quarter_rows) if all(r['value'] is not None for r in quarter_rows) else None
            quarter_views[key]={'quarters':quarter_rows,'sum_krw':qsum,'matches_ttm':near(qsum,nodes[key]['value']),
                'note':'03번 각 분기의 최신 이용 가능 버전입니다. 합계가 25번 TTM과 다르면 동일 계산 구성항으로 확정하지 않습니다. 확정 TTM 경로는 저장된 fact_id의 연간·누적 가감 구조입니다.'}

        for key in ['parent_equity_t','ni_owner_ttm']:
            n=nodes[key]
            n['status']='CSV·공시 연결 / 원천 열 선택 추가 검토' if n['value'] is not None else ('해당 없음 · OFS' if fs=='OFS' else '결측 · 검토 상태 확인')
            n['account_ids']=parts(row.get('ni_owner_account_ids','')) if key=='ni_owner_ttm' else []
            n['unresolved_reasons']=row['unresolved_reasons']
            suffix='EquityAttributableToOwnersOfParent' if key=='parent_equity_t' else 'ProfitLossAttributableToOwnersOfParent'
            n['raw_candidates']=[{k:a.get(k,'') for k in ['corp_code','stock_code','fs_div','rcept_no','business_year','report_code','account_id','account_nm','sj_div','thstrm_nm','thstrm_amount','thstrm_add_amount','frmtrm_nm','frmtrm_amount','frmtrm_add_amount','currency']}
                for f in n['filings'] for a in s.owner_accounts[(stock,fs,f['rcept_no'])]
                if a['corp_code']==row['corp_code'] and a['account_id'].endswith(suffix)]
            n['reviews']=[s.review_public(r) for r in s.reviews if r['corp_code']==row['corp_code'] and r['stock_code']==stock and r['fs_div']==fs
                and r['rcept_no'] in {f['rcept_no'] for f in n['filings']} and r['metric']==('parent_equity' if key=='parent_equity_t' else 'parent_net_income')]
            n['additions']=[r for r in s.additions if r['corp_code']==row['corp_code'] and r['stock_code']==stock and r['fs_div']==fs
                and r['rcept_no'] in {f['rcept_no'] for f in n['filings']} and r['available_from']<=cutoff and r['metric']==('parent_equity' if key=='parent_equity_t' else 'parent_net_income')]

        # Formula verification describes consistency; it does not certify XML meaning.
        for key in ['NOA_t','NOA_t_4q','avg_noa','ATO','PM','OpROA']:
            n=nodes[key]; v={p:nodes[p]['value'] for p in n['parents']}
            parent_filings={f['rcept_no']:f for p in n['parents'] for f in nodes[p]['filings']}
            n['filings']=[parent_filings[rid] for rid in sorted(parent_filings)]
            try:
                calc={'NOA_t':lambda:v['assets_t']-v['current_liabilities_t'],
                      'NOA_t_4q':lambda:v['assets_t_4q']-v['current_liabilities_t_4q'],
                      'avg_noa':lambda:(v['NOA_t']+v['NOA_t_4q'])/2,
                      'ATO':lambda:v['sales_ttm']/v['avg_noa'],
                      'PM':lambda:v['operating_profit_ttm']/v['sales_ttm'],
                      'OpROA':lambda:v['PM']*v['ATO']}[key]()
                n['formula_matches']=near(calc,n['value'])
            except (TypeError,ZeroDivisionError): n['formula_matches']=False
            if n['formula_matches']: n['status']='산식·CSV 일치 · 상위 원천 상태 별도 확인'

        for n in nodes.values():
            issues=s.provenance().issues.get(n['id'],[]) if n['kind']=='fact' else s.source_issues(stock,fs,receipt,n['id'])
            if issues:
                n['status']='불일치 발견 · 독립 재검증의 추출 오류 영향 대상 · 원본 CSV 값 유지'
                n['audit_issues']=[{k:r.get(k) for k in ['cause','cause_detail','affected_columns','source_fact_ids','action']} for r in issues]

        return {'metric':metric,'context':keys,'company_name':row['company_name'],'cutoff':cutoff,
                'nodes':list(nodes.values()),'edges':edges,'traces':traces,'quarter_views':quarter_views,
                'schema':self.schema(),'note':'CSV 산식 일치·출처 연결·원문 의미 검증은 서로 다른 검증 단계입니다. 원천 ID가 없는 항목은 미확정으로 표시합니다.'}
