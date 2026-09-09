"""Cache Wikipedia succession tables and emit provisional dated ruler records.

Uses bundled Python with lxml. --download --fetch-only can run independently of
offline extraction. Each successful download immediately writes its own receipt.
All source claims share Wikimedia lineage and still require collection sampling.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import gzip
import json
from pathlib import Path
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from lxml import html

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/wikipedia'
OUTPUT = ROOT / 'sources/rulers/wikipedia-extracted.json'
SOURCE = 'wikipedia-ruler-lists'
USER_AGENT = 'ChronoscapeHistoricalAtlas/1.0 (offline scholarly source-comparison; public ruler chronologies)'
# These are direct, polity-specific succession-list candidates, never accepted
# merely because the URL exists. A successful dated table extraction is needed.
SEEDS = {
 'wd:Q1986139': 'List_of_monarchs_of_Parthia',
 'wd:Q12560': 'List_of_sultans_of_the_Ottoman_Empire',
 'wd:Q33296': 'Mughal_emperors',
 'wd:Q389688': 'List_of_monarchs_of_the_Achaemenid_Empire',
 'nm:sasanianempire': 'List_of_monarchs_of_the_Sasanian_Empire',
 'wd:Q161205': 'List_of_Safavid_monarchs',
 'wd:Q484195': 'List_of_Timurid_rulers',
 'wd:Q63134381': 'Khwarazmian_dynasty',
 'wd:Q705904': 'List_of_Seleucid_rulers',
 'wd:Q2320005': 'Ptolemaic_dynasty',
 'wd:Q83958': 'List_of_kings_of_Macedonia',
 'wd:Q62943': 'Maurya_Empire',
 'wd:Q11774': 'Gupta_Empire',
 'wd:Q167639': 'Vijayanagara_Empire',
 'wd:Q83618': 'List_of_Maratha_rulers',
 'wd:Q6806806': 'List_of_Chola_emperors',
 'wd:Q28208': 'List_of_monarchs_of_Korea',
 'nm:joseon': 'List_of_monarchs_of_Korea',
 'wd:Q28370': 'List_of_monarchs_of_Korea',
 'wd:Q28428': 'List_of_monarchs_of_Korea',
 'wd:Q28456': 'List_of_monarchs_of_Korea',
 'wd:Q715257': 'List_of_monarchs_of_Korea',
 'wd:Q179876': 'List_of_English_monarchs',
 'wd:Q230791': 'List_of_Scottish_monarchs',
 'wd:Q45670': 'List_of_Portuguese_monarchs',
 'wd:Q34': 'List_of_Swedish_monarchs',
 'wd:Q756617': 'List_of_Danish_monarchs',
 'nm:denmark': 'List_of_Danish_monarchs',
 'wd:Q202266': 'List_of_Norwegian_monarchs',
 'wd:Q20': 'List_of_Norwegian_monarchs',
 'wd:Q171150': 'List_of_Hungarian_monarchs',
 'wd:Q42585': 'List_of_Bohemian_monarchs',
 'wd:Q577867': 'List_of_Polish_monarchs',
 'wd:Q49683': 'List_of_rulers_of_Lithuania',
 'wd:Q27306': 'List_of_monarchs_of_Prussia',
 'wd:Q34266': 'List_of_emperors_of_Russia',
 'wd:Q131964': 'Emperor_of_Austria',
 'nm:austriahungary': 'Emperor_of_Austria',
 'wd:Q203817': 'List_of_Bulgarian_monarchs',
 'wd:Q420759': 'List_of_Bulgarian_monarchs',
 'wd:Q207521': 'List_of_emperors_of_Ethiopia',
 'wd:Q841364': 'List_of_Thai_monarchs',
 'wd:Q863279': 'List_of_Thai_monarchs',
 'wd:Q869': 'List_of_Thai_monarchs',
 'wd:Q888574': 'List_of_Burmese_monarchs',
 'wd:Q201705': 'List_of_Cambodian_monarchs',
 'wd:Q30': 'List_of_presidents_of_the_United_States',
 'nm:romanempire': 'List_of_Roman_emperors',
 'wd:Q112039853': 'List_of_Byzantine_emperors',
 'nm:easternromanempire': 'List_of_Byzantine_emperors',
 'wd:Q12557': 'List_of_Mongol_rulers',
}
SCOPES = {
 'wd:Q28208': r'goryeo', 'nm:joseon': r'joseon', 'wd:Q28370': r'goguryeo',
 'wd:Q28428': r'baekje', 'wd:Q28456': r'silla', 'wd:Q715257': r'(unified|later) silla',
 'wd:Q841364': r'ayutthaya', 'wd:Q863279': r'sukhothai', 'wd:Q869': r'chakri',
 'wd:Q888574': r'pagan', 'wd:Q203817': r'first bulgarian', 'wd:Q420759': r'second bulgarian',
 'wd:Q12557': r'^Mongol Empire[^/]+ / Great Khans and Yuan dynasty$',
 'wd:Q171150': r'^Kings of Hungary',
 'wd:Q49683': r'^Grand Duchy of Lithuania',
 'wd:Q201705': r'(Khmer Empire|Angkor)',
}
PERIODS = {
 'nm:romanempire': (-27, 394), 'nm:easternromanempire': (395, 632),
 'wd:Q112039853': (633, 1453), 'wd:Q12557': (1206, 1293),
 'wd:Q202266': (872, 1401), 'wd:Q20': (1814, 2024),
 'wd:Q756617': (936, 1406), 'nm:denmark': (1945, 2024),
 'wd:Q131964': (1804, 1867), 'nm:austriahungary': (1867, 1918),
 'wd:Q179876': (927, 1707), 'wd:Q577867': (1025, 1569),
 'wd:Q171150': (1000, 1546), 'wd:Q12560': (1299, 1922),
 'wd:Q42585': (1198, 1528),
 'wd:Q484195': (1370, 1506), 'wd:Q83618': (1674, 1818),
}
BLOCKED = {'wd:Q6000379', 'wd:Q201038'}
HELD_RECORDS = {
 'wikipedia:86e554961a7873e292fd': 'The same Commagene article describes deposition and restoration in 41 CE; a single 38–72 interval hides separate tenure episodes.',
 'wikipedia:68528b2853ef60741368': 'The Au Lac article supplies competing chronologies and explicitly discusses a mixture of history and legend; historicality and date alternatives need classification.',
}
EXCLUDED_OFFICE = re.compile(r'\b(deputy|vice[- ]president|vice[- ]premier|lieutenant|speaker|senate|parliament|national assembly|legislative|legislature|consort|minister of)\b', re.I)
ROLE = {'wd:Q30': 'President', 'wd:Q12560': 'Sultan', 'wd:Q34266': 'Emperor',
        'nm:romanempire': 'Emperor', 'wd:Q112039853': 'Emperor', 'nm:easternromanempire': 'Emperor',
        'wd:Q33296': 'Emperor', 'wd:Q12557': 'Khagan', 'wd:Q161205': 'Shah',
        'wd:Q1986139': 'King', 'nm:sasanianempire': 'Shahanshah', 'wd:Q705904': 'King',
        'wd:Q484195': 'Emir', 'wd:Q63134381': 'Shah', 'wd:Q62943': 'Emperor',
        'wd:Q11774': 'Emperor', 'wd:Q167639': 'Emperor', 'wd:Q6806806': 'Emperor'}


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temp.replace(path)


def canonical_url(title):
    return title if title.startswith('https://') else 'https://en.wikipedia.org/wiki/' + urllib.parse.quote(title.replace(' ', '_'), safe='():,_')


def paths(url):
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    return CACHE / (key + '.html'), CACHE / (key + '.receipt.json')


def fetch_page(url):
    path, receipt_path = paths(url)
    if path.exists() and receipt_path.exists():
        return json.loads(receipt_path.read_text())
    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
            final_url = response.url
            compressed = response.headers.get('Content-Encoding') == 'gzip'
            if compressed: content = gzip.decompress(content)
        receipt = {'url': url, 'finalUrl': final_url, 'file': str(path.relative_to(ROOT)),
                   'sha256': hashlib.sha256(content).hexdigest(), 'bytes': len(content),
                   'retrievedAt': datetime.now(timezone.utc).isoformat(), 'decodedGzip': compressed}
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        dump(receipt_path, receipt)
        print('Fetched', final_url, len(content), flush=True)
        time.sleep(0.6)
        return receipt
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        if getattr(error, 'code', None) == 429:
            delay = min(int(error.headers.get('Retry-After', '30')), 60)
            print('Rate limited; backing off', delay, 'seconds', flush=True)
            time.sleep(delay)
        print('Unavailable', url, str(error), flush=True)
        return {'url': url, 'error': str(error)}


def text(node):
    copy = html.fromstring(html.tostring(node, with_tail=False))
    for ignored in copy.xpath('.//sup|.//style|.//script|.//*[contains(@class,"sortkey")]|.//*[contains(@class,"reference")]|.//*[@style="display:none"]'):
        ignored.drop_tree()
    return re.sub(r'\s+', ' ', ' '.join(copy.itertext())).strip()


def grid(table):
    output, spans = [], {}
    for tr in table.xpath('./tr|./thead/tr|./tbody/tr'):
        cells, column = [], 0
        for cell in tr.xpath('./th|./td'):
            while column in spans:
                old, count = spans[column]; cells.append(old)
                if count <= 1: del spans[column]
                else: spans[column] = old, count - 1
                column += 1
            width = min(int(re.match(r'\d+', cell.get('colspan', '1')).group()), 30)
            height = min(int(re.match(r'\d+', cell.get('rowspan', '1')).group()), 300)
            for _ in range(width):
                cells.append(cell)
                if height > 1: spans[column] = cell, height - 1
                column += 1
        while column in spans:
            old, count = spans[column]; cells.append(old)
            if count <= 1: del spans[column]
            else: spans[column] = old, count - 1
            column += 1
        output.append(cells)
    return output


MONTH = r'January|February|March|April|May|June|July|August|September|October|November|December'


def endpoint(raw, inherited_bce=False, inherited_year=None):
    cleaned = re.sub(r'\([^)]*\)|\[[^]]*\]', '', raw)
    numbers = re.findall(r'(?<!\d)(\d{1,4})(?!\d)', cleaned)
    if not numbers or any(term in cleaned.lower() for term in ['present', 'incumbent', 'unknown', '?']): return None
    value = int(numbers[-1])
    if re.search(MONTH, cleaned, re.I) and len(numbers) == 1 and value <= 31:
        return inherited_year
    if value == 0: return None
    if re.search(r'\bB\.?C(?:\.?E)?\.?\b', cleaned, re.I) or inherited_bce and not re.search(r'\b(?:AD|CE)\b', cleaned, re.I): value = -value
    return value


def dates(raw):
    # Preserve scholarly alternatives; do not silently select a slash-separated
    # disputed year or use duration/birth/death as a reign.
    cleaned = re.sub(r'\([^)]*\)|\[[^]]*\]', '', raw).replace('\u2212', '-')
    if '/' in cleaned or re.search(r'\bor\b', cleaned, re.I): return None
    pieces = re.split(r'\s*[–—┃]\s*|\s+-\s+|\bto\b', cleaned)
    if len(pieces) != 2:
        pieces = re.split(r'(?<=\d)-(?=\d)', cleaned)
    if len(pieces) != 2: return None
    both_bce = bool(re.search(r'\bB\.?C(?:\.?E)?\.?\b', pieces[1], re.I))
    end = endpoint(pieces[1])
    start = endpoint(pieces[0], both_bce, end)
    if start is None or end is None or start > end or end - start > 120: return None
    return start, end, 'approximate' if re.search(r'\b(c\.|ca\.|circa|about|approx)', raw, re.I) else 'year', {'from': pieces[0].strip(), 'to': pieces[1].strip()}


def date_cell(cell):
    # Some tables combine name, reign, and coronation with <hr> separators.
    # Only the segment containing a two-endpoint reign is eligible.
    serialized = html.tostring(cell, encoding='unicode')
    segments = re.split(r'<hr\b[^>]*>', serialized, flags=re.I)
    for segment in segments:
        raw = text(html.fromstring('<div>' + segment + '</div>'))
        parsed = dates(raw)
        if parsed: return raw, parsed
    return text(cell), None


def person_link(cell, url):
    candidates = cell.xpath('.//b//a[@href]|.//strong//a[@href]') + cell.xpath('.//a[@href and not(contains(@class,"new"))]')
    for node in candidates:
        href = urllib.parse.urljoin(url, node.get('href'))
        if href.startswith('https://en.wikipedia.org/wiki/') and not re.search(r'File:|Help:|Template:|List_of|dynasty|House_of|_language', href, re.I):
            label = text(node)
            if re.search(r'\breign\b|^(?:shah|king|queen|emperor|duke|prince|ruler|sultan|caliph|co-emperor|pharaoh|ratu|marshal|field marshal|general|colonel|sir|lord|nawab|sheikh|sayyid)$', label, re.I): continue
            if label: return label, href.split('#')[0]
    return None, None


def unlinked_name(cell):
    # Some continuation rows omit the already-linked name. Keep a typographically
    # isolated name where supplied; otherwise stop before the explicit date.
    for node in cell.xpath('./b|./strong|.//big'):
        label = text(node)
        if label and not re.search(r'\d|reign|unknown|circa|^c\.', label, re.I): return label
    value = re.sub(r'\([^)]*\)', '', text(cell)).strip()
    value = re.split(r'\b(?:' + MONTH + r')\b|(?<!\w)\d{3,4}(?!\w)', value, maxsplit=1, flags=re.I)[0]
    return re.sub(r'[\s–—,;:]+$|\b(?:c\.|circa)\s*$', '', value).strip()


def infer_role(section, headers, default):
    combined = ' '.join(headers) + ' ' + section
    for pattern, role in [(r'prime ministers?|peshwas?', 'Prime minister'), (r'presidents?', 'President'),
                          (r'regents?', 'Regent'), (r'emperors?|khagans?', 'Emperor'), (r'sultans?', 'Sultan'),
                          (r'grand dukes?', 'Grand duke'), (r'kings?|queens?|monarchs?', 'Monarch')]:
        if re.search(r'\b' + pattern + r'\b', combined, re.I): return role
    return default


def non_person_name(value):
    """Reject missing-name/office placeholders, including empty temple names."""
    value = value.strip()
    return value.upper() in {'N/A', 'NA', 'N.A.', 'NOT APPLICABLE'} or bool(re.match(
        r'^(?:none\b|did not exist\b|not used\b|not known\b|not recorded\b|'
        r'no (?:name|temple name|regnal name|title)\b|interregnum\b|vacant\b)', value, re.I))


def heading(table):
    # Reconstruct the current heading hierarchy. A previous sibling dynasty's
    # heading must not leak into a later table's polity/branch scope.
    heads = table.xpath('preceding::*[self::h2 or self::h3 or self::h4]')
    active = {}
    for node in heads:
        level = int(node.tag[1])
        active = {key: value for key, value in active.items() if key < level}
        active[level] = text(node)
    return ' / '.join(active.values())


def table_records(document, polity_key, url, receipt, scope=None, dedicated=False):
    out, skipped = [], []
    for table_number, table in enumerate(document.xpath('//table[contains(@class,"wikitable")]')):
        if table.xpath('ancestor::*[contains(@class,"navbox")]'): continue
        rows = grid(table)
        section = heading(table)
        if scope and not re.search(scope, section, re.I): continue
        if re.search(r'length of reign|duration|legendary|mytholog|pretenders|claimants|titular', section, re.I): continue
        if not dedicated and not re.search(r'rulers?|monarchs?|emperors?|kings?|queens?|sultans?|khans?|presidents?|prime ministers?|succession', section, re.I): continue
        header_at = None
        for i, row in enumerate(rows[:8]):
            labels = [text(cell).lower() for cell in row]
            if any(re.search(r'\b(reign|regnal dates|ruled|in office|term|accession|succeeded|tenure)\b', value) for value in labels):
                header_at = i; break
            if dedicated and 'name' in labels and any('birth' in value for value in labels) and any('death' in value for value in labels):
                header_at = i; break
        if header_at is None: continue
        labels = [text(cell).lower() for cell in rows[header_at]]
        name_columns = [i for i, value in enumerate(labels) if re.search(r'\b(name|monarch|emperor|ruler|king|queen|sultan|shah|khan|president|pharaoh)\b', value) and not re.search(r'father|mother|parent|spouse|portrait|image|dynast|vice president', value)]
        reign_columns = [i for i, value in enumerate(labels) if re.search(r'\b(reign|regnal dates|ruled|in office|term|tenure)\b', value) and not re.search(r'birth|death|dynast', value)]
        if name_columns and not reign_columns and dedicated and any('birth' in value for value in labels) and any('death' in value for value in labels): reign_columns = [name_columns[0]]
        if not name_columns or not reign_columns: continue
        name_col = name_columns[0]
        if re.search(r'titular|title/', labels[name_col]):
            # Royal titles are not necessarily names: the Bahmani table prints
            # simply "Shah" here and provides the person in the next column.
            explicit_person = [i for i in name_columns if re.search(r'personal name|birth name', labels[i])]
            if explicit_person: name_col = explicit_person[0]
        chronology = None
        if polity_key == 'wd:Q1986139':
            # Fixed scholarly chronology column, not first nonempty/arbitrary.
            chronology = 'Daryaee (2012) chronology; the source marks all dates approximate.'
            reign_columns = [4]
        for row_number, row in enumerate(rows[header_at + 1:], header_at + 1):
            if name_col >= len(row): continue
            namecell = row[name_col]
            jurisdictions = [text(row[col]) for col, label in enumerate(labels) if col < len(row) and re.search(r'^ruling part$|^territory$|^realm$', label)]
            if polity_key == 'wd:Q42585' and jurisdictions and not any(re.search(r'\bBohemia\b', value, re.I) for value in jurisdictions): continue
            # Cells with colspan spanning a table are section labels, not people.
            if int(re.match(r'\d+', namecell.get('colspan', '1')).group()) > 1: continue
            name = text(namecell)
            if non_person_name(name):
                skipped.append({'polityKey': polity_key, 'url': url, 'table': table_number, 'row': row_number,
                                'name': name, 'reason': 'Missing-name or office-vacancy placeholder, not a person'})
                continue
            if not name or re.search(r'\b(interregnum|vacant|dynasty|dynasties|abolished|disputed|legendary|mythical|unknown|unnamed|unidentified)\b', name, re.I): continue
            if polity_key == 'wd:Q12560' and not re.search(r'\d', text(row[0])):
                skipped.append({'url': url, 'table': table_number, 'row': row_number, 'name': name,
                                'reason': 'unnumbered claimant/regional ruler or post-sultanate caliph; office scope held for review'})
                continue
            date_raw, interval = '', None
            for col in reign_columns:
                if col >= len(row): continue
                candidate, parsed = date_cell(row[col])
                if parsed: date_raw, interval = candidate, parsed; break
            if interval is None and len(reign_columns) == 2 and max(reign_columns) < len(row):
                date_raw = ' – '.join(text(row[col]) for col in reign_columns)
                interval = dates(date_raw)
            if interval is None: continue
            row_text = ' | '.join(text(cell) for cell in dict.fromkeys(row))
            if re.search(r'\b(legendary|mythical|semi-legendary)\b', name, re.I):
                skipped.append({'url': url, 'table': table_number, 'row': row_number, 'reason': 'historicality-needs-review', 'name': name})
                continue
            linked_name, person_url = person_link(namecell, url)
            if linked_name:
                name = linked_name
            else:
                name = unlinked_name(namecell)
                person_url = None
            if len(name) > 120 or not re.search(r'[A-Za-z\u0080-\uffff]', name): continue
            if non_person_name(name): continue
            if re.fullmatch(r'(?:shah|king|queen|duke|prince|emperor|sultan|ratu|marshal|vacant|none)', name, re.I): continue
            start, end, precision, raw_endpoints = interval
            if chronology: precision = 'approximate'
            identity = hashlib.sha256(f'{url}|{table_number}|{row_number}|{polity_key}'.encode()).hexdigest()[:20]
            locator = f'{url} (section {section or "succession table"}; table {table_number + 1}, row {row_number + 1})'
            role = ROLE.get(polity_key, infer_role(section, labels, 'Sovereign'))
            if polity_key == 'wd:Q12557' and re.search(r'\bregent\b', row_text, re.I): role = 'Regent'
            if EXCLUDED_OFFICE.search(role) or EXCLUDED_OFFICE.search(section): continue
            if jurisdictions: role += ' — ' + '; '.join(jurisdictions)
            out.append({'id': f'wikipedia:{identity}', 'polityKey': polity_key,
                        'personKey': person_url or 'wikipedia-person:' + re.sub(r'\W+', '-', name.lower()),
                        'name': name, 'role': role,
                        'from': start, 'to': end, 'precision': precision, 'calendar': 'historical',
                        'sourceId': SOURCE, 'sourceRecordId': f'{urllib.parse.unquote(url.rsplit("/",1)[-1])}:table-{table_number + 1}:row-{row_number + 1}',
                        'locator': locator, 'snapshot': {'path': receipt['file'], 'sha256': receipt['sha256']},
                        'sourceDates': raw_endpoints, 'sourceDateText': date_raw, 'sourceName': text(namecell), 'section': section,
                        'aliases': [text(row[col]) for col in name_columns if col < len(row) and col != name_col and text(row[col])],
                        'sourceSequence': row_number, 'personUrl': person_url,
                        'sourceJurisdiction': '; '.join(jurisdictions) or None,
                        'note': 'Dates transcribed from the cited succession table; source collection subject to sample review.' + (' ' + chronology if chronology else '')})
            if chronology:
                out[-1]['primaryChronology'] = 'Daryaee (2012)'
                alternatives = []
                for col, column_name in [(2,'Sellwood (1971–80)'),(3,'Assar (2011)'),(5,'Dąbrowa (2012)')]:
                    if col < len(row):
                        alt = dates(text(row[col]))
                        if alt and alt[:2] != (start,end): alternatives.append({'from':alt[0],'to':alt[1],'chronology':column_name,'sourceDates':alt[3], 'locator': f'{locator}; {column_name} column {col + 1}'})
                if alternatives:
                    out[-1]['alternativeDates'] = alternatives
                    out[-1]['note'] += ' Alternative published chronologies: ' + '; '.join(f"{a['chronology']}: {a['sourceDates']['from']}–{a['sourceDates']['to']}" for a in alternatives) + '.'
    return out, skipped


OFFICE = re.compile(r'^(?:(?:list of |the |last |first |de facto |hereditary |elected |constitutional |executive )?)(?:emperor|empress|king|queen|sultan|shah|shahanshah|khagan|khan|caliph|pharaoh|monarch|ruler|president|prime minister|premier|chancellor|governor|viceroy|duke|grand duke|prince|emir|amir|peshwa|regent|consul|doge|head of state|head of government|leader|shogun|tsar|czar|raja|maharaja|sar|šarrum)', re.I)


def infobox_records(document, polity_key, url, receipt):
    out = []
    for box in document.xpath('//table[contains(@class,"infobox") and not(ancestor::table)]'):
        role = None
        for row_number, tr in enumerate(box.xpath('./tr|./tbody/tr')):
            if 'infobox-hiddenrow' in tr.get('class', '') or not text(tr): continue
            heads, cells = tr.xpath('./th'), tr.xpath('./td')
            if len(heads) != 1: role = None; continue
            header = text(heads[0])
            interval = dates(header)
            if not interval:
                role = header if OFFICE.search(header) and not re.search(r'population|title|religion', header, re.I) and not EXCLUDED_OFFICE.search(header) else None
                # Ottoman political succession is the sultan's office. Its
                # separately listed caliphate survives the sultanate in 1922–24
                # and must not extend the empire's political ruler chronology.
                if polity_key == 'wd:Q12560' and re.search(r'caliph', header, re.I): role = None
                continue
            if not role or len(cells) != 1: continue
            raw_name = text(cells[0])
            if non_person_name(raw_name): continue
            if re.search(r'\b(unknown|legendary|mythical|depends|disputed|vacant|contested|collective|regency council)\b|\bor\b', raw_name, re.I): continue
            # A joint executive cannot silently become only its first person.
            # Keep these cells for a later explicit co-officeholder adapter.
            if re.search(r'\b(?:and|with)\b|&', re.sub(r'\([^)]*\)', '', raw_name), re.I): continue
            name, person_url = person_link(cells[0], url)
            if not name:
                name = re.sub(r'\([^)]*\)', '', raw_name).strip()
            if non_person_name(name): continue
            if not name or len(name) > 120 or re.search(r'\b(dynasty|dynasties|republic|council|committee)\b', name, re.I): continue
            start, end, precision, source_dates = interval
            rid = f'{urllib.parse.unquote(url.rsplit("/",1)[-1])}:infobox-row-{row_number + 1}'
            identity = hashlib.sha256(f'{rid}|{polity_key}'.encode()).hexdigest()[:20]
            out.append({'id': 'wikipedia:' + identity, 'polityKey': polity_key,
                        'personKey': person_url or 'wikipedia-person:' + re.sub(r'\W+', '-', name.lower()),
                        'name': name, 'role': role, 'from': start, 'to': end, 'precision': precision, 'calendar': 'historical',
                        'sourceId': SOURCE, 'sourceRecordId': rid, 'locator': f'{url} (infobox {role}; row {row_number + 1})',
                        'snapshot': {'path': receipt['file'], 'sha256': receipt['sha256']},
                        'sourceDates': source_dates, 'sourceDateText': header, 'sourceName': raw_name,
                        'section': 'Infobox: ' + role, 'sourceSequence': row_number, 'personUrl': person_url,
                        'note': 'Selected infobox officeholder; this does not establish a complete succession list.'})
    return out


def linked_targets(article_targets, index):
    found = []
    for key, url, route, _ in article_targets:
        if route != 'polity-article' or key in BLOCKED: continue
        path, _ = paths(url)
        if not path.exists(): continue
        document = html.fromstring(path.read_bytes())
        words = set(re.findall(r'[a-z]{4,}', urllib.parse.unquote(url.rsplit('/',1)[-1]).lower())) - {'empire','kingdom','dynasty','republic','united','state','states','federation','confederation','sultanate','caliphate','principality','duchy','period','ancient','people','democratic'}
        for node in document.xpath('//table[contains(@class,"infobox")]//th//a[@href]'):
            href = urllib.parse.urljoin(url, node.get('href'))
            title = urllib.parse.unquote(href.rsplit('/',1)[-1]).replace('_',' ')
            if not href.startswith('https://en.wikipedia.org/wiki/List_of_'): continue
            if not re.search(r'rulers?|monarchs?|emperors?|kings?|sultans?|presidents?|prime ministers?|caliphs?|pharaohs?|shahs?', title, re.I): continue
            if EXCLUDED_OFFICE.search(title) or EXCLUDED_OFFICE.search(text(node)): continue
            if not words.intersection(set(re.findall(r'[a-z]{4,}', title.lower()))): continue
            # A label naming the polity's own office is the discovery evidence.
            # Generic country-wide lists without the branch name stay unlinked.
            if re.search(r'western|eastern|northern|southern', index[key]['n'], re.I):
                directions = re.findall(r'western|eastern|northern|southern', index[key]['n'].lower())
                if not all(direction in title.lower() for direction in directions): continue
            found.append((key, href, 'linked-ruler-list', None))
    return list(dict.fromkeys(found))


def targets(mode):
    index = json.loads((ROOT / 'docs/data/polity_index.json').read_text())
    output = [(key, canonical_url(title), 'dedicated-list', SCOPES.get(key)) for key, title in SEEDS.items() if key in index]
    if mode in ['all', 'linked']:
        discovery = json.loads((ROOT / 'sources/rulers/wikidata-discovery.json').read_text())
        for key, polity in discovery['polities'].items():
            for source in polity['sourceCandidates']:
                if source['kind'] == 'wikipedia': output.append((key, source['url'], 'polity-article', None))
        linked = linked_targets(output, index)
        if mode == 'linked': return linked
        output.extend(linked)
    return list(dict.fromkeys(output))


def extract(all_targets):
    index = json.loads((ROOT / 'docs/data/polity_index.json').read_text())
    records, receipts, skipped, pages = [], {}, [], []
    dedup = set()
    by_url = {}
    for key, url, route, _ in all_targets:
        if route == 'polity-article': by_url.setdefault(url, set()).add(key)
    for key, url, route, scope in all_targets:
        if key in BLOCKED:
            skipped.append({'polityKey': key, 'url': url, 'reason': 'Historicality review required for Roman Kingdom tradition' if key == 'wd:Q201038' else 'Known atlas identity/period conflict'})
            continue
        if route == 'polity-article' and key not in PERIODS:
            # Concurrent narrower atlas branches cannot inherit one shared
            # umbrella article's entire dynasty list (e.g. Water/Land Chenla).
            overlapping = [other for other in by_url.get(url, set()) if other != key
                           and index[other]['first'] <= index[key]['last'] and index[key]['first'] <= index[other]['last']]
            title = re.sub(r'[^a-z]', '', urllib.parse.unquote(url.rsplit('/',1)[-1]).lower())
            name = re.sub(r'[^a-z]', '', index[key]['n'].lower())
            if overlapping and title != name:
                skipped.append({'polityKey': key, 'url': url, 'reason': 'shared umbrella article needs branch-specific scope'})
                continue
        path, receipt_path = paths(url)
        if not path.exists() or not receipt_path.exists(): continue
        receipt = json.loads(receipt_path.read_text())
        if hashlib.sha256(path.read_bytes()).hexdigest() != receipt['sha256']: raise ValueError('Cache hash mismatch')
        receipts[url] = receipt
        document = html.fromstring(path.read_bytes())
        found, rejected = table_records(document, key, receipt['finalUrl'], receipt, scope, route in ['dedicated-list','linked-ruler-list'])
        if route == 'polity-article' or route == 'dedicated-list' and not url.rsplit('/',1)[-1].startswith('List_of_'):
            found.extend(infobox_records(document, key, receipt['finalUrl'], receipt))
        # Generic broad lists are assigned only within the atlas period. This is
        # an association filter; surviving reign dates are never clipped.
        for row in found:
            if row['id'] in HELD_RECORDS:
                skipped.append({'polityKey': key, 'url': url, 'recordId': row['id'], 'name': row['name'], 'locator': row['locator'], 'reason': HELD_RECORDS[row['id']]})
                continue
            period = PERIODS.get(key)
            if period and (row['to'] < period[0] or row['from'] > period[1]): continue
            if route in ['polity-article','linked-ruler-list'] and (row['to'] < index[key]['first'] or row['from'] > index[key]['last']): continue
            marker = (key, row['personKey'], row['role'], row['from'], row['to'])
            if marker not in dedup: records.append(row); dedup.add(marker)
        skipped.extend(rejected)
        pages.append({'polityKey': key, 'url': url, 'route': route, 'extracted': len(found)})
    output = {'schemaVersion': 1,
              'sources': {SOURCE: {'title': 'Wikipedia polity succession tables', 'url': 'https://en.wikipedia.org/wiki/Lists_of_rulers',
                                   'lineage': 'wikimedia', 'kind': 'reference', 'admission': 'candidate', 'checks': []}},
              'records': records, 'receipts': list(receipts.values()), 'unmatched': skipped,
              'pages': pages, 'summary': {'downloadedPages': len(receipts), 'records': len(records), 'polities': len({r['polityKey'] for r in records})}}
    dump(OUTPUT, output)
    print(json.dumps(output['summary']), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--fetch-only', action='store_true')
    parser.add_argument('--mode', choices=['seeds','all','linked'], default='seeds')
    parser.add_argument('--limit', type=int)
    parser.add_argument('--workers', type=int, choices=[1,2,3,4], default=2)
    args = parser.parse_args()
    all_targets = targets(args.mode)
    urls = list(dict.fromkeys(t[1] for t in all_targets))
    if args.limit: urls = urls[:args.limit]
    if args.download:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(fetch_page, url): url for url in urls}
            for number, future in enumerate(as_completed(futures),1):
                future.result()
                if number % 10 == 0: print(f'Progress {number}/{len(urls)} URLs', flush=True)
    if not args.fetch_only: extract(all_targets)


if __name__ == '__main__':
    main()
