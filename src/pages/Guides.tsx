import { Link } from 'react-router-dom';
import { guides } from '../seo/guides';

export default function Guides() {
  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b border-line bg-surface px-6 py-4"><nav aria-label="Primary" className="mx-auto flex max-w-4xl items-center justify-between"><Link to="/" className="font-display text-2xl font-bold">TakeOne</Link><Link to="/create" className="text-sm font-semibold underline-offset-4 hover:underline">Open workspace</Link></nav></header>
    <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
      <h1 className="text-balance font-display text-5xl font-extrabold sm:text-6xl">Video editing guides</h1>
      <p className="mt-6 text-lg leading-8 text-muted">Start with the change you want to make. Each guide explains the controls, gives an example and shows what to check before publishing.</p>
      <ul className="mt-10 divide-y divide-line">{guides.map(guide => <li key={guide.path} className="py-8"><h2 className="text-2xl font-semibold"><Link className="underline decoration-muted/50 hover:decoration-ink underline-offset-4" to={guide.path}>{guide.title}</Link></h2><p className="mt-3 leading-7 text-muted">{guide.intro}</p></li>)}</ul>
      <p className="mt-8 text-sm leading-6 text-muted">Rendering availability is shown in the workspace. Reading guides and reviewing settings does not submit a video job.</p>
    </main>
    <footer className="border-t border-line px-6 py-8"><nav aria-label="Footer" className="mx-auto flex max-w-3xl gap-6 text-sm"><Link to="/pricing">Pricing</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav></footer>
  </div>;
}
