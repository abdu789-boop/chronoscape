"""Prepare broad ruler imports using declared source-level comparison samples.

Reads flat extractor records, never web pages or candidate infobox dates.
Identity/office matching precedes all date comparison. The sample is chosen by
source-record hash, spread across available polity/office strata, not agreement.
Known conflicts outside that sample are still withheld. Existing accepted reigns
are preserved; checksOnly sample claims materialize evidence without duplicate UI.
"""
import hashlib
import json
import re
import subprocess
import unicodedata
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INPUTS = ['wikipedia-extracted', 'additional-extracted', 'wikidata-extracted']
BASES = ['china', 'classical', 'modern', 'reference-import']
SAMPLE_SIZE = 30
FIELDS = ('personKey','polityKey','role','from','to','precision','calendar','ongoing','asOf')
EFFECTIVE = 'Effective primary political leader (Archigos definition)'
# Explicit offices corresponding to the effective-leader definition in these
# particular atlas regimes. Never equate all ceremonial heads with Archigos.
EFFECTIVE_OFFICES = {'wd:Q30':'president', 'wd:Q23666':'prime minister',
 'wd:Q668':'prime minister', 'wd:Q408':'prime minister', 'wd:Q200686':'president'}
# Inspected aliases in the source records; these identify people before dates
# are compared, and never merge a restoration with a separate tenure episode.
IDENTITY_LINKS = [
 ('wd:Q30','franklin-roosevelt',{'wd:Q8007','https://en.wikipedia.org/wiki/Franklin_D._Roosevelt'},{('archigos-4.1','USA-1933')}),
 ('wd:Q30','gerald-ford',{'wd:Q9582','https://en.wikipedia.org/wiki/Gerald_Ford'},{('archigos-4.1','USA-1974')}),
 ('wd:Q9683','tang-gaozu',{'wd:Q9700','https://en.wikipedia.org/wiki/Emperor_Gaozu_of_Tang'},set()),
 ('wd:Q9683','tang-taizong',{'wd:Q9701','https://en.wikipedia.org/wiki/Emperor_Taizong_of_Tang'},set()),
 ('wd:Q9683','tang-xuanzong-玄宗',{'wd:Q9746','https://en.wikipedia.org/wiki/Emperor_Xuanzong_of_Tang'},set()),
 ('nm:handynasty','china:han-wudi',{'wd:Q7225','https://en.wikipedia.org/wiki/Emperor_Wu_of_Han'},set()),
 ('nm:handynasty','china:hou-han-guangwudi',{'wd:Q7268','https://en.wikipedia.org/wiki/Emperor_Guangwu'},set()),
 ('nm:handynasty','china:hou-han-xiandi',{'wd:Q7316','https://en.wikipedia.org/wiki/Emperor_Xian'},set()),
 ('nm:caowei','china:wei-wendi',{'wd:Q313333','https://en.wikipedia.org/wiki/Cao_Pi'},set()),
 ('nm:caowei','china:wei-mingdi',{'wd:Q378470','https://en.wikipedia.org/wiki/Cao_Rui'},set()),
 ('nm:easternwu','china:wu-jingdi',{'wd:Q468767','https://en.wikipedia.org/wiki/Sun_Xiu_(emperor)'},set()),
 ('nm:easternwu','china:wu-modi',{'wd:Q470030','https://en.wikipedia.org/wiki/Sun_Hao'},set()),
 ('wd:Q875305','china:beiwei-mingyuandi',{'wd:Q1071591','https://en.wikipedia.org/wiki/Emperor_Mingyuan_of_Northern_Wei'},set()),
 ('wd:Q875305','china:beiwei-wenchengdi',{'wd:Q1074798','https://en.wikipedia.org/wiki/Emperor_Wencheng_of_Northern_Wei'},set()),
 ('wd:Q875305','china:beiwei-xiandi',{'wd:Q1071582','https://en.wikipedia.org/wiki/Emperor_Xianwen_of_Northern_Wei'},set()),
 ('wd:Q875305','china:beiwei-xiaowendi',{'wd:Q1327614','https://en.wikipedia.org/wiki/Emperor_Xiaowen_of_Northern_Wei'},set()),
 ('wd:Q875305','china:beiwei-xuanwudi',{'wd:Q1194968','https://en.wikipedia.org/wiki/Emperor_Xuanwu_of_Northern_Wei'},set()),
 ('wd:Q4958','china:liao-shizong',{'wd:Q4992','https://en.wikipedia.org/wiki/Emperor_Shizong_of_Liao'},set()),
 ('wd:Q4958','china:liao-muzong',{'wd:Q4993','https://en.wikipedia.org/wiki/Emperor_Muzong_of_Liao'},set()),
 ('wd:Q4958','china:liao-jingzong',{'wd:Q4997','https://en.wikipedia.org/wiki/Emperor_Jingzong_of_Liao'},set()),
 ('wd:Q4958','china:liao-shengzong',{'wd:Q5000','https://en.wikipedia.org/wiki/Shengzong'},set()),
 ('wd:Q4958','china:liao-xingzong',{'wd:Q5005','https://en.wikipedia.org/wiki/Xingzong'},set()),
 ('wd:Q4958','china:liao-daozong',{'wd:Q5007','https://en.wikipedia.org/wiki/Daozong'},set()),
 ('nm:liangdynasty','china:liang-wudi',{'wd:Q736726','https://en.wikipedia.org/wiki/Emperor_Wu_of_Liang'},set()),
 ('nm:liangdynasty','china:liang-jianwendi',{'wd:Q1140994','https://en.wikipedia.org/wiki/Emperor_Jianwen_of_Liang'},set()),
 ('nm:liangdynasty','china:liang-jingdi',{'wd:Q1059979','https://en.wikipedia.org/wiki/Emperor_Jing_of_Liang'},set()),
 ('wd:Q62454','china:chen-wendi',{'wd:Q712113','https://en.wikipedia.org/wiki/Emperor_Wen_of_Chen'},set()),
 ('wd:Q62454','china:chen-houzhu',{'wd:Q718206','https://en.wikipedia.org/wiki/Chen_Shubao'},set()),
 ('wd:Q62456','china:qi-gaodi',{'wd:Q1194981','https://en.wikipedia.org/wiki/Emperor_Gao_of_Southern_Qi'},set()),
 ('wd:Q62456','china:qi-hedi',{'wd:Q1190420','https://en.wikipedia.org/wiki/Emperor_He_of_Southern_Qi'},set()),
 ('nm:northernqi','china:beiqi-xiaozhaodi',{'wd:Q708325','https://en.wikipedia.org/wiki/Emperor_Xiaozhao_of_Northern_Qi'},set()),
 ('nm:northernqi','china:beiqi-wuchengdi',{'wd:Q718243','https://en.wikipedia.org/wiki/Emperor_Wucheng_of_Northern_Qi'},set()),
 ('wd:Q49697','china:liu-song-wendi',{'wd:Q49702','https://en.wikipedia.org/wiki/Emperor_Wen_of_Song'},set()),
 ('wd:Q49697','china:liu-song-shundi',{'wd:Q718210','https://en.wikipedia.org/wiki/Emperor_Shun_of_Song'},set()),
 *[('wd:Q12560','ottoman:'+slug,{'https://en.wikipedia.org/wiki/'+slug,*fallbacks},set(records)) for slug,fallbacks,records in [
  ('Osman_I',[],[('islamic-atlas','130-001')]),
  ('Murad_I',[],[('islamic-atlas','130-002')]),
  ('Bayezid_I',[],[('islamic-atlas','130-003')]),
  ('Mehmed_II',['wikipedia-person:mehmed-ii'],[('islamic-atlas','130-004')]),
  ('Selim_I',[],[('islamic-atlas','130-005')]),
  ('Suleiman_the_Magnificent',[],[('islamic-atlas','130-006')]),
  ('Abdul_Hamid_II',[],[('islamic-atlas','130-007'),('archigos-4.1','TUR-1876-2')]),
  ('Mehmed_VI',[],[('islamic-atlas','130-008'),('archigos-4.1','TUR-1918')]),
  ('Abdulaziz',[],[('archigos-4.1','TUR-1861')]),
  ('Murad_V',[],[('archigos-4.1','TUR-1876-1')]),
  ('Murad_II',['wikipedia-person:murad-ii'],[]),
  ('Mustafa_I',['wikipedia-person:mustafa-i'],[]),
 ]]
]


