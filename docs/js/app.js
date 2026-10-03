import { loadAtlas, loadRulers, loadRivers, loadRelief, fmtYear, fmtArea, fmtAreaWords, fmtPopulation, nearestYear, parseYear, cityPresent, mapChanges, majorChange, timelineDensity } from './data.js';
import { createMap, getPolityColor, renderThumbnail } from './map.js';
import { createRulersView } from './rulers-view.js';
import { displayRole } from './rulers.js';
import { createSearch } from './search.js';
import { paperGrain } from './paper.js';
import { clamp, yearToPosition, positionToYear, timelineWindow, readHash, writeHash } from './state.js';

const $ = id => document.getElementById(id);
const state = readHash(location.hash);
let atlas, search, changeYears = [], current = [], map, playback = null, playRange = null, playSpeed = 500;
let timelineBounds = [-3400, 2024], searchItems = [], activeSearch = -1, searchExpanded = new Set();
let persistenceTimer, toastTimer, viewTimer, scrubbing = false;
let selectedChartKey = null, yearFrame = 0, pendingYear = null;
let panel = 'largest', changesFilter = 'all', changesExpanded = new Set(), countriesExpanded = false;
let scaleSignature = '', grain = null, focusSignature = '', changesLegend = false;
// Loading state of the optional geography layers: null, 'loading', 'ready' or 'unsupported'.
const geography = { base: false, rivers: null, relief: null };
const MIN = -3400, MAX = 2024;
const SCALE_BLOCKS = [-3400, -3000, -2000, -1000, 1, 500, 1000, 1250, 1500, 1650, 1800, 1900, 2024];
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
};
let theme = storage.get('chronoscape-theme') === 'dark' ? 'dark' : 'light';
let rulersRetryPending = false;
const updateRulers = createRulersView({
  async onRetry() {
    if (!atlas || rulersRetryPending || atlas.rulersLoading) return;
    rulersRetryPending = true;
    atlas.rulersLoading = true;
    const button = $('detail-history-error').querySelector('button');
    if (button) { button.disabled = true; button.textContent = 'Loading ruler records…'; }
    updateDetail();
    try { atlas.rulers = await loadRulers(); atlas.rulersError = null; }
    catch (error) { atlas.rulersError = error.message; announce('Ruler records could not be loaded. Please retry.'); }
    finally {
      rulersRetryPending = false;
      atlas.rulersLoading = false;
      if (button) { button.disabled = false; button.textContent = 'Retry ruler records'; }
      updateDetail();
    }
  },
});

const compactYear = year => year < 0 ? `${-year} BCE` : String(year);
const mobile = () => matchMedia('(max-width: 760px)').matches;
const polityName = key => atlas.index[key]?.n || atlas.byKey.get(key)?.[0]?.n || key;
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}
function swatch(key) {
  const mark = el('span', 'swatch'); mark.setAttribute('aria-hidden', 'true');
  mark.dataset.polityKey = key; mark.style.setProperty('--swatch', getPolityColor(key, theme));
  return mark;
}
function leaderLine(name, value, valueClass = '') {
  const line = el('span', 'leader-line');
  line.append(el('span', 'leader-name', name), el('span', 'leader-dots'), el('span', `leader-value ${valueClass}`.trim(), value));
  return line;
}
function icon(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', className); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#icon-${name}`);
  svg.append(use); return svg;
}

function announce(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function persist(immediate = false) {
  clearTimeout(persistenceTimer);
  const save = () => {
    if (!atlas) return;
    const hash = writeHash(state, map.getView());
    if (location.hash !== hash) history.replaceState(null, '', hash);
  };
  if (immediate) save(); else persistenceTimer = setTimeout(save, 220);
}
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0e1420' : '#f1eadb');
  if (theme === 'light' && grain === null) grain = paperGrain() || '';
  if (grain) document.documentElement.style.setProperty('--paper-grain', `url(${grain})`);
  for (const mark of document.querySelectorAll('[data-polity-key]')) {
    mark.style.setProperty('--swatch', getPolityColor(mark.dataset.polityKey, theme));
  }
  $('theme-toggle').setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  map?.setTheme(theme);
  if (atlas && state.selected) { selectedChartKey = null; updateDetail(); }
}
function openSidebar() {
  document.body.classList.remove('sidebar-collapsed');
  document.body.classList.add('sidebar-open');
  $('sidebar-toggle').setAttribute('aria-expanded', 'true');
  map?.resize();
}
function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  document.body.classList.add('sidebar-collapsed');
  $('sidebar-toggle').setAttribute('aria-expanded', 'false');
  map?.resize();
}
// On a phone the sheet covers the lower map; frame the territory above it.
function focusPolity(polity) {
  if (!polity) return;
  map.focus(polity, { bottom: mobile() ? $('sidebar').getBoundingClientRect().height : 0 });
}
function selectPolity(key, { focus = false, peak = false, open = true, keepYear = false } = {}) {
  if (!atlas || !atlas.byKey.has(key)) return;
  const changingSelection = state.selected !== key;
  if (changingSelection && playRange) stopPlayback();
  state.selected = key;
  const entry = atlas.index[key];
  if (peak || (!keepYear && !current.some(p => p.k === key))) setYear(entry.peak_year);
  map.setSelected(key);
  updateDetail();
  updateChanges();
  if (changingSelection) document.querySelector('.sidebar-scroll').scrollTop = 0;
  if (open) openSidebar();
  if (focus) {
    // Wait for the sidebar layout before fitting the selected extent.
    requestAnimationFrame(() => focusPolity(current.find(p => p.k === key) || atlas.byKey.get(key)?.[0]));
  }
  closeSearch();
  $('search').value = '';
  $('map-tooltip').hidden = true;
  persist();
}
function deselect() {
  if (playRange) stopPlayback();
  state.selected = null;
  selectedChartKey = null;
  map.setSelected(null);
  $('detail-panel').hidden = true;
  $('explore-panel').hidden = false;
  $('sidebar-head-text').textContent = 'Polities';
  updateVisible();
  updateChanges();
  document.querySelector('.sidebar-scroll').scrollTop = 0;
  persist();
}

