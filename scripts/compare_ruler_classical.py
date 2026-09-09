"""Extract museum chronology facts and compare independent scholarly chronology.

The Met snapshots are explicitly web-tool text extractions (HTTP download was
rate limited), retaining the published line numbers. DIR is original HTML.
Run offline against committed/cache receipts. No draft candidate dates are read.
"""
import hashlib
import html
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/classical'
MET_ROMAN = 'https://www.metmuseum.org/toah/hd/roru/hd_roru.htm'
MET_BYZ = 'https://www.metmuseum.org/toah/hd/byru/hd_byru.htm'
DIR = 'https://roman-emperors.sites.luc.edu/impindex.htm'
ROMAN, WEST, EAST, BYZ, NICAEA = 'nm:romanempire', 'wd:Q42834', 'nm:easternromanempire', 'wd:Q112039853', 'wd:Q181254'


def digest(path):
    return {'path':str(path.relative_to(ROOT)), 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}


def clean(value):
    value = re.sub(r'cite[^†]*†([^]*)', r'\1', value)
    value = re.sub(r'\(\s*[\d.]+[a-z]?\s*\)', '', value)
    return ' '.join(html.unescape(value).split()).strip()


def web_lines(text):
    return {int(m[1]):clean(m[2]) for m in re.finditer(r'L(\d+): (.*?)(?=L\d+: |\Z)', text, re.S)}


def dates(value):
    # Only explicit year / year-range values. Never turn uncertain notation into
    # exact dates, infer an accession from a death date, or use dynasty dates.
    m = re.fullmatch(r'(\d+)(?:\s*(B\.C\.|A\.D\.))?\s*(?:[–-]\s*(\d+))?\s*(A\.D\.)?', value)
    if not m: return None
    start, end = int(m[1]), int(m[3] or m[1])
    if m[2] == 'B.C.': start = -start
    if start > end: return None
    return start, end


def canonical(name):
    name = unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()
    name = re.sub(r'^with ', '', name)
    # Alternate Latin spellings explicitly supplied in the museum table.
    trans = {'constantios':'constantius','theodosios':'theodosius','arkadios':'arcadius',
      'basiliscos':'basiliscus','anastasios':'anastasius','tiberios':'tiberius',
      'phokas':'phocas','herakleios':'heraclius','herakleonas':'heraclonas',
      'heracleonas':'heraclonas','leontios':'leontius','philippicos':'philippicus',
      'nikephoros':'nicephorus','stauracios':'stauracius','theophilos':'theophilus',
      'romanos':'romanus','alexios':'alexius','andronikos':'andronicus'}
    for a,b in trans.items(): name = re.sub(r'\b'+a+r'\b',b,name)
    name = re.sub(r'\([^)]*\)', '',name)
    name = re.sub(r'\s+alone$', '',name)
    # Individually inspected spelling/abbreviation aliases, NOT year-based IDs.
    aliases = {'gaius germanicus':'caligula','gaius':'caligula','l. verus':'lucius verus',
       'septimius':'septimius severus','antoninus':'caracalla','alexander severus':'severus alexander',
       'maximinus i':'maximinus thrax','trajan decius':'decius','aemilius aemilianus':'aemilianus',
       'claudius ii, gothicus':'claudius ii','constans':'constans i','valentinian':'valentinian i',
       'constantinius iii':'constantius iii','john':'johannes','severus iii':'libius severus',
       'leo':'leo i','anastasius':'anastasius i','justin':'justin i','phocas i':'phocas',
       'bardanes':'philippicus','heracleonas':'heraclonas'}
    name = ' '.join(name.split()).strip(' ,')
    name = aliases.get(name,name)
    # Imperial given name plus regnal ordinal is unique within these explicitly
    # mapped jurisdictions. Match only if the resulting candidate is unique.
    ordinal = re.match(r'^([a-z]+)\s+([ivx]+)\b',name)
    if ordinal: return ordinal[1]+' '+ordinal[2]
    return name


