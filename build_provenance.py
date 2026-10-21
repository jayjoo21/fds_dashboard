"""Create derived metadata only. Original CSV/XML are never written."""
import hashlib
import json
from datetime import datetime,timezone
from pathlib import Path
from server import Store
from lineage import FILES

if __name__=='__main__':
    s=Store();p=s.provenance();out=Path(__file__).parent/'derived';out.mkdir(exist_ok=True)
    # Existing names, IDs, report codes, original dates and amounts remain in CSV.
    # These rows add only metadata/verification fields, keyed by existing receipt.
    fields=['rcept_no','report_type','report_period_start','report_period_end','period_source','receipt_date','published_at','revision_published_at','availability_policy','date_precision','xml_code_matches','xml_identity_matches','metadata_status','metadata_issues','xml_source_status','xml_file','xml_sha256','official_code_status']
    records=[{k:r.get(k) for k in fields} for r in (p.report(rid) for rid in s.versions)]
    report={'generated_at_utc':datetime.now(timezone.utc).isoformat(),'join':'01.rcept_no = 02.source_receipt; 03/25 fact_id lists retain many-to-many links. NOA edges use original selection rules and amount checks.',
            'publication_time_policy':'NULL when official intraday time is unavailable. No receipt-number or midnight inference.',
            'records':records,
            'source_csv_sha256':{name:hashlib.sha256((s.package/name).read_bytes()).hexdigest() for name in FILES.values()}}
    (out/'source_reports.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (out/'variable_column_mapping.json').write_text(json.dumps(s.lineage().schema(),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Derived source reports:',len(records),' / original files unchanged')
