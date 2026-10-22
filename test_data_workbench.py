"""Real-source contracts for the two bounded read-only workbench adapters."""
import unittest
from unittest.mock import patch
from server import Store
from data_workbench import Workbench, equal_amount


class WorkbenchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.store = Store()
        cls.w = Workbench(cls.store)
        cls.args = ('089010', 'CFS', '2015-01-01', '2019-12-31', '20191113000024', 'sales_ttm')

    def test_stored_ttm_terms_and_original_quarter_method(self):
        data = self.w.pipeline(*self.args)
        trace = data['graph']['traces']['sales_ttm']
        self.assertEqual({t['fact_id']: t['sign'] for t in trace['terms']},
                         {'F030155': 1, 'F030157': -1, 'F030455': 1})
        self.assertTrue(trace['matches_csv'])
        self.assertTrue(any(r['calculation'] == 'original_statement_value'
                            for r in data['quarter']['stored_quarters']))
        self.assertTrue(equal_amount(data['quarter']['direct_single']['value'],
                                     data['quarter']['stored_quarters'][0]['single_quarter_amount_krw']))

    def test_daily_rows_are_stored_event_rows_with_cutoff(self):
        data = self.w.pipeline(*self.args)
        self.assertGreater(len(data['daily']), 10)
        for row in data['daily']:
            self.assertEqual(row['trigger_receipt'], self.args[4])
            self.assertEqual(row['as_of_available_from'], '2019-11-14')
            self.assertEqual(row['fs_div'], 'CFS')
            self.assertTrue('2019-11-14' <= row['trade_date'] <= '2019-12-31')
            self.assertTrue(equal_amount(row['sales_ttm'], data['event']['sales_ttm']))
            self.assertGreaterEqual(row['csv_row'], 2)
        with self.assertRaises(ValueError):
            self.w.pipeline('089010', 'CFS', '2015-01-01', '2019-11-13', self.args[4], 'sales_ttm')

    def test_audit_records_keep_exact_scope_and_review(self):
        data = self.w.quality(*self.args)
        checks = {c['id']: c for c in data['checks']}
        self.assertEqual(checks['ttm']['rows'][0]['status'], 'PASS')
        self.assertEqual(checks['ttm']['rows'][0]['source_status'], 'REVIEW')
        self.assertEqual(checks['dates']['rows'][0]['format_status'], 'FAIL')
        self.assertEqual(checks['dates']['rows'][0]['published_time_status'], 'MISSING')
        self.assertTrue(checks['cells']['rows'])
        self.assertTrue(all(r['semantic_period_status'] == 'REVIEW' for r in checks['semantics']['rows']))
        self.assertEqual(data['unlinked_fact_ids'], [])
        self.assertTrue(checks['api']['rows'])
        self.assertTrue(all(r['xml_source_row_id'][2:] in {f['fact_id'] for f in data['facts']}
                            for r in checks['api']['rows']))
        for r in checks['daily']['rows']:
            self.assertEqual(r['file'], '26')
            self.assertEqual(r['fs_div'], 'CFS')
        self.assertTrue(checks['daily']['rows'])

    def test_mismatched_audit_value_cannot_inherit_pass(self):
        original = self.w.audit_rows
        def changed(name):
            rows = original(name)
            if name == 'TTM_전수재계산_대조.csv':
                return tuple(dict(r, stored='1') for r in rows)
            return rows
        with patch.object(self.w, 'audit_rows', side_effect=changed):
            data = self.w.quality(*self.args)
        check = next(c for c in data['checks'] if c['id'] == 'ttm')
        self.assertEqual(check['rows'], [])
        self.assertEqual(check['link_status'], 'unlinked')

    def test_confirmed_errors_preserve_original_and_affected_columns(self):
        data = self.w.quality('052270', 'OFS', '2015-01-01', '2018-12-31', '20180515000925', 'sales_ttm')
        errors = next(c for c in data['checks'] if c['id'] == 'errors')['rows']
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]['status'], 'FAIL')
        self.assertEqual(set(errors[0]['affected_columns'].split('|')), {'sales_ttm', 'PM', 'ATO', 'OpROA'})
        self.assertEqual(errors[0]['after_sales_ttm'], '')
        self.assertLess(float(self.w.event('052270', 'OFS', '2018-12-31', '20180515000925')['sales_ttm']), 0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
