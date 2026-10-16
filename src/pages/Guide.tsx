import { Link, useLocation } from 'react-router-dom';
import { guideAnswers } from '../seo/guideAnswers';
import { guides } from '../seo/guides';
export default function Guide() {
  const { pathname } = useLocation();
  const guide = guides.find(g => g.path === pathname.replace(/\/+$/, ''));
  if (!guide) return null;
  return <div className="min-h-screen bg-paper text-ink">
    <header className="border-b border-black/10 px-6 py-5"><nav aria-label="Primary" className="mx-auto flex max-w-4xl items-center justify-between"><Link to="/" className="font-display text-2xl font-bold">takeone</Link><Link to="/create" className="text-sm font-semibold">Open workspace</Link></nav></header>
    <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20"><article>
      <nav aria-label="Breadcrumb" className="mb-8 text-sm text-muted"><Link to="/" className="underline">Home</Link> / <Link to="/guides" className="underline">Video editing guides</Link></nav>
      <h1 className="font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{guide.title}</h1>
      <p className="mt-6 text-lg leading-8 text-muted">{guide.intro}</p>
      <p className="mt-4 text-sm text-muted">By TakeOne</p>
      <nav aria-label="On this page" className="mt-8 border-y border-black/10 py-5"><ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm">{guide.sections.map((section, index) => <li key={section.heading}><a className="underline underline-offset-4" href={`#section-${index + 1}`}>{section.heading}</a></li>)}<li><a className="underline underline-offset-4" href="#questions">Common questions</a></li></ul></nav>
      {guide.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.heading} className="mt-10 scroll-mt-8"><h2 className="font-display text-2xl font-semibold">{section.heading}</h2><p className="mt-3 leading-8 text-muted">{section.text}</p></section>)}
      <section id="questions" className="mt-12 scroll-mt-8"><h2 className="font-display text-2xl font-semibold">Common questions</h2>{guideAnswers[guide.path]?.map(item => <div key={item.question} className="mt-6"><h3 className="font-semibold">{item.question}</h3><p className="mt-2 leading-8 text-muted">{item.answer}</p></div>)}</section>
    </article><aside className="mt-14 border-t border-black/10 pt-8"><h2 className="text-lg font-semibold">More editing guides</h2><ul className="mt-4 space-y-3">{guides.filter(g => g.path !== guide.path).map(g => <li key={g.path}><Link className="underline underline-offset-4" to={g.path}>{g.title}</Link></li>)}</ul><Link to="/create" className="mt-8 inline-block font-semibold underline">Explore the TakeOne workspace</Link></aside></main>
    <footer className="border-t border-black/10 px-6 py-8"><nav aria-label="Footer" className="mx-auto flex max-w-3xl gap-6 text-sm"><Link to="/pricing">Pricing</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav></footer>
  </div>;
}
