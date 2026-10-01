import { DATA_VERSIONS } from './data-version.js';

const CACHE_LIMIT = 32;

export function fmtYear(year) {
  if (!Number.isFinite(year) || year === 0) return '—';
  // Years take no thousands separator (1970 CE, 3400 BCE) unless they have five
  // or more digits (10,000 BCE). Areas and counts below keep their separators.
  const digits = Math.abs(Math.round(year));
  return `${digits >= 10000 ? digits.toLocaleString('en-US') : digits} ${year < 0 ? 'BCE' : 'CE'}`;
}

export function fmtArea(area) {
  if (!Number.isFinite(area) || area <= 0) return '—';
  return area >= 1e6
    ? `${(area / 1e6).toFixed(2)}M km²`
    : `${Math.round(area).toLocaleString('en-US')} km²`;
}

/** Areas written out for headline figures: "2.03 million km²". */
export function fmtAreaWords(area) {
  if (!Number.isFinite(area) || area <= 0) return '—';
  return area >= 1e6
    ? `${(area / 1e6).toFixed(2)} million km²`
    : `${Math.round(area).toLocaleString('en-US')} km²`;
}

export function fmtPop(population) {
  if (!Number.isFinite(population) || population < 1) return '—';
  if (population >= 1e9) return `${(population / 1e9).toFixed(2)}B`;
  if (population >= 1e6) return `${(population / 1e6).toFixed(population < 1e7 ? 2 : 1)}M`;
  if (population >= 1e3) return `${Math.round(population / 1e3)}k`;
  return String(Math.round(population));
}

/** Population written out for the timeline: "444.7 million". */
export function fmtPopulation(population) {
  if (!Number.isFinite(population) || population < 1) return '—';
  if (population >= 1e9) return `${(population / 1e9).toFixed(2)} billion`;
  if (population >= 1e6) return `${(population / 1e6).toFixed(1)} million`;
  return Math.round(population).toLocaleString('en-US');
}

/** Parse historical notation without silently accepting a nonexistent year zero. */
export function parseYear(input) {
  if (typeof input === 'number') return Number.isSafeInteger(input) && input !== 0 ? input : null;
  const text = String(input ?? '').trim().toUpperCase().replace(/−/g, '-')
    .replace(/B\.C\.E\.?/g, 'BCE').replace(/B\.C\.?/g, 'BC')
    .replace(/C\.E\.?/g, 'CE').replace(/A\.D\.?/g, 'AD');
  const match = text.match(/^(?:(BCE|BC|CE|AD)\s*)?([+-]?(?:\d{1,3}(?:,\d{3})+|\d+))(?:\s*(BCE|BC|CE|AD))?$/);
  if (!match || (match[1] && match[3])) return null;
  const number = Number(match[2].replaceAll(',', ''));
  if (!Number.isSafeInteger(number) || number === 0) return null;
  const era = match[1] || match[3];
  if ((era === 'CE' || era === 'AD') && number < 0) return null;
  return era === 'BCE' || era === 'BC' ? -Math.abs(number) : number;
}

/** Sorted data-change years; ties select the earlier map, matching the atlas. */
export function nearestYear(years, year) {
  if (!years.length || !Number.isFinite(year)) return null;
  const at = lowerBound(years, year);
  if (at === 0) return years[0];
  if (at === years.length) return years[at - 1];
  return year - years[at - 1] <= years[at] - year ? years[at - 1] : years[at];
}

function lowerBound(array, value, project = item => item) {
  let low = 0, high = array.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (project(array[mid]) < value) low = mid + 1;
    else high = mid;
  }
  return low;
}

function memoizedYear(compute) {
  const cache = new Map();
  return year => {
    if (cache.has(year)) {
      const result = cache.get(year);
      cache.delete(year);
      cache.set(year, result);
      return result;
    }
    const result = compute(year);
    cache.set(year, result);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return result;
  };
}

