"""Cross-reference cached Chinese chronologies without inventing dates or aliases.

Only unique name matches within an explicitly mapped dynasty are compared.
Unmatched people and disagreeing years remain in the review queue. Matching
by date/order alone is deliberately forbidden. Run fetch_ruler_china.py first.
"""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/raw/rulers/china'
# UCSD dynasty code -> source regime -> exact atlas identity. Unrepresented
# regimes are not attached to a nearby/larger state. Later Zhou's atlas identity
# spans 750 BCE–960 CE and is held out pending identity repair.
CROSSWALK = {
 '05a': ('qin', 'nm:qindynasty'),
 '06b': ('western-han', 'nm:handynasty'), '06c': ('xin', 'wd:Q504769'),
 '06d': ('eastern-han', 'nm:handynasty'),
 '07b': ('cao-wei', 'nm:caowei'), '07c': ('shu-han', 'wd:Q320925'), '07d': ('eastern-wu', 'nm:easternwu'),
 '08b': ('western-jin', 'wd:Q7352'),
 '09b': ('former-zhao', 'nm:formerzhao'), '09c': ('cheng-han', 'wd:Q1069905'),
 '09d': ('former-yan', 'nm:formeryan'), '09e': ('later-zhao', 'wd:Q2314907'),
 '09f': ('former-qin', 'nm:formerqin'), '09g': ('former-liang', 'wd:Q943392'),
 '09j': ('later-qin', 'wd:Q1730130'), '09k': ('later-yan', 'wd:Q1534482'),
 '10i': ('northern-wei', 'wd:Q875305'), '10j': ('eastern-wei', 'wd:Q307069'),
 '10k': ('western-wei', 'wd:Q1143164'), '10l': ('northern-qi', 'nm:northernqi'),
 '10m': ('northern-zhou', 'wd:Q551067'),
 '10c': ('liu-song', 'wd:Q49697'), '10d': ('southern-qi', 'wd:Q62456'),
 '10e': ('southern-liang', 'nm:liangdynasty'), '10g': ('chen', 'wd:Q62454'),
 '11a': ('sui', 'wd:Q7405'), '12a': ('tang', 'wd:Q9683'),
 '13b': ('later-liang', 'nm:laterliangdynasty'), '13c': ('later-tang', 'wd:Q1143126'),
 '13d': ('later-jin', 'wd:Q1154540'), '13e': ('later-han', 'wd:Q957429'),
 '14c': ('former-shu', 'wd:Q571453'), '14i': ('later-shu', 'wd:Q526507'),
 '14j': ('southern-tang', 'wd:Q1326742'),
 '15b': ('northern-song', 'nm:northernsong'), '15c': ('southern-song', 'nm:southernsong'),
 '16b': ('liao', 'wd:Q4958'), '16c': ('western-liao', 'wd:Q862304'), '17a': ('western-xia', 'nm:westernxia'),
 '18a': ('jin-jurchen', 'wd:Q5066'), '19a': ('yuan', 'nm:yuandynasty'),
 '20a': ('ming', 'wd:Q9903'), '21a': ('qing', 'wd:Q8733'),
}


