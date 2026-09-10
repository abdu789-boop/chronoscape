"""Audit every accepted ruler for aliases, duplicate tenures, and date conflicts.

Canonical page/QID metadata or explicitly reviewed aliases establish identity
before dates are compared. Same years alone never establish the same person.
The report is consumed by the builder; original source assertions are retained.
"""
import argparse
from collections import defaultdict, Counter
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import unquote
from prepare_ruler_broad_import import IDENTITY_LINKS

ROOT = Path(__file__).resolve().parents[1]
EFFECTIVE = 'Effective primary political leader (Archigos definition)'


def norm(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value or '').casefold() if not unicodedata.combining(c))
    return ' '.join(re.sub(r'[^\w\s]', ' ', value).split())


def variants(value):
    result = {norm(value), norm(re.sub(r'\b[\w]+ \(([^)]+)\)', r'\1', value))}
    # A parenthetical proper name is an explicit alias, never a fuzzy name match.
    outside = re.sub(r'\([^)]*\)', '', value)
    # Do not turn Theodosios (Theodosius) II into the unnumbered Theodosius.
    parenthetical = [] if re.search(r'\b(?:[IVXLCDM]+|\d+)\b', outside) else re.findall(r'\(([^)]*)\)', value)
    for part in [outside, *parenthetical]:
        if part.strip() and not re.search(r'\d|reign|first|second|third|last|died|born', part, re.I): result.add(norm(part))
    for v in list(result):
        latin = ' '.join(w for w in v.split() if all(ord(c) < 128 for c in w))
        if latin: result.add(latin)
        result.add(re.sub(r'\b(?:sir|dr|doctor|lord|baron|count|general|marshal|field marshal)\b', '', v).strip())
        result.add(re.sub(r'^(?:emperor|empress|king|queen|duke|sultan) ', '', v))
    result.update(' '.join(sorted(v.split())) for v in list(result))
    return {v for v in result if len(v) > 2 and v not in {'the great', 'the elder', 'the younger', 'emperor', 'king', 'queen', 'sultan'}}


def record_names(record):
    return set().union(*(variants(v) for v in [record['name'], *(record.get('aliases') or [])] if isinstance(v, str)))


def direct_person(key, evidence):
    if key.startswith('wd:Q'): return key
    if key.startswith('https://en.wikipedia.org/wiki/'):
        title = unquote(key.split('/wiki/', 1)[1]).replace('_', ' ')
        page = evidence['pages'].get(title, {})
        if page.get('qid'): return 'wd:' + page['qid']
        if page.get('pageId'): return 'wikipedia-page:' + str(page['pageId'])
    return None


def office(role):
    value = norm(re.sub(r'\(\s*\d+\s*[–-]\s*\d+\s*\)', '', role))
    # Translation/formatting equivalents, not equivalence of different offices.
    if value in {'padisah', 'emperor', 'empress', 'holy roman emperor'}: return 'emperor'
    if value in {'halife', 'halife hammudi', 'caliph', 'rashidun', 'abbasid caliph', 'umayyad caliph', 'fatimid caliph', 'caliph of cordoba'}: return 'caliph'
    if value in {'shahanshah', 'king of kings'}: return 'shahanshah'
    if value in {'sultan', 'sultans', 'sultana', 'sultane', 'sultan halife', 'sultan sultana'}: return 'sultan'
    if value in {'emir', 'amir', 'amir emir'}: return 'emir'
    if value in {'han', 'khan'}: return 'khan'
    if value in {'buyuk han', 'khagan'}: return 'khagan'
    if value == 'peshwa': return 'prime minister'
    if value in {'shah', 'sah'}: return 'shah'
    if value in {'sovereign', 'monarch', 'monarchs', 'ruler'} or value.startswith('monarch '): return '*monarch'
    if value in {'head of state', 'head of government'}: return '*' + value
    if role == EFFECTIVE: return '*effective'
    return value


