import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metadataFor, siteUrl, structuredDataFor } from './metadata';
export function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const data = metadataFor(pathname);
    document.title = data.title;
    function meta(key: string, value: string, property = false) {
      const attr = property ? 'property' : 'name';
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attr, key); document.head.append(element); }
      element.content = value;
    }
    meta('og:type', data.type, true);
    meta('description', data.description); meta('robots', data.robots);
    for (const prefix of ['og', 'twitter']) {
      meta(`${prefix}:title`, data.title, prefix === 'og'); meta(`${prefix}:description`, data.description, prefix === 'og');
      meta(`${prefix}:url`, data.canonical ?? siteUrl, prefix === 'og');
    }
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (data.canonical) { if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); } canonical.href = data.canonical; }
    else canonical?.remove();
    document.getElementById('seo-schema')?.remove();
    const schema = document.createElement('script'); schema.id = 'seo-schema'; schema.type = 'application/ld+json'; schema.textContent = JSON.stringify(structuredDataFor(pathname)); document.head.append(schema);
  }, [pathname]);
  return null;
}
