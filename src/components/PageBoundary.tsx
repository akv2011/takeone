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
    if (this.state.failed) return <main role="alert" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">
      <h1 className="font-display text-4xl font-extrabold">This page could not load</h1>
      <p className="mt-3 text-sm text-muted">Check your connection, then reload the page.</p>
      <a href={this.props.retryUrl} className={`${button('primary')} mt-6`}>Reload page</a>
    </main>;
    return <Suspense fallback={<main role="status" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">Loading TakeOne…</main>}>{this.props.children}</Suspense>;
  }
}
