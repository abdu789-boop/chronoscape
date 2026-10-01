import { displayRole, getRulers } from './rulers.js';
import { fmtYear } from './data.js';

const labels = {
  corroborated: 'Individually cross-checked', 'source-reviewed': 'Source checked by sample', approximate: 'Approximate chronology',
  'dates-unknown': 'Tenure dates incomplete',
  disputed: 'Disputed chronology', 'semi-legendary': 'Semi-legendary', legendary: 'Legendary tradition',
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function sourceLink(source, locator) {
  const node = element('a', '', source.title);
  const url = locator?.match(/^https:\/\/[^\s]+/)?.[0] || source.url;
  if (/^https:\/\/[^\s]+$/.test(url || '')) {
    node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer';
  }
  return node;
}

function reignDates(claim) {
  const prefix = claim.precision === 'approximate' || ['approximate', 'semi-legendary', 'legendary'].includes(claim.assessment.status) ? 'c. ' : '';
  if (claim.from === null && claim.to === null) return 'Dates unknown';
  const first = claim.from === null ? 'Unknown start' : fmtYear(claim.from);
  if (claim.to === null) return `${prefix}${first} – ?`;
  return `${prefix}${first} – ${fmtYear(claim.to)}`;
}


/** A shared, floating detail panel keeps long evidence out of the roster layout. */
function createRulerTooltip() {
  const panel = element('div', 'ruler-tooltip');
  panel.id = 'ruler-tooltip'; panel.popover = 'auto';
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'ruler-tooltip-name');
  document.body.append(panel);
  let current, leaveTimer, restoringFocus = false;
  const cancelLeave = () => clearTimeout(leaveTimer);
  const close = (restore = false) => {
    cancelLeave();
    const trigger = current;
    current = null;
    trigger?.setAttribute('aria-expanded', 'false');
    if (panel.matches(':popover-open')) panel.hidePopover();
    if (restore && trigger?.isConnected) {
      restoringFocus = true; trigger.focus({ preventScroll: true }); restoringFocus = false;
    }
  };
  const scheduleClose = () => {
    cancelLeave();
    leaveTimer = setTimeout(() => {
      if (!panel.contains(document.activeElement) && document.activeElement !== current) close();
    }, 180);
  };
  const position = () => {
    const anchor = current.getBoundingClientRect(), gap = 8;
    const width = panel.offsetWidth, height = panel.offsetHeight;
    let left = anchor.right + gap;
    if (left + width > innerWidth - gap) left = Math.max(gap, anchor.left - width - gap);
    let top = Math.max(gap, Math.min(anchor.top, innerHeight - height - gap));
    if (innerWidth < 640) {
      left = (innerWidth - width) / 2;
      top = anchor.bottom + gap + height <= innerHeight - gap ? anchor.bottom + gap
        : Math.max(gap, anchor.top - height - gap);
    }
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  };
  const show = (trigger, render) => {
    cancelLeave();
    if (restoringFocus || current === trigger && panel.matches(':popover-open')) return;
    close(); current = trigger;
    panel.replaceChildren();
    const header = element('div', 'ruler-tooltip-heading');
    const name = element('strong', 'history-name', trigger.rulerClaim.name); name.id = 'ruler-tooltip-name';
    const dismiss = element('button', 'ruler-tooltip-close', '×'); dismiss.type = 'button';
    dismiss.setAttribute('aria-label', 'Close ruler details'); dismiss.addEventListener('click', () => close(true));
    header.append(name, dismiss); panel.append(header); render(panel, trigger.rulerClaim);
    panel.showPopover({ source: trigger });
    trigger.setAttribute('aria-expanded', 'true'); position();
  };
  panel.addEventListener('pointerenter', cancelLeave);
  panel.addEventListener('pointerleave', scheduleClose);
  panel.addEventListener('focusout', event => {
    if (!panel.contains(event.relatedTarget) && event.relatedTarget !== current) close();
  });
  panel.addEventListener('toggle', () => {
    if (!panel.matches(':popover-open')) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && panel.matches(':popover-open')) {
      event.preventDefault(); event.stopImmediatePropagation(); close(true);
    }
  }, true);
  document.addEventListener('scroll', event => {
    if (!current || panel.contains(event.target)) return;
    const anchor = current.getBoundingClientRect();
    const clips = [current.closest('.ruler-list'), current.closest('.sidebar-scroll')]
      .filter(Boolean).map(node => node.getBoundingClientRect());
    const top = Math.max(0, ...clips.map(bounds => bounds.top));
    const bottom = Math.min(innerHeight, ...clips.map(bounds => bounds.bottom));
    if (anchor.bottom <= top || anchor.top >= bottom) close();
    else position();
  }, true);
  window.addEventListener('resize', () => close());
  return {
    close,
    bind(trigger, render) {
      trigger.setAttribute('aria-haspopup', 'dialog'); trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', panel.id);
      trigger.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') show(trigger, render); });
      trigger.addEventListener('pointerleave', scheduleClose);
      trigger.addEventListener('focus', () => {
        if (!restoringFocus) requestAnimationFrame(() => {
          if (document.activeElement === trigger) show(trigger, render);
        });
      });
      trigger.addEventListener('blur', event => {
        if (!panel.contains(event.relatedTarget)) close();
      });
      trigger.addEventListener('click', () => {
        show(trigger, render);
        panel.querySelector('a, button')?.focus({ preventScroll: true });
      });
    },
  };
}

