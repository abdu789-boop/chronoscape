/* Local browser checks. Requires Playwright and an installed Chromium/Chrome.
 * QA_BASE_URL defaults to the local static server; no deployment is performed.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:8337/';
const output = process.env.QA_OUTPUT || '/private/tmp/chronoscape-rulers-qa';

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
    assert.match(await page.locator('#detail-ruler-current').innerText(), /Xuán/);
    await page.evaluate(() => { window.qaRuler = document.querySelector('.ruler-row'); });
    await page.locator('#year-input').fill('751 CE');
    await page.locator('#year-input').press('Enter');
    await page.waitForFunction(() => document.querySelector('#detail-ruler-year').textContent === '751 CE');
    assert.equal(await page.evaluate(() => window.qaRuler === document.querySelector('.ruler-row')), true);
    assert.equal(await page.locator('#detail-ruler-roster').getAttribute('open'), '');
    await page.locator('#detail-ruler-roster > summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('#play-toggle').getAttribute('aria-pressed'), 'false');
    await page.locator('#detail-ruler-roster > summary').click();
    await page.locator('.ruler-evidence summary').first().click();
    assert.match(await page.locator('.ruler-evidence a').first().getAttribute('href'), /^https:\/\//);
    await page.screenshot({ path: output + '/desktop.png' });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: output + '/mobile.png' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + '#year=2000&polity=wd%3AQ30');
    await page.waitForFunction(() => document.querySelectorAll('.ruler-row').length > 0);
    await page.locator('#detail-ruler-roster > summary').click();
    assert.match(await page.locator('.history-section').innerText(), /Source checked by sample/);
    assert.match(await page.locator('#detail-ruler-list').innerText(), /Ulysses/);
    assert.equal(await page.locator('.ruler-row').count(), 46);
    assert.equal(await page.locator('.history-name').filter({ hasText: /Gerald.*Ford/ }).count(), 1);
    assert.equal(await page.locator('.polity-wikipedia a').getAttribute('href'), 'https://en.wikipedia.org/wiki/United_States');
    await page.locator('.ruler-evidence summary').first().click();
    assert.match(await page.locator('.ruler-evidence a').first().getAttribute('href'), /^https:\/\//);

    await page.goto(base + '#year=-91&polity=wd%3AQ1986139');
    await page.waitForFunction(() => document.querySelectorAll('.ruler-row').length >= 25);
    assert.match(await page.locator('#detail-ruler-current').innerText(), /Mithridates II/);
    assert.equal(await page.locator('.polity-wikipedia a').getAttribute('href'), 'https://en.wikipedia.org/wiki/Parthian_Empire');
    await page.locator('#detail-ruler-roster > summary').click();
    assert.match(await page.locator('#detail-ruler-list').innerText(), /Disputed chronology/);
    assert.match(await page.locator('#detail-ruler-list').innerText(), /Daryaee/);
    await page.screenshot({ path: output + '/parthian.png' });

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
    const report = { passed: true, checks: ['ruler selection', 'year updates preserve roster DOM', 'keyboard expansion preserves paused playback', 'evidence links', 'Wikipedia links with and without rulers', 'mobile overflow', 'sample-reviewed source label', 'expanded Parthian list with named alternative chronologies', 'unverified coverage', 'polity shortcuts removed', 'search selection and expanded Ottoman list', 'no page errors'], screenshots: ['desktop.png', 'mobile.png', 'parthian.png'] };
    fs.writeFileSync(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
