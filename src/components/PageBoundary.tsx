import { Component, Suspense, type ReactNode } from 'react';

export class PageBoundary extends Component<{ children: ReactNode; retryUrl: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main role="alert" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">
      <h1 className="font-display text-2xl font-bold">This page couldn’t load</h1>
      <p className="mt-3 text-sm">Check your connection and reload to try again.</p>
      <a href={this.props.retryUrl} className="mt-6 inline-block rounded-xl bg-ink px-5 py-3 text-sm text-white">Reload page</a>
    </main>;
    return <Suspense fallback={<main role="status" className="min-h-screen bg-paper px-6 py-24 text-center text-ink">Loading TakeOne…</main>}>{this.props.children}</Suspense>;
  }
}