function compactYear(year) {
  return year < 0 ? `${-year} BCE` : String(year);
}

/** Reign dates written compactly: "1200–1218", "247–211 BCE", "31 BCE–14 CE". */
function compactReign(claim) {
  const prefix = claim.precision === 'approximate' || ['approximate', 'semi-legendary', 'legendary'].includes(claim.assessment.status) ? 'c. ' : '';
  if (claim.from === null && claim.to === null) return 'dates unknown';
  if (claim.from === null || claim.to === null) return prefix + reignDates(claim).replace(/^c\. /, '');
  if (claim.from > 0 && claim.to > 0) return `${prefix}${claim.from}–${claim.to}`;
  if (claim.from < 0 && claim.to < 0) return `${prefix}${-claim.from}–${-claim.to} BCE`;
  return `${prefix}${fmtYear(claim.from)}–${fmtYear(claim.to)}`;
}

/** The name a chart bar can carry: a parenthesised common name, else the name before a patronymic. */
function shortName(name) {
  const common = name.match(/\(([^)]+)\)\s*$/);
  if (common) return common[1];
  return name.split(/,| b\. | bin | ibn /)[0].trim();
}

/** Rulers in office in the selected year, each with title, reign and evidence label. */
function renderCurrent(box, result, loading) {
  box.replaceChildren();
  const active = result.rulers.filter(claim => claim.active);
  const possible = result.rulers.filter(claim => claim.possiblyActive);
  if (loading || !active.length) {
    box.append(element('p', 'ruler-current-empty', loading ? 'Loading ruler records…' : possible.length
      ? `Possible for this year: ${possible.map(claim => claim.name).join('; ')}`
      : 'No checked ruler is documented for this year.'));
    return;
  }
  const list = element('ul', 'leader-list ruler-current-list');
  for (const claim of active) {
    const item = element('li', 'leader-row');
    const line = element('span', 'leader-line');
    line.append(element('span', 'leader-name', claim.name), element('span', 'leader-dots'), element('span', 'leader-value', compactReign(claim)));
    const label = labels[claim.assessment.status];
    item.append(line, element('span', 'leader-note', `${displayRole(claim.role)}${label ? ` · ${label.charAt(0).toLowerCase()}${label.slice(1)}` : ''}`));
    list.append(item);
  }
  box.append(list);
}

/**
 * Reigns on a shared time axis, one lane per title, in the manner of an
 * eighteenth-century chart of biography. Reigns in the selected year are marked.
 */
