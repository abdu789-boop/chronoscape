/* Local browser checks for atlas navigation: What changed, search, polity
 * playback, globe orientation, the phone sheet and themes. Requires Playwright
 * and an installed Chromium/Chrome; see tests/browser/README.md.
 * QA_BASE_URL defaults to the local static server; no deployment is performed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8337/';
const output = process.env.QA_OUTPUT || '/private/tmp/chronoscape-atlas-qa';

async function ready(page) {
  await page.waitForFunction(() => document.getElementById('loading-status')?.hidden === true, null, { timeout: 60000 });
}
// The displayed year; the URL is written a moment later.
const year = page => page.evaluate(() => {
  const number = Number(document.getElementById('year-number').textContent.replace(/,/g, ''));
  return document.getElementById('year-era').textContent === 'BCE' ? -number : number;
});

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const checks = [], errors = [];
  const pass = name => checks.push(name);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(base + '#year=1200');
    await ready(page);
    assert.equal(await page.locator('#year-number').innerText(), '1200');
    assert.equal(await page.locator('#year-era').innerText(), 'CE');
    assert.equal(await page.locator('#previous-year-label').innerText(), '1192');
    assert.equal(await page.locator('#next-year-label').innerText(), '1202');
    assert.match(await page.locator('#population-value').innerText(), /^\d+(\.\d)? million$/);
    assert.ok(await page.locator('#visible-list .place-row').count() >= 5);
    pass('year face, step labels, population and largest polities');
    await page.screenshot({ path: output + '/explore.png' });

    await page.locator('#year-input').fill('500 BCE');
    await page.locator('#year-input').press('Enter');
    await page.waitForFunction(() => document.getElementById('year-era').textContent === 'BCE');
    assert.equal(await page.locator('#year-number').innerText(), '500');
    pass('typed BCE year updates the year face');

    await page.goto(base + '#year=1206');
    await ready(page);
    await page.locator('#tab-changes').click();
    assert.equal(await page.locator('#explore-title').innerText(), 'Changes in 1206 CE');
    assert.match(await page.locator('#explore-intro').innerText(), /Compared with the map of 1202 CE: 17 first mapped, 3 no longer mapped and 24 changed in area\./);
    const groups = await page.locator('#changes-groups').innerText();
    assert.match(groups, /Mongol Empire/); assert.match(groups, /Latin Empire/); assert.match(groups, /Nicaean Empire/);
    assert.match(groups, /Byzantine Empire[\s\S]*−382,282 km²/);
    assert.match(groups, /Chámpa[\s\S]*Mapped again from 1220 CE/);
    assert.equal(await page.locator('.legend-changes').first().isVisible(), true);
    assert.equal(await page.locator('#changes-count').innerText(), '44');
    pass('What changed lists first mapped, no longer mapped and area changes for 1206 CE');
    await page.locator('#changes-view').click();
    const inView = Number((await page.locator('#changes-view').innerText()).match(/\d+/)[0]);
    assert.ok(inView > 0 && inView <= 44);
    await page.locator('#zoom-in').click(); await page.locator('#zoom-in').click(); await page.locator('#zoom-in').click();
    await page.waitForTimeout(500);
    const zoomed = Number((await page.locator('#changes-view').innerText()).match(/\d+/)[0]);
    assert.ok(zoomed < inView, `zooming in narrows the changes in view (${zoomed} < ${inView})`);
    pass('In this view follows the map camera');
    await page.locator('#changes-all').click();
    await page.locator('#reset-view').click();
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#changes-view').innerText(), 'In this view · 44', 'the count follows the camera with either filter');
    await page.screenshot({ path: output + '/changes.png' });

    await page.goto(base + '#year=1200');
    await ready(page);
    await page.locator('#search').fill('rome');
    await page.waitForSelector('#search-results [role="option"]');
    // Rulers join the results once their optional download has finished.
    await page.waitForFunction(() => /Romeo Bosque/.test(document.getElementById('search-listbox').innerText), null, { timeout: 30000 });
    const first = page.locator('#search-results [role="option"]').first();
    assert.match(await first.innerText(), /Roman Empire[\s\S]*also called Rome/);
    const results = await page.locator('#search-listbox').innerText();
    assert.match(results, /PLACES[\s\S]*Rome[\s\S]*population figures 500 BCE – 2000 CE/i);
    assert.match(results, /RULERS[\s\S]*Romeo Bosque/i);
    assert.equal(await page.locator('#search-preview canvas').count(), 1);
    assert.match(await page.locator('#search-preview').innerText(), /Roman Empire[\s\S]*Maximum extent/);
    pass('search finds alternative names, places and rulers with a preview');
    await page.screenshot({ path: output + '/search.png' });
    await page.locator('#search').press('Enter');
    await page.waitForFunction(() => document.getElementById('detail-name').textContent === 'Roman Empire');
    assert.equal(await year(page), 118, 'a polity not mapped in the current year opens at its maximum extent');
    pass('Enter opens the highlighted polity');

    await page.locator('#search').fill('1453');
    await page.waitForSelector('#search-results [role="option"]');
    assert.match(await page.locator('#search-results [role="option"]').first().innerText(), /Go to 1453 CE/);
    await page.locator('#search').press('Enter');
    await page.waitForFunction(() => document.getElementById('year-number').textContent === '1453');
    pass('a typed year is offered and opens');

    await page.locator('#search').fill('saladin');
    await page.waitForSelector('#search-results [role="option"]');
    await page.locator('#search-results [role="option"]').filter({ hasText: /Ayyubid Sultanate/ }).first().click();
    await page.waitForFunction(() => document.getElementById('detail-name').textContent === 'Ayyubid Sultanate');
    assert.equal(await year(page), 1177, 'a reign that began before the polity was mapped opens at its first mapped year');
    pass('a ruler result opens the polity at the reign');

    await page.goto(base + '#year=1200&polity=wd%3AQ180114');
    await ready(page);
    assert.equal(await page.locator('#detail-play').innerText(), 'Play 1177–1249');
    await page.locator('.speed-control button', { hasText: '5×' }).click();
    await page.locator('#detail-play').click();
    assert.equal(await page.locator('#play-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#detail-play').getAttribute('aria-pressed'), 'true');
    const seen = new Set();
    for (let i = 0; i < 80 && await page.locator('#play-toggle').getAttribute('aria-pressed') === 'true'; i++) {
      seen.add(await year(page)); await page.waitForTimeout(100);
    }
    assert.equal(await page.locator('#play-toggle').getAttribute('aria-pressed'), 'false', 'playback stops at the end of the mapped years');
    const years = [...seen, await year(page)];
    assert.ok(years.every(value => value >= 1177 && value <= 1249), `playback stays within 1177–1249: ${years.join(', ')}`);
    assert.ok(years.length >= 4);
    assert.equal(await page.locator('#detail-name').innerText(), 'Ayyubid Sultanate');
    pass('Play steps through the polity\'s mapped years and stops');
    await page.screenshot({ path: output + '/selected.png' });

    await page.goto(base + '#year=1200');
    await ready(page);
    await page.locator('#projection-globe').click();
    await page.waitForTimeout(400);
    const rotation = await page.evaluate(() => Number(new URLSearchParams(location.hash.slice(1)).get('rx')));
    assert.ok(rotation < -30 && rotation > -100, `globe turns toward Eurasia in 1200 CE (rx ${rotation})`);
    pass('the globe opens toward the year\'s territories');
    await page.locator('#theme-toggle').click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.locator('meta[name="theme-color"]').getAttribute('content'), '#0e1420');
    await page.waitForTimeout(400);
    await page.screenshot({ path: output + '/globe-dark.png' });
    await page.locator('#theme-toggle').click();
    pass('dark theme');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.close();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(base + '#year=1200&polity=wd%3AQ180114');
    await ready(mobile);
    await mobile.waitForTimeout(400);
    const layout = await mobile.evaluate(() => {
      const header = document.querySelector('.app-header').getBoundingClientRect();
      const sheet = document.getElementById('sidebar').getBoundingClientRect();
      const timeline = document.getElementById('timeline').getBoundingClientRect();
      return { mapTop: header.bottom, sheetTop: sheet.top, mapBottom: timeline.top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok((layout.sheetTop - layout.mapTop) / (layout.mapBottom - layout.mapTop) >= 0.38, `the sheet leaves the upper map visible (${JSON.stringify(layout)})`);
    assert.equal(layout.overflow, false);
    const view = await mobile.evaluate(() => Number(new URLSearchParams(location.hash.slice(1)).get('zoom')));
    assert.ok(view > 1.5, `a shared polity link without a camera frames the polity on a phone (zoom ${view})`);
    pass('phone sheet leaves the map visible above it, with the polity framed');
    await mobile.screenshot({ path: output + '/mobile.png' });
    await mobile.close();

    assert.deepEqual(errors, []);
    pass('no page errors');
    const report = { passed: true, checks, screenshots: ['explore.png', 'changes.png', 'search.png', 'selected.png', 'globe-dark.png', 'mobile.png'] };
    fs.writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