function interpolate(series, year) {
  if (!series?.length) return 0;
  if (year <= series[0][0]) return series[0][1];
  if (year >= series.at(-1)[0]) return series.at(-1)[1];
  const at = lowerBound(series, year, point => point[0]);
  if (series[at][0] === year) return series[at][1];
  const [firstYear, firstPop] = series[at - 1];
  const [lastYear, lastPop] = series[at];
  const weight = (year - firstYear) / (lastYear - firstYear);
  return firstPop > 0 && lastPop > 0
    ? Math.exp(Math.log(firstPop) * (1 - weight) + Math.log(lastPop) * weight)
    : firstPop + (lastPop - firstPop) * weight;
}

/** Accent- and punctuation-insensitive text used for every search comparison. */
export function folded(text) {
  return String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Rank one folded candidate against a folded query: 0 exact, 1 prefix,
 * 2 substring, 3 every word present, 3.5 shared word stem, Infinity no match.
 * The stem rule lets "byzantium" find "Byzantine Empire"; it needs six or more
 * letters so that short queries stay literal.
 */
export function matchScore(candidate, needle) {
  if (!needle) return Infinity;
  if (candidate === needle) return 0;
  if (candidate.startsWith(needle)) return 1;
  if (candidate.includes(needle)) return 2;
  const tokens = needle.split(' ');
  if (tokens.every(token => candidate.includes(token))) return 3;
  const words = candidate.split(' ');
  if (tokens.every(token => token.length >= 6 && words.some(word => word.startsWith(token.slice(0, Math.max(5, token.length - 2)))))) return 3.5;
  return Infinity;
}

// A city is drawn from its first population figure until 50 years after its
// last one. Inside a gap of more than 300 years between figures its presence is
// not recorded, so it is hidden rather than interpolated across the gap.
export const CITY_TRAILING_YEARS = 50;
export const CITY_MAX_GAP = 300;
export function cityPresent(series, year) {
  if (!series?.length || year < series[0][0] || year > series.at(-1)[0] + CITY_TRAILING_YEARS) return false;
  const at = lowerBound(series, year, point => point[0]);
  return at === 0 || at === series.length || series[at][0] === year || series[at][0] - series[at - 1][0] <= CITY_MAX_GAP;
}

/**
 * Differences between the map in force at `year` and the map before it.
 * Mapped dates come from boundary data, so these are changes in the map, not
 * dates of founding or collapse.
 */
export function mapChanges(atlas, changeYears, year, threshold = 1000) {
  const current = changeYears.findLast(y => y <= year);
  if (current === undefined) return null;
  const previous = changeYears.findLast(y => y < current);
  const result = { year: current, previous: previous ?? null, first: [], gone: [], changed: [] };
  if (previous === undefined) return result;
  const sums = records => records.reduce((areas, record) => areas.set(record.k, (areas.get(record.k) || 0) + record.a), new Map());
  const before = sums(atlas.snapshot(previous)), after = sums(atlas.snapshot(current));
  const name = key => atlas.index[key]?.n || atlas.byKey.get(key)?.[0]?.n || key;
  for (const [key, area] of after) {
    if (!before.has(key)) result.first.push({ key, name: name(key), area });
    else if (Math.abs(area - before.get(key)) >= threshold) result.changed.push({ key, name: name(key), from: before.get(key), to: area, delta: area - before.get(key) });
  }
  for (const [key, area] of before) {
    if (after.has(key)) continue;
    const records = atlas.byKey.get(key) || [];
    const returns = records.find(record => record.f > current)?.f ?? null;
    const lastMapped = Math.max(...records.filter(record => record.t < current).map(record => record.t));
    result.gone.push({ key, name: name(key), area, returns, lastMapped: Number.isFinite(lastMapped) ? lastMapped : null });
  }
  result.first.sort((a, b) => b.area - a.area);
  result.gone.sort((a, b) => b.area - a.area);
  result.changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return result;
}

/** A change large enough to emphasise on the map: 50,000 km\u00b2 or a quarter of the territory. */
export const majorChange = change => Math.abs(change.delta) >= 50000 || Math.abs(change.delta) >= change.from * 0.25;

/** Record starts and ends in equal slices of a timeline window, for the scale's hatching. */
export function timelineDensity(records, bins, toPosition, lo, hi) {
  const counts = new Array(bins).fill(0);
  for (const record of records) {
    for (const year of [record.f, record.t + 1]) {
      if (year <= lo || year > hi) continue;
      const position = toPosition(year);
      if (position >= 0 && position < 1) counts[Math.floor(position * bins)]++;
    }
  }
  return counts;
}

/** Pure data access. Records and cached arrays are shared: consumers must not mutate them. */
export function createAtlas({ polities = [], years = [], cities = [], land = null, borders = null, index = {}, worldPop = [], aliases = {} } = {}) {
  const byKey = new Map();
  for (const record of polities) {
    if (!byKey.has(record.k)) byKey.set(record.k, []);
    byKey.get(record.k).push(record);
  }
  for (const records of byKey.values()) records.sort((a, b) => a.f - b.f || a.t - b.t);

  const catalog = [];
  for (const [key, records] of byKey) {
    const entry = index[key];
    const name = entry?.n || records[0].n;
    const peak = records.reduce((best, record) => record.a > best.a ? record : best, records[0]);
    const names = [...new Set([name, ...records.map(record => record.n)].map(folded))];
    catalog.push({
      key, name,
      first: entry?.first ?? Math.min(...records.map(record => record.f)),
      last: entry?.last ?? Math.max(...records.map(record => record.t)),
      peakYear: entry?.peak_year ?? peak.f,
      peakArea: entry?.peak_area ?? peak.a,
      names,
      // Alternative names from sources/aliases.yaml, kept with their display text.
      aliases: (aliases[key] || []).map(text => ({ text, folded: folded(text) })).filter(alias => alias.folded && !names.includes(alias.folded)),
      records,
    });
  }

  const snapshot = memoizedYear(year => polities.filter(record => record.f <= year && record.t >= year)
    .sort((a, b) => b.a - a.a));
  const cityEntries = memoizedYear(year => {
    const entries = [];
    for (const city of cities) {
      if (!cityPresent(city.s, year)) continue;
      const pop = interpolate(city.s, year);
      if (pop > 0) entries.push({ city, pop });
    }
    return entries.sort((a, b) => b.pop - a.pop);
  });
  const population = year => interpolate(worldPop, year);
  const search = (query, year) => {
    const needle = folded(query);
    if (!needle) return [];
    return catalog.flatMap(entry => {
      let score = Infinity, alias = null;
      for (const name of entry.names) score = Math.min(score, matchScore(name, needle));
      // A canonical name outranks an alternative name at the same match strength.
      for (const candidate of entry.aliases) {
        const aliasScore = matchScore(candidate.folded, needle) + 0.25;
        if (aliasScore < score) { score = aliasScore; alias = candidate.text; }
      }
      if (!Number.isFinite(score)) return [];
      const active = entry.records.some(record => record.f <= year && record.t >= year);
      return [{ key: entry.key, name: entry.name, first: entry.first, last: entry.last, peakYear: entry.peakYear, peakArea: entry.peakArea, active, alias, score }];
    }).sort((a, b) => a.score - b.score || Number(b.active) - Number(a.active) || b.peakArea - a.peakArea || a.name.localeCompare(b.name))
      .slice(0, 30).map(({ score, ...entry }) => entry);
  };
  return { polities, years, cities, land, borders, index, worldPop, aliases, byKey, snapshot, cityEntries, population, search };
}

function dataURL(name) {
  const url = new URL(`../data/${name}.json`, import.meta.url);
  url.searchParams.set('v', DATA_VERSIONS[name]);
  return url.href;
}

function freezeEvidence(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeEvidence(child);
    Object.freeze(value);
  }
  return value;
}

