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
  if (claim.to === null) {
    const dated = claim.assertions.filter(item => item.ongoing && Number.isInteger(item.asOf));
    const asOf = dated.length ? Math.min(...dated.map(item => item.asOf)) : null;
    return `${prefix}${first} – ${asOf ? `documented in office at ${fmtYear(asOf)}` : 'unknown end'}`;
  }
  return `${prefix}${first} – ${fmtYear(claim.to)}`;
}

const displayRole = role => role === 'Effective primary political leader (Archigos definition)' ? 'National political leader' : role;

/** Keep the roster DOM stable while the timeline moves (focus, scroll, expansion). */
export function createRulersView({ onRetry } = {}) {
  let previousData, previousKey, previousError, previousLoading;
  const rows = new Map();
  const $ = id => document.getElementById(id);
  return (data, key, year, error, loading = false) => {
    const result = getRulers(data, key, year);
    const changed = data !== previousData || key !== previousKey || error !== previousError || loading !== previousLoading;
    const sources = data?.sources || {};
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
        : result.rulers.length ? 'Partial succession list · sourced records with verification status below.'
          : 'Succession list awaiting verification.';
      $('detail-ruler-note').textContent = error || loading ? '' : [result.scope, result.note].filter(Boolean).join(' ');
      const list = $('detail-ruler-list'); list.replaceChildren(); rows.clear();
      $('detail-ruler-roster').hidden = result.rulers.length === 0;
      $('detail-ruler-roster').open = false;
      $('detail-ruler-count').textContent = `${result.rulers.length} sourced reign${result.rulers.length === 1 ? '' : 's'} · succession list`;
      for (const claim of result.rulers) {
        const row = element('li', 'ruler-row'); row.dataset.rulerId = claim.id;
        row.append(element('strong', 'history-name', claim.name));
        row.append(element('span', 'ruler-dates', `${displayRole(claim.role)} · ${reignDates(claim)}`));
        row.append(element('span', 'ruler-status', labels[claim.assessment.status]));
        if (claim.sourceDates && result.rulers.some(other => other.id !== claim.id && other.personKey === claim.personKey && other.from === claim.from)) {
          row.append(element('span', 'history-item-note', `Separate tenure · source dates: ${claim.sourceDates.from} to ${claim.sourceDates.to}`));
        }
        if (claim.uncertainty?.reason) row.append(element('span', 'history-item-note', claim.uncertainty.reason));
        if (claim.uncertainty?.alternatives?.length) row.append(element('span', 'history-item-note', `Alternative dates: ${claim.uncertainty.alternatives.map(item => `${item.label ? `${item.label}: ` : ''}${fmtYear(item.from)}–${fmtYear(item.to)}`).join('; ')}`));
        if (claim.note) row.append(element('span', 'history-item-note', claim.note));
        const evidence = element('details', 'ruler-evidence');
        evidence.append(element('summary', '', 'Sources and checks'));
        evidence.append(element('p', 'history-note', claim.assessment.reasons.join(' ')));
        const seen = new Set();
        for (const assertion of claim.assertions || []) {
          const source = sources[assertion.sourceId];
          if (!source || seen.has(assertion.sourceId)) continue;
          seen.add(assertion.sourceId);
          const p = element('p', 'history-sources'); p.append(sourceLink(source, assertion.locator));
          p.append(document.createTextNode(` · record ${assertion.sourceRecordId}`)); evidence.append(p);
        }
        row.append(evidence, element('span', 'ruler-active'));
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
      row.querySelector('.ruler-active').textContent = claim.active ? `In office during ${fmtYear(year)}`
        : claim.possiblyActive ? `Possibly in office during ${fmtYear(year)}` : '';
    }
  };
}
