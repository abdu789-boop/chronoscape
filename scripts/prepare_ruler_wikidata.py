"""Normalize dated Wikidata office statements; admission is a separate step.

Reads the acquisition cache from fetch_ruler_candidates.py, without networking.
JSON dates use historical numbering (unlike Wikidata's RDF dates): -0001 is
1 BCE. See https://www.wikidata.org/wiki/Help:Dates#Years_BC . Never use birth,
death, predecessor, or successor properties to manufacture a term endpoint.
"""
from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/wikidata'
REVIEW_HOLDS = {
    ('wd:Q230791', 'Q471796'): 'The source identifies Edward Balliol as a Scottish throne claimant; plain monarch status needs qualification.',
    ('wd:Q62943', 'Q8589'): 'Ashoka accession/consecration chronology needs review: the dated statement and cached person description give different starting years.',
}


def norm(value):
    return ''.join(c for c in unicodedata.normalize('NFKD', value or '').casefold() if c.isalnum())


def value(snak):
    return snak.get('datavalue', {}).get('value')


def entity_id(statement):
    data = value(statement.get('mainsnak', {}))
    return data.get('id') if isinstance(data, dict) else None


def time_value(snak):
    data = value(snak)
    if not isinstance(data, dict) or data.get('precision', 0) < 9:
        return None
    if data.get('before', 0) or data.get('after', 0):
        return None
    if data.get('calendarmodel', '').rsplit('/', 1)[-1] not in {'Q1985727', 'Q1985786'}:
        return None
    match = re.fullmatch(r'([+-]\d+)-\d{2}-\d{2}T00:00:00Z', data.get('time', ''))
    if not match or int(match[1]) == 0:
        return None
    return int(match[1]), data['time'], data['calendarmodel'], data['precision']


def term(statement):
    qualifiers = statement.get('qualifiers', {})
    # Multiple endpoints or bounds need interpretation, never their Cartesian product.
    if len(qualifiers.get('P580', [])) != 1 or len(qualifiers.get('P582', [])) != 1:
        return None
    if any(p in qualifiers for p in ['P1319', 'P1326', 'P518', 'P5102']):
        return None
    start, end = time_value(qualifiers['P580'][0]), time_value(qualifiers['P582'][0])
    if not start or not end or start[0] > end[0] or end[0] - start[0] > 110:
        return None
    qualifications = {v.get('id') for s in qualifiers.get('P1480', []) if isinstance(v := value(s), dict)}
    if qualifications - {'Q5727902', 'Q21818619'}:  # circa / near only
        return None
    return {'from': start[0], 'to': end[0], 'precision': 'approximate' if qualifications else 'year',
            'sourceDates': {'from': start[1], 'to': end[1]},
            'sourceCalendar': {'from': start[2], 'to': end[2]},
            'sourcePrecision': {'from': start[3], 'to': end[3]}}


def specific_office(entity):
    """Generic titles cannot identify a polity in a reverse person query."""
    name = entity.get('labels', {}).get('en', {}).get('value', '').casefold()
    return bool(name) and name not in {
        'mayor', 'king', 'queen', 'emperor', 'empress', 'sultan', 'khagan',
        'khan', 'raja', 'rector', 'consul', 'prince', 'duke', 'caliph',
        'king of kings', 'great king', 'amir al-mu\'minin', 'president of the republic',
        'president', 'prime minister', 'head of state', 'head of government',
        'tlatoani', 'papal vice-legate', 'reichsstatthalter', 'governor',
    }


def single_year(snaks):
    parsed = [time_value(s) for s in snaks]
    years = {v[0] for v in parsed if v}
    return next(iter(years)) if len(years) == 1 else None


def qualified_position_overlap(entity, offices, dates):
    for position in entity.get('claims', {}).get('P39', []):
        if position.get('rank') == 'deprecated' or entity_id(position) not in offices:
            continue
        q = position.get('qualifiers', {})
        flags = {v.get('id') for prop in ['P1552', 'P1480'] for s in q.get(prop, []) if isinstance(v := value(s), dict)}
        if 'P5102' not in q and not flags.intersection({'Q18912752', 'Q18122778'}):
            continue
        start, end = single_year(q.get('P580', [])), single_year(q.get('P582', []))
        if start is not None and end is not None and start <= dates['to'] and dates['from'] <= end:
            return True
    return False


def read_cache():
    entities, receipts = {}, {}
    for file in sorted(CACHE.glob('batch-*.json')):
        if '.receipt.' in file.name:
            continue
        receiptfile = file.with_suffix('.receipt.json')
        if not receiptfile.exists():
            continue
        receipt = json.loads(receiptfile.read_text())
        if hashlib.sha256(file.read_bytes()).hexdigest() != receipt['sha256']:
            raise ValueError(f'Corrupt source snapshot: {file}')
        for qid, entity in json.loads(file.read_text()).get('entities', {}).items():
            entities[qid], receipts[qid] = entity, receipt
    return entities, receipts