// ----- Largest polities and What changed
function placeRow(key, name, value, action) {
  const item = el('li');
  const button = el('button', 'place-row'); button.type = 'button';
  button.append(swatch(key), leaderLine(name, value));
  button.addEventListener('click', action);
  item.append(button);
  return item;
}
function updateVisible() {
  const box = $('visible-list'); box.replaceChildren();
  $('visible-year').textContent = 'in ' + fmtYear(state.year);
  const areas = new Map();
  for (const p of current) areas.set(p.k, (areas.get(p.k) || 0) + p.a);
  for (const [key, area] of [...areas].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    box.append(placeRow(key, polityName(key), fmtArea(area), () => selectPolity(key, { focus: true })));
  }
  if (!areas.size) box.append(el('li', 'empty-state', 'No polities are mapped for this year.'));
}
let changesCache = { year: null, result: null };
function currentChanges() {
  if (!atlas) return null;
  const year = changeYears.findLast(y => y <= state.year);
  if (changesCache.year !== year) changesCache = { year, result: mapChanges(atlas, changeYears, state.year) };
  return changesCache.result;
}
function anchorOf(key, year) {
  const records = atlas.snapshot(year).filter(record => record.k === key);
  const main = records.reduce((best, record) => !best || record.a > best.a ? record : best, null);
  return main?.lp || null;
}
function setPanel(next) {
  panel = next;
  for (const [id, value] of [['tab-largest', 'largest'], ['tab-changes', 'changes']]) {
    $(id).setAttribute('aria-selected', String(panel === value));
    $(id).tabIndex = panel === value ? 0 : -1;
  }
  $('largest-panel').hidden = panel !== 'largest';
  $('largest-footnote').hidden = panel !== 'largest';
  $('changes-panel').hidden = panel !== 'changes';
  if (panel === 'largest') {
    $('explore-title').textContent = 'Historical polities';
    $('explore-intro').textContent = 'Coverage: 3400 BCE – 2024 CE.';
  }
  updateChanges();
  updateTimeline({ recenter: false });
}
function changeRow(mark, name, value, note, action, valueClass = '') {
  const button = el('button', 'change-row'); button.type = 'button';
  const line = leaderLine(name, value, valueClass);
  line.prepend(mark);
  button.append(line);
  if (note) button.append(el('span', 'leader-note', note));
  button.addEventListener('click', action);
  return button;
}
function changeGroup(id, title, rows, limit) {
  const section = el('section', 'change-group');
  const heading = el('h2'); heading.append(el('span', '', title), el('span', '', String(rows.length)));
  section.append(heading);
  if (!rows.length) { section.append(el('p', 'empty-state', 'None.')); return section; }
  const expanded = changesExpanded.has(id);
  for (const row of expanded ? rows : rows.slice(0, limit)) section.append(row());
  if (rows.length > limit) {
    const more = el('button', 'more-button', expanded ? 'Show fewer' : `${rows.length - limit} more`); more.type = 'button';
    more.addEventListener('click', () => { expanded ? changesExpanded.delete(id) : changesExpanded.add(id); updateChanges(); });
    section.append(more);
  }
  return section;
}
function updateChanges() {
  const result = currentChanges();
  const total = result ? result.first.length + result.gone.length + result.changed.length : 0;
  $('changes-count').textContent = total ? String(total) : '';
  const showing = panel === 'changes' && !state.selected && result;
  for (const item of document.querySelectorAll('.legend-changes')) item.hidden = !showing;
  for (const item of document.querySelectorAll('.legend-default')) item.hidden = Boolean(showing);
  changesLegend = Boolean(showing); syncLegend();
  if (!showing) { if (focusSignature) { focusSignature = ''; map?.setFocus(null); } return; }
  if (result.previous === null) {
    $('explore-title').textContent = 'What changed';
    $('explore-intro').textContent = 'This is the earliest map; there is no earlier map to compare.';
  } else {
    $('explore-title').textContent = `Changes in ${fmtYear(result.year)}`;
    $('explore-intro').textContent = `Compared with the map of ${fmtYear(result.previous)}: ${result.first.length} first mapped, ${result.gone.length} no longer mapped and ${result.changed.length} changed in area.`;
  }
  const inView = item => {
    const anchor = anchorOf(item.key, item.lastMapped !== undefined ? result.previous : result.year);
    return anchor && map.inView(anchor);
  };
  const filter = items => changesFilter === 'view' ? items.filter(inView) : items;
  const first = filter(result.first), changed = filter(result.changed), gone = filter(result.gone);
  $('changes-all').textContent = `All changes · ${total}`;
  $('changes-view').textContent = `In this view · ${result.first.filter(inView).length + result.changed.filter(inView).length + result.gone.filter(inView).length}`;
  $('changes-all').setAttribute('aria-pressed', String(changesFilter === 'all'));
  $('changes-view').setAttribute('aria-pressed', String(changesFilter === 'view'));
  const freshMark = key => { const mark = el('span', 'change-mark fresh'); mark.style.setProperty('--swatch', getPolityColor(key, theme)); mark.dataset.polityKey = key; return mark; };
  const groups = $('changes-groups'); groups.replaceChildren(
    changeGroup('first', 'First mapped', first.map(item => () => changeRow(freshMark(item.key), item.name, fmtArea(item.area), '', () => selectPolity(item.key, { focus: true }))), 6),
    changeGroup('changed', 'Largest changes in area', changed.map(item => () => {
      const mark = el('span', `change-mark ${item.delta > 0 ? 'up' : 'down'}`); mark.append(icon(item.delta > 0 ? 'up' : 'down'));
      const value = `${item.delta > 0 ? '+' : '−'}${fmtArea(Math.abs(item.delta))}`;
      return changeRow(mark, item.name, value, `${fmtArea(item.from)} → ${fmtArea(item.to)}`, () => selectPolity(item.key, { focus: true }), item.delta > 0 ? 'change-value up' : 'change-value down');
    }), 5),
    changeGroup('gone', 'No longer mapped', gone.map(item => () => changeRow(el('span', 'change-mark gone'), item.name, fmtArea(item.area),
      item.returns ? `Mapped again from ${fmtYear(item.returns)}` : item.lastMapped !== null ? `Last mapped ${fmtYear(item.lastMapped)}` : '',
      () => selectPolity(item.key, { keepYear: true }))), 6),
  );
  // The map shows the same change: new territories outlined, earlier extents
  // dotted. Camera moves only recount the list; the emphasis stays as it is.
  const signature = `${result.year}:${result.previous}`;
  if (signature === focusSignature) return;
  focusSignature = signature;
  const losses = result.changed.filter(item => item.delta < 0 && majorChange(item));
  const ghostKeys = [...result.gone, ...losses].sort((a, b) => (b.area ?? -b.delta) - (a.area ?? -a.delta));
  const previousRecords = atlas.snapshot(result.previous);
  map.setFocus({
    fresh: result.first.map(item => item.key),
    lit: result.changed.filter(majorChange).map(item => item.key),
    ghosts: ghostKeys.map((item, index) => {
      const records = previousRecords.filter(record => record.k === item.key);
      return {
        geometry: { type: 'GeometryCollection', geometries: records.map(record => record.g) },
        anchor: anchorOf(item.key, result.previous),
        label: index < 2 ? `${item.name},\nextent in ${fmtYear(result.previous)}` : null,
      };
    }).filter(ghost => ghost.geometry.geometries.length),
  });
}

