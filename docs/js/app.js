import { loadAtlas, loadRulers, fmtYear, fmtArea, fmtPop, nearestYear, parseYear } from './data.js';
import { createMap, getPolityColor } from './map.js';
import { createRulersView } from './rulers-view.js';
import { clamp, yearToPosition, positionToYear, timelineWindow, readHash, writeHash } from './state.js';

const $ = id => document.getElementById(id);
const state = readHash(location.hash);
let atlas, changeYears = [], current = [], map, playback = null;
let timelineBounds = [-3400, 2024], searchRows = [], activeSearch = -1;
let persistenceTimer, toastTimer, scrubbing = false;
let selectedChartKey = null, yearFrame = 0, pendingYear = null;
const MIN = -3400, MAX = 2024;
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#17191b' : '#f6f4ee');
  for (const mark of document.querySelectorAll('[data-polity-key]')) {
    mark.style.setProperty('--swatch', getPolityColor(mark.dataset.polityKey, theme));
  }
  $('theme-toggle').setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark'));
  $('theme-toggle').title = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
  map?.setTheme(theme);
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
function selectPolity(key, { focus = false, peak = false, open = true } = {}) {
  if (!atlas || !atlas.byKey.has(key)) return;
  const changingSelection = state.selected !== key;
  state.selected = key;
  const entry = atlas.index[key];
  if (peak || !current.some(p => p.k === key)) setYear(entry.peak_year);
  map.setSelected(key);
  updateDetail();
  if (changingSelection) document.querySelector('.sidebar-scroll').scrollTop = 0;
  if (open) openSidebar();
  if (focus) {
    // Wait for the sidebar layout before fitting the selected extent.
    requestAnimationFrame(() => map.focus(current.find(p => p.k === key) || atlas.byKey.get(key)?.[0]));
  }
  closeSearch();
  $('search').value = '';
  $('map-tooltip').hidden = true;
  persist();
}
function deselect() {
  state.selected = null;
  selectedChartKey = null;
  map.setSelected(null);
  $('detail-panel').hidden = true;
  $('explore-panel').hidden = false;
  updateVisible();
  document.querySelector('.sidebar-scroll').scrollTop = 0;
  persist();
}

