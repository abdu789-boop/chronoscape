"""Acquire and extract explicitly linked jurisdictions in century leader lists.

Wikipedia is one reference lineage, not independent corroboration of Wikidata.
Every record retains the jurisdiction heading, office, verbatim date expression,
list-item locator and cached snapshot. Ambiguous branches and incomplete dates
are held; neither an atlas boundary nor a century boundary supplies a reign date.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import re
from urllib.parse import unquote, urljoin, urlsplit

from lxml import html

import fetch_ruler_wikipedia as wiki

ROOT = wiki.ROOT
OUTPUT = ROOT / 'sources/rulers/chronology-extracted.json'
MANIFEST = ROOT / 'sources/rulers/chronology-pages.json'
ROUTES = ROOT / 'sources/rulers/chronology-list-routes.json'
SOURCE = 'wikipedia-century-leaders'
SEED = wiki.canonical_url('List_of_state_leaders_in_the_15th_century')
PAGE = re.compile(r'^List_of_state_leaders_in_(?:the_)?(?:\d+(?:st|nd|rd|th)[_-]century(?:_|$)|4th_and_3rd_millennia_BC$|20[012]0s$|South_Asia)')
BAD_CONTEXT = re.compile(r'legendary|mythical|mytholog|pretenders?|claimants?|titular|uncertain historicity', re.I)
ENDPOINT = r'(?:(?:c\.|ca\.|circa)\s*)?(?:(?:AD|CE)\s*)?\d{1,4}(?:\s*(?:BC|BCE|AD|CE))?'
RANGE = re.compile(r'^' + ENDPOINT + r'\s*[–—−-]\s*' + ENDPOINT + r'$', re.I)
SINGLE = re.compile(r'^(?:(?:AD|CE)\s*)?\d{1,4}(?:\s*(?:BC|BCE|AD|CE))?$', re.I)
SCOPE_HOLDS = {
    'nm:hungariannationalists': 'The atlas source URL points to Austria-Hungary, not the Hungarian revolutionary government.',
    'nm:holyromanempireminorstates': 'A roster of Holy Roman Emperors does not cover the separate minor member states.',
    'wd:Q826021': 'The century list mixes rival Japanese courts; the Kenmu government needs an explicit court/office mapping.',
    'wd:Q867227': 'The polity article describes competing chronologies and historical tradition; the existing Au Lac hold applies across adapters.',
}


def page_url(href, base=SEED):
    url = urlsplit(urljoin(base, href))
    if url.hostname != 'en.wikipedia.org' or not url.path.startswith('/wiki/') or url.query:
        return None
    return wiki.canonical_url(unquote(url.path.split('/wiki/', 1)[1]))


def linked_pages(document):
    return sorted({url for a in document.xpath('//a[@href]')
                   if (url := page_url(a.get('href'))) and PAGE.match(unquote(url.rsplit('/', 1)[-1]))})


def acquire(download=False):
    urls = {SEED}
    if MANIFEST.exists(): urls.update(json.loads(MANIFEST.read_text())['urls'])
    inspected = set()
    while pending := sorted(urls - inspected):
        if download:
            with ThreadPoolExecutor(max_workers=2) as pool:
                list(pool.map(wiki.fetch_page, pending))
        for url in pending:
            inspected.add(url)
            path, _ = wiki.paths(url)
            if path.exists(): urls.update(linked_pages(html.fromstring(path.read_bytes())))
    wiki.dump(MANIFEST, {'schemaVersion': 1, 'seed': SEED, 'urls': sorted(urls),
                        'discovery': 'Century, ancient-millennia and 21st-century-decade pages linked from this source family; no annual pages.'})
    return sorted(urls)


def routes(index):
    """Only explicit atlas source URLs and their cached canonical redirects."""
    discovery = json.loads((ROOT / 'sources/rulers/wikidata-discovery.json').read_text())
    result = {}
    for key, polity in discovery['polities'].items():
        if key not in index or key in wiki.BLOCKED or key in SCOPE_HOLDS: continue
        for candidate in polity['sourceCandidates']:
            if candidate['kind'] != 'wikipedia': continue
            url = page_url(candidate['url'])
            if not url: continue
            aliases = {url}
            path, receipt_path = wiki.paths(candidate['url'])
            if path.exists() and receipt_path.exists():
                receipt = json.loads(receipt_path.read_text())
                aliases.add(page_url(receipt['finalUrl']))
                doc = html.fromstring(path.read_bytes())
                aliases.update(page_url(u) for u in doc.xpath('//link[@rel="canonical"]/@href'))
            for alias in aliases - {None}: result.setdefault(alias, set()).add(key)
    return result


def child_roster(item):
    # Both standard nested-list HTML and Parsoid's adjacent ul + dl markup.
    nested = item.xpath('./ul|./ol|./dl')
    if nested: return nested
    parent = item.getparent()
    if parent is not None and parent.tag in ('ul', 'ol') and parent[-1] is item:
        sibling = parent.getnext()
        if sibling is not None and sibling.tag == 'dl': return [sibling]
    return []


def own_text(item):
    copy = html.fromstring(html.tostring(item, with_tail=False))
    for sub in copy.xpath('./ul|./ol|./dl'): sub.drop_tree()
    return wiki.text(copy)


def intervals(raw, bce=False):
    """A dated office list may explicitly contain multiple separate tenures."""
    result = []
    for episode, part in enumerate(raw.split(','), 1):
        part = part.strip()
        inherited = bce or bool(re.search(r'\bBCE?\b', raw, re.I))
        if RANGE.fullmatch(part): parsed = wiki.dates(part, inherited)
        elif SINGLE.fullmatch(part):
            value = wiki.endpoint(part, inherited)
            parsed = (value, value, 'year', {'from': part, 'to': part}) if value else None
        else: parsed = None
        if parsed: result.append((episode, parsed))
    return result


def leader(item, url, bce):
    raw = own_text(item)
    if BAD_CONTEXT.search(raw): return [], 'historicality or claimant review required'
    if item.xpath('.//sup[contains(@class,"Template-Fact") or contains(@class,"Inline-Template")]'):
        return [], 'source flags this entry as needing citation or better evidence'
    # Name, explicitly stated office, and parenthesized office dates.
    match = re.match(r'^(.*),\s*([^,()]+?)\s*\(([^()]*)\)\s*$', raw)
    if not match: return [], 'no unambiguous name / office / tenure expression'
    name, role, date_text = (s.strip() for s in match.groups())
    if not name or len(name) > 120 or wiki.non_person_name(name): return [], 'not a named person'
    if not role or re.match(r'^(?:and|of|later)\b', role, re.I) or re.search(r'\(\s*\d|\b(?:times?|regency|co-?rulers)\b|:', name, re.I):
        return [], 'compound office or tenure expression requires explicit scope mapping'
    if wiki.EXCLUDED_OFFICE.search(role) or re.match(r'^(?:vice|deputy|member)\b', role, re.I): return [], 'excluded subordinate or legislative office'
    if re.search(r'\b(?:unknown|interregnum|vacant|council|committee|regency)\b|\s&\s|\band\b', name, re.I):
        return [], 'unknown, collective or joint name requires explicit person mapping'
    if not re.search(r'[A-Za-z\u0080-\uffff]', name): return [], 'not a named person'
    parsed = intervals(date_text, bce)
    if not parsed: return [], 'incomplete, alternative or unsupported tenure dates'
    person = None
    # Restrict to a name link; office, date, citation and successor links cannot
    # identify this person. Red links preserve the printed name only.
    anchors = item.xpath('./a[@href]|./b/a[@href]|./i/a[@href]')
    name_links = {page_url(a.get('href'), url) for a in anchors if wiki.text(a) and wiki.text(a) in name}
    if len(name_links - {None}) > 1: return [], 'multiple named people require explicit joint-office mapping'
    for anchor in anchors:
        label = wiki.text(anchor)
        if label and label in name and 'new' not in anchor.get('class', ''):
            candidate = page_url(anchor.get('href'), url)
            if candidate and not re.search(r'/wiki/(?:List_of|File:|Help:|Template:)', candidate):
                person = candidate; break
    return [{'name': name, 'role': role, 'personKey': person or 'wikipedia-person:' + re.sub(r'\W+', '-', name.lower()),
             'personUrl': person, 'from': dates[0], 'to': dates[1], 'precision': dates[2], 'sourceDates': dates[3],
             'sourceDateText': date_text, 'sourceName': name, 'episode': episode}
            for episode, dates in parsed], None


def extract_page(document, url, receipt, index, mapping):
    records, held, headings = [], [], []
    bce = unquote(url).endswith('_BC')
    items = document.xpath('//li[not(ancestor::*[contains(@class,"navbox") or contains(concat(" ",normalize-space(@class)," ")," toc ")])]')
    numbers = {item: number for number, item in enumerate(items, 1)}
    for item in items:
        direct = item.xpath('./a[@href]|./b/a[@href]|./i/a[@href]')
        if not direct: continue
        # Only the first linked jurisdiction in the heading defines its scope.
        jurisdiction = page_url(direct[0].get('href'), url)
        keys = mapping.get(jurisdiction, set())
        roster = child_roster(item)
        if not keys or not roster: continue
        label = own_text(item)
        if BAD_CONTEXT.search(label): continue
        headings.append({'url': url, 'jurisdiction': jurisdiction, 'polityKeys': sorted(keys), 'label': label,
                         'rosterLinks': [urljoin(url, a.get('href')) for a in direct[1:]
                                         if 'complete list' in wiki.text(a).lower()],
                         'snapshot': {'path': receipt['file'], 'sha256': receipt['sha256']}})
        for container in roster:
            for row in container.xpath('.//li[not(./ul or ./ol or ./dl)]'):
                if child_roster(row): continue
                # A nested jurisdiction is a separate state, not an office of
                # the enclosing aggregate (e.g. a federation or colonial empire).
                foreign = False
                for ancestor in row.iterancestors():
                    if ancestor is container: break
                    if ancestor.tag not in ('dd', 'li'): continue
                    if ancestor.tag == 'dd':
                        dl = ancestor.getparent(); previous = dl.getprevious()
                        if previous is None or previous.tag != 'ul': continue
                        anchors = previous.xpath('./li/a[@href]')
                    else: anchors = ancestor.xpath('./a[@href]')
                    if anchors:
                        nested_url = page_url(anchors[0].get('href'), url)
                        if nested_url in mapping and nested_url != jurisdiction: foreign = True
                if foreign: continue
                parsed, reason = leader(row, url, bce)
                if reason:
                    held.append({'url': url, 'listItem': numbers.get(row), 'polityKeys': sorted(keys), 'text': own_text(row), 'reason': reason})
                    continue
                for candidate in parsed:
                    compatible = [key for key in keys if candidate['to'] >= wiki.PERIODS.get(key, (index[key]['first'],index[key]['last']))[0]
                                  and candidate['from'] <= wiki.PERIODS.get(key, (index[key]['first'],index[key]['last']))[1]]
                    if len(compatible) > 1:
                        # Prefer a verbatim matching jurisdiction name only;
                        # an umbrella list must not populate overlapping branches.
                        plain = wiki.text(direct[0]).casefold()
                        exact = [key for key in compatible if index[key]['n'].casefold() == plain]
                        compatible = exact if len(exact) == 1 else []
                        if not compatible: held.append({'url': url, 'listItem': numbers.get(row), 'polityKeys': sorted(keys), 'text': own_text(row), 'reason': 'shared jurisdiction requires explicit branch scope'})
                    for key in compatible:
                        locator = f'{url} (jurisdiction {label}; list item {numbers[row]}; tenure {candidate["episode"]})'
                        rid = f'{unquote(url.rsplit("/",1)[-1])}:item-{numbers[row]}:tenure-{candidate["episode"]}'
                        identity = hashlib.sha256(f'{key}|{rid}'.encode()).hexdigest()[:20]
                        records.append({**candidate, 'id': 'chronology:' + identity, 'polityKey': key,
                            'calendar': 'historical', 'sourceId': SOURCE, 'sourceRecordId': rid,
                            'sourceSequence': numbers[row], 'locator': locator, 'sourceJurisdiction': label,
                            'jurisdictionUrl': jurisdiction, 'snapshot': {'path': receipt['file'], 'sha256': receipt['sha256']},
                            'note': 'Explicitly linked jurisdiction and office in the cited century chronology. Separate listed tenures are retained; map bounds only select the associated atlas period.'})
    return records, held, headings


def extract(urls):
    index = json.loads((ROOT / 'docs/data/polity_index.json').read_text())
    mapping = routes(index)
    records, held, headings, receipts, seen = [], [], [], [], set()
    for url in urls:
        path, receipt_path = wiki.paths(url)
        if not path.exists() or not receipt_path.exists(): continue
        receipt = json.loads(receipt_path.read_text()); raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != receipt['sha256']: raise ValueError('Changed source ' + url)
        receipts.append(receipt)
        extracted, skipped, scopes = extract_page(html.fromstring(raw), url, receipt, index, mapping)
        held.extend(skipped); headings.extend(scopes)
        for row in extracted:
            marker = (row['polityKey'], row['personKey'], row['role'], row['from'], row['to'])
            if marker in seen: continue
            seen.add(marker); records.append(row)
    result = {'schemaVersion': 1, 'sources': {SOURCE: {
        'title': 'Wikipedia century-by-century state leader chronologies',
        'url': 'https://en.wikipedia.org/wiki/Lists_of_state_leaders_by_century',
        'lineage': 'wikimedia', 'kind': 'reference', 'admission': 'candidate', 'checks': []}},
        'records': records, 'receipts': receipts, 'unmatched': held, 'jurisdictions': headings,
        'summary': {'downloadedPages': len(receipts), 'records': len(records),
                    'polities': len({r['polityKey'] for r in records}), 'heldEntries': len(held)}}
    wiki.dump(OUTPUT, result); print(json.dumps(result['summary']), flush=True)
    discovered = {}
    generic = {'empire','kingdom','dynasty','republic','united','state','states','federation','confederation',
               'sultanate','caliphate','principality','duchy','period','ancient','people','democratic'}
    for heading in headings:
        for key in heading['polityKeys']:
            words = set(re.findall(r'[a-z]{4,}', unquote(heading['jurisdiction']).rsplit('/',1)[-1].lower())) - generic
            for href in heading['rosterLinks']:
                base = page_url(href)
                if not base: continue
                title = unquote(base.rsplit('/',1)[-1]).replace('_',' ')
                fragment = unquote(urlsplit(href).fragment).replace('_',' ')
                if wiki.EXCLUDED_OFFICE.search(title): continue
                seeded = key in wiki.SEEDS and base == wiki.canonical_url(wiki.SEEDS[key])
                if not fragment and not seeded and not words.intersection(re.findall(r'[a-z]{4,}', title.lower())): continue
                # A branch-specific scope always takes precedence over a generic
                # destination fragment such as "Table of rulers".
                scope = wiki.SCOPES.get(key) or (re.escape(fragment) if fragment else None)
                discovered.setdefault((key,base,scope), {'polityKey': key, 'url': base, 'scope': scope,
                    'basis': 'Explicit succession-list link in the source jurisdiction heading; dates must come from the destination snapshot.',
                    'discoveryUrl': heading['url'], 'jurisdictionUrl': heading['jurisdiction'],
                    'label': heading['label'], 'link': href, 'snapshot': heading['snapshot']})
    wiki.dump(ROUTES, {'schemaVersion': 1, 'status': 'source-discovery-only', 'routes': list(discovered.values())})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--fetch-only', action='store_true')
    args = parser.parse_args(); urls = acquire(args.download)
    if not args.fetch_only: extract(urls)


if __name__ == '__main__': main()