function buildReignChart(figure, rulers) {
  figure.replaceChildren();
  const dated = rulers.filter(claim => Number.isFinite(claim.from) && Number.isFinite(claim.to));
  figure.hidden = dated.length < 2;
  if (figure.hidden) return { bars: new Map(), lo: 0, hi: 0 };
  let lo = Math.min(...dated.map(claim => claim.from)), hi = Math.max(...dated.map(claim => claim.to));
  const pad = Math.max(1, Math.round((hi - lo) * 0.03)); lo -= pad; hi += pad;
  const x = year => (year - lo) / (hi - lo) * 100;
  const roles = new Map();
  for (const claim of dated) {
    const role = displayRole(claim.role);
    if (!roles.has(role)) roles.set(role, []);
    roles.get(role).push(claim);
  }
  const ordered = [...roles].sort((a, b) => b[1].length - a[1].length);
  const lanes = ordered.slice(0, 3);
  if (ordered.length > 3) lanes.push(['Other', ordered.slice(3).flatMap(([, claims]) => claims)]);
  const bars = new Map();
  for (const [role, claims] of lanes) {
    const rows = [];
    for (const claim of [...claims].sort((a, b) => a.from - b.from || a.to - b.to)) {
      const row = rows.find(row => row.at(-1).to <= claim.from) || (rows.length < 4 ? rows[rows.push([]) - 1] : rows.at(-1));
      row.push(claim);
    }
    const lane = element('div', 'reign-lane');
    lane.append(element('span', 'reign-role', role));
    const track = element('div', 'reign-track'); track.style.height = `${rows.length * 19 + 2}px`;
    rows.forEach((row, index) => {
      for (const claim of row) {
        const bar = element('span', 'reign-bar');
        if (claim.precision === 'approximate' || ['approximate', 'disputed'].includes(claim.assessment.status)) bar.classList.add('approximate');
        bar.style.left = `${x(claim.from)}%`; bar.style.width = `${Math.max(0.6, x(claim.to) - x(claim.from))}%`;
        bar.style.top = `${index * 19 + 12}px`;
        bar.title = `${claim.name}, ${displayRole(claim.role)}, ${reignDates(claim)}`;
        if (x(claim.to) - x(claim.from) >= 14) bar.append(element('span', 'reign-label', shortName(claim.name)));
        track.append(bar); bars.set(claim.id, bar);
      }
    });
    lane.append(track); figure.append(lane);
  }
  const axis = element('div', 'reign-axis'), track = element('div', 'reign-axis-track');
  const now = element('span', 'reign-axis-now');
  track.append(element('span', 'reign-axis-start', compactYear(lo + pad)), now, element('span', 'reign-axis-end', compactYear(hi - pad)));
  axis.append(element('span'), track);
  const line = element('span', 'reign-now');
  figure.append(axis, line);
  return { bars, lo, hi, now, line };
}

