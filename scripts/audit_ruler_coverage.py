#!/usr/bin/env python3
"""Reconcile published ruler coverage with acquired source candidates, offline.

Pipeline dispositions describe remaining work, not historical classifications.
An inspected page or an empty extraction never establishes that no rulers existed.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / 'sources/rulers/coverage-audit.json'
INPUTS = ['docs/data/polity_index.json', 'docs/data/rulers.json',
          'sources/rulers/accuracy-report.json', 'sources/rulers/wikidata-discovery.json',
          'sources/rulers/wikipedia-extracted.json', 'sources/rulers/wikidata-extracted.json',
          'sources/rulers/additional-extracted.json']


def build():
    data = {name: json.loads((ROOT / name).read_text()) for name in INPUTS}
    index = data[INPUTS[0]]
    public = data[INPUTS[1]]
    accuracy = data[INPUTS[2]]
    discovery = data[INPUTS[3]]['polities']
    wikipedia = data[INPUTS[4]]
    candidates, pages, held, statuses = (defaultdict(list) for _ in range(4))
    for source in INPUTS[4:]:
        for row in data[source]['records']:
            candidates[row['polityKey']].append(row)
    for page in wikipedia['pages']:
        pages[page['polityKey']].append(page)
    for row in wikipedia['unmatched']:
        if row.get('polityKey'):
            held[row['polityKey']].append(row)
    for row in accuracy['accepted']:
        statuses[row['polityKey']].append(row['status'])
    polities = {}
    for key, polity in public['polities'].items():
        count = len(polity['rulers'])
        conflicts = [r for r in held[key] if 'identity' in r.get('reason', '').lower()
                     or 'metadata' in r.get('reason', '').lower()]
        if polity['coverage'] == 'complete':
            disposition = 'complete-scoped-roster'
        elif count:
            disposition = 'partial-roster'
        elif conflicts or 'conflict' in polity['research'].get('identityStatus', ''):
            disposition = 'identity-review'
        elif candidates[key]:
            disposition = 'candidate-review'
        elif held[key]:
            disposition = 'scope-or-evidence-review'
        else:
            disposition = 'source-acquisition-or-extraction'
        polities[key] = {
            'name': polity['name'],
            'atlasPeriod': {'first': index[key]['first'], 'last': index[key]['last']},
            'coverage': polity['coverage'], 'disposition': disposition,
            'acceptedReigns': count, 'acceptedStatuses': dict(sorted(Counter(statuses[key]).items())),
            'candidateRecords': len(candidates[key]),
            'candidateSources': sorted({row['sourceId'] for row in candidates[key]}),
            'inspectedWikipediaPages': list(dict.fromkeys(p['url'] for p in pages[key])),
            'heldReasons': list(dict.fromkeys(r['reason'] for r in held[key])),
            'sourceLeads': discovery[key]['sourceCandidates'],
            'remainingWork': ('Maintain the scoped roster and review future source changes.' if disposition == 'complete-scoped-roster'
                else 'Reconcile the missing succession entries and office scope; completeness is not established.' if count
                else 'Resolve the recorded identity/period mismatch before attaching ruler claims.' if disposition == 'identity-review'
                else 'Review candidate identities, offices, chronology and admission failures.' if candidates[key]
                else 'Inspect the source leads and acquire or transcribe an appropriately scoped roster; retain unsupported or conflicting claims in review.'),
        }
        if sum(polities[key]['acceptedStatuses'].values()) != count:
            raise ValueError('Published/accepted reconciliation failed: ' + key)
    if set(polities) != set(index) - {'_span'}:
        raise ValueError('The audit must account for every atlas identity exactly once.')
    return {
        'schemaVersion': 1,
        'purpose': 'All-polity work inventory. Pipeline dispositions are not scholarly classifications or proof of complete historical coverage.',
        'inputFingerprints': [{'path': name, 'sha256': hashlib.sha256((ROOT/name).read_bytes()).hexdigest()} for name in INPUTS],
        'summary': {
            'polities': len(polities),
            'withAcceptedRulers': sum(bool(p['acceptedReigns']) for p in polities.values()),
            'withoutAcceptedRulers': sum(not p['acceptedReigns'] for p in polities.values()),
            'completeScopedRosters': sum(p['coverage'] == 'complete' for p in polities.values()),
            'dispositions': dict(sorted(Counter(p['disposition'] for p in polities.values()).items())),
            'acceptedStatuses': dict(sorted(Counter(s for values in statuses.values() for s in values).items())),
        },
        'polities': polities,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = build()
    content = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text() != content:
            raise SystemExit('Stale ruler coverage audit; run scripts/audit_ruler_coverage.py.')
    else:
        OUTPUT.write_text(content)
    print(json.dumps(result['summary']))


if __name__ == '__main__':
    main()