def office_compatible(a, b):
    left, right = office(a), office(b)
    if left == right: return True
    royal = lambda v: bool(re.match(r'^(emperor|empress|king|queen|sultan|emir|shah|shahanshah|caliph|duke|prince|grand duke|grand prince|khan|khagan|bey|doge|apostolic king|raja|maharaja|maharajadhiraja|tsar|yang di pertuan agong|nevvab|ispehbed)\b', v))
    for bare, named in [(left, right), (right, left)]:
        if bare == '*effective': return True  # only used for the exact same identified tenure
        if bare == '*monarch' and (royal(named) or named in {'*head of state', '*head of government'}): return True
        if bare == '*head of state' and (royal(named) or named.startswith('president')): return True
        if bare == '*head of government' and (royal(named) or re.match(r'^(prime minister|premier|chancellor|reich chancellor)', named)): return True
        unmarked = bare.lstrip('*')
        if named.startswith(unmarked + ' of ') or named.startswith(unmarked + ' in '): return True
    return False


MONTHS = {name: i for i, name in enumerate(['january','february','march','april','may','june','july','august','september','october','november','december'],1)}

def exact_dates(record):
    values = record.get('sourceDates') or {}
    if not isinstance(values, dict): return None
    result=[]
    for field in ['from','to']:
        value = str(values.get(field, '')).lower().strip()
        match = re.fullmatch(r'([+-]?\d{4,})-(\d{2})-(\d{2})(?:t00:00:00z)?', value)
        if match and int(match[2]) and int(match[3]): result.append(tuple(map(int, match.groups()))); continue
        match = re.fullmatch(r'(\d{1,2})\s+([a-z]+)(?:\s+(\d{1,4}))?', value)
        if match and match[2] in MONTHS: result.append((int(match[3] or record[field]),MONTHS[match[2]],int(match[1]))); continue
        match = re.fullmatch(r'([a-z]+)\s+(\d{1,2}),?\s*(\d{4})?', value)
        if match and match[1] in MONTHS: result.append((int(match[3] or record[field]),MONTHS[match[1]],int(match[2]))); continue
        return None
    return result


def separate(a, b):
    left, right = exact_dates(a), exact_dates(b)
    return bool(left and right and (left[1] < right[0] or right[1] < left[0]))