def read(path): return json.loads(path.read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def year(value): return isinstance(value,int) and not isinstance(value,bool) and value!=0
def normalize_name(value):
    value=unicodedata.normalize('NFKD',str(value)).casefold()
    value=''.join(c for c in value if not unicodedata.combining(c))
    value=re.sub(r'\[\d+\]', '',value)
    return ' '.join(re.sub(r'[^\w\s]', ' ',value).split())


def names(record):
    aliases=record.get('aliases') or []
    if isinstance(aliases,str): aliases=[aliases]
    return {normalize_name(n) for n in [record.get('name',''),*aliases] if n}


def identity_key(record):
    observations=record.get('assertions') or [record]
    refs={(a.get('sourceId'),a.get('sourceRecordId')) for a in observations}
    for polity,identity,people,records in IDENTITY_LINKS:
        if record['polityKey']==polity and (record.get('personKey') in people or refs & records): return 'inspected:'+identity
    return record.get('personKey','')


def record_role(record):
    identity=identity_key(record)
    if identity in ('inspected:china:wu-jingdi','inspected:china:wu-modi'):
        if 'king' in normalize_name(record['role']) and 'emperor' in normalize_name(record['role']) and year(record.get('from')) and record['from']>=229: return 'Emperor'
    if identity.startswith('inspected:ottoman:'):
        if record['role']==EFFECTIVE or normalize_name(record['role']) in ('sultan','sultan halife','bey','sovereign','monarch','king'): return 'Sultan'
    return role_group(record['role'],record['polityKey'])


def role_group(role, polity):
    value=normalize_name(role)
    if role==EFFECTIVE: return EFFECTIVE
    office=EFFECTIVE_OFFICES.get(polity)
    if office and (value==office or value.startswith(office+' of ')): return EFFECTIVE
    if re.fullmatch(r'(?:emperor|empress)(?: of .+)?',value): return 'Emperor'
    if re.fullmatch(r'(?:sultan|sultana|sultane|sultan halife)',value): return 'Sultan'
    if value in ('caliph','halife'): return 'Caliph'
    if value in ('shah','sah'): return 'Shah'
    if value in ('emir','amir'): return 'Emir'
    return value


def fields(record): return {k:record[k] for k in FIELDS if k in record}


def precise_dates(record):
    dates=record.get('sourceDates') or {}
    if not isinstance(dates,dict): return None
    result=[]
    for key in ('from','to'):
        value=dates.get(key)
        match=re.match(r'^([+-]?\d{4,})-(\d{2})-(\d{2})(?:T|$)',str(value))
        if not match or int(match[2])==0 or int(match[3])==0: return None
        result.append(tuple(int(x) for x in match.groups()))
    return result


def separate_dated_episodes(a,b):
    left,right=precise_dates(a),precise_dates(b)
    return bool(left and right and (left[1]<right[0] or right[1]<left[0]))


def separate_known_years(a,b):
    return all(year(v.get(k)) for v in (a,b) for k in ('from','to')) and (a['to']<b['from'] or b['to']<a['from'])


def receipt_path(receipt): return receipt.get('file') or receipt.get('path')


def validate_record(record,index,sources,receipts):
    reasons=[]
    for field in ('id','personKey','name','role','sourceId','sourceRecordId','locator'):
        if not isinstance(record.get(field),str) or not record[field].strip(): reasons.append('missing '+field)
    if record.get('polityKey') not in index or record.get('polityKey')=='_span': reasons.append('unknown exact atlas identity')
    if record.get('sourceId') not in sources: reasons.append('unknown source')
    if not year(record.get('from')): reasons.append('missing or invalid accession year')
    if not year(record.get('to')):
        if not (record.get('to') is None and record.get('ongoing') is True and year(record.get('asOf')) and year(record.get('from')) and record['asOf']>=record['from']): reasons.append('unknown end without dated ongoing evidence')
    if year(record.get('from')) and year(record.get('to')) and record['from']>record['to']: reasons.append('reversed reign')
    if year(record.get('from')) and year(record.get('to')) and record['to']-record['from']>120:
        reasons.append('tenure longer than 120 years requires historicality or aggregation review')
    if record.get('precision','year') not in ('year','approximate'): reasons.append('unsupported precision')
    if record.get('calendar','historical')!='historical': reasons.append('unconverted calendar')
    snap=record.get('snapshot') or {}
    if not re.fullmatch('[a-f0-9]{64}',snap.get('sha256','')) or receipts.get(snap.get('path'))!=snap.get('sha256'): reasons.append('snapshot missing matching acquisition receipt')
    for alternative in record.get('alternativeDates',[]):
        if not (year(alternative.get('from')) and year(alternative.get('to')) and alternative['from']<=alternative['to'] and isinstance(alternative.get('chronology'),str) and alternative['chronology'].strip()):
            reasons.append('invalid or unlabelled comparative chronology')
    return reasons


def select_sample(comparisons, limit=SAMPLE_SIZE):
    """Deterministic round-robin across available polity/office strata."""
    strata=defaultdict(list)
    for record,peers in comparisons:
        strata[(record['polityKey'],record_role(record))].append((record,peers))
    for items in strata.values(): items.sort(key=lambda item:hashlib.sha256(item[0]['sourceRecordId'].encode()).hexdigest())
    keys=sorted(strata,key=lambda key:hashlib.sha256('|'.join(key).encode()).hexdigest())
    result=[]; position=0; seen=set()
    while len(result)<limit:
        batch=[strata[key][position] for key in keys if len(strata[key])>position]
        if not batch: break
        for item in batch:
            if item[0]['sourceRecordId'] in seen: continue
            seen.add(item[0]['sourceRecordId']); result.append(item)
            if len(result)==limit: break
        position+=1
    return result


def compatible_peers(record, byperson, byname, sources):
    key=record['polityKey']; role=record_role(record)
    candidates=byperson.get((key,identity_key(record),role),[])
    if not candidates:
        candidates=[p for n in names(record) for p in byname.get((key,n,role),[])]
    # Multiple aliases/repeated references to the same person are fine; distinct
    # person identities (homonyms) are not resolved by their convenient dates.
    identities={identity_key(p['claim']) for p in candidates}
    if len(identities)!=1: return [], 'no unique independent person/office match'
    candidate_map={(p['assertion']['sourceId'],p['assertion']['sourceRecordId'],json.dumps(fields(p['assertion']),sort_keys=True)):p for p in candidates}
    candidates=[p for p in candidate_map.values() if sources[p['assertion']['sourceId']].get('lineage')!=sources[record['sourceId']].get('lineage')]
    candidates=[p for p in candidates if not separate_dated_episodes(record,p['claim']) and not separate_known_years(record,p['assertion'])]
    periods={(p['assertion']['from'],p['assertion']['to']) for p in candidates}
    if len(periods)>1:
        same_start={p['claim']['id'] for p in candidates if p['assertion']['from']==record['from']}
        if same_start: candidates=[p for p in candidates if p['claim']['id'] in same_start]
        elif len({p['claim']['id'] for p in candidates})>1: return [], 'multiple independently named tenure episodes; no unique accession match'
    return candidates, ''


def make_claim(record,peers=()):
    claim={k:record[k] for k in ('id','polityKey','personKey','name','role','from','to','precision','ongoing','asOf','note','sourceDates','uncertainty','aliases','primaryChronology','sequence','sourceSequence') if k in record}
    claim.setdefault('precision','year')
    if 'sequence' not in claim and 'sourceSequence' in claim: claim['sequence']=claim['sourceSequence']
    if peers: claim['personKey']=peers[0]['claim']['personKey']
    assertion={**fields(record),**{k:record[k] for k in ('sourceId','sourceRecordId','locator','snapshot')},'imported':True}
    assertion.update(personKey=claim['personKey'],role=claim['role'],precision=record.get('precision','year'),calendar='historical')
    claim['assertions']=[assertion]
    for peer in peers:
        a=dict(peer['assertion']); a['personKey']=claim['personKey']; a['role']=claim['role']
        claim['assertions'].append(a)
    return claim


def attach_comparative_chronology(claim,record):
    """Retain named columns actually extracted from the Parthian comparison table.

    This is evidence about what the cited reference table prints. It is not an
    assertion that its underlying scholarly books were independently inspected.
    Ordinary conflicting records cannot enter through this path.
    """
    primary=record.get('primaryChronology')
    alternatives=record.get('alternativeDates',[])
    if (record['polityKey']!='wd:Q1986139' or record['sourceId']!='wikipedia-ruler-lists'
        or not primary or not alternatives): return
    if not any((a['from'],a['to'])!=(record['from'],record['to']) for a in alternatives): return
    first=next(a for a in claim['assertions'] if a['sourceId']==record['sourceId'] and a['sourceRecordId']==record['sourceRecordId'])
    first['chronology']=primary
    first['precision']='approximate'; claim['precision']='approximate'
    printed=[{'from':record['from'],'to':record['to'],'label':primary}]
    ids=[first['sourceRecordId']]
    for row in alternatives:
        label=row['chronology']
        sid=record['sourceRecordId']+':chronology:'+hashlib.sha256(label.encode()).hexdigest()[:12]
        claim['assertions'].append({**first,'sourceRecordId':sid,'locator':row.get('locator') or record['locator']+'; chronology column '+label,'chronology':label,'from':row['from'],'to':row['to']})
        ids.append(sid); printed.append({'from':row['from'],'to':row['to'],'label':label})
    description='; '.join(f"{p['label']}: {p['from']} to {p['to']} (historical year numbering)" for p in printed)
    claim['uncertainty']={'kind':'disputed','basis':'published-comparative-chronology',
      'reason':'The cited succession table prints differing named chronologies. The underlying books have not been independently cross-checked here.',
      'alternatives':printed,'evidence':[{'sourceId':record['sourceId'],'sourceRecordIds':ids,'locator':record['locator'],
      'classification':'disputed','personKey':claim['personKey'],'polityKey':claim['polityKey'],'snapshot':record['snapshot'],'text':description}]}


def consolidate_imports(output):
    """Merge identical new reigns, retaining assertions without creating independence.

    Names only align a unique person per source within one polity and compatible
    office. Distinct Wikidata identities are never collapsed by a shared name.
    Separate dated terms remain separate, including terms within the same year.
    """
    claims=[*output['imports'],*[c for c in output['matched'] if not c.get('checksOnly')]]
    parent=list(range(len(claims)))
    component_ids=[{c['personKey']} if c['personKey'].startswith('wd:') else set() for c in claims]
    def find(i):
        while parent[i]!=i: parent[i]=parent[parent[i]]; i=parent[i]
        return i
    def join(items):
        identities=set().union(*(component_ids[find(i)] for i in items))
        if len(identities)>1: return
        for i in items[1:]: parent[find(i)]=find(items[0])
        component_ids[find(items[0])]=identities
    people=defaultdict(list); named=defaultdict(list)
    for i,c in enumerate(claims):
        key=(c['polityKey'],record_role(c))
        people[(*key,identity_key(c))].append(i)
        for name in names(c): named[(*key,name)].append(i)
    for items in people.values(): join(items)
    for items in named.values():
        identities=defaultdict(set)
        for i in items:
            for a in claims[i]['assertions']: identities[a['sourceId']].add(claims[i]['personKey'])
        if all(len(values)==1 for values in identities.values()): join(items)
    groups=defaultdict(list)
    for i in range(len(claims)): groups[find(i)].append(claims[i])
    matched_ids={c['id'] for c in output['matched']}; omitted=set()
    for group in groups.values():
        # Keep individually checked claims as the display row where available.
        group.sort(key=lambda c:(not bool(c.get('supersedes')),not bool(c.get('primaryChronology')),c['id'] not in matched_ids,not c['personKey'].startswith('wd:'),c['id']))
        conflicts=set()
        for claim in group:
            if precise_dates(claim): continue
            dated=[c for c in group if c['from']==claim['from'] and c['to']==claim['to'] and precise_dates(c)]
            if any(separate_dated_episodes(a,b) for i,a in enumerate(dated) for b in dated[i+1:]):
                omitted.add(claim['id'])
                output.setdefault('candidateDuplicates',[]).append({'claim':claim,'reason':'Year-only account cannot be assigned to one of multiple separately dated tenure episodes.'})
        for pos,a in enumerate(group):
            for b in group[pos+1:]:
                if separate_dated_episodes(a,b): continue
                end_a=a['to'] if year(a['to']) else a.get('asOf',a['from'])
                end_b=b['to'] if year(b['to']) else b.get('asOf',b['from'])
                overlapping=a['from']==b['from'] or max(a['from'],b['from'])<min(end_a,end_b)
                disagree=any(year(a.get(k)) and year(b.get(k)) and a[k]!=b[k] for k in ('from','to'))
                if overlapping and disagree:
                    conflicts.update((a['id'],b['id']))
                    combined={**a,'assertions':[dict(x) for x in a['assertions']]}
                    combined['assertions'].extend({**x,'personKey':a['personKey'],'role':a['role']} for x in b['assertions'])
                    output['conflicts'].append({'claim':combined,'otherClaimId':b['id'],'reason':'Overlapping tenure accounts for the same identified person and compatible office disagree across new imports; both withheld.'})
        omitted.update(conflicts)
        kept=[]
        for claim in group:
            if claim['id'] in omitted: continue
            same=next((c for c in kept if all(c.get(k)==claim.get(k) for k in ('from','to','precision','ongoing','asOf')) and not separate_dated_episodes(c,claim)),None)
            if same is None: kept.append(claim); continue
            known={(a['sourceId'],a['sourceRecordId']) for a in same['assertions']}
            same['assertions'].extend({**a,'personKey':same['personKey'],'role':same['role']} for a in claim['assertions'] if (a['sourceId'],a['sourceRecordId']) not in known)
            if claim.get('supersedes'):
                same['supersedes']=sorted(set(same.get('supersedes',[])+claim['supersedes']))
                same['supersessionNote']=claim['supersessionNote']
            omitted.add(claim['id'])
            output['duplicates'].append({'id':claim['id'],'existingIds':[same['id']],'reason':'Identical new tenure merged by unique sourced identity and compatible office; every source assertion retained, shared lineages remain shared.'})
    output['imports']=[c for c in output['imports'] if c['id'] not in omitted]
    for claim in output['matched']:
        if claim['id'] in omitted: claim['checksOnly']=True


def main():
    index=read(ROOT/'docs/data/polity_index.json')
    # Restrict baseline deduplication to pre-broad source families so rerunning
    # after the public dataset is rebuilt does not delete the adapter's own rows.
    public=read(ROOT/'docs/data/rulers.json')
    accepted={c['id']:c for p in public['polities'].values() for c in p['rulers']}
    prior_path=ROOT/'sources/rulers/broad-import.json'
    prior=read(prior_path) if prior_path.exists() else {}
    baseline_ids=prior.get('baselineAcceptedIds')
    baseline_revision=prior.get('baselineRevision','adfb69c')
    if not baseline_ids:
        report=json.loads(subprocess.check_output(['git','show',baseline_revision+':sources/rulers/accuracy-report.json'],cwd=ROOT))
        baseline_ids=sorted(c['id'] for c in report['accepted'])
    baseline_set=set(baseline_ids)
    sources={}; basereceipts=[]; baseline=[]; known_conflicts=[]
    for family in BASES:
        path=ROOT/f'sources/rulers/{family}.json'
        if not path.exists(): continue
        data=read(path); sources.update(data.get('sources',{})); basereceipts.extend(data.get('receipts',[]))
        baseline.extend(c for c in [*data.get('matched',[]),*data.get('imports',[])] if c['id'] in baseline_set)
        known_conflicts.extend(item['claim'] for item in data.get('conflicts',[]) if item.get('claim'))
    byperson=defaultdict(list); byname=defaultdict(list)
    for claim in baseline:
        for assertion in claim.get('assertions',[]):
            if assertion.get('sourceId') not in sources: continue
            peer={'claim':claim,'assertion':assertion}
            role=record_role(claim)
            byperson[(claim['polityKey'],identity_key(claim),role)].append(peer)
            for name in names(claim): byname[(claim['polityKey'],name,role)].append(peer)
    contrary_person=defaultdict(list); contrary_name=defaultdict(list)
    for claim in known_conflicts:
        for assertion in claim.get('assertions',[]):
            if public['sources'].get(assertion.get('sourceId'),{}).get('admission')!='passed': continue
            peer={'claim':claim,'assertion':assertion}
            role=record_role(claim)
            contrary_person[(claim['polityKey'],identity_key(claim),role)].append(peer)
            for name in names(claim): contrary_name[(claim['polityKey'],name,role)].append(peer)
    output={'schemaVersion':1,'status':'source-level-reviewed-candidates','sources':{},'matched':[],'imports':[],'conflicts':[],'rejected':[],'duplicates':[],'candidateDuplicates':[],'receipts':[], 'profileOverrides':{},'inputFingerprints':[], 'reviewAudit':{}}
    output['baselineRevision']=baseline_revision; output['baselineAcceptedIds']=baseline_ids
    records=[]; receipts=list(basereceipts); seen_ids=set(); found=0
    for family in INPUTS:
        path=ROOT/f'sources/rulers/{family}.json'
        if not path.exists(): continue
        found+=1; raw=path.read_bytes(); data=json.loads(raw)
        output['inputFingerprints'].append({'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(raw).hexdigest()})
        for key,override in data.get('profileOverrides',{}).items():
            output['profileOverrides'].setdefault(key,{}).update(override)
        receipts.extend(data.get('receipts',[]))
        for sid,source in data.get('sources',{}).items():
            if sid in sources:
                if any(source.get(field)!=sources[sid].get(field) for field in ('url','lineage') if source.get(field)): raise ValueError('Conflicting source registry '+sid)
                continue
            sources[sid]=source; output['sources'][sid]={**source,'admission':'candidate','checks':[]}
        for record in data.get('records',[]):
            if record['id'] in seen_ids: continue
            seen_ids.add(record['id']); records.append(record)
    if not found: raise SystemExit('Waiting for extractor inputs; no output replaced.')
    receipt_map={}; receipt_details={}
    for receipt in receipts:
        filename=receipt_path(receipt)
        if not filename: continue
        if filename in receipt_map and receipt_map[filename]!=receipt['sha256']: raise ValueError('Conflicting acquisition receipt '+filename)
        receipt_map[filename]=receipt['sha256']
        receipt_details.setdefault(filename,{}).update(receipt)
    for filename,expected in receipt_map.items():
        path=(ROOT/filename).resolve()
        if not path.is_relative_to(ROOT): raise ValueError('Snapshot path escapes repository')
        if path.exists() and sha(path)!=expected: raise ValueError('Changed acquisition snapshot '+filename)
    output['receipts']=[{**receipt_details[k],'file':k,'sha256':v} for k,v in sorted(receipt_map.items())]
    comparisons=defaultdict(list); resolved=[]
    for record in records:
        record={**record,'precision':record.get('precision','year'),'calendar':record.get('calendar','historical')}
        errors=validate_record(record,index,sources,receipt_map)
        if errors: output['rejected'].append({'record':record,'reasons':errors}); continue
        peers,reason=compatible_peers(record,byperson,byname,sources)
        contrary,contrary_reason=compatible_peers(record,contrary_person,contrary_name,sources)
        combined={json.dumps([p['assertion']['sourceId'],p['assertion']['sourceRecordId'],fields(p['assertion'])],sort_keys=True):p for p in [*peers,*contrary]}
        resolved.append((record,list(combined.values()),reason or contrary_reason))
        comparable=[p for p in peers if p['assertion'].get('precision')==record['precision']
          and year(p['assertion'].get('from')) and year(p['assertion'].get('to'))]
        if comparable: comparisons[record['sourceId']].append((record,comparable))
    sampled={}
    for sid,pairs in comparisons.items():
        sample=select_sample(pairs)
        sampled[sid]={record['sourceRecordId'] for record,_ in sample}
        if sid in output['sources']:
            output['sources'][sid]['review']={'method':'sampled','sampleRecordIds':[record['sourceRecordId'] for record,_ in sample],
             'samplingNote':'Deterministic SHA256 ordering of source record IDs, round-robin across polity/office strata with independently identifiable benchmarks, up to 30 records. Selection uses identity/office before date agreement; every selected failure remains in the denominator. Unbenchmarked regions are not a statistical accuracy guarantee.'}
    matched_ids=set(); imported_ids=set()
    for record,peers,reason in resolved:
        claim=make_claim(record,peers)
        superseded={p['claim']['id'] for p in peers if p['claim']['from']==record['from']
          and p['claim']['to'] is None and year(record['to'])
          and any(a.get('ongoing') is True and year(a.get('asOf')) and a['asOf']<=record['to'] for a in p['claim'].get('assertions',[]))}
        if superseded:
            claim['supersedes']=sorted(superseded)
            claim['supersessionNote']='Same independently identified person, exact accession year and compatible office ('+record['role']+'); the new explicit end replaces a source observation cutoff, not a previously asserted departure.'
        contrary=[a for a in claim['assertions'][1:] if any(year(a.get(field)) and a.get(field)!=claim.get(field) for field in ('from','to'))]
        if contrary:
            output['conflicts'].append({'claim':claim,'reason':'Known independent tenure-year disagreement; not automatically reconciled.'}); continue
        equivalent=[p['claim'] for p in peers if p['claim']['from']==record['from'] and p['claim']['to']==record['to']]
        # Also suppress exact repeated source IDs inherited from existing sources.
        same_id=record['id'] in baseline_set
        duplicate=bool(equivalent or same_id)
        if duplicate: output['duplicates'].append({'id':record['id'],'existingIds':sorted({c['id'] for c in equivalent} | ({record['id']} if same_id else set())),'reason':'Same person, compatible office, jurisdiction and exact tenure; existing accepted row preserved.'})
        if peers:
            # Checks need exactly equal observation precision, not just an equal
            # pair of numbers. Other precision values stay in the input audit.
            eligible=[a for a in claim['assertions'][1:] if fields(a)==fields(claim['assertions'][0])]
            if eligible:
                claim['assertions']=[claim['assertions'][0],*eligible]
                if duplicate: claim['checksOnly']=True
                output['matched'].append(claim); matched_ids.add(claim['id'])
                continue
        if duplicate: continue
        if reason.startswith('multiple independently'):
            output['candidateDuplicates'].append({'claim':claim,'reason':reason}); continue
        # Source review admission is derived by the JS model/build, never by an
        # adapter-owned accepted flag. Unknown source quality remains withheld.
        claim['assertions']=[claim['assertions'][0]]
        output['imports'].append(claim); imported_ids.add(claim['id'])
    consolidate_imports(output)
    records_by_id={r['id']:r for r in records}
    for claim in [*output['imports'],*[c for c in output['matched'] if not c.get('checksOnly')]]:
        if claim['id'] in records_by_id: attach_comparative_chronology(claim,records_by_id[claim['id']])
    for sid,ids in sampled.items():
        matching={c['assertions'][0]['sourceRecordId'] for c in output['matched'] if c['assertions'][0]['sourceId']==sid}
        conflicting={c['claim']['assertions'][0]['sourceRecordId'] for c in output['conflicts'] if c['claim']['assertions'][0]['sourceId']==sid}
        output['reviewAudit'][sid]={'selected':len(ids),'matched':len(ids&matching),'conflicting':len(ids&conflicting),'unresolved':len(ids-matching-conflicting)}
    output['summary']={k:len(output[k]) for k in ('matched','imports','conflicts','rejected','duplicates','candidateDuplicates')}
    output['summary']['inputs']=found; output['summary']['records']=len(records)
    destination=ROOT/'sources/rulers/broad-import.json'
    temporary=destination.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    temporary.replace(destination)
    print(json.dumps({**output['summary'],'reviewAudit':output['reviewAudit']}))


if __name__=='__main__': main()
