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
    def test_duration_header_can_contain_dates_and_sequence_spans_tables(self):
        doc = html.fromstring('<div><h2>Rulers</h2><table class="wikitable">'
            '<tr><th>Personal name</th><th>Duration of reign</th></tr>'
            '<tr><td>1. Fixture king</td><td>386–400</td></tr>'
            '<tr><td>Fixture undated A</td><td>8 years</td></tr></table>'
            '<table class="wikitable"><tr><th>Name</th><th>Reign</th></tr>'
            '<tr><td>Fixture undated B</td><td>9 years</td></tr></table></div>')
        rows, _ = W.table_records(doc,'test','https://example.org',RECEIPT,allow_incomplete=True)
        self.assertEqual((rows[0]['name'],rows[0]['from'],rows[0]['to']),('Fixture king',386,400))
        self.assertLess(rows[1]['sourceSequence'],rows[2]['sourceSequence'])
        doc = html.fromstring('<div><h2>High Commissioners</h2><table class="wikitable">'
            '<tr><th>Name</th><th>Took office</th><th>Left office</th></tr>'
            '<tr><td>Fixture</td><td>21 December 1898</td><td>30 September 1906</td></tr></table></div>')
        rows, _ = W.table_records(doc,'test','https://example.org',RECEIPT,dedicated=True)
        self.assertEqual([(r['from'],r['to']) for r in rows],[(1898,1906)])

    def test_split_office_columns_ignore_duration_and_life_dates(self):
        # French presidency tables use a multi-row Term header; Palmyra uses
        # Ruler From/Until. These fixtures isolate the observed column layouts.
        doc = html.fromstring('<div><h2>Presidents</h2><table class="wikitable">'
            '<tr><th rowspan="2">Name (Birth–Death)</th><th colspan="3">Term of office</th></tr>'
            '<tr><th>Took office</th><th>Left office</th><th>Time in office</th></tr>'
            '<tr><td><a href="/wiki/Fixture">Fixture</a> (1800–1880)</td>'
            '<td>1 January 1848</td><td>20 December 1852</td><td>4 years</td></tr></table></div>')
        rows, _ = W.table_records(doc,'test','https://en.wikipedia.org/wiki/Fixture',RECEIPT,dedicated=True)
        self.assertEqual([(r['name'],r['from'],r['to']) for r in rows],[('Fixture',1848,1852)])
        doc = html.fromstring('<div><h2>House of Fixture</h2><table class="wikitable">'
            '<tr><th>Name</th><th>Ruler From</th><th>Ruler Until</th><th>Notes</th></tr>'
            '<tr><td>Fixture</td><td>260</td><td>267</td><td></td></tr>'
            '<tr><td>Claimant</td><td>267</td><td>267</td><td>No evidence exists for his reign</td></tr></table></div>')
        rows, held = W.table_records(doc,'test','https://example.org',RECEIPT,dedicated=True)
        self.assertEqual([(r['from'],r['to']) for r in rows],[(260,267)])
        self.assertEqual(held[0]['reason'],'historicality-needs-review')

    def test_header_bce_excludes_reign_lengths_and_alternate_names_resolve(self):
        doc = html.fromstring('<div><h2>Kings</h2><table><tr><th>Name</th><th>Reign (years)</th><th>Approx. BCE</th></tr>'
            '<tr><td>Fixture</td><td>52</td><td>544–492</td></tr></table></div>')
        rows, _ = W.table_records(doc,'test','https://example.org',RECEIPT)
        self.assertEqual([(r['from'],r['to'],r['precision']) for r in rows],[(-544,-492,'approximate')])
        doc = html.fromstring('<div><h2>Rulers</h2><table><tr><th>Horus name</th><th>Throne name</th><th>Reign</th></tr>'
            '<tr><td>Fixture Horus</td><td><a href="/wiki/Fixture">Fixture common name</a></td><td>28 years</td></tr></table></div>')
        rows, _ = W.table_records(doc,'test','https://en.wikipedia.org/wiki/Fixture',RECEIPT,allow_incomplete=True)
        self.assertEqual(rows[0]['name'],'Fixture common name')
        self.assertIn('Fixture Horus',rows[0]['aliases'])

    def test_egypt_name_colspan_is_a_person_but_asterisk_is_not_an_admission(self):
        doc = html.fromstring('<div><h2>Old Kingdom</h2><table><tr><th>#</th><th>Personal name</th><th>Throne name</th><th>Notes</th><th>Reign</th></tr>'
            '<tr><td>1</td><td colspan="2">Fixture king</td><td></td><td>8 years</td></tr>'
            '<tr><td>*</td><td colspan="2">Fixture possible queen</td><td>Office interpretation uncertain</td><td>–</td></tr>'
            '<tr><th colspan="5">Next dynasty</th></tr></table></div>')
        rows, held = W.table_records(doc,'wd:Q177819','https://example.org',RECEIPT,allow_incomplete=True)
        self.assertEqual([r['name'] for r in rows],['Fixture king'])
        self.assertEqual(rows[0]['from'],None)
        self.assertIn('office/historicality',held[0]['reason'])

    def test_dedicated_list_excludes_navigation_and_office_labels(self):
        doc = html.fromstring('<div><h2>Contents</h2><nav><ul><li><a href="#dynasty">1 Fixture dynasty (1200–1300)</a></li></ul></nav>'
            '<div class="vector-toc"><ul><li>2.1 Fixture branch (1200–1300)</li></ul></div>'
            '<h2>Partial list of rectors</h2><ul><li>1505 - 1506 Fixture rector</li>'
            '<li><a href="/wiki/Province">a province</a> (1510–1515)</li>'
            '<li>Provisional Government (1600–1601)</li></ul>'
            '<h2>Office title</h2><ul><li>President of the Executive Power (1873–1874)</li></ul></div>')
        rows, _ = W.list_records(doc,'test','https://en.wikipedia.org/wiki/List_of_rectors_of_Fixture',RECEIPT,dedicated=True)
        self.assertEqual([(r['name'],r['role'],r['from'],r['to']) for r in rows],[('Fixture rector','Rector',1505,1506)])

    def test_incomplete_source_dates_require_explicit_scope_and_keep_missing_bounds(self):
        doc = html.fromstring('<div><h2>Rulers</h2><table class="wikitable">'
            '<tr><th>Ruler</th><th>Reign</th><th>Notes</th></tr>'
            '<tr><td>Fixture A</td><td>?–665 BC</td><td></td></tr>'
            '<tr><td>Fixture B</td><td>fl. c. 640 BC</td><td></td></tr>'
            '<tr><td>Fixture C</td><td>28–29 years</td><td></td></tr>'
            '<tr><td>Fixture D</td><td>1410s–?</td><td></td></tr>'
            '<tr><td>Fixture E</td><td>200–100</td><td></td></tr>'
            '<tr><td>Fixture F</td><td>?</td><td>Historicity uncertain</td></tr></table></div>')
        self.assertEqual(W.table_records(doc,'test','https://example.org',RECEIPT)[0], [])
        rows, _ = W.table_records(doc,'test','https://example.org',RECEIPT,allow_incomplete=True)
        self.assertEqual([(r['from'],r['to']) for r in rows], [(None,-665),(None,None),(None,None),(None,None)])
        self.assertTrue(all(r['dateStatus']=='incomplete' and r['sourceDateText'] for r in rows))
        self.assertIsNone(W.dates('before 500–510'))

    def test_single_year_reign_and_separate_bounds_are_explicit(self):
        doc = html.fromstring('<div><h2>Kings</h2><table class="wikitable">'
            '<tr><th>King</th><th>Reign</th></tr><tr><td>Fixture king</td><td>499 BC</td></tr>'
            '<tr><td>Fixture second king</td><td>28–29 years</td></tr></table></div>')
        rows, _ = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
        self.assertEqual([(r['from'],r['to']) for r in rows], [(-499,-499)])
        doc = html.fromstring('<div><h2>Rulers</h2><table><tr><th>Name</th><th>From</th><th>To</th></tr>'
            '<tr><td>Fixture</td><td>1900</td><td>1910</td></tr></table></div>')
        rows, _ = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
        self.assertEqual([(r['from'],r['to']) for r in rows], [(1900,1910)])

    def test_successions_in_bullets_exclude_biography_and_duration(self):
        doc = html.fromstring('<div><h2>List of rulers</h2><ul>'
            '<li><a href="/wiki/Fixture">Fixture king</a>, ruled 740–690 BC</li>'
            '<li>Fixture short reign (499–498 BC)</li>'
            '<li>Fixture biography (born 600–died 540 BC)</li>'
            '<li>Fixture uncertain (fl. 300–299 BC)</li>'
            '<li>Fixture duration (20–21 years)</li></ul>'
            '<h2>Notable people</h2><ul><li>Fixture person (1800–1880)</li></ul></div>')
        rows, _ = W.list_records(doc, 'test', 'https://en.wikipedia.org/wiki/Fixture_state', RECEIPT)
        self.assertEqual([(r['name'],r['from'],r['to']) for r in rows],
                         [('Fixture king',-740,-690),('Fixture short reign',-499,-498)])

    def test_plain_cao_table_and_chen_header_supply_bce(self):
        # Formats observed in Cao_(state), "Rulers of Cao", and Chen_(state),
        # "Table": BCE belongs to the column, not necessarily every data cell.
        for table_class in ['', ' class="wikitable"']:
            doc = html.fromstring('<div><h2>Rulers</h2><table' + table_class + '>'
                '<tr><th>King</th><th>Reign (BC)</th></tr>'
                '<tr><td>Fixture duke</td><td>754—745</td></tr>'
                '<tr><td>Fixture successor</td><td>707─706</td></tr></table></div>')
            rows, _ = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
            self.assertEqual([(r['from'], r['to']) for r in rows], [(-754, -745), (-707, -706)])

    def test_dates_are_office_dates_only_in_a_ruler_section(self):
        for role in ['Princes', 'Beys']:
            doc = html.fromstring(f'<div><h2>{role}</h2><table><tr><th>Name</th><th>Years</th></tr>'
                '<tr><td>Fixture ruler</td><td>1302–1320</td></tr></table></div>')
            rows, _ = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
            self.assertEqual(len(rows), 1)
        doc = html.fromstring('<div><h2>Family tree</h2><table><tr><th>Name</th><th>Reign</th></tr>'
            '<tr><td>Fixture ruler</td><td>1302–1320</td></tr></table></div>')
        self.assertEqual(W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)[0], [])

    def test_federation_members_and_subordinate_states_are_not_rulers(self):
        # German Confederation membership notes contain two dates and an office
        # word, while Myinsaing's Government table lists provincial rulers.
        doc = html.fromstring('<div><h2>Establishment and member states</h2><table class="wikitable">'
            '<tr><th>Category and country</th><th>Notes</th></tr>'
            '<tr><td>Prussia</td><td>Monarch: included from 1848 to 1851</td></tr></table></div>')
        self.assertEqual(W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)[0], [])
        doc = html.fromstring('<div><h2>Government</h2><table class="wikitable">'
            '<tr><th>State</th><th>Ruler</th><th>Title</th><th>Reign</th></tr>'
            '<tr><td>Prome</td><td>Fixture governor</td><td>Viceroy</td><td>1289–1323</td></tr></table></div>')
        rows, skipped = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
        self.assertEqual(rows, [])
        self.assertIn('jurisdiction', skipped[0]['reason'])

    def test_collapsed_succession_table_is_allowed_but_row_tradition_is_held(self):
        # House_of_Wittelsbach wraps its genuine succession table in a collapsed
        # container. Collapse is a presentation attribute, not historicality.
        doc = html.fromstring('<div><h2>Rulers</h2><table class="mw-collapsible"><tr><td>'
            '<table class="wikitable"><tr><th>Ruler</th><th>Reign</th><th>Notes</th></tr>'
            '<tr><td>Fixture A</td><td>1100–1120</td><td></td></tr>'
            '<tr><td>Fixture B</td><td>1120–1140</td><td>Legendary founder</td></tr>'
            '</table></td></tr></table></div>')
        rows, skipped = W.table_records(doc, 'test', 'https://example.org/table', RECEIPT)
        self.assertEqual([r['name'] for r in rows], ['Fixture A'])
        self.assertEqual(skipped[0]['reason'], 'historicality-needs-review')
        self.assertIsNone(W.dates('fl. c. 2120 – c. 2119 BC'))

    def test_mixed_prime_minister_and_emperor_columns_are_not_confused(self):
        doc = html.fromstring('<div><h2>Prime ministers</h2><table class="wikitable">'
                              '<tr><th>Prime minister Office</th><th>Term of office</th><th>Emperor Reign</th></tr>'
                              '<tr><td>Example minister</td><td>1911–1912</td><td>Taishō r. 1912–1926</td></tr></table></div>')
        rows, skipped = W.table_records(doc, 'test', 'https://example.org/list', RECEIPT, dedicated=True)
        self.assertEqual(rows, [])
        self.assertIn('office-column mapping', skipped[0]['reason'])

    def test_shared_monarchs_and_regents_heading_does_not_assert_regency(self):
        self.assertEqual(W.infer_role('Monarchs and regents / House of Bernadotte', ['Name', 'Reign'], 'Sovereign'), 'Sovereign')
        self.assertEqual(W.infer_role('Regents', ['Name', 'Reign'], 'Sovereign'), 'Regent')

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