function makePlace(entry, caption, action, key = entry.k || entry.n || entry.name) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'place-row';
  const mark = document.createElement('span'); mark.className = 'place-swatch'; mark.setAttribute('aria-hidden', 'true');
  mark.dataset.polityKey = key;
  mark.style.setProperty('--swatch', getPolityColor(key, theme));
  const copy = document.createElement('span'); copy.className = 'place-copy';
  const title = document.createElement('strong'); title.textContent = entry.n || entry.name;
  const sub = document.createElement('small'); sub.textContent = caption;
  const arrow = document.createElement('span'); arrow.className = 'place-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
  copy.append(title, sub); button.append(mark, copy, arrow);
  button.addEventListener('click', action);
  return button;
}
function updateVisible() {
  const box = $('visible-list'); box.replaceChildren();
  const unique = new Set();
  for (const p of current) {
    if (unique.has(p.k)) continue;
    unique.add(p.k);
    box.append(makePlace(p, fmtArea(p.a), () => selectPolity(p.k, { focus: true })));
    if (unique.size >= 8) break;
  }
  if (!unique.size) {
    const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = 'No polities are mapped for this year.'; box.append(p);
  }
}
function fillRelations(id, rows, emptyText) {
  const box = $(id); box.replaceChildren();
  if (!rows?.length) {
    const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = emptyText; box.append(p); return;
  }
  for (const [name, percent] of rows) {
    // Names can be ambiguous across unrelated historical states. Only make a
    // navigation link when the name identifies exactly one index entry.
    const matches = Object.entries(atlas.index).filter(([, e]) => e.n === name);
    const row = document.createElement(matches.length === 1 ? 'button' : 'div');
    row.className = 'relation-link country-row';
    if (matches.length === 1) { row.type = 'button'; row.addEventListener('click', () => selectPolity(matches[0][0], { focus: true })); }
    const label = document.createElement('span'); label.textContent = name;
    const value = document.createElement('strong'); value.textContent = percent + '%';
    row.append(label, value); box.append(row);
  }
}
function drawExtentChart(records, entry) {
  const svg = $('detail-chart'); svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const width = 284, height = 78, pad = 5;
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
  const max = Math.max(...values.map(p => p[1]), 1);
  const x = y => pad + (y - lo) / Math.max(1, hi - lo) * (width - pad * 2);
  const y = a => height - pad - a / max * (height - pad * 2);
  let line = `M ${x(values[0][0])} ${y(values[0][1])}`;
  for (let i = 1; i < values.length; i++) line += ` H ${x(values[i][0])} V ${y(values[i][1])}`;
  const area = document.createElementNS(ns, 'path');
  area.setAttribute('d', line + ` L ${x(hi)} ${height - pad} L ${x(lo)} ${height - pad} Z`);
  area.setAttribute('fill', 'var(--accent)'); area.setAttribute('fill-opacity', '.12');
  const stroke = document.createElementNS(ns, 'path'); stroke.setAttribute('d', line); stroke.setAttribute('fill', 'none');
  stroke.setAttribute('stroke', 'var(--accent)'); stroke.setAttribute('stroke-width', '1.8');
  const marker = document.createElementNS(ns, 'line'); marker.id = 'extent-marker';
  marker.setAttribute('y1', pad); marker.setAttribute('y2', height - pad); marker.setAttribute('stroke', 'var(--ink)'); marker.setAttribute('stroke-dasharray', '3 3');
  svg.dataset.first = lo; svg.dataset.last = hi; svg.append(area, stroke, marker);
  $('detail-chart-caption').textContent = `${fmtYear(entry.first)} — ${fmtYear(entry.last)} · mapped extent`;
}
function updateDetail() {
  const key = state.selected, e = atlas?.byKey.has(key) ? atlas.index[key] : null;
  if (!key || !e) { $('detail-panel').hidden = true; $('explore-panel').hidden = false; return; }
  $('detail-panel').hidden = false; $('explore-panel').hidden = true;
  const present = current.filter(p => p.k === key);
  const area = present.reduce((total, p) => total + p.a, 0);
  $('detail-name').textContent = e.n;
  $('detail-period').textContent = fmtYear(e.first) + ' – ' + fmtYear(e.last);
  $('detail-status').textContent = present.length ? 'Mapped in ' + fmtYear(state.year) : 'Not mapped in ' + fmtYear(state.year);
  $('detail-status').classList.toggle('inactive', !present.length);
  $('detail-area-label').textContent = 'Mapped extent · ' + fmtYear(state.year);
  $('detail-area').textContent = present.length ? fmtArea(area) : 'Not recorded';
  $('detail-focus').disabled = !present.length;
  $('detail-peak').textContent = `Go to maximum extent · ${fmtYear(e.peak_year)}`;
  updateRulers(atlas.rulers, key, state.year, atlas.rulersError, atlas.rulersLoading);
  if (selectedChartKey !== key) {
    selectedChartKey = key;
    drawExtentChart(atlas.byKey.get(key) || [], e);
    fillRelations('detail-pred', e.pred, 'No earlier polity recorded here.');
    fillRelations('detail-succ', e.succ, 'No later polity recorded here.');
    const countries = $('detail-countries'); countries.replaceChildren();
    for (const [name, pct] of e.countries || []) {
      const row = document.createElement('div'); row.className = 'country-row';
      const label = document.createElement('span'); label.textContent = name;
      const value = document.createElement('strong'); value.textContent = pct + '%';
      row.append(label, value); countries.append(row);
    }
    if (!e.countries?.length) countries.textContent = 'No modern overlap recorded.';
    const notes = ['Maximum recorded extent: ' + fmtArea(e.peak_area) + '. Boundaries and derived areas reflect the available historical map data.'];
    if (e.tstart) notes.push('Its beginning may predate the dataset.');
    if (e.tend) notes.push('The record reaches the dataset boundary; this does not establish an end date.');
    $('detail-notes').textContent = notes.join(' ');
  }
  const marker = $('extent-marker'), svg = $('detail-chart');
  if (marker) {
    const lo = Number(svg.dataset.first), hi = Number(svg.dataset.last);
    const x = 5 + clamp((state.year - lo) / Math.max(1, hi - lo), 0, 1) * 274;
    marker.setAttribute('x1', x); marker.setAttribute('x2', x);
    marker.style.display = present.length ? '' : 'none';
  }
}

