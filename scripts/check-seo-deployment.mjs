import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

// Read-only release check. Spoofed user agents cannot establish access from real crawler IPs.
const target = new URL(process.argv[2] || 'https://takeone.web.app');
assert.ok(['http:', 'https:'].includes(target.protocol), 'Use an HTTP(S) origin');
assert.equal(target.pathname, '/', 'Supply an origin, not a page URL');
assert.ok(!target.username && !target.password && !target.search && !target.hash, 'Do not include credentials or query parameters');
const expected = [...(await readFile('dist/sitemap.xml', 'utf8')).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
assert.ok(expected.length > 0, 'Run npm run build first');
const productionOrigin = new URL(expected[0]).origin;
const failures = [];
async function check(label, run) {
  try { await run(); console.log(`PASS ${label}`); }
  catch (error) { failures.push(label); console.error(`FAIL ${label}: ${error.message}`); }
}
async function request(path, userAgent = 'TakeOne-SEO-Check/1.0') {
  const response = await fetch(new URL(path, target), { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  assert.equal(new URL(response.url).origin, target.origin, 'Unexpected host redirect; use the canonical deployment origin');
  return response;
}
await check('sitemap matches the built public routes', async () => {
  const response = await request('/sitemap.xml');
  assert.equal(response.status, 200);
  const actual = [...(await response.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(actual.sort(), [...expected].sort());
});
await check('robots exposes the production sitemap', async () => {
  const response = await request('/robots.txt');
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(text.includes(`Sitemap: ${productionOrigin}/sitemap.xml`));
  assert.ok(!/^Disallow:\s*\/\s*$/m.test(text), 'Blanket crawl block');
});
for (const url of expected) {
  const path = new URL(url).pathname;
  await check(`public HTML ${path}`, async () => {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.ok(!(response.headers.get('x-robots-tag') || '').includes('noindex'), 'Public response marked noindex');
    const doc = new JSDOM(await response.text()).window.document;
    assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), url);
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.ok((doc.querySelector('#root')?.textContent.length || 0) > 300, 'Missing readable server HTML');
    assert.ok(!doc.querySelector('meta[name="robots"]')?.content.includes('noindex'));
  });
}
for (const agent of ['Googlebot', 'bingbot', 'OAI-SearchBot']) {
  await check(`public content with ${agent} user agent`, async () => {
    for (const path of ['/', '/guides']) {
      const response = await request(path, agent);
      assert.equal(response.status, 200);
      const doc = new JSDOM(await response.text()).window.document;
      assert.ok((doc.querySelector('#root')?.textContent.length || 0) > 300, 'Missing readable content');
      assert.equal(doc.querySelector('link[rel="canonical"]')?.getAttribute('href'), productionOrigin + path);
    }
  });
}
for (const path of ['/create', '/review', '/studio/seo-check']) {
  await check(`private exclusion ${path}`, async () => {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.ok((response.headers.get('x-robots-tag') || '').includes('noindex'));
    const doc = new JSDOM(await response.text()).window.document;
    assert.ok(doc.querySelector('meta[name="robots"]')?.content.includes('noindex'));
    assert.equal(doc.querySelector('link[rel="canonical"]'), null);
  });
}
await check('unknown route returns HTTP 404', async () => {
  assert.equal((await request('/seo-missing-page-check')).status, 404);
});
if (failures.length) {
  console.error(`${failures.length} release checks failed. No deployment or indexing action was performed.`);
  process.exitCode = 1;
} else console.log('Deployment checks passed. Real crawler-IP access, indexing and rankings still require external verification.');
