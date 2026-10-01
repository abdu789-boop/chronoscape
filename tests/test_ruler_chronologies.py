"""Source-format regressions; synthetic fixture names never become evidence."""
import sys
from pathlib import Path
import unittest
from lxml import html

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import fetch_ruler_chronologies as C

URL = C.wiki.canonical_url('List_of_state_leaders_in_the_15th_century')
RECEIPT = {'file': 'synthetic-test-fixture', 'sha256': '0' * 64}
JURISDICTION = C.wiki.canonical_url('Fixture_state')


class ChronologyTests(unittest.TestCase):
    def test_parsoid_sibling_roster_and_repeat_tenures(self):
        # The Wallachia/Ottoman lists use adjacent ul/dl and comma-separated
        # tenures, including multiple accessions in a single year.
        doc = html.fromstring('<div class="vector-toc-available"><ul><li>'
            '<a href="/wiki/Fixture_state">Fixture state</a></li></ul><dl><dd><ul>'
            '<li><a href="/wiki/Fixture_person">Fixture person</a>, Prince (1422–1426, 1427–1431)</li>'
            '<li>Fixture successor, Prince (1448, 1456–1462, 1476)</li>'
            '</ul></dd></dl></div>')
        rows, held, _ = C.extract_page(doc, URL, RECEIPT,
            {'fixture': {'n': 'Fixture state', 'first': 1400, 'last': 1500}}, {JURISDICTION: {'fixture'}})
        self.assertEqual([(r['from'], r['to']) for r in rows], [(1422,1426),(1427,1431),(1448,1448),(1456,1462),(1476,1476)])
        self.assertEqual(held, [])
        self.assertEqual(rows[0]['personKey'], C.wiki.canonical_url('Fixture_person'))

    def test_bce_context_and_no_unknown_endpoint_invention(self):
        self.assertEqual(C.intervals('754–745', True)[0][1][:2], (-754,-745))
        self.assertEqual(C.intervals('27 BC–14 AD')[0][1][:2], (-27,14))
        for raw in ['1410s', '?–1450', 'c. 1440', '100/101–120', '120–present', '0–20']:
            self.assertEqual(C.intervals(raw), [], raw)

    def test_citation_warning_and_claimant_are_held(self):
        for snippet in ['Fixture ruler, King (1400–1420)<sup class="Inline-Template">citation needed</sup>',
                        'Fixture legendary ruler, King (1400–1420)']:
            rows, reason = C.leader(html.fromstring('<li>'+snippet+'</li>'), URL, False)
            self.assertEqual(rows, [])
            self.assertTrue(reason)

    def test_overlap_does_not_assign_one_roster_to_two_branches(self):
        doc = html.fromstring('<div><ul><li><a href="/wiki/Fixture_state">Umbrella</a><ul>'
            '<li>Fixture person, King (1400–1450)</li></ul></li></ul></div>')
        index = {key: {'n': key, 'first': 1400, 'last': 1460} for key in ['East', 'West']}
        rows, held, _ = C.extract_page(doc, URL, RECEIPT, index, {JURISDICTION: set(index)})
        self.assertEqual(rows, [])
        self.assertIn('branch scope', held[0]['reason'])

    def test_atlas_bounds_filter_association_without_clipping_reign(self):
        doc = html.fromstring('<div><ul><li><a href="/wiki/Fixture_state">Fixture</a><ul>'
            '<li>Fixture person, King (1390–1420)</li>'
            '<li>Later person, King (1440–1450)</li></ul></li></ul></div>')
        rows, _, _ = C.extract_page(doc, URL, RECEIPT,
            {'fixture': {'n': 'Fixture', 'first': 1400, 'last': 1410}}, {JURISDICTION: {'fixture'}})
        self.assertEqual([(r['from'],r['to']) for r in rows], [(1390,1420)])

    def test_office_and_red_link_name_are_preserved(self):
        item = html.fromstring('<li><a class="new" href="/wiki/Fixture?action=edit">Fixture person</a>, Grand Vizier (1453–1456)</li>')
        rows, _ = C.leader(item, URL, False)
        self.assertEqual(rows[0]['role'], 'Grand Vizier')
        self.assertIsNone(rows[0]['personUrl'])
        self.assertEqual(C.leader(html.fromstring('<li>Fixture person, Deputy President (1453–1456)</li>'),URL,False)[0], [])


if __name__ == '__main__': unittest.main()