def met_records():
    whole = (CACHE/'met-web-extract.txt').read_text()
    byztext, romantext = whole.split('www.metmuseum.org ('+MET_ROMAN+')',1)
    pages = [('met-byzantine',MET_BYZ,web_lines(byztext),33,392,CACHE/'met-web-extract.txt'),
             ('met-roman',MET_ROMAN,{**web_lines(romantext),**web_lines((CACHE/'met-roman-tail-web-extract.txt').read_text())},71,505,CACHE/'met-roman-tail-web-extract.txt')]
    records=[]; held=[]
    for sid,url,lines,low,high,path in pages:
        prior=None; section=''; seen=set()
        for line in sorted(lines):
            if not low <= line <= high: continue
            text=lines[line]
            if not text: continue
            period=dates(text)
            if period and prior:
                nameline,name=prior
                if any(s in name for s in ('Dynasty','Emperors','Empire')): continue
                if 'Palmyrene' in section or 'Gallic' in section:
                    held.append({'sourceId':sid,'line':nameline,'name':name,'dates':text,'reason':'Regional empire scope is not the central Roman office.'}); continue
                if sid=='met-roman' and nameline>=473: continue # independently fuller Byzantine table covers these rows
                if name=='with Marcus Aurelius': continue # subset of an already listed full reign
                if name in ('Gordian I and II (in Africa)','Balbinus and Pupienus (in Italy)',
                            'Constantine III and Herakleonas (Heracleonas)', 'Zoë and Theodora',
                            'Isaac II (again) and Alexios IV Angelos (Alexius IV Angelus)'):
                    expansion={'Gordian I and II (in Africa)':['Gordian I','Gordian II'],
                      'Balbinus and Pupienus (in Italy)':['Balbinus','Pupienus'],
                      'Constantine III and Herakleonas (Heracleonas)':['Constantine III','Herakleonas (Heracleonas)'],
                      'Zoë and Theodora':['Zoë','Theodora'],
                      'Isaac II (again) and Alexios IV Angelos (Alexius IV Angelus)':['Isaac II','Alexios IV Angelos (Alexius IV Angelus)']}
                    names=expansion[name]
                else: names=[name]
                for display in names:
                    display=re.sub(r'^with ', '',display)
                    display=re.sub(r' \(again\)', '',display)
                    if display.startswith('Trebonianus Gallus'): display='Trebonianus Gallus'
                    if display.startswith('Diocletian'): display='Diocletian'
                    key=WEST if sid=='met-roman' and period[0]>=395 else ROMAN
                    if sid=='met-byzantine':
                        key=NICAEA if section=='Nicaean Emperors' else (ROMAN if period[1]<=395 else EAST if period[0]<633 else BYZ)
                        if key==ROMAN: continue # Roman table has its own jurisdiction scope
                    ident=(key,canonical(display),period)
                    if ident in seen: continue
                    seen.add(ident)
                    records.append({'sourceId':sid,'sourceRecordId':f'line-{nameline}:{canonical(display)}',
                      'locator':url+'#:~:text='+quote(name),'snapshot':digest(path),'line':nameline,
                      'name':display,'polityKey':key,'from':period[0],'to':period[1], 'rawName':name,'rawDates':text})
            elif not period:
                if ('Empire' in text or 'Emperors' in text or 'Dynasty' in text): section=text
                prior=(line,text)
    return records,held


