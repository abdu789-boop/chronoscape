"""Cache canonical Wikipedia redirects and Wikidata person identities for ruler auditing.

Only identity metadata is acquired. Reign dates and source admission are not
changed by these API responses. Existing acquisition receipts are reused.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import time
from urllib.parse import urlencode, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/identities'
USER_AGENT = 'Chronoscape/1.0 (historical atlas ruler identity audit)'


def records():
    result = []
    for family in ['china', 'classical', 'modern', 'reference-import', 'broad-import',
                   'wikipedia-extracted', 'wikidata-extracted', 'additional-extracted']:
        file = ROOT / f'sources/rulers/{family}.json'
        if not file.exists(): continue
        data = json.loads(file.read_text())
        result.extend(data.get('records', []))
        result.extend(data.get('matched', []))
        result.extend(data.get('imports', []))
        result.extend(x['claim'] for x in data.get('conflicts', []) if x.get('claim'))
    return result


def fetch(item, download):
    kind, params = item
    base = 'https://en.wikipedia.org/w/api.php' if kind == 'wikipedia' else 'https://www.wikidata.org/w/api.php'
    url = base + '?' + urlencode(params)
    file = CACHE / f'{kind}-{hashlib.sha256(url.encode()).hexdigest()[:24]}.json'
    receiptfile = file.with_suffix('.receipt.json')
    if file.exists() and receiptfile.exists():
        raw = file.read_bytes(); receipt = json.loads(receiptfile.read_text())
        if hashlib.sha256(raw).hexdigest() != receipt['sha256']: raise ValueError(f'Changed cache {file}')
        return json.loads(raw), receipt
    if not download: raise RuntimeError(f'Missing cached identity query: {url}')
    for attempt in range(5):
        try:
            with urlopen(Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'application/json'}), timeout=45) as response:
                raw = response.read()
            data = json.loads(raw)
            if 'error' in data: raise RuntimeError(str(data['error']))
            break
        except (HTTPError, TimeoutError, RuntimeError) as error:
            if attempt == 4: raise
            delay = max(30, int(error.headers.get('Retry-After', '30'))) if isinstance(error, HTTPError) and error.code == 429 else 10 * (attempt + 1)
            print(f'{kind}: {error}; retry after {delay}s', flush=True); time.sleep(delay)
    CACHE.mkdir(parents=True, exist_ok=True); file.write_bytes(raw)
    receipt = {'path': str(file.relative_to(ROOT)), 'sha256': hashlib.sha256(raw).hexdigest(),
               'url': url, 'retrievedAt': datetime.now(timezone.utc).isoformat()}
    receiptfile.write_text(json.dumps(receipt, indent=2) + '\n')
    time.sleep(2)
    return data, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__); parser.add_argument('--download', action='store_true'); args = parser.parse_args()
    rawrecords = records()
    urls = sorted({r['personKey'] for r in rawrecords if r.get('personKey', '').startswith('https://en.wikipedia.org/wiki/')})
    titles = sorted({unquote(url.split('/wiki/', 1)[1]).replace('_', ' ') for url in urls})
    batches = [('wikipedia', {'action': 'query', 'format': 'json', 'redirects': '1', 'prop': 'pageprops',
                'ppprop': 'wikibase_item', 'titles': '|'.join(titles[i:i+50]), 'maxlag': '5'}) for i in range(0, len(titles), 50)]
    pages, receipts = {}, []
    with ThreadPoolExecutor(max_workers=1) as pool:
        for i, (data, receipt) in enumerate(pool.map(lambda item: fetch(item, args.download), batches)):
            receipts.append(receipt); query = data.get('query', {})
            redirects = {r['from']: r['to'] for r in [*query.get('normalized', []), *query.get('redirects', [])]}
            bytitle = {p['title']: p for p in query.get('pages', {}).values()}
            for title in batches[i][1]['titles'].split('|'):
                target = title; seen = set()
                while target in redirects and target not in seen: seen.add(target); target = redirects[target]
                p = bytitle.get(target, {})
                pages[title] = {'title': target, 'pageId': p.get('pageid'), 'qid': p.get('pageprops', {}).get('wikibase_item'),
                    'missing': 'missing' in p or not p, 'snapshot': {'path': receipt['path'], 'sha256': receipt['sha256']}}
            if (i+1) % 10 == 0 or i+1 == len(batches): print(f'Wikipedia identity batches {i+1}/{len(batches)}', flush=True)
    qids = sorted({r['personKey'][3:] for r in rawrecords if r.get('personKey', '').startswith('wd:Q')} | {p['qid'] for p in pages.values() if p.get('qid')})
    batches = [('wikidata', {'action': 'wbgetentities', 'format': 'json', 'ids': '|'.join(qids[i:i+50]),
                'props': 'labels|aliases|descriptions|sitelinks', 'languages': 'en', 'sitefilter': 'enwiki', 'maxlag': '5'}) for i in range(0, len(qids), 50)]
    people = {}
    with ThreadPoolExecutor(max_workers=1) as pool:
        for i, (data, receipt) in enumerate(pool.map(lambda item: fetch(item, args.download), batches)):
            receipts.append(receipt)
            for qid, e in data.get('entities', {}).items():
                people[qid] = {'label': e.get('labels', {}).get('en', {}).get('value'),
                    'aliases': [a['value'] for a in e.get('aliases', {}).get('en', [])],
                    'description': e.get('descriptions', {}).get('en', {}).get('value'),
                    'wikipedia': e.get('sitelinks', {}).get('enwiki', {}).get('title'),
                    'snapshot': {'path': receipt['path'], 'sha256': receipt['sha256']}}
            if (i+1) % 10 == 0 or i+1 == len(batches): print(f'Wikidata identity batches {i+1}/{len(batches)}', flush=True)
    result = {'schemaVersion': 1, 'purpose': 'Identity metadata only; no dates or historical accuracy admission.',
              'pages': pages, 'people': people, 'receipts': receipts}
    (ROOT / 'sources/rulers/identity-evidence.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'wikipediaTitles': len(pages), 'wikidataPeople': len(people), 'missingPages': sum(p['missing'] for p in pages.values())}))


if __name__ == '__main__': main()
