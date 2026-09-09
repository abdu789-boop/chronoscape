"""Offline regression cases derived from inspected Wikipedia table/infobox formats.

Run with the bundled Python (lxml required). Small markup fixtures exercise the
extractor; they are not new historical source records or production evidence.
"""
import sys
from pathlib import Path
import unittest

from lxml import html

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import fetch_ruler_wikipedia as W

RECEIPT = {'file': 'synthetic-test-fixture', 'sha256': '0' * 64}


def infobox(role, cells):
    rows = ''.join(f'<tr><th>{period}</th><td>{name}</td></tr>' for period, name in cells)
    return html.fromstring(f'<div><table class="infobox"><tr><th>{role}</th><td></td></tr>'
                           '<tr class="infobox-hiddenrow"><td></td></tr>' + rows + '</table></div>')


class WikipediaExtractionTests(unittest.TestCase):
    def test_shared_year_is_not_day_of_month(self):
        # List_of_Roman_emperors: Otho and Vitellius share their end year.
        self.assertEqual(W.dates('15 January – 16 April 69')[:2], (69, 69))
        self.assertEqual(W.dates('19 April – 20 December 69')[:2], (69, 69))
        self.assertEqual(W.dates('8 June 68 – 15 January 69')[:2], (68, 69))

    def test_bce_and_approximation_preserve_source_era(self):
        self.assertEqual(W.dates('247–211 BC')[:3], (-247, -211, 'year'))
        self.assertEqual(W.dates('c. 2334–2279 BC')[:3], (-2334, -2279, 'approximate'))
        self.assertEqual(W.dates('27 BC – 14 AD')[:2], (-27, 14))

    def test_ambiguous_or_open_bounds_are_not_invented(self):
        for value in ['958/64–985/6', 'c. 100–unknown', '2025–present', '0–20', '2300–1800']:
            self.assertIsNone(W.dates(value), value)

    def test_links_exclude_rank_title_and_tail(self):
        cell = html.fromstring('<td><a href="/wiki/Ratu">Ratu</a> '
                               '<a href="/wiki/Seru_Epenisa_Cakobau">Seru Epenisa Cakobau</a> and</td>')
        self.assertEqual(W.person_link(cell, 'https://en.wikipedia.org/wiki/Kingdom_of_Fiji')[0], 'Seru Epenisa Cakobau')
        cell = html.fromstring('<td><a href="/wiki/Marshal">Marshal</a> '
                               '<a href="/wiki/Philippe_P%C3%A9tain">Philippe Pétain</a></td>')
        self.assertEqual(W.person_link(cell, 'https://en.wikipedia.org/wiki/Vichy_France')[0], 'Philippe Pétain')

    def test_hidden_spacer_keeps_office_but_new_section_clears_it(self):
        doc = infobox('Emperor', [('321–298 BCE', '<a href="/wiki/Chandragupta_Maurya">Chandragupta</a>')])
        rows = W.infobox_records(doc, 'test:maurya', 'https://en.wikipedia.org/wiki/Maurya_Empire', RECEIPT)
        self.assertEqual([(r['name'], r['from'], r['to'], r['role']) for r in rows], [('Chandragupta', -321, -298, 'Emperor')])
        doc = infobox('Population', [('1000–1100', '500000')])
        self.assertEqual(W.infobox_records(doc, 'test', 'https://en.wikipedia.org/wiki/Test', RECEIPT), [])

    def test_joint_vacant_collective_contested_cells_are_not_single_people(self):
        for name in ['Vacant', 'Collective leadership', 'Hindenburg and Ludendorff',
                     'Contested between Lothair I and Louis the German']:
            doc = infobox('Leader', [('1940–1952', name)])
            self.assertEqual(W.infobox_records(doc, 'test', 'https://en.wikipedia.org/wiki/Test', RECEIPT), [], name)

    def test_legislative_or_deputy_office_is_not_a_ruler(self):
        for role in ['President of the Senate', 'Deputy Prime Minister', 'President of the National Assembly']:
            doc = infobox(role, [('2000–2004', 'Synthetic officeholder')])
            self.assertEqual(W.infobox_records(doc, 'test', 'https://en.wikipedia.org/wiki/Test', RECEIPT), [])

    def test_ottoman_caliphate_is_separate_from_political_succession(self):
        url = 'https://en.wikipedia.org/wiki/Ottoman_Empire'
        for dates, name in [('1517–1520', 'Selim I'), ('1922–1924', 'Abdülmecid II')]:
            doc = infobox('Caliph', [(dates, name)])
            self.assertEqual(W.infobox_records(doc, 'wd:Q12560', url, RECEIPT), [])
        doc = infobox('Sultan', [('1918–1922', 'Mehmed VI')])
        rows = W.infobox_records(doc, 'wd:Q12560', url, RECEIPT)
        self.assertEqual([(r['name'], r['from'], r['to']) for r in rows], [('Mehmed VI', 1918, 1922)])

    def test_heading_stack_does_not_leak_previous_dynasty(self):
        doc = html.fromstring('<div><h2>Goryeo</h2><h3>Kings</h3><table></table>'
                              '<h2>Joseon</h2><h3>Kings</h3><table></table></div>')
        self.assertEqual(W.heading(doc.xpath('.//table')[1]), 'Joseon / Kings')

    def test_explicit_scope_and_tradition_holds(self):
        self.assertEqual(W.PERIODS['nm:romanempire'], (-27, 394))
        self.assertIn('wd:Q201038', W.BLOCKED)
        self.assertIn('wd:Q6000379', W.BLOCKED)
        self.assertNotRegex('Mongol Empire (1206–1368) / Golden Horde', W.SCOPES['wd:Q12557'])

    def test_titular_shah_column_is_not_the_person_name(self):
        doc = html.fromstring('<div><h2>Rulers</h2><table class="wikitable">'
                              '<tr><th>Titular Name</th><th>Personal Name</th><th>Reign</th></tr>'
                              '<tr><td>Shah</td><td>Mohammad Shah I</td><td>1358–1375</td></tr></table></div>')
        rows, _ = W.table_records(doc, 'test', 'https://en.wikipedia.org/wiki/Bahmani_Sultanate', RECEIPT, dedicated=True)
        self.assertEqual(rows[0]['name'], 'Mohammad Shah I')

    def test_bohemia_table_does_not_import_another_ruling_part(self):
        doc = html.fromstring('<div><h2>Rulers</h2><table class="wikitable">'
                              '<tr><th>Ruler</th><th>Reign</th><th>Ruling part</th></tr>'
                              '<tr><td>Test ruler</td><td>1200–1210</td><td>Duchy of Olomouc</td></tr>'
                              '<tr><td>Test ruler</td><td>1200–1210</td><td>Kingdom of Bohemia</td></tr></table></div>')
        rows, _ = W.table_records(doc, 'wd:Q42585', 'https://en.wikipedia.org/wiki/List_of_Bohemian_monarchs', RECEIPT, dedicated=True)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['sourceJurisdiction'], 'Kingdom of Bohemia')

    def test_empty_temple_names_and_interregna_are_not_people(self):
        # Observed Later Jin/Yuan "temple name" placeholders and vacancies.
        placeholders = ['Did not exist', 'None, known either by his personal or era name',
                        'None, known by his personal name Other names Temple name: Ningzong',
                        'N/A', 'NA', 'No temple name', 'Interregnum']
        for value in placeholders:
            self.assertTrue(W.non_person_name(value), value)
            doc = html.fromstring('<div><h2>Rulers</h2><table class="wikitable">'
                                  '<tr><th>Ruler</th><th>Reign</th></tr>'
                                  f'<tr><td>{value}</td><td>942–947</td></tr></table></div>')
            rows, _ = W.table_records(doc, 'test', 'https://en.wikipedia.org/wiki/Later_Jin_(Five_Dynasties)', RECEIPT, dedicated=True)
            self.assertEqual(rows, [], value)
        self.assertFalse(W.non_person_name('Shi Chonggui'))
        self.assertFalse(W.non_person_name('Nader Shah'))


if __name__ == '__main__':
    unittest.main()