def dir_records():
    raw=(CACHE/'dir-index.html').read_text(encoding='windows-1252')
    cells=re.findall(r'<td\b[^>]*>(.*?)</td>',raw,re.S|re.I)
    records=[]; jurisdiction=ROMAN
    for i in range(0,len(cells)-1,2):
        a,b=cells[i:i+2]
        value=clean(re.sub('<[^>]+>','',a)); body=clean(re.sub('<[^>]+>','',b))
        if 'PARTITION - WESTERN' in body: jurisdiction=WEST
        if 'PARTITION - EASTERN' in body: jurisdiction=EAST
        if 'Lascarid Dynasty in Nicaea' in body: jurisdiction=NICAEA
        if 'Dynasty of the Palaeologi' in body: jurisdiction=BYZ
        # DIR's abbreviated 218-22 denotes 218-222. No BCE sign is given for
        # Augustus, so that ambiguous row is held rather than silently repaired.
        if value=='218-22': value='218-222'
        period=dates(value)
        if not period: continue
        if 'PARTITION' in body: continue
        if jurisdiction==EAST and period[0]>=633: jurisdiction=BYZ
        pieces=[clean(re.sub('<[^>]+>','',p)) for p in re.split(r'<p\b[^>]*>|<br\s*/?>',b,flags=re.I)]
        pieces=[p for p in pieces if p]
        if pieces and 'Dynasty' in pieces[0]: pieces=pieces[1:]
        if not pieces: continue
        primary=pieces[0]
        for name in ([x.strip() for x in primary.split(' and ')] if primary=='Zoe and Theodora' else [primary]):
            records.append({'sourceId':'dir-index','sourceRecordId':f'cell-pair-{i//2}:{canonical(name)}',
             'locator':DIR+'#:~:text='+quote(name), 'snapshot':digest(CACHE/'dir-index.html'),
             'name':name,'polityKey':jurisdiction,'from':period[0],'to':period[1],'rawDates':value})
    return records


def achaemenid_records(out):
    path=CACHE/'achaemenid-web-extract.txt'
    if not path.exists(): return
    livius='https://www.livius.org/articles/dynasty/achaemenids/achaemenid-kings/'
    iranica='https://www.iranicaonline.org/articles/chronology-of-iranian-history-part-1/'
    left,right=path.read_text().split('Chronology of Iranian History Part 1 - Encyclopaedia Iranica',1)
    ll,il=web_lines(left),web_lines(right)
    out['sources']['livius-achaemenid']={'title':'Jona Lendering — Achaemenid Kings','url':livius,'lineage':'jona-lendering-livius','kind':'scholarly','admission':'candidate','checks':[], 'note':'Chronology based on named rulers and day-level document bounds; the quoted before/after wording is retained in audit rows.'}
    out['sources']['iranica-chronology']={'title':'Ehsan Yarshater — Chronology of Iranian History, Part1','url':iranica,'lineage':'encyclopaedia-iranica-editorial','kind':'scholarly','admission':'candidate','checks':[], 'note':'Used only for individually matched extracted observations. Numerous conflicts prevent broad source admission.'}
    # Line references are to explicit accession/death statements for the named
    # person; a successor accession alone NEVER supplies a previous reign end.
    event_pairs={'Cyrus':(81,91),'Cambyses II':(91,95),'Darius I the Great':(96,109),
      'Xerxes I':(109,118),'Artaxerxes I Makrocheir':(118,122),
      'Xerxes II':(122,124),'Artaxerxes III Ochus':(131,135),
      'Artaxerxes IV Arses':(135,137),'Darius III Codomannus':(137,147)}
    sid='livius-achaemenid'; sample=[]
    for line in range(16,51):
        if ' | ' not in ll.get(line,''): continue
        name,starttext=ll[line].split(' | ',1)
        endtext=ll[line+2] if ll.get(line+1)=='-' else starttext
        start=-int(re.findall(r'\d{3}',starttext)[-1]); end=-int(re.findall(r'\d{3}',endtext)[-1])
        shared={'personKey':'achaemenid:'+canonical(name).replace(' ','-'),'polityKey':'wd:Q389688','role':'King of Persia','precision':'year','calendar':'historical'}
        a={**shared,'sourceId':sid,'sourceRecordId':f'line-{line}','locator':livius+'#:~:text='+quote(name),'from':start,'to':end,'snapshot':digest(path),'imported':True}
        claim={'id':'achaemenid:'+canonical(name).replace(' ','-'),**{k:shared[k] for k in ('personKey','polityKey','role')},'name':name,'from':start,'to':end,'assertions':[a]}
        out['extractedRows'].append({'sourceId':sid,'line':line,'name':name,'from':start,'to':end,'rawDates':[starttext,endtext],'polityKey':shared['polityKey']})
        if name not in event_pairs:
            out['imports'].append(claim); continue
        sl,el=event_pairs[name]
        start_event,end_event=il[sl],il[el]
        b={**shared,'sourceId':'iranica-chronology','sourceRecordId':f'lines-{sl}-{el}',
           'locator':iranica+'#:~:text='+quote(start_event[:55]),'from':-int(re.match(r'\d+',start_event)[0]),'to':-int(re.match(r'\d+',end_event)[0]),'snapshot':digest(path),'imported':True}
        claim['assertions'].append(b); sample.append(a['sourceRecordId'])
        out['referenceRows'].append({'sourceId':'iranica-chronology','sourceRecordId':b['sourceRecordId'],'events':[start_event,end_event]})
        if (a['from'],a['to'])==(b['from'],b['to']): out['matched'].append(claim)
        else: out['conflicts'].append({'claim':claim,'reason':'Published accession/death years disagree; retained for review, no automatic tolerance.'})
    out['sources'][sid]['review']={'method':'sampled','sampleRecordIds':sample,'samplingNote':'Every ruler with explicit named accession AND death/end events in the independently retrieved chronology. Includes all disagreements; no successor-date extrapolation. Broad admission fails this sample.'}
    out['crosswalk']['wd:Q389688']={'scope':'Kings of Persia in the Achaemenid royal chronology; accession dates may precede the map polygon period.'}