// ----- Polity details
function fillRelations(id, barId, rows, emptyText) {
  const box = $(id); box.replaceChildren();
  const bar = $(barId); bar.replaceChildren();
  if (!rows?.length) { box.append(el('p', 'empty-state', emptyText)); return; }
  for (const [name, percent] of rows) {
    // Names can be ambiguous across unrelated historical states. Only make a
    // navigation link when the name identifies exactly one index entry.
    const matches = Object.entries(atlas.index).filter(([, e]) => e.n === name);
    const key = matches.length === 1 ? matches[0][0] : name;
    const segment = el('span'); segment.style.width = `${percent}%`; segment.style.setProperty('--swatch', getPolityColor(key, theme));
    segment.dataset.polityKey = key; segment.title = `${name}, ${percent}%`;
    bar.append(segment);
    const row = el(matches.length === 1 ? 'button' : 'div', 'relation-link');
    if (matches.length === 1) { row.type = 'button'; row.addEventListener('click', () => selectPolity(key, { focus: true })); }
    row.append(swatch(key), leaderLine(name, percent + '%'));
    box.append(row);
  }
}
function niceStep(span) {
  return [5, 10, 25, 50, 100, 250, 500, 1000].find(step => span / step <= 12) || 1000;
}
function drawExtentChart(records, entry) {
  const svg = $('detail-chart'); svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const width = 284, height = 104, base = height - 18;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Mapped extent of ${entry.n} from ${fmtYear(entry.first)} to ${fmtYear(entry.last)}. Maximum ${fmtArea(entry.peak_area)} in ${fmtYear(entry.peak_year)}.`);
  const ordered = [...records].sort((a, b) => a.f - b.f || b.a - a.a);
  // Sum resolved features for each identity, where a source splits a polity
  // into simultaneous pieces; this graph is explicitly mapped extent.
  const changes = [...new Set(ordered.flatMap(p => [p.f, p.t + 1]))].sort((a, b) => a - b);
  const values = changes.map(y => [y, ordered.filter(p => p.f <= y && p.t >= y).reduce((sum, p) => sum + p.a, 0)]);
  if (!values.length) return;
  const lo = values[0][0], hi = values.at(-1)[0];
  const top = Math.max(...values.map(p => p[1]), 1);
  const gridStep = [1e3, 2e3, 5e3, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7].find(step => top / step <= 3) || 1e7;
  const max = top * 1.08;
  const x = y => (y - lo) / Math.max(1, hi - lo) * width;
  const y = a => base - a / max * (base - 8);
  const add = (tag, attributes, text) => {
    const node = document.createElementNS(ns, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    if (text !== undefined) node.textContent = text;
    svg.append(node); return node;
  };
  const gridValues = [];
  for (let value = gridStep; value < max; value += gridStep) {
    add('line', { x1: 0, x2: width, y1: y(value), y2: y(value), stroke: 'var(--rule)', 'stroke-width': .8 });
    gridValues.push(value);
  }
  let line = `M ${x(values[0][0])} ${y(values[0][1])}`;
  for (let i = 1; i < values.length; i++) line += ` H ${x(values[i][0])} V ${y(values[i][1])}`;
  add('path', { d: line + ` L ${x(hi)} ${base} L ${x(lo)} ${base} Z` }).style.fill = `color-mix(in srgb, ${getPolityColor(entry.key || selectedChartKey, theme)} var(--wash), var(--leaf))`;
  add('path', { d: line, fill: 'none', stroke: 'var(--ink)', 'stroke-width': 1.4 });
  add('line', { x1: 0, x2: width, y1: base + .5, y2: base + .5, stroke: 'var(--ink)', 'stroke-width': 1 });
  for (const value of gridValues) add('text', { x: width - 2, y: y(value) - 3, 'text-anchor': 'end' }, value >= 1e6 ? `${value / 1e6}M` : `${value / 1e3}k`);
  const peak = values.reduce((best, value) => value[1] > best[1] ? value : best, values[0]);
  add('circle', { cx: x(peak[0]) + 1, cy: y(peak[1]), r: 3, fill: 'var(--leaf)', stroke: 'var(--ink)', 'stroke-width': 1.2 });
  const marker = add('line', { id: 'extent-marker', y1: 2, y2: base, stroke: 'var(--rubric)', 'stroke-width': 1.3 });
  marker.dataset.x = '';
  add('text', { x: 0, y: height - 2 }, compactYear(entry.first));
  add('text', { x: width, y: height - 2, 'text-anchor': 'end' }, compactYear(entry.last));
  add('text', { id: 'extent-year', y: height - 2, 'text-anchor': 'middle', fill: 'var(--rubric)' }, '');
  svg.dataset.first = lo; svg.dataset.last = hi;
  $('detail-chart-caption').textContent = `${fmtYear(entry.first)} – ${fmtYear(entry.last)} · mapped extent`;
}
function updateLifespan(e, present) {
  const span = Math.max(1, e.last - e.first), step = niceStep(span);
  const offset = ((Math.ceil(e.first / step) * step - e.first) / span) * 100;
  const bar = document.querySelector('.lifespan-bar');
  bar.style.setProperty('--swatch', getPolityColor(state.selected, theme));
  const ticks = document.querySelector('.lifespan-ticks');
  ticks.style.setProperty('--tick-gap', `${step / span * 100}%`);
  ticks.style.setProperty('--tick-offset', `${offset}%`);
  $('lifespan-peak').style.left = `${clamp((e.peak_year - e.first) / span, 0, 1) * 100}%`;
  $('lifespan-now').hidden = state.year < e.first || state.year > e.last;
  $('lifespan-now').style.left = `${clamp((state.year - e.first) / span, 0, 1) * 100}%`;
  $('lifespan-first').textContent = compactYear(e.first);
  $('lifespan-peak-label').textContent = `largest in ${compactYear(e.peak_year)}`;
  $('lifespan-last').textContent = compactYear(e.last);
  $('lifespan-now').classList.toggle('inactive', !present);
}
function updateDetail() {
  const key = state.selected, e = atlas?.byKey.has(key) ? atlas.index[key] : null;
  if (!key || !e) { $('detail-panel').hidden = true; $('explore-panel').hidden = false; $('sidebar-head-text').textContent = 'Polities'; return; }
  $('detail-panel').hidden = false; $('explore-panel').hidden = true;
  $('sidebar-head-text').textContent = 'Historical polity';
  const present = current.filter(p => p.k === key);
  const area = present.reduce((total, p) => total + p.a, 0);
  $('detail-name').textContent = e.n;
  $('detail-period').textContent = fmtYear(e.first) + ' – ' + fmtYear(e.last);
  $('detail-status').textContent = present.length ? 'Mapped in ' + fmtYear(state.year) : 'Not mapped in ' + fmtYear(state.year);
  $('detail-status').classList.toggle('inactive', !present.length);
  $('detail-area-label').textContent = 'Territory in ' + fmtYear(state.year);
  $('detail-area').textContent = present.length ? fmtAreaWords(area) : 'Not recorded';
  $('detail-peak-text').textContent = `Maximum extent, ${compactYear(e.peak_year)}`;
  $('detail-peak-area').textContent = fmtArea(e.peak_area);
  $('detail-focus').disabled = !present.length;
  $('detail-peak').textContent = `Go to maximum extent · ${fmtYear(e.peak_year)}`;
  const playingThis = Boolean(playRange && playback);
  $('detail-play-label').textContent = playingThis ? 'Stop' : `Play ${compactYear(e.first)}–${compactYear(e.last)}`;
  $('detail-play').setAttribute('aria-pressed', String(playingThis));
  $('detail-play').setAttribute('aria-label', playingThis ? 'Stop playing this polity' : `Play the mapped years of ${e.n}, ${fmtYear(e.first)} to ${fmtYear(e.last)}`);
  updateLifespan(e, present.length > 0);
  updateRulers(atlas.rulers, key, state.year, atlas.rulersError, atlas.rulersLoading);
  if (selectedChartKey !== key) {
    selectedChartKey = key;
    countriesExpanded = false;
    drawExtentChart(atlas.byKey.get(key) || [], { ...e, key });
    fillRelations('detail-pred', 'detail-pred-bar', e.pred, 'No earlier polity recorded here.');
    fillRelations('detail-succ', 'detail-succ-bar', e.succ, 'No later polity recorded here.');
    renderCountries(e);
    const notes = ['Maximum recorded extent: ' + fmtArea(e.peak_area) + '. Boundaries and derived areas reflect the available historical map data.'];
    if (e.tstart) notes.push('Its beginning may predate the dataset.');
    if (e.tend) notes.push('The record reaches the dataset boundary; this does not establish an end date.');
    $('detail-notes').textContent = notes.join(' ');
  }
  const marker = $('extent-marker'), svg = $('detail-chart');
  if (marker) {
    const lo = Number(svg.dataset.first), hi = Number(svg.dataset.last);
    const x = clamp((state.year - lo) / Math.max(1, hi - lo), 0, 1) * 284;
    marker.setAttribute('x1', x); marker.setAttribute('x2', x);
    marker.style.display = present.length ? '' : 'none';
    const label = $('extent-year');
    // The year label gives way to the start and end labels when it would overlap them.
    label.setAttribute('x', x); label.textContent = present.length && x > 48 && x < 236 ? compactYear(state.year) : '';
  }
}
function renderCountries(e) {
  const countries = $('detail-countries'); countries.replaceChildren();
  const rows = [...(e.countries || [])].sort((a, b) => b[1] - a[1]);
  if (!rows.length) countries.append(el('p', 'empty-state', 'No modern overlap recorded.'));
  for (const [name, pct] of countriesExpanded ? rows : rows.slice(0, 8)) {
    const row = el('div', 'country-row'); row.append(leaderLine(name, pct + '%')); countries.append(row);
  }
  const more = $('detail-countries-more');
  more.hidden = rows.length <= 8;
  more.textContent = countriesExpanded ? 'Show fewer countries' : `${rows.length - 8} more countries`;
}

// ----- Timeline: a scale of years with hatching for map changes
function updateScale(lo, hi) {
  const highlight = panel === 'changes' && !state.selected ? currentChanges() : null;
  const signature = `${state.scope}:${lo}:${hi}:${highlight?.previous ?? ''}:${highlight?.year ?? ''}`;
  if (signature === scaleSignature || !atlas) return;
  scaleSignature = signature;
  const toPosition = state.scope === 'all' ? yearToPosition : year => (year - lo) / (hi - lo);
  const bins = state.scope === 'all' ? 200 : Math.min(200, Math.max(10, hi - lo));
  const counts = timelineDensity(atlas.polities, bins, toPosition, state.scope === 'all' ? MIN : lo, state.scope === 'all' ? MAX : hi);
  const peak = Math.max(1, ...counts);
  let hatch = '';
  counts.forEach((count, i) => {
    if (!count) return;
    const x = (i + 0.5) / bins * 1000, h = Math.max(1.5, Math.sqrt(count / peak) * 26);
    hatch += `M${x.toFixed(1)} 30V${(30 - h).toFixed(1)}`;
  });
  const step = state.scope === 'all' ? null : niceStep(hi - lo) / 2;
  const blocks = state.scope === 'all' ? SCALE_BLOCKS
    : [lo, ...Array.from({ length: Math.ceil((hi - lo) / step) }, (_, i) => Math.ceil(lo / step) * step + i * step).filter(y => y > lo && y < hi), hi];
  let rects = '';
  for (let i = 0; i < blocks.length - 1; i++) {
    const x0 = toPosition(blocks[i]) * 1000, x1 = toPosition(blocks[i + 1]) * 1000;
    rects += `<rect x="${x0.toFixed(1)}" y="34" width="${(x1 - x0).toFixed(1)}" height="7" fill="${i % 2 ? 'var(--leaf)' : 'var(--ink)'}"/>`;
  }
  let mark = '';
  if (highlight?.previous !== null && highlight?.previous !== undefined) {
    const x0 = toPosition(highlight.previous) * 1000, x1 = toPosition(highlight.year) * 1000;
    if (x1 >= 0 && x0 <= 1000) mark = `<rect x="${((x0 + x1) / 2 - Math.max(5, (x1 - x0) / 2 + 2)).toFixed(1)}" y="1" width="${Math.max(10, x1 - x0 + 4).toFixed(1)}" height="31" fill="var(--rubric-soft)"/>`;
  }
  $('timeline-scale').innerHTML = `${mark}<path d="${hatch}" stroke="var(--ink-2)" stroke-opacity="0.7" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"/>${rects}<rect x="0" y="34" width="1000" height="7" fill="none" stroke="var(--ink)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
}
function updateTimeline({ recenter = true } = {}) {
  if ((recenter && !scrubbing) || state.year < timelineBounds[0] || state.year > timelineBounds[1]) timelineBounds = timelineWindow(state.year, state.scope, MIN, MAX);
  const [lo, hi] = timelineBounds;
  const pos = state.scope === 'all' ? yearToPosition(state.year) : (state.year - lo) / (hi - lo);
  $('timeline-range').value = Math.round(clamp(pos, 0, 1) * 1000);
  document.querySelector('.timeline-track').style.setProperty('--progress', (clamp(pos, 0, 1) * 100) + '%');
  $('timeline-range').setAttribute('aria-valuetext', fmtYear(state.year));
  $('timeline-scope').value = state.scope;
  $('year-display').textContent = fmtYear(state.year);
  if (document.activeElement !== $('year-input')) $('year-input').value = fmtYear(state.year);
  const [number, era] = fmtYear(state.year).split(' ');
  $('year-number').textContent = number; $('year-era').textContent = era || '';
  $('population-value').textContent = fmtPopulation(atlas?.population(state.year));
  const previous = changeYears.findLast(y => y < state.year), next = changeYears.find(y => y > state.year);
  $('previous-year').disabled = previous === undefined;
  $('next-year').disabled = next === undefined;
  $('previous-year-label').textContent = previous === undefined ? '' : compactYear(previous);
  $('next-year-label').textContent = next === undefined ? '' : compactYear(next);
  $('previous-year').setAttribute('aria-label', previous === undefined ? 'Previous map change' : `Previous map change, ${fmtYear(previous)}`);
  $('next-year').setAttribute('aria-label', next === undefined ? 'Next map change' : `Next map change, ${fmtYear(next)}`);
  $('timeline-description').textContent = state.scope === 'all'
    ? '3400 BCE – 2024 CE · recent centuries expanded'
    : `${fmtYear(lo)} – ${fmtYear(hi)} · ${state.scope}-year window`;
  updateScale(lo, hi);
  const tickYears = state.scope === 'all' ? [-3000, -1000, 1, 1000, 1500, 1800, 2024]
    : Array.from({ length: 5 }, (_, i) => Math.round(lo + (hi - lo) * i / 4)).filter(y => y !== 0);
  const tickWidth = $('timeline-ticks').clientWidth;
  const signature = tickYears.join(',') + ':' + tickWidth;
  if ($('timeline-ticks').dataset.signature !== signature) {
    $('timeline-ticks').dataset.signature = signature; $('timeline-ticks').replaceChildren();
    let previousRight = -100;
    const lastYear = tickYears.at(-1);
    const lastText = lastYear < 0 ? `${-lastYear} BCE` : String(lastYear);
    const reservedEnd = tickWidth - lastText.length * 7.5 - 14;
    for (const [i, y] of tickYears.entries()) {
      const tick = el('span', 'tick');
      const fraction = state.scope === 'all' ? yearToPosition(y) : (y - lo) / (hi - lo);
      tick.style.left = (fraction * 100) + '%'; tick.textContent = y < 0 ? `${-y} BCE` : (y === 1 ? '1 CE' : y);
      const textWidth = tick.textContent.length * 7.5;
      const left = fraction * tickWidth - (i === 0 ? 0 : y === lastYear ? textWidth : textWidth / 2);
      const right = left + textWidth;
      if (y !== lastYear && (left < previousRight + 12 || right > reservedEnd)) continue;
      previousRight = right;
      $('timeline-ticks').append(tick);
    }
  }
}
function setYear(year, { recenter = true } = {}) {
  if (!atlas || !Number.isFinite(year)) return;
  const next = clamp(Math.round(year), MIN, MAX);
  const normalized = next === 0 ? 1 : next;
  const changed = normalized !== state.year || !current.length;
  state.year = normalized;
  $('year-input').removeAttribute('aria-invalid');
  if (changed) {
    current = atlas.snapshot(state.year);
    map.setSnapshot(current, atlas.cityEntries(state.year));
    $('map-era').textContent = fmtYear(state.year);
    $('map-count').textContent = new Set(current.map(p => p.k)).size + ' polities mapped';
    updateDetail();
    if (!state.selected) updateVisible();
    updateChanges();
  }
  updateTimeline({ recenter });
  persist();
}
function stepYear(direction) {
  if (!atlas) return;
  let year;
  if (direction > 0) year = changeYears.find(y => y > state.year);
  else year = changeYears.findLast(y => y < state.year);
  // Playing one polity's history stops at the end of its mapped years.
  if (playRange && direction > 0 && (year === undefined || year > playRange[1])) { stopPlayback(); return; }
  if (year !== undefined) setYear(year);
  else stopPlayback();
}
function stopPlayback() {
  clearInterval(playback); playback = null; playRange = null;
  $('play-toggle').setAttribute('aria-label', 'Play timeline');
  $('play-toggle').setAttribute('aria-pressed', 'false');
  $('play-toggle').dataset.playing = 'false';
  document.querySelector('.map-context').setAttribute('aria-live', 'polite');
  $('year-display').setAttribute('aria-live', 'polite');
  const use = $('play-toggle').querySelector('use'); if (use) use.setAttribute('href', '#icon-play');
  if (atlas && state.selected) updateDetail();
}
function startPlayback(range = null) {
  if (!atlas) return;
  if (range) {
    if (state.year < range[0] || state.year >= range[1]) setYear(changeYears.find(y => y >= range[0]) ?? range[0]);
  } else if (state.year >= changeYears.at(-1)) setYear(changeYears[0]);
  playRange = range;
  $('play-toggle').setAttribute('aria-label', 'Pause timeline');
  $('play-toggle').setAttribute('aria-pressed', 'true');
  $('play-toggle').dataset.playing = 'true';
  document.querySelector('.map-context').setAttribute('aria-live', 'off');
  $('year-display').setAttribute('aria-live', 'off');
  const use = $('play-toggle').querySelector('use'); if (use) use.setAttribute('href', '#icon-pause');
  playback = setInterval(() => stepYear(1), playSpeed);
  if (state.selected) updateDetail();
}
function playPolity() {
  const key = state.selected, e = key && atlas?.index[key];
  if (!e) return;
  if (playRange && playback) { stopPlayback(); return; }
  stopPlayback();
  const records = atlas.byKey.get(key) || [];
  focusPolity(records.reduce((best, record) => !best || record.a > best.a ? record : best, null));
  startPlayback([e.first, e.last]);
}