def main():
    discovery = json.loads((ROOT / 'sources/rulers/wikidata-discovery.json').read_text())
    entities, receipts = read_cache()
    reverse_holders = {}
    reverse_receipts = []
    for file in sorted(CACHE.glob('office-holders-*.json')):
        if '.receipt.' in file.name:
            continue
        receipt = json.loads(file.with_suffix('.receipt.json').read_text())
        if hashlib.sha256(file.read_bytes()).hexdigest() != receipt['sha256']:
            raise ValueError(f'Corrupt office discovery: {file}')
        reverse_receipts.append(receipt)
        for row in json.loads(file.read_text())['results']['bindings']:
            office = row['office']['value'].rsplit('/', 1)[-1]
            person = row['person']['value'].rsplit('/', 1)[-1]
            reverse_holders.setdefault(office, set()).add(person)
    records, held, profiles = [], [], {}
    seen = {}

    def label(qid):
        return entities.get(qid, {}).get('labels', {}).get('en', {}).get('value')

    for key, polity in discovery['polities'].items():
        wiki_titles = {norm(unquote(c['url'].split('/wiki/')[-1]).replace('_', ' '))
                       for c in polity['sourceCandidates'] if c['kind'] == 'wikipedia'}
        names = {norm(polity['name']), *map(norm, polity.get('rawNames', []))}
        qids = sorted({c['entityId'] for c in polity['sourceCandidates'] if c['kind'] == 'wikidata'})
        for qid in qids:
            entity = entities.get(qid, {})
            sitelink = entity.get('sitelinks', {}).get('enwiki', {}).get('title', '')
            if key in {'wd:Q6000379', 'wd:Q201038'} or not (norm(label(qid)) in names or not key.startswith('nm:') and norm(sitelink) in wiki_titles):
                reason = 'Traditional Roman royal chronology requires a sourced historicality classification.' if key == 'wd:Q201038' else 'Polity name and Wikipedia identity do not align.'
                held.append({'polityKey': key, 'entityId': qid, 'reason': reason})
                continue
            claims = entity.get('claims', {})
            inception = single_year([s.get('mainsnak', {}) for s in claims.get('P571', []) if s.get('rank') != 'deprecated'])
            dissolution = single_year([s.get('mainsnak', {}) for s in claims.get('P576', []) if s.get('rank') != 'deprecated'])
            offices, office_periods = {}, {}
            for prop, role in [('P1906', 'Head of state'), ('P1313', 'Head of government')]:
                offices[role] = {entity_id(s) for s in claims.get(prop, []) if s.get('rank') != 'deprecated'} - {None}
                for s in claims.get(prop, []):
                    if s.get('rank') == 'deprecated':
                        continue
                    q = s.get('qualifiers', {})
                    office_periods.setdefault((role, entity_id(s)), []).append((single_year(q.get('P580', [])), single_year(q.get('P582', []))))

            def append(person, statement, subject, role, route, office=None):
                if statement.get('rank') == 'deprecated':
                    return
                if (key, person) in REVIEW_HOLDS:
                    held.append({'polityKey': key, 'sourceRecordId': statement.get('id'), 'reason': REVIEW_HOLDS[key, person]})
                    return
                person_entity = entities.get(person, {})
                is_human = any(entity_id(s) == 'Q5' for s in person_entity.get('claims', {}).get('P31', []))
                description = person_entity.get('descriptions', {}).get('en', {}).get('value', '')
                if not label(person) or not is_human or re.search(r'legendary|mytholog|mythical|fictional|semi-historical', description, re.I):
                    return
                dates = term(statement)
                if not dates:
                    return
                if qualified_position_overlap(person_entity, offices[role], dates):
                    held.append({'polityKey': key, 'sourceRecordId': statement.get('id'), 'reason': 'Matching personal office statement qualifies acting, disputed, or presumed status; cannot bypass it through a plain polity/office record.'})
                    return
                if dates['to'] < polity['mappedFrom'] or dates['from'] > polity['mappedTo']:
                    return
                if (inception is not None and dates['from'] < inception or dissolution is not None and dates['to'] > dissolution):
                    held.append({'polityKey': key, 'sourceRecordId': statement.get('id'), 'reason': 'Whole source tenure crosses the Wikidata entity inception or dissolution; no endpoint clipping.'})
                    return
                if office and not any((start is None or dates['from'] >= start) and (end is None or dates['to'] <= end)
                                      for start, end in office_periods.get((role, office), [(None, None)])):
                    return
                # Atlas entries can use a historical label while representing a
                # successor; direct entity identity must still be checked above.
                record_id = statement.get('id')
                if not record_id:
                    return
                # One presidency may be both head of state and government.
                # Its explicit shared office makes this one tenure, not two.
                if office is None:
                    # A polity's current title cannot be projected into every
                    # historical P35/P6 statement. Require the person's matching
                    # position and whole tenure before assigning that title.
                    candidates = []
                    for position in person_entity.get('claims', {}).get('P39', []):
                        named_office = entity_id(position)
                        position_term = term(position)
                        if named_office in offices[role] and position_term and position_term['from'] == dates['from'] and position_term['to'] == dates['to']:
                            candidates.append(named_office)
                    if len(set(candidates)) == 1:
                        office = candidates[0]
                displayed_role = label(office) or role
                signature = key, person, displayed_role, dates['from'], dates['to']
                for prior in seen.get(signature, []):
                    exact_days = all(x['sourcePrecision'][bound] >= 11 for x in [prior, dates] for bound in ['from', 'to'])
                    different = prior['sourceDates'] != dates['sourceDates']
                    disjoint = different and (prior['sourceDates']['to'] <= dates['sourceDates']['from']
                                or dates['sourceDates']['to'] <= prior['sourceDates']['from'])
                    if not exact_days or not disjoint:
                        return
                seen.setdefault(signature, []).append(dates)
                receipt = receipts[subject]
                record = {'id': f'wikidata:{key}:{record_id}', 'personKey': f'wd:{person}',
                          'polityKey': key, 'name': label(person), 'role': displayed_role,
                          'aliases': [a['value'] for a in person_entity.get('aliases', {}).get('en', [])],
                          'calendar': 'historical', **dates,
                          'sourceId': 'wikidata-broad', 'sourceRecordId': record_id,
                          'locator': f'https://www.wikidata.org/wiki/{subject}#{record_id}',
                          'snapshot': {'path': receipt['path'], 'sha256': receipt['sha256']},
                          'officeEntity': office, 'officeLabel': label(office) if office else None, 'officeScope': role,
                          'property': statement.get('mainsnak', {}).get('property'),
                          'route': route, 'personDescription': description,
                          'sourceJurisdiction': label(qid), 'polityEntity': qid,
                          'polityWikipediaTitle': sitelink, 'revision': entities[subject].get('lastrevid'),
                          'references': statement.get('references', []),
                          'qualifiers': statement.get('qualifiers', {})}
                records.append(record)

            for prop, role in [('P35', 'Head of state'), ('P6', 'Head of government')]:
                persons = set()
                for statement in claims.get(prop, []):
                    person = entity_id(statement)
                    if person:
                        persons.add(person)
                        append(person, statement, qid, role, 'direct-polity-statement')
                for office in offices[role]:
                    if specific_office(entities.get(office, {})):
                        persons.update(reverse_holders.get(office, set()))
                    for statement in entities.get(office, {}).get('claims', {}).get('P1308', []):
                        person = entity_id(statement)
                        if person:
                            persons.add(person)
                            append(person, statement, office, role, 'explicit-polity-office-holder', office)
                # Use term dates only from an explicit matching office; this
                # cannot mistake a person's unrelated offices for ruling here.
                for person in sorted(persons):
                    for statement in entities.get(person, {}).get('claims', {}).get('P39', []):
                        office = entity_id(statement)
                        if office in offices[role]:
                            append(person, statement, person, role, 'person-position-matching-polity-office', office)
            if any(r['polityKey'] == key for r in records):
                profiles[key] = {'crosswalk': f'Wikidata {qid}: matching atlas name or original Wikipedia article ({sitelink}); P35/P6 and explicitly linked P1906/P1313 offices only. Dates overlap the mapped interval without clipping.'}

    used_paths = {r['snapshot']['path'] for r in records}
    used_receipts = {r['path']: r for r in receipts.values() if r['path'] in used_paths}
    result = {'schemaVersion': 1, 'sources': {'wikidata-broad': {
        'title': 'Wikidata: dated heads of state, heads of government, and officeholders',
        'url': 'https://www.wikidata.org/wiki/Wikidata:Main_Page', 'lineage': 'wikimedia',
        'kind': 'reference', 'authors': ['Wikidata contributors'], 'reuse': 'CC0 structured data',
        'scope': 'Dated statements on exact matched polities and their explicitly linked offices. Not exhaustive lists.',
        'limitations': ['Wikipedia and Wikidata are one publication lineage.', 'Current terms without an explicit end are omitted; absence of an end is not proof of ongoing rule.', 'Source sampling is required before any normalized candidate may be published.'],
        'dateConvention': 'Wikidata JSON signed years are historical: -0001 means 1 BCE. Source calendars and precision are retained.'}},
        'records': sorted(records, key=lambda r: (r['polityKey'], r['from'], r['to'], r['id'])),
        'receipts': list(used_receipts.values()) + reverse_receipts, 'profileOverrides': profiles, 'held': held,
        'summary': {'records': len(records), 'polities': len({r['polityKey'] for r in records}),
                    'cachedEntities': len(entities), 'identityHoldbacks': len(held),
                    'routes': dict(Counter(r['route'] for r in records))}}
    path = ROOT / 'sources/rulers/wikidata-extracted.json'
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result['summary']))


if __name__ == '__main__':
    main()
