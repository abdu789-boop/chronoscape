// URL and timeline math are independent of the renderer and DOM.
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const KNOTS = [[-3400, 0], [-1000, .13], [1, .32], [1000, .52], [1500, .67], [1800, .8], [2024, 1]];
function interpolate(value, from, to) {
  if (value <= KNOTS[0][from]) return KNOTS[0][to];
  for (let i = 1; i < KNOTS.length; i++) {
    if (value <= KNOTS[i][from]) {
      const a = KNOTS[i - 1], b = KNOTS[i];
      return a[to] + (value - a[from]) / (b[from] - a[from]) * (b[to] - a[to]);
    }
  }
  return KNOTS.at(-1)[to];
}
export const yearToPosition = year => interpolate(year, 0, 1);
export const positionToYear = position => interpolate(position, 1, 0);
export function timelineWindow(year, scope, min, max) {
  if (scope === 'all') return [min, max];
  const width = clamp(Number(scope) || 100, 1, max - min);
  const lo = clamp(Math.round(year - width / 2), min, max - width);
  return [lo, lo + width];
}
export function readHash(hash) {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  const finite = (key, fallback, lo, hi) => {
    const raw = p.get(key);
    const n = raw === null || raw.trim() === '' ? NaN : Number(raw);
    return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
  };
  const y = Math.round(finite('year', -450, -3400, 2024));
  return {
    year: y === 0 ? 1 : y,
    selected: (p.get('polity') || '').slice(0, 200) || null,
    projection: p.get('view') === 'globe' ? 'globe' : 'flat',
    zoom: finite('zoom', 1, .8, 40),
    center: [finite('lon', 0, -180, 180), finite('lat', 0, -90, 90)],
    rotation: [finite('rx', 0, -360, 360), finite('ry', 0, -90, 90)],
    borders: ['off', 'over', 'under'].includes(p.get('borders')) ? p.get('borders') : 'off',
    cities: p.get('cities') !== '0',
    labels: p.get('labels') !== '0',
    scope: ['all', '1000', '500', '100', '25'].includes(p.get('scope')) ? p.get('scope') : 'all',
  };
}
export function writeHash(state, view) {
  const p = new URLSearchParams();
  p.set('year', String(state.year));
  if (state.selected) p.set('polity', state.selected);
  if (state.projection === 'globe') p.set('view', 'globe');
  const rounded = n => Number(n.toFixed(3));
  if (view && Number.isFinite(view.zoom)) p.set('zoom', rounded(view.zoom));
  if (view?.center?.every(Number.isFinite)) {
    p.set('lon', rounded(view.center[0])); p.set('lat', rounded(view.center[1]));
  }
  if (state.projection === 'globe' && view?.rotation?.every(Number.isFinite)) {
    p.set('rx', rounded(view.rotation[0])); p.set('ry', rounded(view.rotation[1]));
  }
  if (state.borders !== 'off') p.set('borders', state.borders);
  if (!state.cities) p.set('cities', '0');
  if (!state.labels) p.set('labels', '0');
  if (state.scope !== 'all') p.set('scope', state.scope);
  return '#' + p.toString();
}
