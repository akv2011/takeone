import { Link, useLocation } from 'react-router-dom';
import { guideAnswers } from '../seo/guideAnswers';
import { guides } from '../seo/guides';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';
import { button } from '../lib/ui';

const crumb = 'text-[13px] font-medium text-ink2 transition-colors hover:text-ink';

export default function Guide() {
  const { pathname } = useLocation();
  const guide = guides.find(g => g.path === pathname.replace(/\/+$/, ''));
  if (!guide) return null;
  return <div className="flex min-h-screen flex-col text-ink">
    <Header />
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-10 sm:px-8 md:px-12 md:pt-16">
      <article>
        <nav aria-label="Breadcrumb" className="flex gap-2"><Link to="/" className={crumb}>Home</Link><span aria-hidden="true" className="text-[13px] text-muted">/</span><Link to="/guides" className={crumb}>Video editing guides</Link></nav>
        <header className="mt-6 max-w-[68ch]">
          <h1 className="display ml-[-0.04em] text-[36px] md:text-[52px]">{guide.title}</h1>
          <p className="mt-5 text-[18px] leading-relaxed text-ink2">{guide.intro}</p>
          <p className="mt-4 text-[13px] text-muted">By TakeOne</p>
        </header>
        <div className="mt-12 grid gap-10 lg:grid-cols-12">
          <nav aria-label="On this page" className="lg:col-span-3">
            <div className="lg:sticky lg:top-24">
              <p className="text-[13px] font-semibold text-ink">On this page</p>
              <ol className="mt-3 space-y-2.5 text-[14px]">{guide.sections.map((section, index) => <li key={section.heading}><a className="text-ink2 transition-colors hover:text-ink" href={`#section-${index + 1}`}>{section.heading}</a></li>)}<li><a className="text-ink2 transition-colors hover:text-ink" href="#questions">Common questions</a></li></ol>
            </div>
          </nav>
          <div className="min-w-0 lg:col-span-9">
            {guide.sections.map((section, index) => <section id={`section-${index + 1}`} key={section.heading} className="max-w-[68ch] scroll-mt-24 pb-10">
              <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.02em]">{section.heading}</h2>
              <p className="mt-3 text-[17px] leading-[1.7] text-ink2">{section.text}</p>
            </section>)}
            <section id="questions" className="sheet max-w-[68ch] scroll-mt-24 p-6 md:p-8">
              <h2 className="text-[22px] font-semibold leading-snug tracking-[-0.02em]">Common questions</h2>
              {guideAnswers[guide.path]?.map(item => <div key={item.question} className="mt-5 border-t border-line pt-5">
                <h3 className="text-[16px] font-semibold">{item.question}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink2">{item.answer}</p>
              </div>)}
            </section>
          </div>
        </div>
      </article>
      <aside className="mt-16 border-t border-line pt-10 lg:grid lg:grid-cols-12 lg:gap-10">
        <h2 className="display text-[26px] lg:col-span-3">More editing guides</h2>
        <div className="mt-6 lg:col-span-9 lg:mt-0">
          <ul className="grid gap-3 sm:grid-cols-2">{guides.filter(g => g.path !== guide.path).map(g => <li key={g.path}><Link className="sheet block h-full p-4 text-[15px] font-medium leading-snug transition-[transform,box-shadow] duration-150 ease-paper hover:-translate-y-0.5 hover:shadow-lift" to={g.path}>{g.title}</Link></li>)}</ul>
          <Link to="/create" className={`${button('primary', 'lg')} mt-8`}>Explore the TakeOne workspace</Link>
        </div>
      </aside>
    </main>
    <SiteFooter />
  </div>;
}
