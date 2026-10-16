import { Component, Suspense, type ReactNode } from 'react';
import { button } from '../lib/ui';

export class PageBoundary extends Component<{ children: ReactNode; retryUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">
      <h1 className="font-display text-4xl font-extrabold">This page could not load</h1>
      <p className="mt-3 text-sm text-muted">Check your connection, then reload the page.</p>
      <a href={this.props.retryUrl} className={`${button('primary')} mt-6`}>Reload page</a>
    </main>;
    return <Suspense fallback={<main role="status" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">Loading TakeOne…</main>}>{this.props.children}</Suspense>;
  }
}
