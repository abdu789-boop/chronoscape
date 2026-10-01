#!/usr/bin/env python3
"""Reproduce the century-list quality review without altering production imports."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'wikipedia-century-leaders'


def main():
    with tempfile.TemporaryDirectory(prefix='chronoscape-chronology-review-') as directory:
        candidate = Path(directory) / 'candidate-import.json'
        subprocess.run([sys.executable, str(ROOT/'scripts/prepare_ruler_broad_import.py'),
                        '--include-chronologies', '--output', str(candidate)], cwd=ROOT, check=True)
        data = json.loads(candidate.read_text())
    source = data['sources'][SOURCE]
    audit = data['reviewAudit'][SOURCE]
    selected = set(source['review']['sampleRecordIds'])
    sample = {}
    for outcome, rows in [('matched', data['matched']), ('conflict', data['conflicts'])]:
        for row in rows:
            claim = row.get('claim', row)
            first = claim['assertions'][0]
            if first['sourceId'] != SOURCE or first['sourceRecordId'] not in selected:
                continue
            sample[first['sourceRecordId']] = {'outcome': outcome, 'claim': claim}
            if 'reason' in row: sample[first['sourceRecordId']]['reason'] = row['reason']
    agreement = audit['matched'] / audit['selected'] if audit['selected'] else 0
    passed = audit['selected'] >= 5 and agreement >= .9
    result = {
        'schemaVersion': 1, 'source': source, 'reviewAudit': audit,
        'admission': 'requires-editorial-review' if passed else 'failed-sampled-threshold',
        'requiredAgreement': .9, 'observedAgreement': agreement,
        'decision': 'Source discovery only. This review never changes the production input list; all selected failures and source snapshots remain inspectable.',
        'sample': [sample[rid] for rid in source['review']['sampleRecordIds'] if rid in sample],
        'inputFingerprints': data['inputFingerprints'],
    }
    (ROOT/'sources/rulers/chronology-review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'chronologyReview': audit, 'admission': result['admission']}))


if __name__ == '__main__':
    main()