def main():
    met,held=met_records(); refs=dir_records()
    byname=defaultdict(list)
    for ref in refs: byname[(ref['polityKey'],canonical(ref['name']))].append(ref)
    out={'schemaVersion':1,'status':'source_review_candidates','sources':{
      'met-roman':{'title':'The Metropolitan Museum of Art — List of Rulers of the Roman Empire','url':MET_ROMAN,'lineage':'metropolitan-museum-art','kind':'scholarly','admission':'candidate','checks':[], 'note':'Department of Greek and Roman Art, October2004. Original institution-authored chronology. Some sole-rule/co-rule dates and clear date disagreements are withheld; no open content license asserted.'},
      'met-byzantine':{'title':'The Metropolitan Museum of Art — List of Rulers of Byzantium','url':MET_BYZ,'lineage':'metropolitan-museum-art','kind':'scholarly','admission':'candidate','checks':[], 'note':'Department of Medieval Art and The Cloisters, October2003. Original institution-authored chronology. Repeated reigns retained where explicitly separated; no open content license asserted.'},
      'dir-index':{'title':'De Imperatoribus Romanis — The Imperial Index','url':DIR,'lineage':'de-imperatoribus-romanis-editorial','kind':'scholarly','admission':'candidate','checks':[],'note':'University-hosted scholar-written chronology. DIR describes peer review at https://roman-emperors.sites.luc.edu/startup.htm . Independent publisher fromMet; date disagreements retained. No open content license asserted.'}},
      'matched':[],'imports':[],'conflicts':[],'unmatched':held,'extractedRows':met,'referenceRows':refs,
      'crosswalk':{ROMAN:{'scope':'Roman emperors before the395partition; published accession periods include co-rule.'},WEST:{'scope':'Western Roman emperors after the395partition.'},EAST:{'scope':'Eastern Roman emperors whose reigns overlap395–632; full published tenures retained.'},BYZ:{'scope':'Byzantine emperors whose reigns overlap633onward; Nicaean rulers mapped separately; no rulers inferred after1453.'},NICAEA:{'scope':'Emperors explicitly listed under the Nicaean dynasty.'}}}
    samples=defaultdict(list)
    for record in met:
        key=record['polityKey']; person='classical:'+canonical(record['name']).replace(' ','-')
        # Person identity is independent of date; restoration tenure IDs include
        # start-year only AFTER names and the source jurisdiction have matched.
        shared={'personKey':person,'polityKey':key,'role':'Emperor','precision':'year','calendar':'historical'}
        def assertion(r):
            return {**shared,**{k:r[k] for k in ('sourceId','sourceRecordId','locator','snapshot','from','to')},'imported':True}
        a=assertion(record)
        claim={'id':f'{key}:{person}:{record["from"]}',**{k:shared[k] for k in ('personKey','polityKey','role')},'name':record['name'],'from':record['from'],'to':record['to'],'assertions':[a]}
        candidates=byname.get((key,canonical(record['name'])),[])
        if len(candidates)>1:
            exact=[r for r in candidates if r['from']==record['from'] and r['to']==record['to']]
            if len(exact)==1: candidates=exact
        if canonical(record['name'])=='john v' and record['from']==1341:
            out['conflicts'].append({'claim':claim,'reason':'The published interval aggregates interrupted reigns; DIR separately lists restoration in1379 and both sources list Andronikos IV1376–1379. Withheld to avoid implying continuous rule.'})
            continue
        if len(candidates)==1:
            b=assertion(candidates[0]); claim['assertions'].append(b)
            if (a['from'],a['to'])==(b['from'],b['to']):
                out['matched'].append(claim)
            else:
                out['conflicts'].append({'claim':claim,'reason':'Published tenure years disagree (may include co-rule vs sole-rule scope); withheld pending resolution.'})
            samples[record['sourceId']].append(claim)
        else:
            out['imports'].append(claim)
            out['unmatched'].append({'recordId':a['sourceRecordId'],'reason':'No unique independent name/jurisdiction match; source import only if sampled admission passes.'})
    # Every comparable extracted record is retained in the review denominator;
    # no sampling after seeing whether a date happens to agree.
    for sid,claims in samples.items():
        out['sources'][sid]['review']={'method':'sampled','sampleRecordIds':[c['assertions'][0]['sourceRecordId'] for c in claims],
          'samplingNote':'All uniquely name-and-jurisdiction comparable entries in this extraction; includes conflicts, no date-agreement selection. This convenience sample is not a statistical error-rate guarantee.'}
    # The atlas splits the same historical imperial institution in633. Its
    # incumbent Heraclius appears in both phase rosters without changing dates.
    for collection in ('matched','imports'):
        for claim in list(out[collection]):
            if claim['polityKey']==EAST and claim['from']<=633<=claim['to']:
                duplicate=json.loads(json.dumps(claim))
                duplicate['polityKey']=BYZ; duplicate['id']=duplicate['id'].replace(EAST,BYZ,1)
                for a in duplicate['assertions']:
                    a['polityKey']=BYZ; a['sourceRecordId']+=':atlas-phase-633'
                out[collection].append(duplicate)
    achaemenid_records(out)
    out['profileOverrides']={key:{'scope':v['scope'],'crosswalk':'Published source jurisdiction, explicitly mapped to the atlas name; map-year boundaries are not reign dates.'} for key,v in out['crosswalk'].items()}
    out['receipts']=[{**digest(p),'file':str(p.relative_to(ROOT)), 'bytes':p.stat().st_size,'format':'original-html' if p.suffix=='.html' else 'web-tool-text-extract'} for p in sorted(CACHE.glob('*')) if p.suffix in ('.html','.txt')]
    out['summary']={k:len(out[k]) for k in ('matched','imports','conflicts','unmatched','extractedRows','referenceRows')}
    out['summary']['byPolity']=dict(Counter(c['polityKey'] for c in out['matched']))
    target=ROOT/'sources/rulers/classical.json'; target.write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(out['summary']))


if __name__=='__main__': main()