class Tables(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows = []; self.row = []; self.cell = None
    def flush_cell(self):
        if self.cell is not None: self.row.append(' '.join(''.join(self.cell).split())); self.cell = None
    def flush_row(self):
        self.flush_cell()
        if self.row: self.rows.append(self.row); self.row = []
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.flush_row()
        if tag in ('td', 'th'): self.flush_cell(); self.cell = []
        if tag == 'br' and self.cell is not None: self.cell.append(' ')
    def handle_endtag(self, tag):
        if tag in ('td', 'th'): self.flush_cell()
        if tag == 'tr': self.flush_row()
    def handle_data(self, data):
        if self.cell is not None: self.cell.append(data)


# Japanese shinjitai / traditional forms, not semantic or personal-name aliases.
ORTHOGRAPHY = str.maketrans({'恵':'惠','霊':'靈','献':'獻','粛':'肅','廃':'廢','懐':'懷','顕':'顯','斉':'齊','徳':'德','禅':'禪','寧':'寧','厲':'厲'})
def chinese(value):
    return re.findall(r'[\u3400-\u9fff]+', (value or '').translate(ORTHOGRAPHY))


def main():
    corpus = json.loads((CACHE / 'emperors.json').read_text())
    index = json.loads((ROOT / 'docs/data/polity_index.json').read_text())
    extracted = []; headers = {}
    for path in sorted(CACHE.glob('dyn1*-u.html')):
        parser = Tables(); parser.feed(path.read_text()); parser.flush_row()
        for row in parser.rows:
            if len(row) not in (6, 7) or not re.fullmatch(r'\d\d[a-z]', row[0]): continue
            if row[1] == '0': headers[row[0]] = row; continue
            if not re.fullmatch(r'\d+', row[1]): continue
            if not all(re.fullmatch(r'-?\d+', val) for val in row[-2:]): continue
            extracted.append({'file':path.name,'code':row[0], 'number':int(row[1]), 'name':' '.join(row[3:-2]), 'from':int(row[-2]), 'to':int(row[-1]), 'raw':row})
    # Save all parsed headers so crosswalk jurisdiction checks are reviewable.
    output = {'schemaVersion':1,'status':'candidate_comparisons','crosswalk':{},'sources':{
      'emperor-stats': {'title':'中国皇帝統計 (Emperor Statistics), version ' + str(corpus['meta']['version']), 'url':'https://github.com/kotenbu135/emperor-stats', 'lineage':'emperor-stats-original-chronicle-compilation', 'kind':'reference', 'license':'CC BY 4.0', 'admission':'candidate', 'checks':[], 'note':'Individually compiled chronology citing Chinese histories; original personal project, not institutional review. Only independently matched rows may be admitted.'},
      'ucsd-jordan': {'title':'David K. Jordan — Table of Chinese Imperial Reigns', 'url':'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/dyn10-u.html','lineage':'david-jordan-chronology','kind':'scholarly','admission':'candidate','checks':[], 'note':'University-hosted scholarly chronology. Several year disagreements detected; source is usable only for individually cross-checked rows. Era years and accession years must not be conflated.'}
    },'matched':[], 'conflicts':[], 'unmatched':[], 'extractedRows':extracted}
    for code,(regime,key) in CROSSWALK.items():
        assert key in index, key
        output['crosswalk'][code] = {'regime':regime,'polityKey':key,'atlasName':index[key]['n'],'referenceHeader':headers.get(code), 'scope':'Emperors of '+regime.replace('-',' ')+'; accession and abdication/death years, excluding regents and posthumous emperors.'}
    for record in extracted:
        if record['code'] not in CROSSWALK: continue
        regime,key = CROSSWALK[record['code']]
        terms = set(chinese(record['name']))
        candidates = []
        for e in corpus['emperors']:
            if e['regimeId'] != regime: continue
            n=e['name']; aliases = [n.get('commonName'),n.get('posthumousName'),n.get('templeName'),(n.get('familyName') or '')+(n.get('personalName') or ''),*n.get('aliases',[])]
            names = {x for a in aliases for x in chinese(a) if len(x)>1}
            if terms & names: candidates.append(e)
        if len(candidates)!=1:
            output['unmatched'].append({'record':record,'polityKey':key,'reason':'No unique same-dynasty name match','candidates':[e['id'] for e in candidates]}); continue
        e=candidates[0]
        # Restoration periods match to the nearest tenure only AFTER unique name
        # identification. Equidistant / multiple equal periods remain unresolved.
        reigns=sorted(enumerate(e['reigns']),key=lambda x:abs(x[1]['startYear']-record['from']))
        if len(reigns)>1 and abs(reigns[0][1]['startYear']-record['from'])==abs(reigns[1][1]['startYear']-record['from']):
            output['unmatched'].append({'record':record,'polityKey':key,'reason':'Ambiguous restoration tenure'}); continue
        ri,reign=reigns[0]
        person='wd:'+e['sources']['wikidata'] if e['sources'].get('wikidata') else 'china:'+e['id']
        role='Emperor'; rawurl='https://raw.githubusercontent.com/kotenbu135/emperor-stats/main/data/emperors.json'
        shared={'personKey':person,'polityKey':key,'role':role,'precision':'year','calendar':'historical'}
        a={**shared,'sourceId':'emperor-stats','sourceRecordId':e['id']+':'+str(ri),'locator':rawurl+'#/emperors/'+str(corpus['emperors'].index(e))+'/reigns/'+str(ri),'from':reign['startYear'],'to':reign['endYear']}
        b={**shared,'sourceId':'ucsd-jordan','sourceRecordId':record['code']+'-'+str(record['number']),'locator':'https://pages.ucsd.edu/~dkjordan/chin/chinahistory/'+record['file']+'#d-'+record['code'][:2],'from':record['from'],'to':record['to']}
        roman = re.split(r'[\u3400-\u9fff]',record['name'])[0].strip()
        claim={'id':'china:'+e['id']+':'+str(ri),'polityKey':key,'personKey':person,'name':roman+' ('+e['name']['commonName']+')','role':role,'from':a['from'],'to':a['to'],'assertions':[a,b]}
        if (a['from'],a['to']) == (b['from'],b['to']):
            prior = next((item for item in output['matched'] if item['id']==claim['id']), None)
            if prior:
                # Jordan sometimes repeats one reign under a second name.
                assert prior['assertions'] == claim['assertions'], 'Non-identical duplicate source row'
                prior.setdefault('aliases', []).append(claim['name'])
            else: output['matched'].append(claim)
        else: output['conflicts'].append({'claim':claim,'reason':'Independent extracted tenure years disagree; no automatic ±1-year tolerance.'})
    output['receipts']=json.loads((CACHE/'receipts.json').read_text())
    output['summary']={k:len(output[k]) for k in ('matched','conflicts','unmatched','extractedRows')}
    target=ROOT/'sources/rulers/china.json'; target.write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(output['summary']))

if __name__=='__main__': main()
