import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function python(body) {
  const result = spawnSync('python3', ['-c', `import importlib.util\nspec=importlib.util.spec_from_file_location('broad','scripts/prepare_ruler_broad_import.py')\nm=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)\n${body}`], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('broad source samples are deterministic, stratified and independent of date agreement', () => python(`
rows=[({'sourceRecordId':str(i),'polityKey':'p'+str(i%3),'role':'Emperor','from':i+1,'to':i+2},[]) for i in range(12)]
a=m.select_sample(rows,6)
assert len({r['polityKey'] for r,_ in a})==3
for r,_ in rows: r['from']=-r['from']
b=m.select_sample(list(reversed(rows)),6)
assert [r['sourceRecordId'] for r,_ in a]==[r['sourceRecordId'] for r,_ in b]
rows.append((dict(rows[0][0]),[]))
c=m.select_sample(rows,30)
assert len(c)==len({r['sourceRecordId'] for r,_ in c})==12
`));

test('office alignment does not treat ceremonial monarchs or all heads of state as effective leaders', () => python(`
assert m.role_group('President of the United States','wd:Q30')==m.EFFECTIVE
assert m.role_group('Prime Minister of India','wd:Q668')==m.EFFECTIVE
assert m.role_group('King of the United Kingdom','wd:Q23666')!=m.EFFECTIVE
assert m.role_group('Head of state','wd:Q668')!=m.EFFECTIVE
assert m.role_group('President of India','wd:Q668')!=m.EFFECTIVE
assert m.role_group('Emperor of China','dynasty')==m.role_group('Emperor','dynasty')
`));

test('new imports require actual historical bounds and a recorded matching snapshot', () => python(`
record={'id':'one','personKey':'one','polityKey':'p','name':'One','role':'Emperor','from':-2,'to':2,'sourceId':'a','sourceRecordId':'a1','locator':'https://example.test/one','snapshot':{'path':'source.txt','sha256':'a'*64}}
assert m.validate_record(record,{'p':{}},{'a':{}},{'source.txt':'a'*64})==[]
for patch in [{'from':0},{'from':True},{'to':None},{'from':4},{'from':-500},{'polityKey':'q'},{'calendar':'astronomical'},{'snapshot':{'path':'source.txt','sha256':'b'*64}}]:
 assert m.validate_record({**record,**patch},{'p':{}},{'a':{}},{'source.txt':'a'*64})
assert not m.validate_record({**record,'to':None,'ongoing':True,'asOf':2024},{'p':{}},{'a':{}},{'source.txt':'a'*64})
`));

test('matching an accession episode retains contrary assertions of that same episode', () => python(`
record={'sourceId':'new','polityKey':'p','personKey':'one','name':'One','role':'Emperor','from':10,'to':20}
claim={'id':'episode-one','polityKey':'p','personKey':'one','name':'One','role':'Emperor'}
peers=[{'claim':claim,'assertion':{'sourceId':'a','sourceRecordId':'a1','from':10,'to':20}},{'claim':claim,'assertion':{'sourceId':'b','sourceRecordId':'b1','from':11,'to':20}}]
registry={'new':{'lineage':'new'},'a':{'lineage':'a'},'b':{'lineage':'b'}}
actual,reason=m.compatible_peers(record,{('p','one','Emperor'):peers},{},registry)
assert len(actual)==2 and not reason
`));

test('independent-lineage and homonym checks precede any convenient year match', () => python(`
record={'sourceId':'wiki','polityKey':'p','personKey':'new-key','name':'Alexander','role':'Emperor','from':10,'to':20}
def peer(person,lineage):
 return {'claim':{'id':person,'polityKey':'p','personKey':person,'name':'Alexander','role':'Emperor'},'assertion':{'sourceId':lineage,'sourceRecordId':person,'from':10,'to':20}}
registry={'wiki':{'lineage':'wikimedia'},'wd':{'lineage':'wikimedia'},'a':{'lineage':'independent'}}
assert not m.compatible_peers(record,{}, {('p','alexander','Emperor'):[peer('one','wd')]},registry)[0]
assert not m.compatible_peers(record,{}, {('p','alexander','Emperor'):[peer('one','a'),peer('two','a')]},registry)[0]
`));

test('day-dated separate episodes in one calendar year are not merged into one reign', () => python(`
a={'sourceDates':{'from':'2000-01-01','to':'2000-03-01'}}
b={'sourceDates':{'from':'+2000-06-01T00:00:00Z','to':'+2000-12-01T00:00:00Z'}}
assert m.separate_dated_episodes(a,b)
assert not m.separate_dated_episodes(a,{'sourceDates':{'from':'2000','to':'2000'}})
assert not m.separate_dated_episodes(a,{'sourceDates':{'from':'+2000-02-01T00:00:00Z','to':'+2000-04-01T00:00:00Z'}})
assert not m.separate_dated_episodes(a,{'sourceDates':'January to March 2000'})
`));

test('cross-input duplicate reigns retain both assertions without inventing independent provenance', () => python(`
def claim(id,person,source,role='Emperor'):
 return {'id':id,'polityKey':'p','personKey':person,'name':'Alexánder','role':role,'from':10,'to':20,'precision':'year','assertions':[{'sourceId':source,'sourceRecordId':id,'personKey':person,'role':role,'from':10,'to':20}]}
out={'imports':[claim('wp','wikipedia-person:alexander','wp'),claim('wd','wd:Q1','wd','Emperor of P')],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert len(out['imports'])==1 and len(out['duplicates'])==1
c=out['imports'][0]
assert len(c['assertions'])==2 and {a['sourceId'] for a in c['assertions']}=={'wp','wd'}
assert all(a['personKey']==c['personKey'] and a['role']==c['role'] for a in c['assertions'])
assert not out['matched']
# A name shared by two concrete identities is not enough to merge.
out={'imports':[claim('a','wd:Q1','wd'),claim('b','wd:Q2','wd')],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert len(out['imports'])==2
`));

test('overlapping contrary imports are withheld while separate restored terms survive', () => python(`
def claim(id,start,end,dates=None):
 return {'id':id,'polityKey':'p','personKey':'wd:Q1','name':'One','role':'King','from':start,'to':end,'precision':'year','sourceDates':dates,'assertions':[{'sourceId':id,'sourceRecordId':id,'personKey':'wd:Q1','role':'King','from':start,'to':end}]}
out={'imports':[claim('a',1260,1294),claim('b',1271,1294)],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert not out['imports'] and len(out['conflicts'])==1
assert {a['from'] for a in out['conflicts'][0]['claim']['assertions']}=={1260,1271}
out={'imports':[claim('a',10,20),claim('b',30,40)],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert len(out['imports'])==2 and not out['conflicts']
out={'imports':[claim('a',2000,2000,{'from':'2000-01-01','to':'2000-03-01'}),claim('b',2000,2000,{'from':'2000-06-01','to':'2000-12-01'})],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert len(out['imports'])==2 and not out['duplicates']
out={'imports':[claim('year-only',2000,2000),claim('a',2000,2000,{'from':'2000-01-01','to':'2000-03-01'}),claim('b',2000,2000,{'from':'2000-06-01','to':'2000-12-01'})],'matched':[],'conflicts':[],'duplicates':[]}
m.consolidate_imports(out)
assert len(out['imports'])==2 and len(out['candidateDuplicates'])==1
`));

test('comparative chronology imports preserve every printed alternative and the actual reference provenance', () => python(`
r={'id':'parthia-one','personKey':'one','polityKey':'wd:Q1986139','name':'One','role':'Monarch','from':-247,'to':-211,'precision':'approximate','calendar':'historical','sourceId':'wikipedia-ruler-lists','sourceRecordId':'table1:row3','locator':'https://example.test/table','snapshot':{'path':'table.html','sha256':'a'*64},'primaryChronology':'Daryaee (2012)','alternativeDates':[{'from':-247,'to':-217,'chronology':'Dąbrowa (2012)'}]}
c=m.make_claim(r);m.attach_comparative_chronology(c,r)
assert c['uncertainty']['basis']=='published-comparative-chronology'
assert {a['to'] for a in c['assertions']}=={-211,-217}
assert {a['sourceId'] for a in c['assertions']}=={'wikipedia-ruler-lists'}
assert {a['chronology'] for a in c['assertions']}=={'Daryaee (2012)','Dąbrowa (2012)'}
assert c['uncertainty']['evidence'][0]['sourceRecordIds']==[a['sourceRecordId'] for a in c['assertions']]
assert [a['to'] for a in c['uncertainty']['alternatives']]==[-211,-217]
# A generic conflicting row or guessed label is not enough to activate the route.
r.pop('primaryChronology'); c=m.make_claim(r);m.attach_comparative_chronology(c,r)
assert not c.get('uncertainty')
`));

test('inspected aliases align named people and office exceptions without guessing all Ottoman effective leaders', () => python(`
old={'polityKey':'wd:Q30','personKey':'archigos-person-id','role':m.EFFECTIVE,'assertions':[{'sourceId':'archigos-4.1','sourceRecordId':'USA-1933'}]}
new={'polityKey':'wd:Q30','personKey':'wd:Q8007','role':'President of the United States'}
assert m.identity_key(old)==m.identity_key(new)
assert m.record_role(old)==m.record_role(new)
old={'polityKey':'wd:Q12560','personKey':'islamic-atlas:130-007','role':'Sultan/Halife','assertions':[{'sourceId':'islamic-atlas','sourceRecordId':'130-007'}]}
new={'polityKey':'wd:Q12560','personKey':'https://en.wikipedia.org/wiki/Abdul_Hamid_II','role':'Sultan'}
assert m.identity_key(old)==m.identity_key(new) and m.record_role(old)==m.record_role(new)
archigos={'polityKey':'wd:Q12560','personKey':'archigos-person','role':m.EFFECTIVE,'sourceId':'archigos-4.1','sourceRecordId':'TUR-1913'}
assert m.record_role(archigos)!=m.record_role(new)
ford={'polityKey':'wd:Q30','personKey':'https://en.wikipedia.org/wiki/Gerald_Ford','role':'President'}
assert m.identity_key(ford)==m.identity_key({**ford,'personKey':'wd:Q9582'})
xuanzong={'polityKey':'wd:Q9683','personKey':'https://en.wikipedia.org/wiki/Emperor_Xuanzong_of_Tang','role':'Emperor'}
assert m.identity_key(xuanzong)==m.identity_key({**xuanzong,'personKey':'wd:Q9746'})
assert m.identity_key(xuanzong)!=m.identity_key({**xuanzong,'personKey':'wd:Q9825'})
wu={'polityKey':'nm:easternwu','personKey':'https://en.wikipedia.org/wiki/Sun_Hao','role':'King (222–229) Emperor (229–280)','from':264}
assert m.record_role(wu)=='Emperor'
assert m.record_role({**wu,'from':225})!='Emperor'
`));

test('a documented first reign is not sampled against the same person’s separately dated restoration', () => python(`
record={'sourceId':'new','polityKey':'p','personKey':'one','name':'One','role':'Sultan','from':1444,'to':1446}
claim={'id':'restoration','personKey':'one','polityKey':'p','name':'One','role':'Sultan','from':1451,'to':1481}
peer={'claim':claim,'assertion':{'sourceId':'old','sourceRecordId':'one-second-term','from':1451,'to':1481}}
registry={'new':{'lineage':'new'},'old':{'lineage':'old'}}
actual,reason=m.compatible_peers(record,{('p','one','Sultan'):[peer]},{},registry)
assert not actual
`));