def prepare(data, evidence, review):
    rows = [r for p in data['polities'].values() for r in p['rulers']]
    resolved = {}; proof = {}; by_person = defaultdict(list)
    for r in rows:
        k = (r['polityKey'], r['personKey']); by_person[k].append(r)
        person = direct_person(r['personKey'], evidence)
        if person: resolved[k] = person; proof[k] = 'canonical Wikipedia page / Wikidata ID'
    # Preserve the previously inspected crosswalks, applying them to entire people,
    # including restorations, before looking at tenure dates.
    for polity, label, people, references in IDENTITY_LINKS:
        canonical = {direct_person(k, evidence) for k in people} - {None}
        if len(canonical) > 1: raise ValueError('Conflicting prior identity map: ' + label)
        if not canonical: continue
        for k, group in by_person.items():
            if k[0] == polity and (k[1] in people or any((a['sourceId'],a['sourceRecordId']) in references for r in group for a in r['assertions'])):
                resolved[k] = next(iter(canonical)); proof[k] = 'previously inspected identity crosswalk: ' + label
    for item in review.get('identities', []):
        k = (item['polityKey'], item['personKey'])
        if k not in by_person: continue
        person = item['canonicalPerson']
        if k in resolved and resolved[k] != person: raise ValueError('Review contradicts canonical ID: ' + str(k))
        resolved[k] = person; proof[k] = item['reason']
    by_alias = defaultdict(set)
    suffix_names = defaultdict(set)
    for k, group in by_person.items():
        if k not in resolved: continue
        person = resolved[k]
        names = set().union(*(record_names(r) for r in group))
        if person.startswith('wd:'):
            e = evidence['people'].get(person[3:], {})
            for name in [e.get('label'), *e.get('aliases',[])]:
                if name: names.update(variants(name))
        for name in names: by_alias[(k[0],name)].add(person)
        original_names = [r['name'] for r in group]
        if person.startswith('wd:'):
            e = evidence['people'].get(person[3:], {})
            original_names.extend([e.get('label'), *e.get('aliases',[])])
        for name in original_names:
            if name: suffix_names[(k[0],norm(name))].add(person)
    for k, group in by_person.items():
        if k in resolved: continue
        matches = set().union(*(by_alias.get((k[0],name),set()) for r in group for name in record_names(r)))
        if len(matches) == 1:
            resolved[k] = next(iter(matches)); proof[k] = 'unique exact recorded name/alias within this polity; dates not used'
    # Archigos often identifies a leader by surname only. Expand that spelling
    # only when it is an exact complete suffix of a sourced person name, unique
    # across the polity, and not shared by different Archigos person IDs.
    archive_names = defaultdict(set)
    for k, group in by_person.items():
        if k[1].startswith('archigos-4.1:'):
            for r in group:
                for name in record_names(r): archive_names[(k[0], name)].add(k[1])
    for k, group in by_person.items():
        if k in resolved or not k[1].startswith('archigos-4.1:'): continue
        matches = set()
        for r in group:
            for name in {norm(r['name']), *(norm(v) for v in r.get('aliases',[]))}:
                if len(name) < 5 or len(archive_names[(k[0], name)]) != 1: continue
                for (polity, full), candidates in suffix_names.items():
                    if polity == k[0] and full.endswith(' ' + name): matches.update(candidates)
        if len(matches) == 1:
            resolved[k] = next(iter(matches)); proof[k] = 'unique Archigos surname/name suffix in sourced full names within this polity; no date matching'
    def person(r): return resolved.get((r['polityKey'],r['personKey']),r['personKey'])
    def compatible(a, b):
        return office_compatible(a['role'], b['role']) or any(
            item['polityKey'] == a['polityKey'] and a['role'] in item['roles'] and b['role'] in item['roles']
            for item in review.get('officeEquivalences', []))
    grouped=defaultdict(list)
    for r in rows: grouped[(r['polityKey'],person(r),r['from'],r['to'],r.get('ongoing'),r.get('asOf'))].append(r)
    merges=[]; retained=[]
    for key, group in sorted(grouped.items(),key=lambda v:str(v[0])):
        if len(group)<2: continue
        # Avoid transitive merges through a generic title when two explicit offices
        # are present, or through a year-only source spanning two separate episodes.
        known=[r for r in group if exact_dates(r)]
        ambiguous={r['id'] for r in group if not exact_dates(r) and any(separate(a,b) for i,a in enumerate(known) for b in known[i+1:])}
        keep=[]
        for r in sorted(group,key=lambda r:(office(r['role']).startswith('*'),r['id'])):
            target=next((g for g in keep if r['id'] not in ambiguous and all(x['id'] not in ambiguous and compatible(x,r) and not separate(x,r) for x in g)),None)
            if target is None: keep.append([r])
            else: target.append(r)
        for g in keep:
            if len(g)>1:
                canonical=key[1]; metadata=evidence['people'].get(canonical[3:],{}) if canonical.startswith('wd:') else {}
                label=review.get('displayNames',{}).get(canonical) or review.get('displayNames',{}).get(canonical[3:]) or metadata.get('wikipedia') or metadata.get('label')
                merges.append({'polityKey':key[0],'canonicalPerson':canonical,'ids':[r['id'] for r in g],
                    'displayName':label or g[0]['name'], 'identityEvidence':[{'personKey':r['personKey'],'name':r['name'],'basis':proof.get((r['polityKey'],r['personKey']),'same original person key')} for r in g]})
        if len(keep)>1: retained.append({'polityKey':key[0],'canonicalPerson':key[1],'ids':[r['id'] for r in group],
            'reason':'Separate recorded offices or separate dated episodes; ambiguous year-only observations cannot bridge them.'})
    # Genuine disagreements for the SAME explicit office are retained for review,
    # not silently merged, averaged, or turned into an extra reign.
    by_identity=defaultdict(list)
    for r in rows: by_identity[(r['polityKey'],person(r))].append(r)
    conflicts=[]
    for (polity,canonical),group in by_identity.items():
        for i,a in enumerate(group):
            for b in group[i+1:]:
                if (a['from'],a['to'])==(b['from'],b['to']) or separate(a,b): continue
                if not all(isinstance(r.get(f),int) for r in [a,b] for f in ['from','to']): continue
                if office(a['role']) != office(b['role']) or office(a['role']).startswith('*'): continue
                if max(a['from'],b['from']) >= min(a['to'],b['to']): continue
                if a.get('uncertainty') or b.get('uncertainty'): continue
                conflicts.append({'polityKey':polity,'canonicalPerson':canonical,'ids':[a['id'],b['id']],
                    'reason':'Overlapping accounts of one identified person in the same explicit office disagree on whole tenure years.'})
    # Every equal-year interval is audited, including different rulers and offices.
    by_dates=defaultdict(list)
    for r in rows: by_dates[(r['polityKey'],r['from'],r['to'])].append(r)
    interval_audit=[]; pending=[]
    for (polity,start,end),group in by_dates.items():
        if len(group)<2: continue
        identities={person(r) for r in group}
        unresolved=[r for r in group if (r['polityKey'],r['personKey']) not in resolved]
        if unresolved and len(identities)>1:
            pending.append({'polityKey':polity,'polity':data['polities'][polity]['name'],'from':start,'to':end,
                'rows':[{'id':r['id'],'personKey':r['personKey'],'canonicalPerson':person(r),'name':r['name'],'role':r['role']} for r in group]})
        interval_audit.append({'polityKey':polity,'from':start,'to':end,'ids':[r['id'] for r in group],
            'identities':sorted(identities),'classification':'one identity; tenure/office checks applied' if len(identities)==1 else 'different or unresolved identities; never merged by dates'})
    return {'schemaVersion':1,'summary':{'atlasPolities':len(data['polities']),'auditedReigns':len(rows),'politiesWithRulers':sum(bool(p['rulers']) for p in data['polities'].values()),
        'resolvedPersonKeys':len(resolved),'personKeys':len(by_person),'duplicateGroups':len(merges),'duplicateRows':sum(len(g['ids'])-1 for g in merges),
        'conflictPairs':len(conflicts),'sameIntervalGroups':len(interval_audit),'unresolvedIntervalGroups':len(pending)},
        'identities':[{'polityKey':k[0],'personKey':k[1],'canonicalPerson':v,'basis':proof[k]} for k,v in sorted(resolved.items())],
        'merges':merges,'conflicts':conflicts,'retainedDistinctTerms':retained,'intervalAudit':interval_audit,'pending':pending,
        'displayCorrections':[{'id':r['id'],'canonicalPerson':person(r),'name':review['displayNames'].get(person(r)) or review['displayNames'].get(person(r)[3:])} for r in rows
            if review.get('displayNames',{}).get(person(r)) or review.get('displayNames',{}).get(person(r)[3:])]}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',required=True);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    file=Path(args.input); raw=file.read_bytes(); evidence_path=ROOT/'sources/rulers/identity-evidence.json'; review_path=ROOT/'sources/rulers/identity-review.json'
    result=prepare(json.loads(raw),json.loads(evidence_path.read_text()),json.loads(review_path.read_text()) if review_path.exists() else {})
    result['inputSha256']=hashlib.sha256(raw).hexdigest()
    result['inputFingerprints']=[{'path':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [evidence_path,review_path,Path(__file__),ROOT/'scripts/ruler_identity_merge.mjs'] if p.exists()]
    output=json.dumps(result,ensure_ascii=False,indent=2)+'\n';dest=ROOT/'sources/rulers/identity-audit.json'
    if args.check:
        if dest.read_text()!=output:raise ValueError('Stale identity audit')
    else:dest.write_text(output)
    print(json.dumps(result['summary']))


if __name__=='__main__':main()
