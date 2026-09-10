import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { applyIdentityAudit } from '../scripts/ruler_identity_merge.mjs';

function fixture() {
  const rows = ['a','b','c'].map(id => ({id, polityKey:'p', personKey:id, name:id, role:'Emperor', from:10,to:20,
    assertions:[{sourceId:id,sourceRecordId:id,personKey:id,from:10,to:20}],note:`Source note ${id}`}));
  const data={polities:{p:{rulers:rows}}};
  const report={accepted:rows.map(r=>({id:r.id,status:'source-reviewed'})),withheld:[]};
  const audit={summary:{},identities:rows.map(r=>({polityKey:'p',personKey:r.personKey,canonicalPerson:'wd:Q1'})),
    merges:[{polityKey:'p',canonicalPerson:'wd:Q1',ids:['a','b','c'],displayName:'Example I'}],conflicts:[],retainedDistinctTerms:[]};
  return {data,report,audit};
}

test('consolidation preserves original evidence and cannot manufacture corroboration',()=>{
  const {data,report,audit}=fixture();const originals=structuredClone(data.polities.p.rulers);
  applyIdentityAudit(data,report,audit);
  assert.equal(data.polities.p.rulers.length,1);
  const kept=data.polities.p.rulers[0];
  assert.deepEqual(kept.assertions,originals[0].assertions);
  assert.deepEqual(kept.mergedEvidence,originals.slice(1));
  assert.deepEqual(kept.aliases,['a','b','c']);
  assert.equal(report.accepted[0].status,'source-reviewed');
  assert.equal(report.identityAudit.removedDuplicates,2);
});

test('invalid or overlapping consolidation plans fail closed',()=>{
  for(const mutate of [f=>f.data.polities.p.rulers[1].to++,f=>f.audit.identities[1].canonicalPerson='wd:Q2',
    f=>f.audit.merges.push({...f.audit.merges[0]}),f=>f.audit.merges[0].ids=['a','a']]) {
    const f=fixture();mutate(f);assert.throws(()=>applyIdentityAudit(f.data,f.report,f.audit));
  }
});

test('an approximate source is not made definite by consolidating equal-year entries',()=>{
  const f=fixture();f.data.polities.p.rulers[1].precision='approximate';f.report.accepted[0].status='corroborated';
  applyIdentityAudit(f.data,f.report,f.audit);
  assert.equal(f.data.polities.p.rulers[0].id,'b');
  assert.equal(f.data.polities.p.rulers[0].precision,'approximate');
});

test('a newly discovered conflict also withholds its exact duplicate versions',()=>{
  const f=fixture();f.audit.conflicts=[{polityKey:'p',canonicalPerson:'wd:Q1',ids:['a','b']}];
  applyIdentityAudit(f.data,f.report,f.audit);
  assert.equal(f.data.polities.p.rulers.length,0);
  assert.equal(f.report.withheld.length,3);
});

const read = path => JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
test('Mughal alternate names produce one row per reign, retaining genuine restorations',()=>{
  const rows=read('docs/data/rulers.json').polities['wd:Q33296'].rulers;
  for(const [person,start,end] of [['wd:Q83672',1628,1658],['wd:Q8597',1556,1605],['wd:Q485547',1658,1707]]) {
    const found=rows.filter(r=>r.canonicalPerson===person&&r.from===start&&r.to===end);
    assert.equal(found.length,1,person);assert.ok(found[0].mergedEvidence.length>=2,person);
  }
  assert.equal(rows.filter(r=>/Humayun/i.test(r.name)).length,2);
  assert.ok(rows.some(r=>/Shah Jahan II/.test(r.name)));
  assert.ok(rows.some(r=>/Shah Jahan III/.test(r.name)));
});

test('every audited duplicate is consolidated or explicitly withheld across the full dataset',()=>{
  const data=read('docs/data/rulers.json'),audit=read('sources/rulers/identity-audit.json'),report=read('sources/rulers/accuracy-report.json');
  const rows=Object.values(data.polities).flatMap(p=>p.rulers),published=new Map(rows.map(r=>[r.id,r]));
  const held=new Set(report.withheld.filter(r=>r.family==='identity-audit').map(r=>r.claim.id));
  for(const group of audit.merges) {
    const visible=group.ids.filter(id=>published.has(id));
    assert.ok(visible.length<=1,group.ids.join(','));
    if(!visible.length)assert.ok(group.ids.every(id=>held.has(id)));
    else assert.deepEqual(new Set([visible[0],...published.get(visible[0]).mergedEvidence.map(r=>r.id)]),new Set(group.ids));
  }
  assert.equal(audit.summary.auditedReigns,rows.length+report.identityAudit.removedDuplicates+held.size);
  assert.equal(audit.summary.atlasPolities,Object.keys(data.polities).length);
  assert.ok(audit.summary.duplicateRows>1200);
  assert.ok(!data.polities['nm:empireofjapan'].rulers.some(r=>r.role==='Prime minister'&&/Taish|Shōwa/.test(r.name)));
});

test('the full identity audit reproduces offline and preserves every original merged observation',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ruler-identity-test-'));
  try {
    const input=path.join(dir,'input.json');
    const build=spawnSync(process.execPath,['scripts/build_rulers.mjs',`--audit-input=${input}`],{encoding:'utf8'});
    assert.equal(build.status,0,build.stderr);
    const raw=fs.readFileSync(input),audit=read('sources/rulers/identity-audit.json');
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),audit.inputSha256);
    const check=spawnSync('python3',['scripts/audit_ruler_duplicates.py','--input',input,'--check'],{encoding:'utf8'});
    assert.equal(check.status,0,check.stderr);
    const original=new Map(Object.values(JSON.parse(raw).polities).flatMap(p=>p.rulers).map(r=>[r.id,r]));
    for(const p of Object.values(read('docs/data/rulers.json').polities))for(const r of p.rulers) {
      assert.deepEqual(r.assertions,original.get(r.id).assertions);
      for(const evidence of r.mergedEvidence||[])assert.deepEqual(evidence,original.get(evidence.id));
    }
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
