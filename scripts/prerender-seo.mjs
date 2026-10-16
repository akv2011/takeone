import { createServer } from 'vite';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const server = await createServer({ mode: 'production', server: { middlewareMode: true }, appType: 'custom' });
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
try {
  const { renderPublicPage, publicMetadata, metadataFor, structuredDataFor, siteUrl } = await server.ssrLoadModule('/src/seo/prerender.tsx');
  const template = await readFile('dist/index.html', 'utf8');
  function htmlFor(path, body) {
    const data = metadataFor(path);
    let html = template.replace(/<title>.*?<\/title>/s, `<title>${escape(data.title)}</title>`);
    for (const [key, value] of Object.entries({ 'og:type': data.type, description: data.description, robots: data.robots, 'og:title': data.title, 'twitter:title': data.title, 'og:description': data.description, 'twitter:description': data.description, 'og:url': data.canonical ?? siteUrl, 'twitter:url': data.canonical ?? siteUrl })) {
      html = html.replace(new RegExp(`<meta (?:name|property)="${key}" content="[^"]*"\\s*/?>`), `<meta ${key.startsWith('og:') ? 'property' : 'name'}="${key}" content="${escape(value)}" />`);
    }
    html = html.replace(/<link rel="canonical"[^>]*>/, data.canonical ? `<link rel="canonical" href="${data.canonical}" />` : '');
    const schema = JSON.stringify(structuredDataFor(path)).replace(/</g, '\\u003c');
    return html.replace('</head>', `<script id="seo-schema" type="application/ld+json">${schema}</script></head>`).replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  }
  for (const path of Object.keys(publicMetadata)) {
    const dir = path === '/' ? 'dist' : `dist${path}`;
    await mkdir(dir, { recursive: true });
    await writeFile(`${dir}/index.html`, htmlFor(path, renderPublicPage(path)));
  }
  await writeFile('dist/app.html', htmlFor('/create', ''));
  await writeFile('dist/404.html', htmlFor('/404', '<main><h1>Page not found</h1><a href="/">Return to TakeOne</a></main>'));
  await writeFile('dist/robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
  await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${Object.keys(publicMetadata).map(path => `<url><loc>${siteUrl}${path}</loc></url>`).join('')}</urlset>\n`);
  console.log(`Prerendered ${Object.keys(publicMetadata).length} public pages, sitemap, robots and private app shell.`);
} finally { await server.close(); }