/** Keep the roster DOM stable while the timeline moves (focus, scroll, expansion). */
export function createRulersView({ onRetry } = {}) {
  let chart = { bars: new Map(), lo: 0, hi: 0 };
  let previousData, previousKey, previousError, previousLoading, previousYear;
  const tooltip = createRulerTooltip();
  const rows = new Map();
  const $ = id => document.getElementById(id);
  return (data, key, year, error, loading = false) => {
    const result = getRulers(data, key, year);
    const changed = data !== previousData || key !== previousKey || error !== previousError || loading !== previousLoading;
    const sources = data?.sources || {};
    if (changed || year !== previousYear) tooltip.close();
    previousYear = year;
    $('detail-ruler-year').textContent = fmtYear(year);
    renderCurrent($('detail-ruler-current'), result, loading);
    if (changed) {
      previousData = data; previousKey = key; previousError = error; previousLoading = loading;
      const errorBox = $('detail-history-error'); errorBox.replaceChildren(); errorBox.hidden = !error;
      if (error) {
        errorBox.append(element('p', 'history-note', 'Ruler records could not be loaded.'));
        const retry = element('button', 'text-button', 'Retry ruler records');
        retry.type = 'button'; retry.addEventListener('click', () => onRetry?.()); errorBox.append(retry);
      }
      $('detail-ruler-coverage').textContent = error || loading ? '' : result.coverage === 'complete'
        ? 'Complete within the stated scope; independently cross-checked.'
        : result.rulers.length ? 'Partial succession list.'
          : 'Succession list awaiting verification.';
      const list = $('detail-ruler-list'); list.replaceChildren(); rows.clear();
      $('detail-ruler-roster').hidden = result.rulers.length === 0;
      $('detail-ruler-roster').open = false;
      $('detail-ruler-count').textContent = `Succession list · ${result.rulers.length} sourced reign${result.rulers.length === 1 ? '' : 's'}`;
      chart = buildReignChart($('detail-ruler-chart'), result.rulers);
      for (const claim of result.rulers) {
        const row = element('li', 'ruler-row'); row.dataset.rulerId = claim.id;
        const trigger = element('button', 'ruler-trigger'); trigger.type = 'button'; trigger.rulerClaim = claim;
        trigger.append(element('strong', 'history-name', claim.name));
        trigger.append(element('span', 'ruler-dates', `${displayRole(claim.role)} · ${reignDates(claim)}`));
        tooltip.bind(trigger, (panel, detail) => {
          panel.append(element('p', 'ruler-status', labels[detail.assessment.status]));
          if (detail.dateStatus === 'incomplete') panel.append(element('p', 'history-note', `Source chronology: ${detail.sourceDateText}`));
          if (detail.to === null) {
            const cutoffs = detail.assertions.filter(item => item.ongoing && Number.isInteger(item.asOf)).map(item => item.asOf);
            panel.append(element('p', 'history-note', cutoffs.length
              ? `End date unknown; documented in office at ${fmtYear(Math.min(...cutoffs))}.` : 'End date unknown.'));
          }
          if (detail.active || detail.possiblyActive) panel.append(element('p', 'history-note',
            `${detail.active ? 'In office' : 'Possibly in office'} during ${fmtYear(previousYear)}`));
          if (detail.sourceDates && result.rulers.some(other => other.id !== detail.id && other.personKey === detail.personKey && other.from === detail.from)) {
            panel.append(element('p', 'history-note', `Separate tenure · source dates: ${detail.sourceDates.from} to ${detail.sourceDates.to}`));
          }
          if (detail.uncertainty?.reason) panel.append(element('p', 'history-note', detail.uncertainty.reason));
          if (detail.uncertainty?.alternatives?.length) panel.append(element('p', 'history-note', `Alternative dates: ${detail.uncertainty.alternatives.map(item => `${item.label ? `${item.label}: ` : ''}${fmtYear(item.from)}–${fmtYear(item.to)}`).join('; ')}`));
          if (detail.note) panel.append(element('p', 'history-note', detail.note));
          if (detail.aliases?.length) panel.append(element('p', 'history-note', `Also recorded as: ${detail.aliases.join('; ')}`));
          panel.append(element('p', 'history-note', detail.assessment.reasons.join(' ')));
          const seen = new Set();
          const evidence = [...(detail.assertions || []), ...(detail.mergedEvidence || []).flatMap(record => record.assertions || [])];
          for (const assertion of evidence) {
            const source = sources[assertion.sourceId];
            const key = JSON.stringify([assertion.sourceId, assertion.sourceRecordId, assertion.locator]);
            if (!source || seen.has(key)) continue;
            seen.add(key);
            const p = element('p', 'history-sources'); p.append(sourceLink(source, assertion.locator));
            p.append(document.createTextNode(` · record ${assertion.sourceRecordId}`)); panel.append(p);
          }
        });
        row.append(trigger);
        rows.set(claim.id, row); list.append(row);
      }
      const sourceBox = $('detail-ruler-sources'); sourceBox.replaceChildren();
      const links = data?.polities?.[key]?.research?.links || [];
      const wikipedia = links.find(link => /^https:\/\/en\.wikipedia\.org\/wiki\//.test(link.url || ''));
      if (wikipedia) {
        const p = element('p', 'history-sources polity-wikipedia');
        p.append(sourceLink({ ...wikipedia, title: `${wikipedia.title} on Wikipedia ↗` }));
        sourceBox.append(p);
      }
      if (!result.rulers.length) {
        const leads = links.filter(link => link !== wikipedia).slice(0, 3);
        if (leads.length) sourceBox.append(element('p', 'history-note', 'Source leads under review; no ruler claims from them are accepted yet.'));
        for (const link of leads) {
          const p = element('p', 'history-sources'); p.append(sourceLink(link)); sourceBox.append(p);
        }
      }
    }
    for (const claim of result.rulers) {
      chart.bars.get(claim.id)?.classList.toggle('active', claim.active);
      const row = rows.get(claim.id); if (!row) continue;
      row.classList.toggle('active', claim.active);
      row.querySelector('.ruler-trigger').rulerClaim = claim;
    }
    if (chart.line) {
      const inside = Number.isFinite(year) && year >= chart.lo && year <= chart.hi;
      chart.line.hidden = chart.now.hidden = !inside;
      const at = inside ? (year - chart.lo) / (chart.hi - chart.lo) : 0;
      chart.line.style.setProperty('--at', at); chart.now.style.left = `${at * 100}%`;
      chart.now.textContent = at > 0.12 && at < 0.88 ? compactYear(year) : '';
    }
  };
}
