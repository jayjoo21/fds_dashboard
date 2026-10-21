"""Write a separate verification artifact; never modify input data."""
import json
import unittest
from datetime import datetime, timezone
from pathlib import Path
from server import Store, METRICS

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.discover(str(Path(__file__).parent), pattern='test_dashboard.py')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    store = Store()
    report = {
        'checked_at_utc': datetime.now(timezone.utc).isoformat(),
        'successful': result.wasSuccessful(), 'tests_run': result.testsRun,
        'failures': len(result.failures), 'errors': len(result.errors),
        'companies': len(store.companies), 'event_rows': len(store.events),
        'metrics_per_row': len(METRICS), 'xml_documents': len(store.documents),
        'review_rows':len(store.reviews), 'new_source_rows':len(store.additions),
        'default_stock':store.default, 'default_complete_cfs_events': store.scores[store.default],
        'scope':'CSV/API mapping, formula/source reconciliation, PIT/CFS/OFS separation, XML hash/search and local HTTP isolation; not a full accounting semantic audit',
    }
    target = Path(__file__).parent / 'validation.json'
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    raise SystemExit(0 if result.wasSuccessful() else 1)
