import hashlib
import json
import math
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import urlopen, Request
from http.server import ThreadingHTTPServer
from pathlib import Path
from server import Store, METRICS, make_handler, number, read_csv, ROOT


class DashboardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Store()

    def test_identifiers_and_counts(self):
        self.assertEqual(len(self.s.companies), 20)
        self.assertEqual(len(self.s.reviews), 185)
        self.assertEqual(len(self.s.additions), 9)
        for r in self.s.companies:
            self.assertRegex(r['corp_code'], r'^\d{8}$')
            self.assertRegex(r['stock_code'], r'^\d{6}$')
        self.assertEqual(self.s.catalog()['review_summary'], {'verified_existing_value':25,'verified_new_value':9,'verified_not_reported':11,'not_applicable':119,'semantic_review_required':21})

    def test_lineage_all_events_full_keys_values_and_pit(self):
        from lineage import DEFS
        count=0
        for r in self.s.events:
            d=self.s.lineage().build(r['stock_code'],r['fs_div'],r['as_of_available_from'],r['trigger_receipt'],'OpROA')
            nodes={n['id']:n for n in d['nodes']}
            for key in DEFS:
                self.assertEqual(nodes[key]['value'],number(r[key]),(r['trigger_receipt'],key))
            for n in d['nodes']:
                self.assertEqual(n['row']['corp_code'],r['corp_code'])
                self.assertEqual(n['row']['stock_code'],r['stock_code'])
                self.assertEqual(n['row']['fs_div'],r['fs_div'])
                for filing in n['filings']:
                    self.assertLessEqual(filing['available_from'],d['cutoff'])
                    self.assertLessEqual(filing['publication_date'],d['cutoff'])
                if n['kind']=='fact':
                    fact=self.s.by_fact[n['id']]
                    self.assertEqual(n['value'],number(fact['amount_krw']))
                    for edge in [e for e in d['edges'] if e['source']==n['id'] and e['target'].startswith(('assets_','current_liabilities_'))]:
                        key=edge['target'];year=int(r['fiscal_year'])-(1 if key.endswith('_4q') else 0)
                        self.assertEqual(fact['fiscal_year'],str(year))
                        self.assertEqual(fact['quarter'],r['quarter'])
                        self.assertEqual(n['value'],number(r[key]))
                        count+=1
            for key,t in d['traces'].items():
                if number(r[key]) is not None:
                    self.assertTrue(t['matches_csv'],(r['trigger_receipt'],key))
        self.assertGreater(count,2000)

    def test_lineage_schema_exact_columns_and_failure_boundaries(self):
        from lineage import FILES
        l=self.s.lineage();schema=l.schema()
        self.assertEqual(len(schema['files']),7)
        headers={f['file']:f['columns'] for f in schema['files']}
        for m in schema['mapping']:
            self.assertIn(m['column'],headers[m['file']])
        self.assertIn('trigger_receipt',headers[FILES['quarters']])
        self.assertNotIn('rcept_no',headers[FILES['quarters']])
        r=next(r for r in self.s.events if r['fs_div']=='CFS')
        with self.assertRaises(ValueError):l.build(r['stock_code'],'CFS','2014-01-01',r['trigger_receipt'],'ATO')
        with self.assertRaises(ValueError):l.build(r['stock_code'],'CFS','2020-12-31','00000000000000','ATO')
        with self.assertRaises(ValueError):l.build(r['stock_code'],'CFS','2020-12-31',r['trigger_receipt'],'invented_column')

    def test_lineage_quarter_sum_never_claimed_when_mismatched(self):
        s=self.s;r=next(r for r in s.events if r['stock_code']==s.default and r['fs_div']=='CFS' and r['fiscal_year']=='2019' and r['quarter']=='3')
        l=s.lineage();d=l.build(r['stock_code'],'CFS',r['as_of_available_from'],r['trigger_receipt'],'sales_ttm')
        q=d['quarter_views']['sales_ttm'];self.assertEqual(len(q['quarters']),4)
        for item in q['quarters']:
            if item['row']:
                self.assertLessEqual(item['row']['as_of_available_from'],d['cutoff'])
                self.assertEqual(item['value'],number(item['row']['single_quarter_amount_krw']))
        original=r['sales_ttm']
        try:
            r['sales_ttm']=str(number(original)+1000000)
            altered=l.build(r['stock_code'],'CFS',r['as_of_available_from'],r['trigger_receipt'],'sales_ttm')
            self.assertFalse(altered['traces']['sales_ttm']['matches_csv'])
            if q['matches_ttm']:self.assertFalse(altered['quarter_views']['sales_ttm']['matches_ttm'])
        finally:r['sales_ttm']=original

    def test_source_reports_official_dates_xml_periods_and_code_systems(self):
        p=self.s.provenance()
        self.assertEqual(sum(p.code_checks.values()),20)
        self.assertEqual(len(p.documents),476)
        periods=0
        for rid,version in self.s.versions.items():
            r=p.report(rid)
            self.assertTrue(r['official_list_match'])
            self.assertEqual(r['corp_code'],version['corp_code'])
            self.assertEqual(r['receipt_date'],version['publication_date'])
            self.assertIsNone(r['published_at'])
            self.assertIsNone(r['revision_published_at'])
            self.assertTrue(r['xml_code_matches'])
            if r['report_period_end']:
                periods+=1
                self.assertLessEqual(r['report_period_start'],r['report_period_end'])
                self.assertLess(r['report_period_end'],r['receipt_date'])
        self.assertEqual(periods,449)
        q3=p.report('20191113000024')
        self.assertEqual(q3['report_type'],'3분기보고서')
        self.assertEqual(q3['report_code'],'11014')
        self.assertEqual(q3['xml_form_code'],'11013')
        self.assertEqual(q3['report_period_start'],'2019-01-01')
        self.assertEqual(q3['report_period_end'],'2019-09-30')

    def test_csv_profiles_actual_headers_counts_missing_and_bounded_examples(self):
        from lineage import FILES
        p=self.s.provenance()
        for name in FILES.values():
            item=next(f for f in p.files() if f['primary'] and f['name']==name)
            d=p.profile(item['id'])
            self.assertEqual(d['rows'],len(read_csv(self.s.package/name)))
            self.assertEqual([c['name'] for c in d['columns']],list(read_csv(self.s.package/name)[0]))
            for c in d['columns']:self.assertEqual(c['present']+c['missing'],d['rows'])
        item=next(f for f in p.files() if f['primary'] and f['name']==FILES['events'])
        d=p.column(item['id'],'avg_noa','089010','CFS','2017-01-01')
        self.assertLessEqual(len(d['examples']),3)
        for e in d['examples']:
            self.assertEqual(e['row']['stock_code'],'089010')
            self.assertEqual(e['row']['fs_div'],'CFS')
            self.assertLessEqual(e['row']['as_of_available_from'],'2017-01-01')
        self.assertEqual(p.column(item['id'],'sales_ttm','089010','CFS','2010-01-01')['examples'],[])
        with self.assertRaises(ValueError):p.profile('../../OPENDART_API_KEY.txt')
        with self.assertRaises(ValueError):p.column(item['id'],'not_a_column','089010','CFS','2019-12-31')

    def test_quarter_actual_ytd_subtraction_and_direct_statement_comparison(self):
        p=self.s.provenance()
        d=p.quarter_compare('089010','CFS','2019-12-31','20191113000024','매출액')
        self.assertEqual(d['current_ytd']['value'],299898807499)
        self.assertEqual(d['prior_ytd']['value'],170403298559)
        self.assertEqual(d['direct_single']['value'],129495508940)
        self.assertEqual(d['difference'],0)
        self.assertIn('회계 의미 추가 검토',d['status'])
        for key in ('current_ytd','prior_ytd','direct_single'):
            self.assertLessEqual(d[key]['filing']['available_from'],'2019-11-14')
        with self.assertRaises(ValueError):p.quarter_compare('089010','CFS','2010-01-01','20191113000024')

    def test_independent_confirmed_errors_are_flagged_not_silently_replaced(self):
        self.assertEqual(len(self.s.provenance().errors),3)
        for issue in self.s.provenance().errors:
            d=self.s.lineage().build(issue['stock_code'],issue['fs_div'],'2019-12-31',issue['trigger_receipt'],'sales_ttm')
            node=next(n for n in d['nodes'] if n['id']=='sales_ttm')
            self.assertIn('불일치 발견',node['status'])
            row=next(r for r in self.s.events if r['stock_code']==issue['stock_code'] and r['fs_div']==issue['fs_div'] and r['trigger_receipt']==issue['trigger_receipt'])
            self.assertEqual(node['value'],number(row['sales_ttm']))
            self.assertTrue(node['audit_issues'])

    def test_external_original_xml_hash_and_report_filters_pit(self):
        p=self.s.provenance();rid='20191113000024'
        self.assertNotIn(rid,self.s.documents)
        d=self.s.search_xml('089010','2019-12-31',rid,'매출')
        self.assertEqual(d['sha256'],p.documents[rid]['sha256'])
        reports=p.reports('089010','CFS','2017-01-01',kind='11014')
        self.assertTrue(reports)
        for r in reports:
            self.assertEqual(r['report_code'],'11014')
            self.assertLessEqual(r['available_from'],'2017-01-01')
        self.assertEqual(p.reports('089010','CFS','2010-01-01'),[])

    def test_account_id_requires_exact_statement_scope_period_and_api_amount(self):
        p=self.s.provenance();f=self.s.by_fact['F030155']
        d=p.account_context(f)
        self.assertEqual(d['account_id'],'ifrs-full_Revenue')
        self.assertEqual(d['sj_div'],'CIS')
        self.assertEqual(d['statement_context']['fs_div'],'CFS')
        self.assertEqual(d['api_candidates'][0]['source_column'],'thstrm_add_amount')
        self.assertEqual(p.account_context(self.s.by_fact['F030142'])['sj_div'],'BS')
        self.assertEqual(p.fact_period(self.s.by_fact['F030142'])['balance_as_of'],'2019-09-30')
        original=f['amount_krw']
        try:
            f['amount_krw']=str(number(original)+1000000)
            p.account_context_by_id.cache_clear()
            self.assertIsNone(p.account_context(f)['account_id'])
        finally:
            f['amount_krw']=original
            p.account_context_by_id.cache_clear()

    def test_all_graph_values_match_final_csv_and_pit(self):
        count = 0
        for (stock, fs), rows in self.s.groups.items():
            actual = {p['id']:p for p in self.s.series(stock, fs, '2020-12-31')}
            for r in rows:
                for m in METRICS:
                    value = actual[r['trigger_receipt']]['values'][m]
                    self.assertEqual(value, number(r[m]), (stock, fs, r['trigger_receipt'], m))
                    if value is not None:
                        count += 1
                        for rid in self.s.receipts(r, m):
                            self.assertTrue(self.s.visible(rid, r['as_of_available_from'], stock))
                    if fs == 'OFS' and m in ('parent_equity_t','ni_owner_ttm'):
                        self.assertIsNone(value)
        self.assertGreater(count, 3000)

    def test_formulas_without_replacing_csv(self):
        for r in self.s.events:
            n = {k:number(v) for k,v in r.items()}
            expected = {
                'NOA_t': lambda: n['assets_t']-n['current_liabilities_t'],
                'avg_noa': lambda: (n['NOA_t']+n['NOA_t_4q'])/2,
                'ATO': lambda: n['sales_ttm']/n['avg_noa'],
                'PM': lambda: n['operating_profit_ttm']/n['sales_ttm'],
                'OpROA': lambda: n['PM']*n['ATO'],
            }
            for m, f in expected.items():
                if n[m] is not None:
                    self.assertTrue(math.isclose(n[m], f(), rel_tol=1e-10, abs_tol=1e-7), (r['trigger_receipt'],m))

    def test_fact_links_and_ttm_multiple_receipts(self):
        multiple = False
        for r in self.s.events:
            for m in ('sales_ttm','operating_profit_ttm'):
                ids = r[m+'_fact_ids'].split('|') if r[m+'_fact_ids'] else []
                receipts = self.s.receipts(r,m)
                multiple |= len(receipts)>1
                for id in ids:
                    f = self.s.by_fact[id]
                    self.assertEqual(f['stock_code'],r['stock_code'])
                    self.assertEqual(f['fs_div'],r['fs_div'])
                    self.assertIn(f['source_receipt'],receipts)
                    self.assertLessEqual(f['available_from'],r['as_of_available_from'])
        self.assertTrue(multiple)

    def test_ttm_source_amount_reconciliation(self):
        for r in self.s.events:
            for metric in ('sales_ttm', 'operating_profit_ttm'):
                if not r[metric]:
                    continue
                d = self.s.evidence(r['stock_code'],r['fs_div'],r['as_of_available_from'],r['trigger_receipt'],metric)
                self.assertEqual(len(d['calculation_trace']),1)
                self.assertTrue(d['calculation_trace'][0]['matches_csv'],(r['trigger_receipt'],metric))

    def test_asof_and_unknown_receipt_fail_closed(self):
        stock = self.s.default
        self.assertEqual(self.s.series(stock,'CFS','2010-01-01'),[])
        for p in self.s.series(stock,'CFS','2017-01-01'):
            self.assertLessEqual(p['date'],'2017-01-01')
        with self.assertRaises(ValueError):
            self.s.search_xml('052270','2016-12-31','20170331001179','지배')
        row = dict(next(r for r in self.s.events if r['ATO']))
        row['sales_ttm_source_receipts'] = '99999999999999'
        self.assertIsNone(self.s.value(row,'ATO','2020-12-31'))

    def test_xml_hash_and_search_for_all_51_documents(self):
        for rid, d in self.s.documents.items():
            result = self.s.search_xml(d['stock_code'],'2020-12-31',rid,'자산')
            self.assertEqual(result['status'],'hash_verified_copy',rid)
            self.assertEqual(result['sha256'],d['original_xml_sha256'])
        with tempfile.TemporaryDirectory() as tmp:
            s = self.s
            rid = next(iter(s.documents))
            name = next(n for n in s.xml_files if n.startswith(rid+'_'))
            saved = s.xml_files[name]
            bad = Path(tmp)/name
            bad.write_bytes(b'<DOCUMENT>modified</DOCUMENT>')
            s.xml_files[name] = bad
            s.xml_tables.cache_clear()
            try:
                with self.assertRaises(ValueError):
                    s.xml_tables(rid)
            finally:
                s.xml_files[name] = saved
                s.xml_tables.cache_clear()

    def test_http_and_file_isolation(self):
        server = ThreadingHTTPServer(('127.0.0.1',0),make_handler(self.s))
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base+'/api/catalog') as r:
                self.assertEqual(len(json.load(r)['companies']),20)
                self.assertIn("default-src 'self'",r.headers['Content-Security-Policy'])
            for path in ['/OPENDART_API_KEY.txt','/../OPENDART_API_KEY.txt','/server.py','/data.csv']:
                with self.assertRaises(HTTPError) as e:
                    urlopen(base+path)
                self.assertEqual(e.exception.code,404)
            with urlopen(base+'/') as r:
                self.assertIn('FDS',r.read().decode())
            with self.assertRaises(HTTPError) as e:
                urlopen(Request(base+'/api/catalog', headers={'Host':'external.invalid'}))
            self.assertEqual(e.exception.code,403)
            with urlopen(base+'/api/prices?stock=089010&from=2017-01-01&asof=2017-03-31') as r:
                data=json.load(r)
                self.assertTrue(data['points'])
                self.assertTrue(all('2017-01-01'<=p['date']<='2017-03-31' for p in data['points']))
        finally:
            server.shutdown()
            server.server_close()

    def test_real_price_csv_match_and_period_cutoff(self):
        source=read_csv(ROOT/'KRX_20종목_2015-2025_확보자료'/'01_종목가격_2015-2025_수정주가미확인.csv')
        for company in self.s.companies:
            stock=company['stock_code']
            actual=self.s.price_series(stock,'2015-01-01','2019-12-31')
            expected=[{'date':r['trade_date'],'close':number(r['close'])} for r in source if r['stock_code']==stock and '2015-01-01'<=r['trade_date']<='2019-12-31' and number(r['close']) is not None]
            self.assertEqual(actual['points'],sorted(expected,key=lambda r:r['date']))
            self.assertIn('미확인',actual['status'])
            self.assertEqual(self.s.price_series(stock,'2010-01-01','2010-12-31')['points'],[])


if __name__ == '__main__':
    unittest.main(verbosity=2)
