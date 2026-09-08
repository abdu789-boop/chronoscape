import { DATA_VERSIONS } from './data-version.js';

const CACHE_LIMIT = 32;

export function fmtYear(year) {
  if (!Number.isFinite(year) || year === 0) return '—';
  return `${Math.abs(Math.round(year)).toLocaleString('en-US')} ${year < 0 ? 'BCE' : 'CE'}`;
}

export function fmtArea(area) {
  if (!Number.isFinite(area) || area <= 0) return '—';
  return area >= 1e6
    ? `${(area / 1e6).toFixed(2)}M km²`
    : `${Math.round(area).toLocaleString('en-US')} km²`;
}

export function fmtPop(population) {
  if (!Number.isFinite(population) || population < 1) return '—';
  if (population >= 1e9) return `${(population / 1e9).toFixed(2)}B`;
  if (population >= 1e6) return `${(population / 1e6).toFixed(population < 1e7 ? 2 : 1)}M`;
  if (population >= 1e3) return `${Math.round(population / 1e3)}k`;
  return String(Math.round(population));
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

function folded(text) {
  return String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

/** Pure data access. Records and cached arrays are shared: consumers must not mutate them. */
export function createAtlas({ polities = [], years = [], cities = [], land = null, borders = null, index = {}, worldPop = [] } = {}) {
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
    catalog.push({
      key, name,
      first: entry?.first ?? Math.min(...records.map(record => record.f)),
      last: entry?.last ?? Math.max(...records.map(record => record.t)),
      peakYear: entry?.peak_year ?? peak.f,
      names: [...new Set([name, ...records.map(record => record.n)].map(folded))],
      records,
    });
  }

  const snapshot = memoizedYear(year => polities.filter(record => record.f <= year && record.t >= year)
    .sort((a, b) => b.a - a.a));
  const cityEntries = memoizedYear(year => {
    const entries = [];
    for (const city of cities) {
      const series = city.s;
      // Preserve the source viewer's limited extrapolation window.
      if (!series?.length || year < series[0][0] - 100 || year > series.at(-1)[0] + 50) continue;
      const pop = interpolate(series, year);
      if (pop > 0) entries.push({ city, pop });
    }
    return entries.sort((a, b) => b.pop - a.pop);
  });
  const population = year => interpolate(worldPop, year);
  const search = (query, year) => {
    const needle = folded(query);
    const tokens = needle.split(' ').filter(Boolean);
    return catalog.flatMap(entry => {
      let score = Infinity;
      for (const name of entry.names) {
        if (!needle) score = 4;
        else if (name === needle) score = Math.min(score, 0);
        else if (name.startsWith(needle)) score = Math.min(score, 1);
        else if (name.includes(needle)) score = Math.min(score, 2);
        else if (tokens.every(token => name.includes(token))) score = Math.min(score, 3);
      }
      if (!Number.isFinite(score)) return [];
      const active = entry.records.some(record => record.f <= year && record.t >= year);
      return [{ key: entry.key, name: entry.name, first: entry.first, last: entry.last, peakYear: entry.peakYear, active, score }];
    }).sort((a, b) => a.score - b.score || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
      .slice(0, 30).map(({ score, ...entry }) => entry);
  };
  return { polities, years, cities, land, borders, index, worldPop, byKey, snapshot, cityEntries, population, search };
}

function dataURL(name) {
  const url = new URL(`../data/${name}.json`, import.meta.url);
  url.searchParams.set('v', DATA_VERSIONS[name]);
  return url.href;
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
export async function loadAtlas({ onProgress = () => {}, onBase = () => {} } = {}) {
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
    const [baseData, polities, years, cities, index, population] = await Promise.all([
      base, fetchPolities(signal, onProgress), fetchJSON('years', signal), fetchJSON('cities', signal),
      fetchJSON('polity_index', signal), fetchJSON('population', signal),
    ]);
    const atlas = createAtlas({ ...baseData, polities, years, cities, index, worldPop: population?.world || [] });
    onProgress({ phase: 'ready', loaded: null, total: null, message: 'Atlas ready' });
    return atlas;
  } catch (error) {
    controller.abort();
    throw error;
  }
}
