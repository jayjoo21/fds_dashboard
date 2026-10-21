"""Source metadata, bounded CSV profiling, and existing independent audit results."""
import csv
import codecs
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import date
from functools import lru_cache
from pathlib import Path
from lineage import FILES, DEFS, num, parts

REPORTS={'11013':'1분기보고서','11012':'반기보고서','11014':'3분기보고서','11011':'사업보고서'}
PURPOSE={'versions':'공시 버전·접수일·이용 가능일 관리','facts':'XML 원문 기간별 금액과 위치','quarters':'공시 시점별 단독 분기 변환','core':'핵심 재무 입력·분기/현금흐름 지표','events':'공시 이벤트별 NOA·DuPont·Ohlson 입력','daily':'거래일별 이용 가능한 재무 입력','companies':'기업고유번호와 종목코드 매핑'}
PARENTS={'versions':['기업_종목_매핑표.csv','OpenDART 공시목록'],'facts':[FILES['versions'],'공시 원문 XML'],'quarters':[FILES['facts']],'core':[FILES['quarters'],FILES['facts']],'events':[FILES['core'],FILES['facts'],FILES['quarters'],'04_전체원본계정_통합.csv'],'daily':[FILES['events'],'04_일별_핵심재무입력_corp추가.csv'],'companies':['OpenDART 기업정보']}
KEYS={'versions':['corp_code','stock_code','rcept_no'],'facts':['fact_id'],'quarters':['corp_code','stock_code','fs_div','as_of_available_from','trigger_receipt','fiscal_year','quarter','metric'],'core':['corp_code','stock_code','fs_div','as_of_available_from','trigger_receipt'],'events':['corp_code','stock_code','fs_div','as_of_available_from','trigger_receipt'],'daily':['stock_code','trade_date','fs_div'],'companies':['corp_code','stock_code']}
MEANINGS={'corp_code':'DART 기업고유번호','stock_code':'거래소 종목코드','rcept_no':'해당 공시 접수번호','source_receipt':'원천 금액이 나온 공시 접수번호','trigger_receipt':'계산 이벤트를 발생시킨 공시','latest_period_receipt':'선택된 최신 회계기간의 공시','available_from':'전달 데이터의 이용 가능일','as_of_available_from':'계산 이벤트의 이용 가능일','publication_date':'공시 공개 날짜','rcept_dt':'원본에 저장된 공시 접수일','trade_date':'일별 입력의 거래일','fiscal_year':'금액 대상 회계연도','business_year':'보고서 회계연도','quarter':'금액 대상 분기','fs_div':'연결 CFS·별도 OFS','metric':'재무 항목','period_kind':'기간 유형: 기말 잔액·누적·단독','amount_krw':'원 단위 원천 금액','single_quarter_amount_krw':'변환된 단독 분기 금액','fact_id':'기간별 금액 행의 식별자','source_fact_ids':'사용된 원천 행 ID 전체','source_receipts':'사용된 공시 접수번호 전체','source_file':'원천 파일 참조','source_column':'원문 금액 열 위치','table_index':'원문 표의 검색 위치','account_nm':'원문 재무계정명','report_nm':'실제 DART 보고서 제목','report_code':'정기보고서 종류 코드','is_revision':'정정공시 여부','raw_cell':'원문에 표시된 금액 문자열','header_text':'금액 열의 기간 머리말','source_unit':'원문 표시 단위','status':'원천 행의 처리 상태','calculation':'분기 변환 방법','unavailable_reason':'변환값 미확보 사유'}

def read(path):
    if not path.exists(): return []
    with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def csv_encoding(path):
    with path.open('rb') as f:sample=f.read(65536)
    try:
        codecs.getincrementaldecoder('utf-8-sig')().decode(sample,final=False)
        return 'utf-8-sig'
    except UnicodeDecodeError:return 'cp949'

def iso(v):
    if not v:return None
    try:
        if re.fullmatch(r'\d{8}',v):return date(int(v[:4]),int(v[4:6]),int(v[6:])).isoformat()
        return date.fromisoformat(v).isoformat()
    except ValueError:return None