function updateTimeline({ recenter = true } = {}) {
  if ((recenter && !scrubbing) || state.year < timelineBounds[0] || state.year > timelineBounds[1]) timelineBounds = timelineWindow(state.year, state.scope, MIN, MAX);
  const [lo, hi] = timelineBounds;
  const pos = state.scope === 'all' ? yearToPosition(state.year) : (state.year - lo) / (hi - lo);
  $('timeline-range').value = Math.round(clamp(pos, 0, 1) * 1000);
  $('timeline-range').style.setProperty('--progress', (clamp(pos, 0, 1) * 100) + '%');
  $('timeline-range').setAttribute('aria-valuetext', fmtYear(state.year));
  $('timeline-scope').value = state.scope;
  $('year-display').textContent = fmtYear(state.year);
  if (document.activeElement !== $('year-input')) $('year-input').value = fmtYear(state.year);
  $('population-value').textContent = fmtPop(atlas?.population(state.year));
  $('previous-year').disabled = !changeYears.some(y => y < state.year);
  $('next-year').disabled = !changeYears.some(y => y > state.year);
  $('timeline-description').textContent = state.scope === 'all'
    ? '3400 BCE – 2024 CE · recent centuries expanded'
    : `${fmtYear(lo)} – ${fmtYear(hi)} · ${state.scope}-year window`;
  const tickYears = state.scope === 'all' ? [-3000, -1000, 1, 1000, 1500, 1800, 2024]
    : Array.from({ length: 5 }, (_, i) => Math.round(lo + (hi - lo) * i / 4)).filter(y => y !== 0);
  const tickWidth = $('timeline-ticks').clientWidth;
  const signature = tickYears.join(',') + ':' + tickWidth;
  if ($('timeline-ticks').dataset.signature !== signature) {
    $('timeline-ticks').dataset.signature = signature; $('timeline-ticks').replaceChildren();
    let previousRight = -100;
    const lastYear = tickYears.at(-1);
    const lastText = lastYear < 0 ? `${-lastYear} BCE` : String(lastYear);
    const reservedEnd = tickWidth - lastText.length * 6.5 - 14;
    for (const [i, y] of tickYears.entries()) {
      const tick = document.createElement('span'); tick.className = 'tick';
      const fraction = state.scope === 'all' ? yearToPosition(y) : (y - lo) / (hi - lo);
      tick.style.left = (fraction * 100) + '%'; tick.textContent = y < 0 ? `${-y} BCE` : (y === 1 ? '1 CE' : y);
      const textWidth = tick.textContent.length * 6.5;
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
  }
  updateTimeline({ recenter });
  persist();
}
function stepYear(direction) {
  if (!atlas) return;
  let year;
  if (direction > 0) year = changeYears.find(y => y > state.year);
  else year = changeYears.findLast(y => y < state.year);
  if (year !== undefined) setYear(year);
  else stopPlayback();
}
function stopPlayback() {
  clearInterval(playback); playback = null;
  $('play-toggle').setAttribute('aria-label', 'Play timeline');
  $('play-toggle').setAttribute('aria-pressed', 'false');
  $('play-toggle').dataset.playing = 'false';
  document.querySelector('.map-context').setAttribute('aria-live', 'polite');
  $('year-display').setAttribute('aria-live', 'polite');
  const use = $('play-toggle').querySelector('use'); if (use) use.setAttribute('href', '#icon-play');
}
function startPlayback() {
  if (!atlas) return;
  if (state.year >= changeYears.at(-1)) setYear(changeYears[0]);
  $('play-toggle').setAttribute('aria-label', 'Pause timeline');
  $('play-toggle').setAttribute('aria-pressed', 'true');
  $('play-toggle').dataset.playing = 'true';
  document.querySelector('.map-context').setAttribute('aria-live', 'off');
  $('year-display').setAttribute('aria-live', 'off');
  const use = $('play-toggle').querySelector('use'); if (use) use.setAttribute('href', '#icon-pause');
  playback = setInterval(() => stepYear(1), Number($('play-speed').value));
}
function closeSearch() {
  $('search-results').hidden = true; $('search').setAttribute('aria-expanded', 'false');
  $('search').removeAttribute('aria-activedescendant'); activeSearch = -1;
}
function runSearch() {
  const query = $('search').value.trim();
  if (!atlas || !query) { closeSearch(); return; }
  searchRows = atlas.search(query, state.year).slice(0, 20);
  const box = $('search-results'); box.replaceChildren(); activeSearch = -1;
  if (!searchRows.length) {
    const empty = document.createElement('div'); empty.className = 'search-empty'; empty.setAttribute('role', 'presentation');
    empty.textContent = 'No matching polity. Try a different name.'; box.append(empty);
  }
  searchRows.forEach((row, i) => {
    const item = document.createElement('div'); item.id = 'search-option-' + i;
    item.className = 'search-option'; item.setAttribute('role', 'option'); item.setAttribute('aria-selected', 'false');
    const title = document.createElement('strong'); title.textContent = row.name;
    const meta = document.createElement('span'); meta.textContent = `${fmtYear(row.first)} – ${fmtYear(row.last)}${row.active ? ' · mapped now' : ''}`;
    item.append(title, meta); item.addEventListener('pointerdown', e => e.preventDefault());
    item.addEventListener('click', () => selectPolity(row.key, { focus: true }));
    box.append(item);
  });
  box.hidden = false; $('search').setAttribute('aria-expanded', 'true');
}
function updateSearchFocus() {
  for (const [i, item] of [...$('search-results').querySelectorAll('[role="option"]')].entries()) item.setAttribute('aria-selected', String(i === activeSearch));
  const item = $('search-option-' + activeSearch);
  if (item) { $('search').setAttribute('aria-activedescendant', item.id); item.scrollIntoView({ block: 'nearest' }); }
}
function applyLayers() {
  $('borders-mode').value = state.borders; $('cities-toggle').checked = state.cities; $('labels-toggle').checked = state.labels;
  $('city-legend').hidden = !state.cities;
  map.setLayers({ borders: state.borders, cities: state.cities, labels: state.labels });
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
  onViewChange() { $('map-tooltip').hidden = true; persist(); },
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

$('theme-toggle').addEventListener('click', () => { theme = theme === 'light' ? 'dark' : 'light'; storage.set('chronoscape-theme', theme); applyTheme(); });
$('sidebar-toggle').addEventListener('click', () => {
  const mobile = matchMedia('(max-width: 760px)').matches;
  const open = mobile ? document.body.classList.contains('sidebar-open') : !document.body.classList.contains('sidebar-collapsed');
  open ? closeSidebar() : openSidebar();
});
$('sidebar-close').addEventListener('click', () => { closeSidebar(); $('sidebar-toggle').focus(); });
$('detail-deselect').addEventListener('click', deselect);
$('detail-peak').addEventListener('click', () => { if (state.selected) selectPolity(state.selected, { peak: true, focus: true }); });
$('detail-focus').addEventListener('click', () => { const p = current.find(p => p.k === state.selected); if (p) map.focus(p); });
$('projection-flat').addEventListener('click', () => { state.projection = 'flat'; applyProjection(); persist(); });
$('projection-globe').addEventListener('click', () => { state.projection = 'globe'; applyProjection(); persist(); });
$('zoom-in').addEventListener('click', () => map.zoomBy(1.45));
$('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.45));
$('reset-view').addEventListener('click', () => { map.reset(); persist(); });
$('layers-toggle').addEventListener('click', () => { $('layers-panel').hidden = !$('layers-panel').hidden; $('layers-toggle').setAttribute('aria-expanded', String(!$('layers-panel').hidden)); });
for (const [id, key] of [['borders-mode', 'borders'], ['cities-toggle', 'cities'], ['labels-toggle', 'labels']]) {
  $(id).addEventListener('change', e => { state[key] = key === 'borders' ? e.target.value : e.target.checked; applyLayers(); persist(); });
}
$('search').addEventListener('input', runSearch);
$('search').addEventListener('focus', () => { if ($('search').value) runSearch(); });
$('search').addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeSearch(); e.stopPropagation(); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault(); if ($('search-results').hidden) runSearch();
    activeSearch = clamp(activeSearch + (e.key === 'ArrowDown' ? 1 : -1), 0, searchRows.length - 1); updateSearchFocus();
  }
  if (e.key === 'Enter' && searchRows.length && !$('search-results').hidden) {
    e.preventDefault(); selectPolity(searchRows[Math.max(0, activeSearch)].key, { focus: true });
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
$('play-speed').addEventListener('change', () => { if (playback) { stopPlayback(); startPlayback(); } });
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
      onBase(data) { map.setData(data); },
      onRulers(loadedAtlas) {
        // A cached response may settle before the await assigns atlas. Boot
        // renders that state; a later response refreshes the current selection.
        if (atlas === loadedAtlas) updateDetail();
      },
      onProgress(info) {
        $('loading-message').textContent = info.message || 'Loading map data…';
        if (info.total && info.loaded) { $('loading-progress').max = info.total; $('loading-progress').value = info.loaded; }
        else $('loading-progress').removeAttribute('value');
      },
    });
    changeYears = atlas.years.filter(y => y >= MIN && y <= MAX && y !== 0);
    if (!atlas.byKey.has(state.selected)) state.selected = null;
    map.setData({ land: atlas.land, borders: atlas.borders });
    map.setSelected(state.selected);
    current = []; setYear(state.year);
    $('loading-status').hidden = true; $('search').disabled = false;
    if (state.selected) openSidebar();
    // Apply a shared camera only after initial layout/data have settled.
    map.setView(readHash(location.hash));
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
