"""Discover people holding the explicit offices of sparse historical polities.

The query supplies identity pairs only. Dates always come from original Wikidata
JSON P39 statements, avoiding RDF calendar/year transformations. This optional
acquisition is cached and cannot itself admit any ruler to the application.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import urllib.parse
import urllib.request

from fetch_ruler_candidates import ROOT, CACHE, read_cache, fetch_entities, entity_id, dump, sha
from prepare_ruler_wikidata import specific_office


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--discover-only', action='store_true')
    args = parser.parse_args()
    entities, receipts = read_cache()
    discovery = json.loads((ROOT / 'sources/rulers/wikidata-discovery.json').read_text())
    public = json.loads((ROOT / 'docs/data/rulers.json').read_text())
    offices = set()
    for key, polity in discovery['polities'].items():
        if public['polities'][key]['rulers'] and polity['mappedTo'] >= 1875:
            continue
        for source in polity['sourceCandidates']:
            if source['kind'] != 'wikidata':
                continue
            claims = entities.get(source['entityId'], {}).get('claims', {})
            for prop in ['P1906', 'P1313']:
                offices.update(entity_id(s) for s in claims.get(prop, []) if s.get('rank') != 'deprecated')
    offices.discard(None)
    # Freeze the actual VALUES clause in the receipt for reproducibility.
    query = 'SELECT DISTINCT ?person ?office WHERE { VALUES ?office { ' + ' '.join('wd:' + q for q in sorted(offices)) + ' } ?person p:P39 ?statement . ?statement ps:P39 ?office ; pq:P580 ?start ; pq:P582 ?end . }'
    name = hashlib.sha256(query.encode()).hexdigest()[:20]
    file = CACHE / f'office-holders-{name}.json'
    if not file.exists():
        if not args.download:
            raise SystemExit('No cached office discovery; use --download to acquire it.')
        url = 'https://query.wikidata.org/sparql?' + urllib.parse.urlencode({'query': query, 'format': 'json'})
        request = urllib.request.Request(url, headers={'User-Agent': 'Chronoscape/1.0 (public historical atlas source research)', 'Accept': 'application/sparql-results+json'})
        print(f'Discovering holders of {len(offices)} explicit historical offices', flush=True)
        with urllib.request.urlopen(request, timeout=60) as response:
            content = response.read()
            json.loads(content)
        file.write_bytes(content)
        dump(file.with_suffix('.receipt.json'), {'path': str(file.relative_to(ROOT)), 'url': url,
             'retrievedAt': datetime.now(timezone.utc).isoformat(), 'sha256': sha(file), 'query': query})
    rows = json.loads(file.read_text())['results']['bindings']
    people = {row['person']['value'].rsplit('/', 1)[-1] for row in rows
              if specific_office(entities.get(row['office']['value'].rsplit('/', 1)[-1], {}))}
    print(f'{len(rows)} office/person pairs; {len(people)} people, {len(people-set(entities))} not cached', flush=True)
    if args.download and not args.discover_only:
        fetch_entities(people, entities, receipts, None)


if __name__ == '__main__':
    main()