class Provenance:
    def __init__(self,store):
        self.s=store;self.root=Path(__file__).resolve().parents[1];self.audit=self.root/'audit_20261021'
        self.official={}
        for p in (self.audit/'official').glob('list_*.json'):
            d=json.loads(p.read_text(encoding='utf-8-sig'))
            if d.get('status')=='000':
                for r in d.get('list',[]):self.official[r['rcept_no']]=r
        self.documents={r['receipt']:r for r in read(self.audit/'기업이력_원문근거.csv') if r.get('status')=='PASS' and r.get('receipt') in store.versions}
        self.errors=read(self.audit/'확인오류_영향범위.csv')
        self.issues=defaultdict(list)
        for r in self.errors:
            for fid in parts(r['source_fact_ids']):self.issues[fid].append(r)
        self.codes={r['stock_code']:r for r in read(self.audit/'기업코드_공식대조.csv')}
        self.code_checks={}
        official_codes=self.audit/'official'/'CORPCODE.xml'
        if official_codes.exists():
            content=official_codes.read_bytes();digest=hashlib.sha256(content).hexdigest()
            mapping={n.findtext('corp_code'):n.findtext('stock_code') for n in ET.fromstring(content).findall('list')}
            for c in store.companies:
                recorded=self.codes.get(c['stock_code'],{})
                self.code_checks[c['stock_code']]=mapping.get(c['corp_code'])==c['stock_code'] and recorded.get('source_sha256')==digest
        self.comparisons=None
        self.file_index={}
        # Opaque IDs, server-owned allowlist; no client-supplied filesystem paths.
        folders=[p for p in self.root.iterdir() if p.is_dir() and p.name not in ('dashboard','.git','.codex','.agents')]
        for folder in folders:
            for p in folder.rglob('*.csv'):
                if p.is_file() and p.resolve().is_relative_to(self.root.resolve()) and p.relative_to(self.root).parts[0] not in ('dashboard','.git','.codex','.agents'):
                    relative=p.relative_to(self.root).as_posix();fid=hashlib.sha256(relative.encode()).hexdigest()[:16]
                    self.file_index[fid]=p

    def document(self,receipt):
        r=self.documents.get(receipt)
        if not r:return None
        p=Path(r['file'])
        if not p.is_file():return None
        return p,r['sha256']

    @lru_cache(maxsize=512)
    def xml_metadata(self,receipt):
        original=self.document(receipt)
        if not original:return {'status':'원천자료 없음','period_start':None,'period_end':None,'xml_code':None,'xml_corp_code':None}
        p,digest=original;raw=p.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=digest:return {'status':'불일치 발견 · XML 해시','period_start':None,'period_end':None,'xml_code':None,'xml_corp_code':None}
        try:text=raw.decode('utf-8-sig')
        except UnicodeDecodeError:text=raw.decode('cp949')
        # Only explicit COVER AUNIT dates; no date inferred from filename/year.
        cover=re.search(r'<COVER\b[^>]*>(.*?)</COVER>',text,re.S)
        fields={}
        for tag in re.findall(r'<TU\b[^>]*>',cover.group(1) if cover else ''):
            a=dict(re.findall(r'([A-Z][A-Z0-9-]*)="([^"]*)"',tag))
            if a.get('AUNIT') in ('PERIODFROM','PERIODTO'):
                fields[a['AUNIT']]=iso(a.get('AUNITVALUE',''))
        head=re.search(r'<DOCUMENT-NAME\b[^>]*ACODE="([^"]+)"',text)
        corp=re.search(r'<COMPANY-NAME\b[^>]*AREGCIK="([^"]+)"',text)
        return {'status':'원문 해시·명시 날짜 추출','period_start':fields.get('PERIODFROM'),'period_end':fields.get('PERIODTO'),
                'xml_code':head.group(1) if head else None,'xml_corp_code':corp.group(1) if corp else None,'sha256':digest,'file':p.name}

    def report(self,receipt):
        r=self.s.versions[receipt];official=self.official.get(receipt);xml=self.xml_metadata(receipt)
        official_ok=bool(official and official['corp_code']==r['corp_code'] and official.get('stock_code')==r['stock_code'])
        rd=iso(official['rcept_dt']) if official_ok else None
        # CSV report_code + XML DOCUMENT-NAME are independent explicit fields.
        code=r.get('report_code') or None
        kind=REPORTS.get(code)
        # XML quarterly form ACODE 11013 is shared by Q1 and Q3; API code 11014
        # means Q3. Compare against the stored XML form field, not API code.
        expected_form=r.get('xml_form_code') or None
        code_ok=xml.get('xml_code')==expected_form if xml.get('xml_code') and expected_form else None
        title=official['report_nm'] if official_ok else r.get('report_nm')
        flags=[]
        if not official_ok:flags.append('공식 목록 기업·공시 대조 대기')
        if rd and rd!=r['publication_date']:flags.append('공식 접수일·저장 공개일 불일치')
        if code_ok is False:flags.append('보고서 코드·원문 코드 불일치')
        if xml.get('xml_corp_code') and xml['xml_corp_code']!=r['corp_code']:flags.append('원문 기업코드 불일치')
        if not xml.get('period_start') or not xml.get('period_end'):flags.append('원문 보고기간 미확인')
        if not iso(r.get('rcept_dt','')):flags.append('원본 rcept_dt 형식 오류 · 공식 접수일 별도 연결')
        return {'rcept_no':receipt,'corp_code':r['corp_code'],'stock_code':r['stock_code'],'company_name':r['corp_name'],
            'report_nm':title,'report_type':kind,'report_code':code,'xml_form_code':xml.get('xml_code'),'report_year':r.get('business_year') or None,
            'report_period_start':xml.get('period_start'),'report_period_end':xml.get('period_end'),
            'period_source':'원문 COVER의 PERIODFROM/PERIODTO' if xml.get('period_start') and xml.get('period_end') else None,
            'receipt_date':rd,'stored_rcept_dt':r.get('rcept_dt'),'publication_date':r.get('publication_date') or None,
            'published_at':None,'revision_published_at':None,'available_from':r.get('available_from') or None,
            'availability_policy':'제공 CSV의 익거래일 적용 정책 · 공시 시각·거래 가능성은 별도 검증',
            'is_revision':r['is_revision'],'official_list_match':official_ok,'xml_code_matches':code_ok,
            'xml_identity_matches':xml.get('xml_corp_code')==r['corp_code'] if xml.get('xml_corp_code') else None,
            'date_precision':'날짜 수준 · 공식 공개시각 미확인','metadata_status':'추가 검토 필요' if flags else '날짜·보고서 원문 대조 / 시각 검증 대기',
            'metadata_issues':flags,'xml_source_status':xml['status'],'xml_file':xml.get('file'),'xml_sha256':xml.get('sha256'),
            'official_code_status':'현재 공식 코드·해시 대조 일치 / 과거 상장 이력 별도 검토' if self.code_checks.get(r['stock_code']) else '검증 대기'}

    def fact_period(self,f):
        report=self.report(f['source_receipt'])
        current=f.get('fiscal_year')==f.get('source_report_year') and f.get('quarter')==f.get('source_report_quarter') and f.get('header_date_check')=='valid'
        end=report['report_period_end'] if current and f.get('period_kind') in ('stock','ytd') else None
        start=report['report_period_start'] if current and f.get('period_kind')=='ytd' else None
        return {'account_period_start':start,'account_period_end':end,'balance_as_of':end if f.get('period_kind')=='stock' else None,
            'period_date_basis':'원문 COVER 명시 날짜 + 원천 행의 당기 연도·분기·header_date_check 일치' if end else '대상 연도·분기는 원천 행에 있으나 정확한 시작·종료일 연결 추가 검토'}

    @lru_cache(maxsize=64)
    def account_context_by_id(self,fact_id):
        f=self.s.by_fact[fact_id];doc=self.s.xml_tables(f['source_receipt'])
        table=next((t for t in doc['tables'] if t['table_index']==f['table_index']),None) if doc else None
        context=table.get('statement_context') if table else None
        sj=context['sj_div'] if context and context['fs_div']==f['fs_div'] else None
        candidates=[];path=self.s.package.parent/'04_전체원본계정_통합.csv'
        current=f['fiscal_year']==f['source_report_year'] and f['quarter']==f['source_report_quarter']
        column='thstrm_add_amount' if f['period_kind']=='ytd' and f['quarter']!='4' else 'thstrm_amount'
        if path.exists() and sj and current:
            with path.open(encoding='utf-8-sig',newline='') as h:
                for r in csv.DictReader(h):
                    if (r['corp_code'],r['stock_code'],r['fs_div'],r['rcept_no'],r['business_year'],r['report_code'],r['sj_div'])!=(f['corp_code'],f['stock_code'],f['fs_div'],f['source_receipt'],f['source_report_year'],self.s.versions[f['source_receipt']]['report_code'],sj):continue
                    if re.sub(r'\s','',r['account_nm'])!=re.sub(r'\s','',f['account_nm']) or r['currency']!='KRW':continue
                    value=num(r.get(column));expected=num(f['amount_krw'])
                    if value is None or expected is None or abs(value-expected)>1:continue
                    candidates.append({k:r.get(k) for k in ['account_id','account_nm','account_detail','sj_div','currency','rcept_no']}|{'source_column':column,'amount_krw':value})
        identities={(r['account_id'],r['account_detail'],r['sj_div']) for r in candidates}
        matched=candidates[0] if len(identities)==1 else None
        return {'account_id':matched['account_id'] if matched else None,'account_detail':matched['account_detail'] if matched else None,'sj_div':sj,
            'statement_context':context,'api_candidates':candidates[:20],
            'account_verification':'원문 표제·기업·기간·공시·CFS/OFS·계정명·KRW 금액·API 열 대조 일치' if matched else '원문 표제 확인 / API 계정 ID 추가 검토' if sj else '원문 표제·API 계정 ID 확인 대기',
            'note':'02번에 없는 ID는 원문 표제와 같은 접수번호 API 행의 정확한 범위·기간·금액 대조가 유일할 때만 보강합니다. 미일치·비교기간·다중 ID는 NULL로 유지합니다.'}

    def account_context(self,f):
        return self.account_context_by_id(f['fact_id'])

    def reports(self,stock,fs,asof,kind='',year='',revision='',q=''):
        out=[]
        for rid,r in self.s.versions.items():
            if r['stock_code']!=stock or not self.s.visible(rid,asof,stock):continue
            if kind and r.get('report_code')!=kind:continue
            if year and r.get('business_year')!=year:continue
            if revision and r['is_revision']!=revision:continue
            if q and q.casefold() not in r['report_nm'].casefold():continue
            if not self.s.fact_index[(stock,fs,rid)] and not any(e['trigger_receipt']==rid for e in self.s.groups[(stock,fs)]):continue
            out.append({**self.s.filing(rid),'fs_div':fs})
        return sorted(out,key=lambda r:(r['available_from'],r['rcept_no']))

    def files(self):
        return [{'id':fid,'name':p.name,'folder':p.parent.relative_to(self.root).as_posix(),'size_bytes':p.stat().st_size,
                 'primary':p.parent==self.s.package and p.name in FILES.values()} for fid,p in self.file_index.items()]

    @lru_cache(maxsize=32)
    def profile(self,fid):
        if fid not in self.file_index:raise ValueError('허용된 CSV 파일을 선택하세요.')
        p=self.file_index[fid]
        encoding=csv_encoding(p)
        with p.open(encoding=encoding,newline='') as f:
            reader=csv.DictReader(f);columns=reader.fieldnames;counts={c:Counter() for c in columns};n=0;numeric={c:True for c in columns};boolean={c:True for c in columns}
            for r in reader:
                n+=1
                for c in columns:
                    v=r.get(c,'');missing=v is None or v.strip() in ('','NULL','NaN','nan','None')
                    counts[c]['missing' if missing else 'present']+=1
                    if not missing:
                        numeric[c]&=num(v) is not None;boolean[c]&=v in ('True','False','true','false')
        key=next((k for k,name in FILES.items() if name==p.name and p.parent==self.s.package),None)
        return {'id':fid,'file':p.name,'encoding':encoding,'rows':n,'size_bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),
            'purpose':PURPOSE.get(key,'프로젝트 원본·검증 자료 (역할 추가 검토)'), 'keys':KEYS.get(key,[]),'upstream':PARENTS.get(key,[]),
            'next':[FILES[k] for k,parents in PARENTS.items() if p.name in parents],
            'validation':'실제 스키마·행 수·결측 집계 / 회계 의미는 별도 검증',
            'columns':[{'name':c,'type':'문자열 (식별자 보존)' if c in ('corp_code','stock_code','rcept_no','source_receipt','trigger_receipt','latest_period_receipt','fact_id','source_fact_ids','source_receipts') else '논리값 문자열' if boolean[c] and counts[c]['present'] else '수치 문자열' if numeric[c] and counts[c]['present'] else '문자열',
                        'missing':counts[c]['missing'],'present':counts[c]['present'],'meaning':DEFS[c][0] if c in DEFS else MEANINGS.get(c,'정의 추가 검토 · 실제 컬럼명 유지'),
                        'formula':DEFS[c][1] if c in DEFS else None,'parents':DEFS[c][2] if c in DEFS else [],
                        'data_type':'계산값' if c in DEFS and (DEFS[c][2] or c.endswith('ttm')) else '원천·변환 구분 추가 검토',
                        'models':[m for m,v in DEFS.items() if c in v[2]] + ([c] if c in DEFS else [])} for c in columns]}

    def column(self,fid,column,stock,fs,asof):
        if re.search(r'api[_-]?key|crtfc[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie',column,re.I):
            raise ValueError('비밀정보 관련 컬럼의 예시는 제공하지 않습니다.')
        profile=self.profile(fid);meta=next((c for c in profile['columns'] if c['name']==column),None)
        if meta is None:raise ValueError('실제 CSV 컬럼을 선택하세요.')
        out=[]
        corp=next(c['corp_code'] for c in self.s.companies if c['stock_code']==stock)
        with self.file_index[fid].open(encoding=csv_encoding(self.file_index[fid]),newline='') as f:
            for r in csv.DictReader(f):
                if r.get('stock_code') and r['stock_code']!=stock:continue
                if r.get('corp_code') and r['corp_code']!=corp:continue
                if r.get('fs_div') and r['fs_div']!=fs:continue
                dates=[r.get(k) for k in ('available_from','as_of_available_from','publication_date','trade_date','A_available_from') if r.get(k)]
                if any(iso(v) is None or iso(v)>asof for v in dates):continue
                # Financial samples need an explicit availability key. Mapping IDs are harmless.
                if not dates and profile['file']!=FILES['companies']:continue
                rid=r.get('trigger_receipt') or r.get('source_receipt') or r.get('rcept_no')
                if rid and not self.s.visible(rid,asof,stock):continue
                value=r.get(column)
                if value in ('',None):continue
                value=re.sub(r'(?i)([?&](?:crtfc_key|api_key|access_token|token)=)[^&\s]+',r'\1[REDACTED]',value)
                if column in ('source_file','source_document','source_document_path','main_html_file','fallback_archive') or re.match(r'^[A-Za-z]:[\\/]',value):
                    value=Path(value.replace('\\','/')).name
                out.append({'value':value,'row':{k:r[k] for k in ('corp_code','stock_code','fs_div','fiscal_year','quarter','trade_date','fact_id','source_receipt','trigger_receipt','rcept_no','as_of_available_from','available_from') if k in r},
                            'receipt':rid,'filing':self.s.filing(rid) if rid in self.s.versions else None})
                if len(out)==3:break
        return {'file':profile['file'],'column':meta,'examples':out,'asof':asof,'note':'예시는 선택 기업·재무제표·이용 가능일로 제한했습니다. 전체 결측 통계는 파일 전체 범위입니다. 원천 연결이 없는 컬럼은 자동 연결하지 않습니다.'}

    def quarter_compare(self,stock,fs,asof,receipt,metric='매출액'):
        event=next((r for r in self.s.groups[(stock,fs)] if r['trigger_receipt']==receipt and r['as_of_available_from']<=asof),None)
        if not event or not self.s.visible(receipt,asof,stock):raise ValueError('이용 가능한 공시 이벤트가 없습니다.')
        cutoff=min(asof,event['as_of_available_from']);q=event['quarter'];y=event['fiscal_year'];corp=event['corp_code']
        facts=[f for f in self.s.facts if f['corp_code']==corp and f['stock_code']==stock and f['fs_div']==fs and f['metric']==metric and f['fiscal_year']==y and f['available_from']<=cutoff and self.s.visible(f['source_receipt'],cutoff,stock) and num(f['amount_krw']) is not None and f['status']=='usable']
        current=[f for f in facts if f['source_receipt']==receipt and f['quarter']==q and f['period_kind']=='ytd']
        direct=[f for f in facts if f['source_receipt']==receipt and f['quarter']==q and f['period_kind']=='quarter']
        prior=[f for f in facts if f['quarter']==str(int(q)-1) and f['period_kind']=='ytd'] if q!='1' else []
        def choose(rows,prefer_table=None):
            if prefer_table is not None:
                same=[f for f in rows if f['table_index']==prefer_table and f['source_receipt']==receipt]
                if same:rows=same
            if not rows:return None
            latest=max((f['available_from'],f['source_receipt']) for f in rows);rows=[f for f in rows if (f['available_from'],f['source_receipt'])==latest]
            if len({num(f['amount_krw']) for f in rows})!=1:return None
            return rows[0]
        a=choose(current);b=choose(prior,a['table_index'] if a else None);c=choose(direct,a['table_index'] if a else None)
        calc=num(a['amount_krw'])-(num(b['amount_krw']) if q!='1' and b else 0) if a and (q=='1' or b) else None
        diff=calc-num(c['amount_krw']) if calc is not None and c else None
        def item(f):
            return {'fact_id':f['fact_id'],'value':num(f['amount_krw']),'account_nm':f['account_nm'],'period_kind':f['period_kind'],'table_index':f['table_index'],'source_column':f['source_column'],'fiscal_year':f['fiscal_year'],'quarter':f['quarter'],'source_receipt':f['source_receipt'],'filing':self.s.filing(f['source_receipt'])} if f else None
        quarter_rows=[r for r in self.s.lineage().quarters if r['corp_code']==corp and r['stock_code']==stock and r['fs_div']==fs and r['trigger_receipt']==receipt and r['as_of_available_from']==cutoff and r['fiscal_year']==y and r['quarter']==q and r['metric']==metric]
        return {'event':event['trigger_receipt'],'year':y,'quarter':q,'metric':metric,'current_ytd':item(a),'prior_ytd':item(b),'direct_single':item(c),'subtracted_single':calc,'difference':diff,
                'status':'추가 검토 필요 · 비교 입력 미확보' if diff is None else '금액 차이 발견 · 원인 추가 검토' if abs(diff)>1 else '계산 금액 일치 · 회계 의미 추가 검토',
                'stored_quarters':quarter_rows,'note':'동일 기업·계정 의미·기간·CFS/OFS·공시 버전의 재작성 여부를 추가 검토해야 합니다. 차이를 자동 계산 오류로 판정하지 않습니다. 별도 API 계정 비교는 audit_20261021의 독립 검증과 구분합니다.'}

    def quality(self):
        names=['기업코드_공식대조.csv','공시날짜_공식목록대조.csv','공시날짜_PIT_전수검증.csv','원천계정_금액대조.csv','03_분기산식_독립검증.csv','TTM_전수재계산_대조.csv','일별데이터_시점검증.csv','원인별_불일치목록.csv','불일치_공시원문_대조근거.csv','확인오류_영향범위.csv']
        summaries=[]
        for name in names:
            rows=read(self.audit/name);counts=Counter(r.get('status',r.get('formula_status','추가 검토 필요')) for r in rows)
            summaries.append({'file':name,'rows':len(rows),'statuses':dict(counts),'source':'제공된 독립 재검증 산출물 · 원본 자동 수정 없음'})
        metadata=[self.report(rid) for rid in self.s.versions]
        return {'audits':summaries,'report_metadata':{'reports':len(metadata),'missing_period':sum(not r['report_period_start'] or not r['report_period_end'] for r in metadata),
            'missing_publication_time':sum(r['published_at'] is None for r in metadata),'invalid_stored_rcept_dt':sum(iso(r['stored_rcept_dt']) is None for r in metadata),
            'official_list_unmatched':sum(not r['official_list_match'] for r in metadata),'xml_code_mismatch':sum(r['xml_code_matches'] is False for r in metadata)},
            'confirmed_errors':[{k:r[k] for k in ['stock_code','corp_code','fs_div','trigger_receipt','asof','source_fact_ids','affected_columns','cause','action']} for r in self.errors],
            'review_summary':self.s.catalog()['review_summary'],'scope':'검증 파일별 모집단·검사 단위가 다릅니다. PASS는 해당 검사만 통과한 것이며 모든 데이터의 회계 의미 검증 완료가 아닙니다.'}
