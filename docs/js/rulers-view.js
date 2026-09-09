import { getRulers } from './rulers.js';
import { fmtYear } from './data.js';

const labels = {
  corroborated: 'Individually cross-checked', 'source-reviewed': 'Source checked by sample', approximate: 'Approximate chronology',
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
  const prefix = ['approximate', 'semi-legendary', 'legendary'].includes(claim.assessment.status) ? 'c. ' : '';
  if (claim.from === null && claim.to === null) return 'Dates unknown';
  const first = claim.from === null ? 'Unknown start' : fmtYear(claim.from);
  if (claim.to === null) return `${prefix}${first} – ?`;
  return `${prefix}${first} – ${fmtYear(claim.to)}`;
}

const displayRole = role => role === 'Effective primary political leader (Archigos definition)' ? 'National political leader' : role;

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

/** Keep the roster DOM stable while the timeline moves (focus, scroll, expansion). */
export function createRulersView({ onRetry } = {}) {
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
    const active = result.rulers.filter(claim => claim.active);
    const possible = result.rulers.filter(claim => claim.possiblyActive);
    $('detail-ruler-current').textContent = loading ? 'Loading ruler records…' : active.length
      ? active.map(claim => `${claim.name} · ${displayRole(claim.role)}`).join('; ')
      : possible.length ? `Possible for this year: ${possible.map(claim => claim.name).join('; ')}`
        : 'No checked ruler is documented for this year.';
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
      $('detail-ruler-count').textContent = `${result.rulers.length} sourced reign${result.rulers.length === 1 ? '' : 's'} · succession list`;
      for (const claim of result.rulers) {
        const row = element('li', 'ruler-row'); row.dataset.rulerId = claim.id;
        const trigger = element('button', 'ruler-trigger'); trigger.type = 'button'; trigger.rulerClaim = claim;
        trigger.append(element('strong', 'history-name', claim.name));
        trigger.append(element('span', 'ruler-dates', `${displayRole(claim.role)} · ${reignDates(claim)}`));
        tooltip.bind(trigger, (panel, detail) => {
          panel.append(element('p', 'ruler-status', labels[detail.assessment.status]));
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
          panel.append(element('p', 'history-note', detail.assessment.reasons.join(' ')));
          const seen = new Set();
          for (const assertion of detail.assertions || []) {
            const source = sources[assertion.sourceId];
            if (!source || seen.has(assertion.sourceId)) continue;
            seen.add(assertion.sourceId);
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
      const row = rows.get(claim.id); if (!row) continue;
      row.classList.toggle('active', claim.active);
      row.querySelector('.ruler-trigger').rulerClaim = claim;
    }
  };
}