// ----- Search: polities, alternative names, places, rulers and years
function closeSearch() {
  $('search-results').hidden = true; $('search').setAttribute('aria-expanded', 'false');
  $('search').removeAttribute('aria-activedescendant'); activeSearch = -1;
}
function marked(text, query) {
  const node = el('strong');
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at < 0) { node.textContent = text; return node; }
  node.append(text.slice(0, at), el('mark', '', text.slice(at, at + query.length)), text.slice(at + query.length));
  return node;
}
function lifeBar(first, last) {
  const bar = el('span', 'search-life'); bar.setAttribute('aria-hidden', 'true'); bar.title = `${fmtYear(first)} – ${fmtYear(last)}`;
  const fill = el('span');
  const a = yearToPosition(Math.max(MIN, first)) * 100, b = yearToPosition(Math.min(MAX, last)) * 100;
  fill.style.left = `${a}%`; fill.style.width = `${Math.max(2.5, b - a)}%`;
  bar.append(fill); return bar;
}
function reignText(claim) {
  if (claim.from === null && claim.to === null) return 'dates unknown';
  return `${claim.from === null ? '?' : compactYear(claim.from)}–${claim.to === null ? '?' : compactYear(claim.to)}`;
}
function searchOption(item, query) {
  const option = el('div', 'search-option'); option.setAttribute('role', 'option'); option.setAttribute('aria-selected', 'false');
  const copy = el('span', 'search-option-copy');
  const meta = el('small');
  if (item.type === 'year') {
    option.append(icon('arrow'));
    copy.append(el('strong', '', `Go to ${fmtYear(item.year)}`)); meta.textContent = 'Year';
  } else if (item.type === 'polity') {
    option.append(swatch(item.key));
    copy.append(marked(item.name, query));
    meta.textContent = `${fmtYear(item.first)} – ${fmtYear(item.last)}${item.active ? ' · mapped now' : ''}`;
    if (item.alias) { meta.append(' · also called '); meta.append(el('mark', '', item.alias)); }
  } else if (item.type === 'place') {
    const symbol = el('span', 'search-city'); symbol.setAttribute('aria-hidden', 'true'); option.append(symbol);
    copy.append(marked(item.city.n, query));
    meta.textContent = `City · population figures ${fmtYear(item.first)} – ${fmtYear(item.last)}`;
  } else {
    option.append(icon('person'));
    copy.append(marked(item.claim.name, query));
    meta.textContent = `${displayRole(item.claim.role)} · ${item.polity} · ${reignText(item.claim)}`;
  }
  copy.append(meta); option.append(copy);
  if (item.type === 'polity') option.append(lifeBar(item.first, item.last));
  if (item.type === 'place') option.append(lifeBar(item.first, item.last));
  return option;
}
function runSearch() {
  const query = $('search').value.trim();
  if (!atlas || !query) { closeSearch(); return; }
  const groups = search(query, state.year, atlas.rulers);
  const box = $('search-listbox'); box.replaceChildren(); searchItems = []; activeSearch = -1;
  const sections = [['years', 'Year', 1], ['polities', 'Polities', 6], ['places', 'Places', 4], ['rulers', 'Rulers', 4]];
  for (const [group, title, limit] of sections) {
    const items = groups[group];
    if (!items.length) continue;
    const heading = el('div', 'search-group-heading'); heading.setAttribute('role', 'presentation');
    heading.append(el('span', '', title), el('span', '', group === 'years' ? '' : String(items.length)));
    box.append(heading);
    const shown = searchExpanded.has(group) ? items.slice(0, 30) : items.slice(0, limit);
    for (const item of shown) {
      const index = searchItems.push(item) - 1;
      const option = searchOption(item, query); option.id = 'search-option-' + index;
      option.addEventListener('pointerdown', e => e.preventDefault());
      option.addEventListener('pointerenter', () => { activeSearch = index; updateSearchFocus(false); });
      option.addEventListener('click', () => activateSearch(item));
      box.append(option);
    }
    if (items.length > shown.length) {
      const more = el('button', 'search-more', `${items.length - shown.length} more ${title.toLowerCase()}`); more.type = 'button';
      more.addEventListener('pointerdown', e => e.preventDefault());
      more.addEventListener('click', () => { searchExpanded.add(group); runSearch(); $('search').focus(); });
      box.append(more);
    }
  }
  if (!searchItems.length) box.append(el('div', 'search-empty', 'No match. Try another name, a ruler, a place, or a year such as 1453.'));
  if (atlas.rulersLoading) box.append(el('div', 'search-empty', 'Ruler names become searchable when their records finish loading.'));
  $('search-results').hidden = false; $('search').setAttribute('aria-expanded', 'true');
  renderPreview(searchItems[0]);
}
function updateSearchFocus(scroll = true) {
  for (const [i, item] of [...$('search-listbox').querySelectorAll('[role="option"]')].entries()) item.setAttribute('aria-selected', String(i === activeSearch));
  const item = $('search-option-' + activeSearch);
  if (item) { $('search').setAttribute('aria-activedescendant', item.id); if (scroll) item.scrollIntoView({ block: 'nearest' }); }
  renderPreview(searchItems[Math.max(0, activeSearch)]);
}
function previewButton(label, primary, action) {
  const button = el('button', primary ? 'primary-button' : 'secondary-button', label); button.type = 'button';
  button.addEventListener('pointerdown', e => e.preventDefault());
  button.addEventListener('click', action);
  return button;
}
function renderPreview(item) {
  const box = $('search-preview'); box.replaceChildren();
  if (!item || item.type === 'year' || matchMedia('(max-width: 1000px)').matches) return;
  const title = el('h2'), dates = el('p', 'preview-dates'), facts = el('div', 'leader-list'), actions = el('div', 'preview-actions');
  if (item.type === 'polity') {
    const e = atlas.index[item.key];
    const records = (atlas.byKey.get(item.key) || []).filter(record => record.f <= item.peakYear && record.t >= item.peakYear);
    const canvas = document.createElement('canvas'); canvas.setAttribute('aria-label', `${item.name} at its largest mapped extent, ${fmtYear(item.peakYear)}`); canvas.setAttribute('role', 'img');
    box.append(canvas);
    requestAnimationFrame(() => renderThumbnail(canvas, { geometries: records.map(record => record.g), land: atlas.land, theme, color: getPolityColor(item.key, theme) }));
    title.textContent = item.name; dates.textContent = `Mapped ${fmtYear(item.first)} – ${fmtYear(item.last)}`;
    if (e) facts.append(leaderLine('Maximum extent', `${fmtArea(e.peak_area)}, ${compactYear(e.peak_year)}`));
    if (e?.pred?.length) facts.append(leaderLine('Formed from', `${e.pred[0][0]}, ${e.pred[0][1]}%`));
    if (e?.succ?.length) facts.append(leaderLine('Succeeded by', e.succ.slice(0, 2).map(([name, pct]) => `${name}, ${pct}%`).join('; ')));
    actions.append(previewButton(`Go to ${fmtYear(item.peakYear)}`, true, () => selectPolity(item.key, { peak: true, focus: true })),
      previewButton('Open details', false, () => selectPolity(item.key, { focus: true })));
  } else if (item.type === 'place') {
    title.textContent = item.city.n; dates.textContent = `City · population figures ${fmtYear(item.first)} – ${fmtYear(item.last)}`;
    facts.append(leaderLine('Largest recorded population', Math.round(item.peak).toLocaleString('en-US')));
    actions.append(previewButton('Show on the map', true, () => activateSearch(item)));
  } else {
    title.textContent = item.claim.name; dates.textContent = `${displayRole(item.claim.role)} · ${reignText(item.claim)}`;
    facts.append(leaderLine('Polity', item.polity));
    actions.append(previewButton(`Open ${item.polity}`, true, () => activateSearch(item)));
  }
  box.append(title, dates, facts, actions);
}
function activateSearch(item) {
  if (!item) return;
  if (item.type === 'year') { stopPlayback(); setYear(item.year); closeSearch(); $('search').value = ''; return; }
  if (item.type === 'polity') { selectPolity(item.key, { focus: true }); return; }
  if (item.type === 'place') {
    stopPlayback();
    if (!cityPresent(item.city.s, state.year)) setYear(item.first);
    map.focusPoint([item.city.lo, item.city.la], 7);
    closeSearch(); $('search').value = '';
    announce(`${item.city.n}: population figures from ${fmtYear(item.first)} to ${fmtYear(item.last)}.`);
    return;
  }
  stopPlayback();
  // Open at the reign's start, or the nearest year in which the polity is mapped.
  const e = atlas.index[item.key];
  if (Number.isFinite(item.claim.from)) setYear(e ? clamp(item.claim.from, e.first, e.last) : item.claim.from);
  selectPolity(item.key, { focus: true });
}