export async function loadRulers(signal, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  let timedOut = false;
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    return freezeEvidence(await fetchJSON('rulers', controller.signal));
  } catch (error) {
    if (timedOut) throw new Error('Ruler records took too long to download. Please retry.', { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function fetchJSON(name, signal) {
  let response;
  try { response = await fetch(dataURL(name), { signal }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(`Could not download ${name.replaceAll('_', ' ')}. Check your connection and retry.`, { cause: error });
  }
  if (!response.ok) throw new Error(`Could not load ${name.replaceAll('_', ' ')} (HTTP ${response.status}). Please retry.`);
  try { return await response.json(); }
  catch (error) { throw new Error(`The ${name.replaceAll('_', ' ')} data could not be read. Please retry.`, { cause: error }); }
}

// Match the established D3 spherical convention exactly, including interior rings.
function rewindGeometry(geometry) {
  const fix = rings => {
    for (const ring of rings) {
      if (globalThis.d3.geoArea({ type: 'Polygon', coordinates: [ring] }) > 2 * Math.PI) ring.reverse();
    }
  };
  if (geometry?.type === 'Polygon') fix(geometry.coordinates);
  else if (geometry?.type === 'MultiPolygon') geometry.coordinates.forEach(fix);
  else if (geometry?.type === 'GeometryCollection') geometry.geometries.forEach(rewindGeometry);
  return geometry;
}

function rewindLand(object) {
  if (object.type === 'FeatureCollection') object.features.forEach(feature => rewindGeometry(feature.geometry));
  else if (object.type === 'Feature') rewindGeometry(object.geometry);
  else rewindGeometry(object);
  return object;
}

async function fetchPolities(signal, onProgress) {
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        let worker;
        try { worker = new Worker(new URL('./data-worker.js', import.meta.url)); }
        catch (error) { error.workerUnavailable = true; reject(error); return; }
        const done = () => { signal.removeEventListener('abort', abort); worker.terminate(); };
        const abort = () => { done(); reject(new DOMException('Loading cancelled', 'AbortError')); };
        if (signal.aborted) { abort(); return; }
        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = ({ data }) => {
          if (data.type === 'progress') onProgress(data.progress);
          else if (data.type === 'done') { done(); resolve(data.polities); }
          else if (data.type === 'error') { done(); reject(new Error(data.message)); }
        };
        worker.onerror = () => {
          done();
          const error = new Error('Background loading unavailable');
          error.workerUnavailable = true;
          reject(error);
        };
        worker.postMessage({ url: dataURL('polities') });
      });
    } catch (error) {
      if (!error.workerUnavailable) throw error;
    }
  }
  // Browsers that disallow workers still get a functional atlas. Yield between
  // batches so navigation and loading feedback remain responsive while winding.
  const polities = await fetchJSON('polities', signal);
  onProgress({ phase: 'processing', loaded: null, total: null, message: 'Preparing historical boundaries…' });
  for (let start = 0; start < polities.length; start += 100) {
    if (signal.aborted) throw new DOMException('Loading cancelled', 'AbortError');
    polities.slice(start, start + 100).forEach(record => rewindGeometry(record.g));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return polities;
}

/** Fetch once with content-versioned URLs; the caller can retry after an error. */
export async function loadAtlas({ onProgress = () => {}, onBase = () => {}, onRulers = () => {} } = {}) {
  const controller = new AbortController();
  const signal = controller.signal;
  onProgress({ phase: 'loading', loaded: 0, total: null, message: 'Loading the atlas…' });
  try {
    const base = Promise.all([fetchJSON('land', signal), fetchJSON('borders', signal)])
      .then(([landData, borders]) => {
        const land = rewindLand(landData);
        onBase({ land, borders });
        return { land, borders };
      });
    // Start the optional request alongside the map, without waiting for it.
    const context = loadRulers(signal)
      .then(rulers => ({ rulers, rulersError: null }))
      .catch(error => ({ rulers: null, rulersError: error.message }));
    // Alternative names only widen search; the map loads without them.
    const aliases = fetchJSON('aliases', signal).catch(error => {
      if (error.name === 'AbortError') throw error;
      return {};
    });
    const [baseData, polities, years, cities, index, population, aliasData] = await Promise.all([
      base, fetchPolities(signal, onProgress), fetchJSON('years', signal), fetchJSON('cities', signal),
      fetchJSON('polity_index', signal), fetchJSON('population', signal), aliases,
    ]);
    const atlas = createAtlas({ ...baseData, polities, years, cities, index, worldPop: population?.world || [], aliases: aliasData || {} });
    Object.assign(atlas, { rulers: null, rulersError: null, rulersLoading: true });
    atlas.rulersReady = context.then(result => {
      Object.assign(atlas, result, { rulersLoading: false });
      onRulers(atlas);
      return atlas.rulers;
    });
    onProgress({ phase: 'ready', loaded: null, total: null, message: 'Atlas ready' });
    return atlas;
  } catch (error) {
    controller.abort();
    throw error;
  }
}
