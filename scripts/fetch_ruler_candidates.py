"""Discover ruler sources for every atlas identity and cache Wikidata candidates.

Run with .venv/bin/python. Default is strictly offline and writes discovery plus
whatever cached candidates exist. --download fetches bounded batches from the
Wikidata Action API. No downloaded assertion is automatically accepted as true.
See sources/rulers/wikidata-schema.md for the emitted contract and limitations.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request

import resolve as R

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/wikidata'
OUT = ROOT / 'sources/rulers'
API = 'https://www.wikidata.org/w/api.php'
EXTRACT_PROPERTIES = {'P35': 'head of state', 'P6': 'head of government'}
OFFICE_PROPERTIES = {'P1906': 'head of state', 'P1313': 'head of government'}
USER_AGENT = 'Chronoscape-ruler-source-audit/1.0 (offline historical atlas candidate collection)'


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def discover():
    index = json.loads((ROOT / 'docs/data/polity_index.json').read_text())
    reg = R.load_registry()
    source = next(s for s in reg['sources'] if s['id'] == 'cliopatria')
    raw_path = Path(R.raw_path(reg, source['path']))
    features = R._cliopatria_features(reg, source)
    decisions = R.load_decisions()
    names_by_id = defaultdict(set)
    for feature in features:
        p = feature['properties']
        if not (p.get('Components') or '').strip() and p.get('Wikidata'):
            names_by_id[p['Wikidata']].add(R._norm(p['Name']))
    ambiguous = {qid for qid, names in names_by_id.items() if len(names) > 1}
    polities = {}
    for key, entry in index.items():
        if key == '_span':
            continue
        polities[key] = {
            'name': entry['n'], 'mappedFrom': entry['first'], 'mappedTo': entry['last'],
            'identityStatus': 'unreviewed', 'officeScopeStatus': 'unreviewed',
            'acquisitionStatus': 'not-fetched', 'verificationStatus': 'not-cross-verified',
            'completenessStatus': 'unassessed', 'sourceCandidates': [], 'rawNames': [],
            'candidateCount': 0,
        }
        if key.startswith('wd:'):
            qid = key[3:]
            polities[key]['sourceCandidates'].append({
                'kind': 'wikidata', 'entityId': qid,
                'url': 'https://www.wikidata.org/wiki/' + qid,
                'basis': 'atlas-index-key', 'identityStatus': 'unreviewed',
            })
    unmatched = []
    for row, feature in enumerate(features):
        p = feature['properties']
        rec = R.Record(p['Name'], p['FromYear'], p['ToYear'], None,
                       'cliopatria', 2, source['grade'], wikidata=p.get('Wikidata'))
        rec = R.apply_decisions(rec, p, decisions, 'cliopatria')
        if rec is None:
            continue
        key = 'wd:' + str(rec.wikidata) if rec.wikidata and rec.wikidata not in ambiguous else 'nm:' + R._norm(rec.name)
        if key not in polities:
            unmatched.append({'row': row, 'name': rec.name, 'key': key})
            continue
        polity = polities[key]
        if p['Name'] not in polity['rawNames']:
            polity['rawNames'].append(p['Name'])
        candidates = []
        if rec.wikidata:
            candidates.append({
                'kind': 'wikidata', 'entityId': rec.wikidata,
                'url': 'https://www.wikidata.org/wiki/' + rec.wikidata,
                'basis': 'arbitration' if rec.arb else 'cliopatria-metadata',
                'identityStatus': 'ambiguous-reused-id' if rec.wikidata in ambiguous else 'unreviewed',
                'rawRow': row, 'arbitration': rec.arb,
            })
        if p.get('Wikipedia'):
            title = p['Wikipedia']
            candidates.append({
                'kind': 'wikipedia', 'title': title,
                'url': title if title.startswith(('https://', 'http://')) else 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe='():,'),
                'basis': 'cliopatria-metadata', 'identityStatus': 'unreviewed', 'rawRow': row,
            })
        for candidate in candidates:
            if not any(old['url'] == candidate['url'] for old in polity['sourceCandidates']):
                polity['sourceCandidates'].append(candidate)
        if any(c.get('identityStatus') == 'ambiguous-reused-id' for c in candidates):
            polity['identityStatus'] = 'ambiguous-reused-id'
    return {'schemaVersion': 1, 'status': 'candidate-discovery-only',
            'inputs': [{'path': str(path.relative_to(ROOT)), 'sha256': sha(path)} for path in [ROOT / 'docs/data/polity_index.json', raw_path, ROOT / 'sources/aliases.yaml', ROOT / 'arbitration/decisions.jsonl']],
            'ambiguousWikidataIds': {qid: sorted(names_by_id[qid]) for qid in sorted(ambiguous)},
            'unmatchedRawRecords': unmatched, 'polities': polities}


def read_cache():
    entities, receipts = {}, {}
    for path in sorted(CACHE.glob('batch-*.json')):
        data = json.loads(path.read_text())
        receipt_path = path.with_suffix('.receipt.json')
        if not receipt_path.exists():
            continue
        receipt = json.loads(receipt_path.read_text())
        if receipt.get('sha256') != sha(path):
            raise ValueError('Wikidata cache hash mismatch: ' + str(path))
        for qid, entity in data.get('entities', {}).items():
            entities[qid] = entity
            receipts[qid] = receipt
    return entities, receipts


def fetch_entities(ids, entities, receipts, limit):
    pending = sorted(set(ids) - set(entities), key=lambda value: int(value[1:]))
    for offset in range(0, len(pending), 50):
        if limit is not None and offset // 50 >= limit:
            break
        batch = pending[offset:offset + 50]
        parameters = {'action': 'wbgetentities', 'ids': '|'.join(batch),
                      'props': 'labels|descriptions|claims|sitelinks', 'languages': 'en',
                      'sitefilter': 'enwiki', 'format': 'json', 'maxlag': '5'}
        url = API + '?' + urllib.parse.urlencode(parameters)
        path = CACHE / ('batch-' + hashlib.sha256('|'.join(batch).encode()).hexdigest()[:20] + '.json')
        print(f'Fetching {offset + 1}..{offset + len(batch)} of {len(pending)} missing entities', flush=True)
        request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'})
        with urllib.request.urlopen(request, timeout=40) as response:
            content = response.read()
            data = json.loads(content)
        if 'error' in data:
            raise RuntimeError(str(data['error']))
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        receipt = {'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat(),
                   'path': str(path.relative_to(ROOT)), 'sha256': sha(path),
                   'bytes': len(content), 'entityIds': batch}
        dump(path.with_suffix('.receipt.json'), receipt)
        for qid, entity in data.get('entities', {}).items():
            entities[qid] = entity
            receipts[qid] = receipt
        time.sleep(0.1)


def entity_id(statement):
    return statement.get('mainsnak', {}).get('datavalue', {}).get('value', {}).get('id')


def label(entity):
    return entity.get('labels', {}).get('en', {}).get('value')


def extraction(discovery, entities, receipts):
    assertions = {}
    entity_summaries = {}
    for qid, entity in entities.items():
        entity_summaries[qid] = {'label': label(entity), 'description': entity.get('descriptions', {}).get('en', {}).get('value'),
                                 'revision': entity.get('lastrevid'), 'missing': 'missing' in entity,
                                 'sitelinks': entity.get('sitelinks', {}), 'snapshot': receipts[qid]}
    for key, polity in discovery['polities'].items():
        qids = [source['entityId'] for source in polity['sourceCandidates'] if source['kind'] == 'wikidata']
        links = []

        def append(qid, prop, statement, route):
            sid = statement.get('id')
            if not sid:
                return
            value = entity_id(statement)
            assertions[sid] = {
                'id': sid, 'status': 'candidate', 'subjectId': qid, 'property': prop,
                'personId': value, 'personLabel': label(entities.get(value, {})) if value else None,
                'statementUrl': 'https://www.wikidata.org/wiki/' + qid + '#' + prop,
                'subjectRevision': entities[qid].get('lastrevid'), 'snapshot': receipts[qid],
                'statement': statement,
            }
            links.append({'assertionId': sid, 'route': route, 'status': 'not-cross-verified'})

        for qid in qids:
            entity = entities.get(qid)
            if not entity:
                continue
            claims = entity.get('claims', {})
            for prop, role in EXTRACT_PROPERTIES.items():
                for statement in claims.get(prop, []):
                    append(qid, prop, statement, {'kind': 'polity-property', 'polityEntity': qid, 'officeRole': role})
            for office_prop, role in OFFICE_PROPERTIES.items():
                for office_statement in claims.get(office_prop, []):
                    office = entity_id(office_statement)
                    if not office:
                        continue
                    for statement in entities.get(office, {}).get('claims', {}).get('P1308', []):
                        append(office, 'P1308', statement, {'kind': 'office-holder', 'polityEntity': qid, 'officeEntity': office,
                                                         'officeRole': role, 'officeStatementId': office_statement.get('id')})
        polity['candidateAssertions'] = links
        polity['candidateCount'] = len(links)
        fetched = sum(qid in entities for qid in qids)
        polity['acquisitionStatus'] = ('no-wikidata-id' if not qids else 'not-fetched' if not fetched else
                                       'partially-fetched' if fetched < len(qids) else 'candidates-acquired' if links else 'fetched-no-direct-roster')
    return {'schemaVersion': 1, 'status': 'candidate-only-not-accepted', 'lineage': 'Wikidata',
            'entities': entity_summaries, 'assertions': assertions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--stage', choices=['polities', 'offices', 'people', 'all'], default='polities')
    parser.add_argument('--max-batches', type=int, default=None)
    args = parser.parse_args()
    discovery = discover()
    dump(OUT / 'wikidata-discovery.json', discovery)
    print(f"Discovery saved: {len(discovery['polities'])} atlas keys", flush=True)
    entities, receipts = read_cache()
    try:
        if args.download:
            if args.stage in ('polities', 'all'):
                qids = {source['entityId'] for polity in discovery['polities'].values() for source in polity['sourceCandidates'] if source['kind'] == 'wikidata'}
                fetch_entities(qids, entities, receipts, args.max_batches)
            if args.stage in ('offices', 'all'):
                qids = {entity_id(statement) for entity in list(entities.values()) for prop in OFFICE_PROPERTIES for statement in entity.get('claims', {}).get(prop, [])}
                fetch_entities(qids - {None}, entities, receipts, args.max_batches)
            if args.stage in ('people', 'all'):
                qids = {entity_id(statement) for entity in list(entities.values()) for prop in ['P35', 'P6', 'P1308'] for statement in entity.get('claims', {}).get(prop, [])}
                fetch_entities(qids - {None}, entities, receipts, args.max_batches)
    finally:
        candidates = extraction(discovery, entities, receipts)
        dump(OUT / 'wikidata-candidates.json', candidates)
        discovery['summary'] = {'atlasKeys': len(discovery['polities']), 'cachedEntities': len(entities),
                                'candidateAssertions': len(candidates['assertions']),
                                'politiesWithCandidates': sum(bool(p['candidateCount']) for p in discovery['polities'].values()),
                                'acquisitionStatus': dict(Counter(p['acquisitionStatus'] for p in discovery['polities'].values())),
                                'acceptedAssertions': 0, 'verifiedCompleteRosters': 0}
        dump(OUT / 'wikidata-discovery.json', discovery)
        print(json.dumps(discovery['summary'], indent=2), flush=True)


if __name__ == '__main__':
    main()
