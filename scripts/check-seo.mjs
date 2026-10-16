import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const sitemap = await readFile('dist/sitemap.xml', 'utf8');
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]);
assert.equal(urls.length, 13);
const titles = new Set();
for (const url of urls) {
  const path = new URL(url).pathname;
  assert.equal(new URL(url).origin, 'https://takeone.web.app');
  const html = await readFile(path === '/' ? 'dist/index.html' : `dist${path}/index.html`, 'utf8');
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('h1').length, 1, `${path} heading`);
  assert.equal(doc.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(doc.querySelector('link[rel="canonical"]').href, url);
  assert.ok(doc.querySelector('#root').textContent.length > 300, `${path} raw content`);
  assert.equal(doc.querySelector('meta[property="og:title"]').content, doc.title);
  assert.equal(doc.querySelector('meta[property="og:type"]').content, path.startsWith('/guides/') ? 'article' : 'website');
  assert.ok(!doc.querySelector('meta[name="robots"]').content.includes('noindex'));
  assert.ok(!titles.has(doc.title)); titles.add(doc.title);
  const schemas = JSON.parse(doc.querySelector('#seo-schema').textContent);
  if (path.startsWith('/guides/')) {
    assert.ok(doc.querySelector('#questions'), `${path} answers in raw HTML`);
    assert.ok(schemas.some(item => item['@type'] === 'Article' && item.headline === doc.querySelector('h1').textContent));
    for (const link of doc.querySelectorAll('a[href^="#"]')) assert.ok(doc.getElementById(link.getAttribute('href').slice(1)));
  }
}
for (const file of ['app.html', '404.html']) {
 const doc = new JSDOM(await readFile(`dist/${file}`, 'utf8')).window.document;
 assert.equal(doc.querySelector('meta[name="robots"]').content, 'noindex, nofollow');
 assert.equal(doc.querySelector('link[rel="canonical"]'), null);
}
const routes = JSON.parse(await readFile('vercel.json', 'utf8'));
for (const url of urls.filter(url => new URL(url).pathname !== '/')) assert.ok(routes.rewrites.some(route => route.source === new URL(url).pathname && route.destination === new URL(url).pathname + '/index.html'), `Missing deployed route ${url}`);
assert.ok(!routes.rewrites.some(route => route.destination === '/index.html'), 'Unknown paths must not become homepage soft 404s');
assert.ok((await readFile('dist/robots.txt', 'utf8')).includes('https://takeone.web.app/sitemap.xml'));
console.log('SEO artifact checks passed: 13 readable public pages, unique metadata, schema, sitemap and private exclusions.');