function applyLayers() {
  $('borders-mode').value = state.borders; $('cities-toggle').checked = state.cities; $('labels-toggle').checked = state.labels;
  $('terrain-toggle').checked = state.terrain; $('rivers-toggle').checked = state.rivers;
  map.setLayers({ borders: state.borders, cities: state.cities, labels: state.labels, terrain: state.terrain, rivers: state.rivers });
  loadGeography(); syncLegend();
  if (atlas) updateChanges();
}
function syncLegend() {
  $('city-legend').hidden = changesLegend || !state.cities;
  $('river-legend').hidden = changesLegend || !state.rivers || geography.rivers !== 'ready';
}
// Present-day geography is requested once the basemap has arrived, and only
// for layers that are switched on. A failed request is retried by switching
// the layer off and on again.
function loadGeography() {
  if (!geography.base) return;
  if (state.rivers && !geography.rivers) {
    geography.rivers = 'loading';
    loadRivers().then(data => { geography.rivers = 'ready'; map.setData({ rivers: data }); geographyStatus(); syncLegend(); })
      .catch(error => { geography.rivers = null; geographyStatus(`${error.message} Switch rivers off and on to retry.`); });
  }
  if (state.terrain && !geography.relief) {
    geography.relief = 'loading';
    loadRelief().then(blob => map.setRelief(blob)).then(status => { geography.relief = status; geographyStatus(); })
      .catch(error => { geography.relief = null; geographyStatus(`${error.message} Switch terrain off and on to retry.`); });
  }
}
function geographyStatus(message = '') {
  const unsupported = geography.relief === 'unsupported';
  $('terrain-toggle').disabled = unsupported;
  const text = message || (unsupported ? 'Terrain shading needs WebGL 2, which this browser does not provide.' : '');
  $('geography-status').textContent = text; $('geography-status').hidden = !text;
}
function applyProjection() {
  map.setProjection(state.projection);
  $('projection-flat').setAttribute('aria-pressed', String(state.projection === 'flat'));
  $('projection-globe').setAttribute('aria-pressed', String(state.projection === 'globe'));
  $('projection-flat').classList.toggle('active', state.projection === 'flat');
  $('projection-globe').classList.toggle('active', state.projection === 'globe');
}

