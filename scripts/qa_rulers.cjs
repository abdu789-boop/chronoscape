/* Local browser checks. Requires Playwright and an installed Chromium/Chrome.
 * QA_BASE_URL defaults to the local static server; no deployment is performed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8337/';
const output = process.env.QA_OUTPUT || '/private/tmp/chronoscape-rulers-qa';

async function assertCompactRows(page) {
  assert.equal(await page.locator('.ruler-tooltip').count(), 1);
  assert.equal(await page.locator('.ruler-tooltip').isVisible(), false);
  assert.equal(await page.locator('.ruler-row').evaluateAll(rows => rows.every(row => {
    const name = row.querySelector('.history-name');
    const dates = row.querySelector('.ruler-dates');
    const normalize = text => text.replace(/\s+/g, ' ').trim();
    return name && dates && row.querySelector('.ruler-trigger')
      && normalize(row.innerText) === normalize(`${name.innerText} ${dates.innerText}`);
  })), true, 'Ruler rows show only the name, title, and reign dates');
}

async function assertPopupFitsViewport(page) {
  assert.equal(await page.locator('.ruler-tooltip').evaluate(tooltip => {
    const bounds = tooltip.getBoundingClientRect();
    return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
  }), true, 'Ruler tooltip fits within the viewport');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '#year=750&polity=wd%3AQ9683');
    await page.waitForFunction(() => document.querySelector('.ruler-row'));
    assert.equal(await page.locator('.polity-wikipedia a').getAttribute('href'), 'https://en.wikipedia.org/wiki/Tang_dynasty');
    await page.locator('#detail-ruler-roster > summary').click();
    assert.match(await page.locator('#detail-ruler-current').innerText(), /Xuán|Xuanzong/);
    await assertCompactRows(page);
    await page.evaluate(() => {
      window.qaRuler = document.querySelector('.ruler-row');
      window.qaTooltip = document.querySelector('.ruler-tooltip');
    });
    await page.locator('#year-input').fill('751 CE');
    await page.locator('#year-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#detail-ruler-year').textContent === '751 CE');
    assert.equal(await page.evaluate(() => window.qaRuler === document.querySelector('.ruler-row')), true);
    assert.equal(await page.evaluate(() => window.qaTooltip === document.querySelector('.ruler-tooltip')), true);
    assert.equal(await page.locator('#detail-ruler-roster').getAttribute('open'), '');
    await page.locator('#detail-ruler-roster > summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#play-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#detail-ruler-roster > summary').click();
    const tooltip = page.locator('.ruler-tooltip');
    const firstRuler = page.locator('.ruler-trigger').first();
    await firstRuler.hover();
    await tooltip.waitFor({ state: 'visible' });
    assert.equal(await tooltip.getAttribute('role'), 'dialog');
    assert.match(await tooltip.innerText(), /cross-checked|checked by sample|chronology/);
    const source = tooltip.locator('a').first();
    assert.match(await source.getAttribute('href'), /^https:\/\//);
    await source.hover();
    assert.equal(await tooltip.isVisible(), true, 'Source links remain reachable when leaving the ruler trigger');
    await page.locator('#detail-name').click();
    await tooltip.waitFor({ state: 'hidden' });
    await firstRuler.focus();
    await tooltip.waitFor({ state: 'visible' });
    const selectedPolity = await page.locator('#detail-name').innerText();
    await page.keyboard.press('Escape');
    await tooltip.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#detail-name').innerText(), selectedPolity, 'Escape closes the tooltip without deselecting the polity');
    assert.equal(await firstRuler.evaluate(node => document.activeElement === node), true);
    await page.locator('#detail-name').click();
    await assertCompactRows(page);
    await page.screenshot({ path: output + '/desktop.png' });

    await page.goto(base + '#year=2000&polity=wd%3AQ30');
    await page.waitForFunction(() => document.querySelectorAll('.ruler-row').length > 0);
    await page.locator('#detail-ruler-roster > summary').click();
    await assertCompactRows(page);
    assert.match(await page.locator('#detail-ruler-list').innerText(), /Ulysses/);
    assert.equal(await page.locator('.ruler-row').count(), 46);
    assert.equal(await page.locator('.history-name').filter({ hasText: /Gerald.*Ford/ }).count(), 1);
    assert.equal(await page.locator('.polity-wikipedia a').getAttribute('href'), 'https://en.wikipedia.org/wiki/United_States');
    await page.locator('.ruler-trigger').filter({ hasText: /Rutherford B. Hayes/ }).first().hover();
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Source checked by sample/);
    assert.match(await tooltip.locator('a').first().getAttribute('href'), /^https:\/\//);

    await page.goto(base + '#year=-91&polity=wd%3AQ1986139');
    await page.waitForFunction(() => document.querySelectorAll('.ruler-row').length >= 25);
    assert.match(await page.locator('#detail-ruler-current').innerText(), /Mithridates II/);
    assert.equal(await page.locator('.polity-wikipedia a').getAttribute('href'), 'https://en.wikipedia.org/wiki/Parthian_Empire');
    await page.locator('#detail-ruler-roster > summary').click();
    await assertCompactRows(page);
    assert.doesNotMatch(await page.locator('#detail-ruler-list').innerText(), /Disputed chronology|Alternative dates|Daryaee|Sources and checks/);
    await page.locator('.ruler-trigger').filter({ has: page.locator('.history-name').filter({ hasText: /^Mithridates II$/ }) }).click();
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Disputed chronology/);
    assert.match(await tooltip.innerText(), /Alternative dates/);
    assert.match(await tooltip.innerText(), /Daryaee/);
    await assertPopupFitsViewport(page);
    await page.screenshot({ path: output + '/parthian.png' });
    await tooltip.locator('.ruler-tooltip-close').click();
    await tooltip.waitFor({ state: 'hidden' });

    await page.goto(base + '#year=1650&polity=wd%3AQ33296');
    await page.waitForFunction(() => document.querySelector('#detail-name').textContent.includes('Mughal') && document.querySelectorAll('.ruler-row').length > 0);
    await page.locator('#detail-ruler-roster > summary').click();
    await assertCompactRows(page);
    const shahJahan = page.locator('.ruler-trigger').filter({ has: page.locator('.history-name').filter({ hasText: /^Shah Jahan$/ }) });
    assert.equal(await shahJahan.count(), 1);
    assert.match(await shahJahan.innerText(), /1,?628.*1,?658/);
    assert.match(await page.locator('#detail-ruler-current').innerText(), /Shah Jahan/);
    await shahJahan.click();
    await tooltip.waitFor({ state: 'visible' });
    assert.match(await tooltip.innerText(), /Also recorded as/);
    assert.match(await tooltip.innerText(), /Shihab|Shihāb/);
    assert.ok(await tooltip.locator('a').count() >= 3, 'Merged source observations remain reachable');
    await assertPopupFitsViewport(page);
    await page.screenshot({ path: output + '/mughal.png' });
    await tooltip.locator('.ruler-tooltip-close').click();

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(base + '#year=-91&polity=wd%3AQ1986139');
    await mobile.waitForFunction(() => document.querySelectorAll('.ruler-row').length >= 25);
    await mobile.locator('#detail-ruler-roster > summary').tap();
    await mobile.locator('.ruler-trigger').first().scrollIntoViewIfNeeded();
    await assertCompactRows(mobile);
    await mobile.screenshot({ path: output + '/mobile.png' });
    const mobileTooltip = mobile.locator('.ruler-tooltip');
    await mobile.locator('.ruler-trigger').first().tap();
    await mobileTooltip.waitFor({ state: 'visible' });
    assert.match(await mobileTooltip.innerText(), /Disputed chronology/);
    assert.match(await mobileTooltip.locator('a').first().getAttribute('href'), /^https:\/\//);
    await assertPopupFitsViewport(mobile);
    await mobile.screenshot({ path: output + '/mobile-tooltip.png' });
    await mobile.locator('#detail-name').tap();
    await mobileTooltip.waitFor({ state: 'hidden' });
    assert.match(await mobile.locator('#detail-name').innerText(), /Parthian/);
    await mobile.close();

    await page.goto(base + '#year=-2500&polity=wd%3AQ2345840');
    await page.waitForFunction(() => document.querySelector('#detail-ruler-coverage').textContent.includes('awaiting'));
    assert.equal(await page.locator('#detail-ruler-roster').isVisible(), false);
    assert.match(await page.locator('#detail-ruler-sources').innerText(), /Source leads under review/);
    assert.match(await page.locator('.polity-wikipedia a').getAttribute('href'), /^https:\/\/en\.wikipedia\.org\/wiki\//);

    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#visible-list').children.length > 0);
    assert.equal(await page.locator('#featured-list').count(), 0);
    assert.equal(await page.getByText('Polity shortcuts', { exact: true }).count(), 0);
    await page.locator('#search').fill('Ottoman');
    await page.waitForSelector('#search-results [role="option"]');
    await page.locator('#search-results [role="option"]').first().click();
    assert.match(await page.locator('#detail-name').innerText(), /Ottoman/);
    assert.ok(await page.locator('.ruler-row').count() >= 30);
    assert.equal(await page.locator('.ruler-dates').filter({ hasText: /^Caliph/ }).count(), 0);
    assert.deepEqual(errors, []);
    const report = { passed: true, checks: ['ruler selection', 'year updates preserve roster and tooltip DOM', 'keyboard expansion preserves paused playback', 'compact rows contain only name, title, and reign dates', 'hover tooltip retains reachable source links', 'keyboard focus opens tooltip and Escape preserves polity selection', 'outside click and close button dismiss tooltip', 'Wikipedia links with and without rulers', 'mobile tap opens tooltip within viewport and outside tap dismisses it', 'sample-reviewed source label in tooltip', 'expanded Parthian list with disputed chronology and named alternative dates in tooltip', 'unverified coverage', 'polity shortcuts removed', 'search selection and expanded Ottoman list', 'no page errors'], screenshots: ['desktop.png', 'mobile.png', 'parthian.png', 'mobile-tooltip.png'] };
    report.checks.push('Shah Jahan appears once with original aliases and sources in tooltip');
    report.screenshots.push('mughal.png');
    fs.writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
