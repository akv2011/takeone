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
import BlankStrip from './BlankStrip';

export class PageBoundary extends Component<{ children: ReactNode; retryUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { reloadOnceForStaleChunk(error, this.props.retryUrl); }
  render() {
    if (this.state.failed) return <main role="alert" className="grid min-h-screen place-items-center px-5 py-24 text-ink">
      <div className="sheet w-full max-w-[480px] p-8 text-center sm:p-10">
        <BlankStrip frames={4} className="max-w-[220px]" />
        <h1 className="display mt-8 text-[32px]">This page could not load</h1>
        <p className="mt-3 text-[15px] text-ink2">Check your connection, then reload the page.</p>
        <a href={this.props.retryUrl} className={`${button('primary', 'lg')} mt-7`}>Reload page</a>
      </div>
    </main>;
    return <Suspense fallback={<main className="grid min-h-screen place-items-center px-5 text-ink">
      <div className="w-full max-w-[260px] text-center">
        <BlankStrip filling />
        <p role="status" className="mt-5 text-[14px] font-medium text-ink2">Loading TakeOne…</p>
      </div>
    </main>}>{this.props.children}</Suspense>;
  }
}