map = createMap($('map'), {
  onSelect(polity) { if (polity) selectPolity(polity.k); else deselect(); },
  onHover(hit) {
    const tip = $('map-tooltip');
    if (!hit || !atlas) { tip.hidden = true; return; }
    tip.textContent = hit.polity.n + ' · ' + fmtArea(hit.polity.a);
    tip.hidden = false;
    const width = $('map-stage').clientWidth, height = $('map-stage').clientHeight;
    tip.style.left = clamp(hit.x + 16, 8, Math.max(8, width - tip.offsetWidth - 8)) + 'px';
    tip.style.top = clamp(hit.y + 18, 8, Math.max(8, height - tip.offsetHeight - 8)) + 'px';
  },
  onViewChange() {
    $('map-tooltip').hidden = true; persist();
    if (panel === 'changes' && !state.selected) { clearTimeout(viewTimer); viewTimer = setTimeout(updateChanges, 180); }
  },
});
applyTheme(); applyLayers(); applyProjection();
map.setView(state);
const mobileQuery = matchMedia('(max-width: 760px)');
function syncSidebarState() {
  const open = mobileQuery.matches ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
  $('sidebar-toggle').setAttribute('aria-expanded', String(open));
}
mobileQuery.addEventListener('change', syncSidebarState);
syncSidebarState();

