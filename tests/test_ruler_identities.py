"""Identity regressions; synthetic examples are not historical evidence."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import audit_ruler_duplicates as A

def row(id, person='wd:Q1', name='Example I', start=100, end=110, role='Emperor', **extra):
    return dict(id=id, polityKey='test:p', personKey=person, name=name, role=role,
                **{'from':start,'to':end}, assertions=[], **extra)

def audit(rows, evidence=None, review=None):
    return A.prepare({'polities':{'test:p':{'name':'Test','rulers':rows}}},
                     evidence or {'pages':{},'people':{}}, review or {})

class IdentityTests(unittest.TestCase):
    def test_redirects_and_regnal_aliases_consolidate(self):
        evidence={'pages':{'Alternate':{'qid':'Q1','pageId':7}},'people':{'Q1':{'label':'Example I','aliases':['Personal Name']}}}
        result=audit([row('a'),row('b','https://en.wikipedia.org/wiki/Alternate','Other name'),
                      row('c','source:unlinked','Personal Name')], evidence)
        self.assertEqual(result['summary']['duplicateRows'],2)

    def test_matching_dates_or_homonyms_do_not_establish_identity(self):
        self.assertFalse(audit([row('a','wd:Q1'),row('b','wd:Q2')])['merges'])
        self.assertFalse(audit([row('a','source:a','Alice'),row('b','source:b','Bob')])['merges'])

    def test_regnal_numbers_survive_parenthetical_aliases(self):
        self.assertNotIn('theodosius', A.variants('Theodosios (Theodosius) II'))
        self.assertIn('theodosius ii', A.variants('Theodosios (Theodosius) II'))
        self.assertFalse(audit([row('a',name='Theodosius I'),row('b','source:b','Theodosios (Theodosius) II')])['merges'])

    def test_restorations_and_different_offices_remain(self):
        self.assertFalse(audit([row('a'),row('b',start=112,end=120)])['merges'])
        self.assertFalse(audit([row('a',role='President'),row('b',role='Prime minister')])['merges'])

    def test_generic_office_cannot_bridge_distinct_offices(self):
        result=audit([row('a',role='President'),row('b',role='Prime minister'),row('c',role=A.EFFECTIVE)])
        self.assertEqual(result['summary']['duplicateRows'],1)
        self.assertFalse(any({'a','b'} <= set(g['ids']) for g in result['merges']))

    def test_separate_day_dated_terms_and_ambiguous_year_only_record(self):
        rows=[row('a',end=100,sourceDates={'from':'100-01-01','to':'100-03-01'}),
              row('b',end=100,sourceDates={'from':'100-06-01','to':'100-09-01'}),row('c',end=100)]
        # The production signed ISO form has at least four year digits.
        for r in rows[:2]:r['sourceDates']={k:'0'+v for k,v in r['sourceDates'].items()}
        self.assertFalse(audit(rows)['merges'])

    def test_scoped_title_equivalence_does_not_leak(self):
        rows=[row('a',role='Vali'),row('b',role='Emir')]
        review={'officeEquivalences':[{'polityKey':'test:p','roles':['Vali','Emir']}]}
        self.assertEqual(audit(rows,review=review)['summary']['duplicateRows'],1)
        review['officeEquivalences'][0]['polityKey']='another:p'
        self.assertFalse(audit(rows,review=review)['merges'])

    def test_overlapping_chronology_conflict_is_not_silently_merged(self):
        result=audit([row('a'),row('b',start=101)])
        self.assertEqual(len(result['conflicts']),1)
        self.assertFalse(result['merges'])

    def test_duplicate_metadata_does_not_promote_source_status(self):
        self.assertNotIn('checks',audit([row('a'),row('b')]))

    def test_display_prefers_canonical_article_over_unreviewed_label(self):
        evidence={'pages':{},'people':{'Q1':{'label':'Bad metadata label','wikipedia':'Example I'}}}
        self.assertEqual(audit([row('a'),row('b')],evidence)['merges'][0]['displayName'],'Example I')

if __name__=='__main__':unittest.main()
