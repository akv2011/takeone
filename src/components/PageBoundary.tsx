import { Component, Suspense, type ReactNode } from 'react';

// A deploy replaces hashed chunks; a tab opened before it fails to import them. Reload once, then show the button.
const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
export function reloadOnceForStaleChunk(error: unknown, retryUrl: string, now = Date.now()): boolean {
  if (!STALE_CHUNK.test(String((error as Error)?.message ?? error))) return false;
  try {
    const last = Number(sessionStorage.getItem('takeone:chunk-reload') ?? 0);
    if (now - last < 30_000) return false;
    sessionStorage.setItem('takeone:chunk-reload', String(now));
  } catch { return false; }
  window.location.assign(retryUrl);
  return true;
}
import { button } from '../lib/ui';

export class PageBoundary extends Component<{ children: ReactNode; retryUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { reloadOnceForStaleChunk(error, this.props.retryUrl); }
  render() {
    if (this.state.failed) return <main role="alert" className="grid min-h-screen place-items-center bg-paper px-4 py-24 text-ink">
      <div className="sheet w-full max-w-xl p-8 text-center shadow-hard sm:p-12">
        <p className="eyebrow">Error</p>
        <h1 className="display mt-4 text-5xl sm:text-6xl">This page could not load</h1>
        <p className="mt-4 text-sm text-ink2">Check your connection, then reload the page.</p>
        <a href={this.props.retryUrl} className={`${button('primary')} mt-8`}>Reload page</a>
      </div>
    </main>;
    return <Suspense fallback={<main role="status" className="grid min-h-screen place-items-center bg-paper px-4 text-ink">
      <div className="w-full max-w-md">
        <div aria-hidden="true" className="sheet-ruled h-40 border border-ink"><div className="pat-dots h-full w-1/3 animate-pulse opacity-15" /></div>
        <p className="eyebrow mt-4 text-center">Loading TakeOne…</p>
      </div>
    </main>}>{this.props.children}</Suspense>;
  }
}
