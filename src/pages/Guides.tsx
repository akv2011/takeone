import { Link } from 'react-router-dom';
import { guides } from '../seo/guides';
import Header from '../components/Header';
import SiteFooter from '../components/SiteFooter';

export default function Guides() {
  return <div className="flex min-h-screen flex-col text-ink">
    <Header />
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-12 sm:px-8 md:px-12 md:pt-20">
      <div className="max-w-[640px]">
        <h1 className="display ml-[-0.04em] text-[40px] md:text-[56px]">Video editing guides</h1>
        <p className="mt-4 text-[17px] leading-relaxed text-ink2">Pick the change you want to make. Each guide shows the controls, an example and what to check before you publish.</p>
      </div>
      <ul className="mt-12 grid gap-5 md:grid-cols-2">{guides.map(guide => <li key={guide.path}>
        <article className="sheet group relative h-full p-6 transition-[transform,box-shadow] duration-150 ease-paper hover:-translate-y-0.5 hover:shadow-lift">
          <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.015em]"><Link className="after:absolute after:inset-0 after:rounded-card" to={guide.path}>{guide.title}</Link></h2>
          <p className="mt-2 line-clamp-2 text-[15px] leading-relaxed text-ink2">{guide.intro}</p>
        </article>
      </li>)}</ul>
      <p className="mt-10 max-w-[68ch] text-[13px] text-muted">Reading guides and reviewing settings does not submit a video job.</p>
    </main>
    <SiteFooter />
  </div>;
}
