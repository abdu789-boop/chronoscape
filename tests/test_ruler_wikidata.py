"""Adversarial term extraction cases; synthetic statements, not source evidence."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('ruler_wikidata', Path(__file__).resolve().parents[1] / 'scripts/prepare_ruler_wikidata.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def time(year, precision=9, calendar='Q1985786'):
    return {'datavalue': {'value': {'time': f'{year:+05d}-00-00T00:00:00Z', 'precision': precision,
            'calendarmodel': f'http://www.wikidata.org/entity/{calendar}', 'before': 0, 'after': 0}}}


def statement(start=-247, end=-211):
    return {'qualifiers': {'P580': [time(start)], 'P582': [time(end)]}}


class WikidataTerms(unittest.TestCase):
    def test_plain_route_cannot_bypass_a_qualified_matching_position(self):
        position = statement(2019, 2023)
        position['mainsnak'] = {'datavalue': {'value': {'id': 'QsyntheticOffice'}}}
        position['qualifiers']['P5102'] = [{'datavalue': {'value': {'id': 'QsyntheticActing'}}}]
        person = {'claims': {'P39': [position]}}
        dates = {'from': 2019, 'to': 2023}
        self.assertTrue(module.qualified_position_overlap(person, {'QsyntheticOffice'}, dates))
        self.assertFalse(module.qualified_position_overlap(person, {'QunrelatedOffice'}, dates))
        self.assertFalse(module.qualified_position_overlap(person, {'QsyntheticOffice'}, {'from': 2010, 'to': 2015}))

    def test_generic_titles_cannot_reverse_map_foreign_people(self):
        def entity(label): return {'labels': {'en': {'value': label}}}
        for title in ['king', 'mayor', 'King of Kings', 'prime minister']:
            self.assertFalse(module.specific_office(entity(title)))
        self.assertTrue(module.specific_office(entity('king of Kent')))

    def test_json_bce_does_not_apply_rdf_year_offset(self):
        result = module.term(statement())
        self.assertEqual((result['from'], result['to']), (-247, -211))
        self.assertEqual(module.time_value(time(-1))[0], -1)

    def test_year_zero_and_unknown_calendars_are_rejected(self):
        self.assertIsNone(module.time_value(time(0)))
        self.assertIsNone(module.time_value(time(1500, calendar='unsupported')))

    def test_lifespans_cannot_supply_rule(self):
        self.assertIsNone(module.term({'qualifiers': {'P569': [time(100)], 'P570': [time(150)]}}))

    def test_missing_end_is_not_ongoing(self):
        self.assertIsNone(module.term({'qualifiers': {'P580': [time(2020)]}}))

    def test_multiple_dates_are_not_collapsed(self):
        value = statement()
        value['qualifiers']['P580'].append(time(-246))
        self.assertIsNone(module.term(value))

    def test_decade_is_not_an_exact_year(self):
        self.assertIsNone(module.time_value(time(1950, precision=8)))

    def test_circa_is_preserved_but_dispute_requires_review(self):
        value = statement()
        value['qualifiers']['P1480'] = [{'datavalue': {'value': {'id': 'Q5727902'}}}]
        self.assertEqual(module.term(value)['precision'], 'approximate')
        value['qualifiers']['P1480'][0]['datavalue']['value']['id'] = 'Q18912752'
        self.assertIsNone(module.term(value))

    def test_bounds_partial_jurisdiction_and_reversed_terms_are_held(self):
        for prop in ['P1319', 'P1326', 'P518']:
            value = statement()
            value['qualifiers'][prop] = [time(-248)]
            self.assertIsNone(module.term(value))
        self.assertIsNone(module.term(statement(-211, -247)))


if __name__ == '__main__':
    unittest.main()
