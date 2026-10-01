import { folded, matchScore, parseYear } from './data.js';
import { getRulers } from './rulers.js';

/**
 * Search across polities (names and alternative names), places, accepted rulers
 * and years. Rulers become searchable once their optional download has arrived.
 * Each group keeps its full match count; callers decide how many rows to show.
 */
export function createSearch(atlas, { min = -3400, max = 2024 } = {}) {
  const places = atlas.cities.filter(city => city.s?.length).map(city => ({
    city, folded: folded(city.n), first: city.s[0][0], last: city.s.at(-1)[0],
    peak: Math.max(...city.s.map(point => point[1])),
  }));
  let rulerSource = null, rulers = [];

  function indexRulers(data) {
    const rows = [];
    for (const key of Object.keys(data?.polities || {})) {
      if (!atlas.byKey.has(key)) continue;
      for (const claim of getRulers(data, key, null).rulers) {
        rows.push({ key, polity: atlas.index[key]?.n || data.polities[key].name, claim, names: [claim.name, ...(claim.aliases || [])].map(folded) });
      }
    }
    return rows;
  }

  function prepare(rulerData) {
    if (rulerData && rulerData !== rulerSource) { rulers = indexRulers(rulerData); rulerSource = rulerData; }
  }

  function search(query, year, rulerData = null) {
    const needle = folded(query);
    const groups = { years: [], polities: [], places: [], rulers: [] };
    if (!needle) return groups;
    const parsed = parseYear(query);
    if (parsed !== null && parsed >= min && parsed <= max) groups.years.push({ type: 'year', year: parsed });
    groups.polities = atlas.search(query, year).map(entry => ({ type: 'polity', ...entry }));
    groups.places = places.flatMap(place => {
      const score = matchScore(place.folded, needle);
      return Number.isFinite(score) ? [{ type: 'place', ...place, score }] : [];
    }).sort((a, b) => a.score - b.score || b.peak - a.peak).map(({ score, ...place }) => place);
    if (rulerData) {
      prepare(rulerData);
      groups.rulers = rulers.flatMap(row => {
        const score = Math.min(...row.names.map(name => matchScore(name, needle)));
        return Number.isFinite(score) ? [{ type: 'ruler', ...row, score }] : [];
      }).sort((a, b) => a.score - b.score || (a.claim.from ?? Infinity) - (b.claim.from ?? Infinity))
        .map(({ score, names, ...row }) => row);
    }
    return groups;
  }
  // Indexing every accepted reign takes about a tenth of a second; callers can
  // do it while idle instead of on the first keystroke.
  search.prepare = prepare;
  return search;
}