$('theme-toggle').addEventListener('click', () => { theme = theme === 'light' ? 'dark' : 'light'; storage.set('chronoscape-theme', theme); applyTheme(); scaleSignature = ''; if (atlas) updateTimeline({ recenter: false }); });
$('sidebar-toggle').addEventListener('click', () => {
  const open = mobile() ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
  open ? closeSidebar() : openSidebar();
});
$('sidebar-close').addEventListener('click', () => { closeSidebar(); $('sidebar-toggle').focus(); });
$('detail-deselect').addEventListener('click', deselect);
$('detail-peak').addEventListener('click', () => { if (state.selected) selectPolity(state.selected, { peak: true, focus: true }); });
$('detail-focus').addEventListener('click', () => focusPolity(current.find(p => p.k === state.selected)));
$('detail-play').addEventListener('click', playPolity);
$('detail-countries-more').addEventListener('click', () => { countriesExpanded = !countriesExpanded; if (state.selected) renderCountries(atlas.index[state.selected]); });
for (const [id, value] of [['tab-largest', 'largest'], ['tab-changes', 'changes']]) {
  $(id).addEventListener('click', () => setPanel(value));
  $(id).addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault(); e.stopPropagation();
    setPanel(panel === 'largest' ? 'changes' : 'largest');
    $(panel === 'largest' ? 'tab-largest' : 'tab-changes').focus();
  });
}
$('changes-all').addEventListener('click', () => { changesFilter = 'all'; updateChanges(); });
$('changes-view').addEventListener('click', () => { changesFilter = 'view'; updateChanges(); });
$('projection-flat').addEventListener('click', () => { state.projection = 'flat'; applyProjection(); persist(); });
$('projection-globe').addEventListener('click', () => { state.projection = 'globe'; applyProjection(); persist(); });
$('zoom-in').addEventListener('click', () => map.zoomBy(1.45));
$('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.45));
$('reset-view').addEventListener('click', () => { map.reset(); persist(); });
$('layers-toggle').addEventListener('click', () => { $('layers-panel').hidden = !$('layers-panel').hidden; $('layers-toggle').setAttribute('aria-expanded', String(!$('layers-panel').hidden)); });
for (const [id, key] of [['borders-mode', 'borders'], ['cities-toggle', 'cities'], ['labels-toggle', 'labels'], ['terrain-toggle', 'terrain'], ['rivers-toggle', 'rivers']]) {
  $(id).addEventListener('change', e => { state[key] = key === 'borders' ? e.target.value : e.target.checked; applyLayers(); persist(); });
}
$('search').addEventListener('input', () => { searchExpanded.clear(); runSearch(); });
$('search').addEventListener('focus', () => { if ($('search').value) runSearch(); });
$('search').addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSearch(); e.stopPropagation(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if ($('search-results').hidden) runSearch();
    activeSearch = clamp(activeSearch + (e.key === 'ArrowDown' ? 1 : -1), 0, searchItems.length - 1); updateSearchFocus();
  }
  if (e.key === 'Enter' && searchItems.length && !$('search-results').hidden) {
    e.preventDefault(); activateSearch(searchItems[Math.max(0, activeSearch)]);
  }
});
document.addEventListener('pointerdown', e => {
  if (!$('search-results').contains(e.target) && e.target !== $('search')) closeSearch();
  if (!$('layers-panel').contains(e.target) && !$('layers-toggle').contains(e.target)) { $('layers-panel').hidden = true; $('layers-toggle').setAttribute('aria-expanded', 'false'); }
});
$('year-form').addEventListener('submit', e => {
  e.preventDefault(); stopPlayback();
  if (!atlas) { announce('The historical map is still loading.'); return; }
  const year = parseYear($('year-input').value);
  if (year === null || year < MIN || year > MAX) {
    $('year-input').setAttribute('aria-invalid', 'true');
    announce('Enter a year from 3400 BCE to 2024 CE, such as 450 BCE or 1453. There is no year zero.'); return;
  }
  $('year-input').removeAttribute('aria-invalid'); setYear(year); $('year-input').value = fmtYear(state.year); $('year-input').blur();
});
$('previous-year').addEventListener('click', () => { stopPlayback(); stepYear(-1); });
$('next-year').addEventListener('click', () => { stopPlayback(); stepYear(1); });
$('play-toggle').addEventListener('click', () => playback ? stopPlayback() : startPlayback());
for (const button of document.querySelectorAll('.speed-control button')) {
  button.addEventListener('click', () => {
    playSpeed = Number(button.dataset.speed);
    for (const other of document.querySelectorAll('.speed-control button')) other.setAttribute('aria-pressed', String(other === button));
    if (playback) { const range = playRange; clearInterval(playback); playback = setInterval(() => stepYear(1), playSpeed); playRange = range; }
  });
}
$('timeline-scope').addEventListener('change', () => { state.scope = $('timeline-scope').value; updateTimeline(); persist(); });
$('timeline-range').addEventListener('pointerdown', () => { scrubbing = true; stopPlayback(); });
$('timeline-range').addEventListener('keydown', e => {
  if (!atlas || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault(); e.stopPropagation(); stopPlayback();
  if (e.key === 'Home') setYear(state.scope === 'all' ? MIN : timelineBounds[0], { recenter: false });
  else if (e.key === 'End') setYear(state.scope === 'all' ? MAX : timelineBounds[1], { recenter: false });
  else if (state.scope === 'all') stepYear(e.key === 'ArrowLeft' ? -1 : 1);
  else {
    const direction = e.key === 'ArrowLeft' ? -1 : 1;
    const next = state.year + direction;
    setYear(next === 0 ? direction : next, { recenter: false });
  }
});
$('timeline-range').addEventListener('input', () => {
  if (!atlas) return;
  stopPlayback();
  const fraction = Number($('timeline-range').value) / 1000;
  const target = state.scope === 'all' ? positionToYear(fraction) : timelineBounds[0] + fraction * (timelineBounds[1] - timelineBounds[0]);
  // The whole-history slider visits source-change years. Zoomed windows permit
  // individual years, including quiet years within a recorded interval.
  pendingYear = state.scope === 'all' ? nearestYear(changeYears, target) : Math.round(target);
  if (!yearFrame) yearFrame = requestAnimationFrame(() => { yearFrame = 0; setYear(pendingYear, { recenter: false }); });
});
function finishScrub() { if (scrubbing) { scrubbing = false; /* Preserve the chosen time window until navigation leaves it. */ persist(); } }
window.addEventListener('pointerup', finishScrub);
window.addEventListener('pointercancel', finishScrub);
window.addEventListener('blur', () => { finishScrub(); stopPlayback(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
$('help-button').addEventListener('click', () => $('help-dialog').showModal());
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('click', e => { if (e.target === $('help-dialog')) $('help-dialog').close(); });
$('share-button').addEventListener('click', async () => {
  persist(true);
  try { await navigator.clipboard.writeText(location.href); announce('Link copied. It includes your year, selection, map view, and layers.'); }
  catch {
    const toast = $('toast'); toast.replaceChildren(document.createTextNode('Copy the address from your browser to share this view. '));
    const link = document.createElement('a'); link.href = location.href; link.textContent = 'Current view'; toast.append(link); toast.hidden = false;
  }
});
document.addEventListener('keydown', e => {
  if ($('help-dialog').open) return;
  const editing = e.target.closest?.('input, select, textarea, button, summary, a[href], [tabindex]:not(canvas)') || e.target.isContentEditable;
  if (e.key === 'Escape') {
    const overlayOpen = !$('search-results').hidden || !$('layers-panel').hidden;
    closeSearch(); $('layers-panel').hidden = true; $('layers-toggle').setAttribute('aria-expanded', 'false');
    if (!overlayOpen && state.selected) deselect();
    return;
  }
  if (editing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('search').focus(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stopPlayback(); stepYear(e.key === 'ArrowLeft' ? -1 : 1); }
  if (e.code === 'Space') { e.preventDefault(); playback ? stopPlayback() : startPlayback(); }
});
window.addEventListener('hashchange', () => {
  if (!atlas) return;
  stopPlayback(); Object.assign(state, readHash(location.hash));
  if (!atlas.byKey.has(state.selected)) state.selected = null;
  applyProjection(); applyLayers(); map.setView(state); map.setSelected(state.selected);
  selectedChartKey = null; current = []; setYear(state.year);
  if (state.selected) openSidebar();
});

async function boot() {
  $('retry-button').hidden = true;
  $('loading-status').hidden = false;
  $('loading-progress').removeAttribute('value');
  $('search').disabled = true;
  try {
    atlas = await loadAtlas({
      onBase(data) { map.setData(data); geography.base = true; loadGeography(); },
      onRulers(loadedAtlas) {
        // A cached response may settle before the await assigns atlas. Boot
        // renders that state; a later response refreshes the current selection.
        if (atlas === loadedAtlas) { updateDetail(); if (!$('search-results').hidden) runSearch(); }
      },
      onProgress(info) {
        $('loading-message').textContent = info.message || 'Loading map data…';
        if (info.total && info.loaded) { $('loading-progress').max = info.total; $('loading-progress').value = info.loaded; }
        else $('loading-progress').removeAttribute('value');
      },
    });
    search = createSearch(atlas, { min: MIN, max: MAX });
    atlas.rulersReady.then(data => { if (data) (window.requestIdleCallback || setTimeout)(() => search.prepare(data)); });
    changeYears = atlas.years.filter(y => y >= MIN && y <= MAX && y !== 0);
    if (!atlas.byKey.has(state.selected)) state.selected = null;
    map.setData({ land: atlas.land, borders: atlas.borders });
    map.setSelected(state.selected);
    current = []; setYear(state.year);
    $('loading-status').hidden = true; $('search').disabled = false;
    if (state.selected) openSidebar();
    // Apply a shared camera only after initial layout/data have settled.
    map.setView(readHash(location.hash));
    // On a phone, a link that names a polity but no camera frames it above the sheet.
    if (state.selected && mobile() && !/(^|[#&])zoom=/.test(location.hash)) {
      requestAnimationFrame(() => focusPolity(current.find(p => p.k === state.selected) || atlas.byKey.get(state.selected)?.[0]));
    }
    persist();
  } catch (error) {
    console.error('Chronoscape could not load', error);
    $('loading-message').textContent = error.message || 'The atlas could not load. Check your connection and try again.';
    $('loading-progress').hidden = true; $('retry-button').hidden = false;
    announce('Map data is unavailable. Your view has been preserved.');
  }
}
$('retry-button').addEventListener('click', () => { $('loading-progress').hidden = false; boot(); });
window.addEventListener('pagehide', () => { stopPlayback(); });
new ResizeObserver(() => { if (atlas) updateTimeline({ recenter: false }); }).observe($('timeline-ticks'));
boot();
