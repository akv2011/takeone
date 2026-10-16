import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import App from '../App';
import Guides from '../pages/Guides';
import Guide from '../pages/Guide';
import Legal from '../pages/Legal';
import { PACKS } from '../../convex/config';
export { publicMetadata, metadataFor, structuredDataFor, siteUrl } from './metadata';
export function renderPublicPage(path: string) {
  const page = path === '/' ? <App /> : path === '/guides' ? <Guides /> : path.startsWith('/guides/') ? <Guide /> : path === '/pricing' ?
    <main className="mx-auto max-w-3xl px-6 py-20"><a href="/">TakeOne</a><h1 className="mt-8 text-4xl font-bold">TakeOne pricing</h1><p className="mt-6">Your first 3 videos are free. After that, one-time credit packs with no subscription. Check current checkout availability in the workspace.</p><ul className="my-8 space-y-4">{PACKS.map(pack => <li key={pack.id}>{pack.label}: ${pack.amountUsd} for {pack.credits} videos</li>)}</ul><p>Free generations include TakeOne branding. Credit-funded renders add no TakeOne watermark. Existing source marks remain.</p><a href="/create" className="mt-6 inline-block underline">Open your workspace</a></main> : <Legal />;
  const client = new ConvexReactClient('https://prerender.convex.cloud');
  try { return renderToString(<StaticRouter location={path}><ConvexProvider client={client}>{page}</ConvexProvider></StaticRouter>); }
  finally { void client.close(); }
}
