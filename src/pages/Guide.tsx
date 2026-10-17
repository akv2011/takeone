import { Link, useLocation } from 'react-router-dom';
import { guideAnswers } from '../seo/guideAnswers';
import { guides } from '../seo/guides';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { button } from '../lib/ui';

const crumb = 'font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline';

export default function Guide() {
  const { pathname } = useLocation();
  const guide = guides.find(g => g.path === pathname.replace(/\/+$/, ''));
  if (!guide) return null;
  return <div className="flex min-h-screen flex-col bg-paper text-ink">
    <Header />
    <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 pb-24 pt-12 sm:px-6 md:pt-16">
      <article>
        <nav aria-label="Breadcrumb" className="flex gap-2"><Link to="/" className={crumb}>Home</Link><span aria-hidden="true" className="font-mono text-[11px] text-ink2">/</span><Link to="/guides" className={crumb}>Video editing guides</Link></nav>
        <header className="rule-top mt-6 pt-8">
          <h1 className="display max-w-[16ch] text-[clamp(44px,6.6vw,88px)]">{guide.title}</h1>
          <p className="mt-6 max-w-[68ch] text-lg leading-8 text-ink2">{guide.intro}</p>
          <p className="eyebrow mt-6">By TakeOne</p>
        </header>
        <div className="mt-12 grid gap-12 lg:grid-cols-12">
          <nav aria-label="On this page" className="lg:col-span-3">
            <div className="border-t border-ink pt-3 lg:sticky lg:top-24">
              <p className="eyebrow">On this page</p>
              <ol className="mt-3 space-y-2 text-sm">{guide.sections.map((section, index) => <li key={section.heading} className="flex gap-2"><span className="font-mono text-[11px] leading-5 text-ink2">0{index + 1}</span><a className="leading-5 underline-offset-4 hover:underline" href={`#section-${index + 1}`}>{section.heading}</a></li>)}<li className="flex gap-2"><span className="font-mono text-[11px] leading-5 text-ink2">Q</span><a className="leading-5 underline-offset-4 hover:underline" href="#questions">Common questions</a></li></ol>
            </div>
          </nav>
          <div className="min-w-0 lg:col-span-9">
            {guide.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.heading} className="scroll-mt-24 border-t border-line pb-10 pt-6 first:border-ink">
              <p className="font-mono text-[11px] text-ink2">0{index + 1}</p>
              <h2 className="mt-2 font-serif text-3xl leading-tight md:text-4xl">{section.heading}</h2>
              <p className="mt-4 max-w-[68ch] text-[17px] leading-8 text-ink2">{section.text}</p>
            </section>)}
            <section id="questions" className="scroll-mt-24 border-t border-ink pt-6">
              <h2 className="font-serif text-3xl leading-tight md:text-4xl">Common questions</h2>
              {guideAnswers[guide.path]?.map(item => <div key={item.question} className="mt-6 max-w-[68ch] border-b border-line pb-6">
                <h3 className="font-medium">{item.question}</h3>
                <p className="mt-2 leading-7 text-ink2">{item.answer}</p>
              </div>)}
            </section>
          </div>
        </div>
      </article>
      <aside className="mt-16 grid gap-8 border-t border-ink pt-6 lg:grid-cols-12">
        <h2 className="display text-4xl lg:col-span-3">More editing guides</h2>
        <div className="lg:col-span-9">
          <ul className="border-t border-line">{guides.filter(g => g.path !== guide.path).map(g => <li key={g.path} className="border-b border-line"><Link className="block py-4 font-serif text-2xl leading-tight underline-offset-[6px] hover:underline" to={g.path}>{g.title}</Link></li>)}</ul>
          <Link to="/create" className={`${button('primary')} mt-8`}>Explore the TakeOne workspace</Link>
        </div>
      </aside>
    </main>
    <SiteFooter />
  </div>;
}
