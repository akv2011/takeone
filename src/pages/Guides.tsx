import { Link } from 'react-router-dom';
import { guides } from '../seo/guides';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';

export default function Guides() {
  return <div className="flex min-h-screen flex-col bg-paper text-ink">
    <Header />
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-24 pt-14 sm:px-6 md:pt-20">
      <div className="rule-top grid gap-6 pt-6 md:grid-cols-12">
        <div className="md:col-span-8">
          <p className="eyebrow">Guides · {String(guides.length).padStart(2, '0')}</p>
          <h1 className="display mt-4 text-[clamp(52px,8vw,104px)]">Video editing <em>guides.</em></h1>
        </div>
        <p className="self-end text-base leading-7 text-ink2 md:col-span-4">Start with the change you want to make. Each guide covers the controls, an example and what to check before publishing.</p>
      </div>
      <ol className="mt-14 border-t border-ink">{guides.map((guide, i) => <li key={guide.path} className="border-b border-line">
        <article className="grid gap-3 py-8 md:grid-cols-12 md:gap-8">
          <span className="font-mono text-[11px] text-ink2 md:col-span-1 md:pt-2">{String(i + 1).padStart(2, '0')}</span>
          <div className="md:col-span-11">
            <h2 className="font-serif text-3xl leading-tight md:text-4xl"><Link className="underline decoration-ink/20 decoration-1 underline-offset-[6px] transition-colors hover:decoration-ink" to={guide.path}>{guide.title}</Link></h2>
            <p className="mt-3 max-w-[68ch] leading-7 text-ink2">{guide.intro}</p>
          </div>
        </article>
      </li>)}</ol>
      <p className="mt-10 max-w-[68ch] font-mono text-[11px] uppercase leading-5 tracking-[0.08em] text-ink2">Rendering availability is shown in the workspace. Reading guides and reviewing settings does not submit a video job.</p>
    </main>
    <SiteFooter />
  </div>;
}
