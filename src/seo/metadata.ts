import { guides } from './guides';
export const siteUrl = 'https://takeone.web.app';
export const publicMetadata: Record<string, { title: string; description: string }> = {
  '/': { title: 'TakeOne | AI video editing, YouTube clips and Reels', description: 'Edit videos with prompts, turn YouTube moments into clips, and prepare vertical videos in TakeOne Studio. Explore trimming, captions, framing and audio tools.' },
  '/guides': { title: 'Video editing guides | Prompts, captions and clips | TakeOne', description: 'Practical video editing guides for prompts, YouTube clips, captions, speed and vertical framing. Learn what to change and how to check the finished video.' },
  '/pricing': { title: 'TakeOne pricing | Video credits and free generations', description: 'Explore TakeOne video credit packs, three free generations, watermark rules and one-time pricing. Check current checkout availability before purchasing.' },
  ...Object.fromEntries(guides.map(g => [g.path, { title: `${g.title} | TakeOne`, description: g.description }])),
  ...Object.fromEntries([['privacy', 'Privacy policy'], ['terms', 'Terms of service'], ['acceptable-use', 'Acceptable use'], ['copyright', 'Copyright and takedowns'], ['refund-policy', 'Refund policy']].map(([path, title]) => [`/${path}`, { title: `${title} | TakeOne`, description: `Read TakeOne's ${title.toLowerCase()} and learn about your responsibilities, rights and options when using the video editing service.` }])),
};
export function metadataFor(path: string) {
  const normalized = path === '/' ? '/' : path.replace(/\/+$/, '');
  const page = publicMetadata[normalized];
  const privatePage = /^\/(create|studio|review)(\/|$)/.test(normalized);
  return { type: guides.some(guide => guide.path === normalized) ? 'article' : 'website', title: page?.title ?? (privatePage ? 'Your video workspace | TakeOne' : 'Page not found | TakeOne'), description: page?.description ?? (privatePage ? 'Your private TakeOne video workspace.' : 'This page could not be found. Explore TakeOne video editing guides or open your workspace.'), canonical: page ? siteUrl + normalized : undefined, robots: page ? 'index, follow, max-image-preview:large' : 'noindex, nofollow' };
}
export function structuredDataFor(path: string) {
  path = path === '/' ? '/' : path.replace(/\/+$/, '');
  if (path === '/guides') return [{ '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${siteUrl}/guides#collection`, name: 'Video editing guides', url: `${siteUrl}/guides`, mainEntity: { '@type': 'ItemList', itemListElement: guides.map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: siteUrl + guide.path })) } }];
  if (path === '/') return [
    { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: 'TakeOne', url: `${siteUrl}/` },
    { '@context': 'https://schema.org', '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'TakeOne', url: `${siteUrl}/`, logo: `${siteUrl}/fevicon.png` },
  ];
  const guide = guides.find(g => g.path === path);
  return guide ? [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'TakeOne', item: `${siteUrl}/` },
    { '@type': 'ListItem', position: 2, name: 'Video editing guides', item: `${siteUrl}/guides` },
    { '@type': 'ListItem', position: 3, name: guide.title, item: siteUrl + path },
  ] }, {
    '@context': 'https://schema.org', '@type': 'Article',
    '@id': siteUrl + path + '#article', url: siteUrl + path,
    headline: guide.title, description: guide.description, inLanguage: 'en',
    author: { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'TakeOne', url: `${siteUrl}/` },
    publisher: { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'TakeOne', url: `${siteUrl}/` },
    mainEntityOfPage: siteUrl + path,
  }] : [];
}
