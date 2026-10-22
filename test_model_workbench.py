import unittest
from server import Store
from model_workbench import ModelInputs, RULES, judge, ri_scenario


class ModelInputTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Store()
        cls.m = ModelInputs(cls.s)

    def test_ohlson_one_year_capital_and_review_scenario(self):
        d = self.m.ohlson('089010', 'CFS', '2015-01-01', '2019-12-31', '20191113000024', .085)
        self.assertEqual(d['inputs']['prior']['year'], '2018')
        self.assertEqual(d['inputs']['prior']['quarter'], d['inputs']['ni']['quarter'])
        self.assertEqual(d['inputs']['prior']['receipt'], '20181108000121')
        ni = d['inputs']['ni']['value']; prior = d['inputs']['prior']['value']
        self.assertEqual(ni, 25489766525)
        self.assertEqual(prior, 78197600711)
        self.assertAlmostEqual(d['scenario']['residual_income'], ni - .085 * prior)
        self.assertEqual(d['scenario']['status'], 'REVIEW')
        self.assertIsNone(d['valuation'])
        self.assertIsNone(d['scenario']['equity_value'])
        self.assertTrue(all(not v['fact_ids'] for v in d['inputs'].values()))

    def test_ohlson_missing_prior_and_ofs_do_not_get_replacements(self):
        first = self.m.ohlson('089010', 'CFS', '2015-01-01', '2019-12-31', '20150515001172', .085)
        self.assertIsNone(first['inputs']['prior']['value'])
        self.assertIsNone(first['scenario'])
        ofs = self.m.ohlson('089010', 'OFS', '2015-01-01', '2019-12-31', '', .085)
        self.assertIsNone(ofs['scenario'])
        self.assertTrue(all(v['status'] == 'NOT_APPLICABLE' for v in ofs['inputs'].values()))

    def test_ohlson_asof_filters_future_corrections(self):
        d = self.m.ohlson('089010', 'CFS', '2015-01-01', '2018-12-31', '', .085)
        self.assertTrue(all(o['available_from'] <= '2018-12-31' for o in d['observations']))
        self.assertEqual(d['inputs']['equity']['year'], '2018')
        self.assertEqual(d['inputs']['prior']['year'], '2017')
        with self.assertRaises(ValueError):
            self.m.ohlson('089010', 'CFS', '2015-01-01', '2018-12-31', '20191113000024', .085)

    def test_annual_comparison_and_source_cutoff(self):
        d = self.m.fscore('089010', 'CFS', '2015-01-01', '2019-12-31', '')
        self.assertEqual((d['year'], d['prior_year']), (2018, 2017))
        self.assertEqual(d['inputs']['A2']['year'], 2016)
        self.assertEqual(d['inputs']['NI0']['value'], 1145164385)
        for i in d['inputs'].values():
            for item in i['facts']:
                f = item['row']
                self.assertEqual(f['quarter'], '4')
                self.assertEqual(f['fs_div'], 'CFS')
                self.assertLessEqual(f['available_from'], d['cutoff'])
                self.assertLessEqual(item['filing']['available_from'], d['cutoff'])
        earlier = self.m.fscore('089010', 'CFS', '2015-01-01', '2019-04-01', '')
        self.assertEqual(earlier['year'], 2017)

    def test_review_is_unjudged_not_zero_and_missing_debt_issue_not_inferred(self):
        d = self.m.fscore('089010', 'CFS', '2015-01-01', '2019-12-31', '')
        self.assertEqual((d['judged_count'], d['unjudged_count']), (0, 9))
        self.assertIsNone(d['judged_points'])
        self.assertIsNone(d['score'])
        self.assertTrue(all(c['point'] is None for c in d['conditions']))
        for k in ('LTD0', 'LTD1', 'ISSUE0'):
            self.assertIsNone(d['inputs'][k]['value'])
            self.assertEqual(d['inputs'][k]['semantic_status'], 'MISSING')
        self.assertNotIn('NOA', str([c['formula'] for c in d['conditions']]))

    def test_verdict_gate_and_strict_improvement(self):
        rule = next(r for r in RULES if r[0] == 'F6')
        # Isolated verdict-boundary fixtures; never served as real observations.
        inputs = {k: {'value': v, 'semantic_status': 'PASS'} for k, v in
                  {'CA0': 200, 'CL0': 100, 'CA1': 100, 'CL1': 100}.items()}
        self.assertEqual(judge(rule, inputs), 1)
        inputs['CA0']['value'] = 100
        self.assertEqual(judge(rule, inputs), 0)
        inputs['CA0']['semantic_status'] = 'REVIEW'
        self.assertIsNone(judge(rule, inputs))
        inputs['CA0']['semantic_status'] = 'PASS'
        inputs['CL0']['value'] = 0
        self.assertIsNone(judge(rule, inputs))

    def test_scenario_rate_bounds_and_no_hidden_value_on_missing_input(self):
        self.assertIsNone(ri_scenario(None, 100, .085, True))
        self.assertIsNone(ri_scenario(10, 100, .085, False))
        for rate in (-.01, .31, float('nan')):
            with self.assertRaises(ValueError):
                ri_scenario(10, 100, rate, True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
