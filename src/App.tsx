import { guides } from './seo/guides';
import { useEffect } from "react";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import { TakeOneWordmark } from "./components/TakeOneLogo";
import StudioTools from "./components/StudioTools";
import PromptPlayground from "./components/PromptPlayground";
import FinalCTA from "./components/FinalCTA";
import ProductModes from "./components/ProductModes";
import { Link } from "react-router-dom";

const footerLinks = [
  ["/pricing", "Pricing"], ["/guides", "Guides"], ["/create", "Dashboard"], ["/privacy", "Privacy"], ["/terms", "Terms"],
  ["/acceptable-use", "Acceptable use"], ["/copyright", "Copyright"], ["/refund-policy", "Refunds"],
] as const;

function App() {
  // Always start at the top on every page load/refresh
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-paper">
      <a href="#main" className="fixed -top-20 left-4 z-10 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-surface focus:top-4">Skip to content</a>
      <Header />

      <main id="main" className="flex w-full flex-1 flex-col">
        <HeroSection />
        <ProductModes />
        <StudioTools />
        <PromptPlayground />
        <section className="border-t border-line px-4 py-20 sm:px-6 md:px-12 md:py-24" aria-labelledby="guides-heading">
          <div className="mx-auto max-w-7xl">
            <h2 id="guides-heading" className="font-display text-5xl font-extrabold leading-[0.9] text-ink md:text-6xl">Video editing guides</h2>
            <div className="mt-12 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
              {guides.map(guide => (
                <article key={guide.path}>
                  <h3 className="text-pretty text-lg font-bold leading-7 text-ink"><Link className="underline decoration-line decoration-2 underline-offset-4 transition-colors hover:decoration-ink" to={guide.path}>{guide.title}</Link></h3>
                  <p className="mt-3 max-w-md text-base leading-7 text-muted">{guide.intro}</p>
                </article>
              ))}
            </div>
            <Link to="/guides" className="mt-10 inline-block text-base font-semibold text-ink underline decoration-line decoration-2 underline-offset-[6px] transition-colors hover:decoration-ink">All guides</Link>
          </div>
        </section>
        <FinalCTA />
      </main>

      <footer className="w-full border-t border-line bg-paper px-4 py-12 sm:px-6 md:px-12">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <TakeOneWordmark className="text-xl text-ink" />
            <span className="text-sm text-muted">© {new Date().getFullYear()} TakeOne</span>
          </div>
          <nav aria-label="Footer" className="flex max-w-2xl flex-wrap gap-x-6 gap-y-3 text-sm text-muted">
            {footerLinks.map(([to, label]) => <Link key={to} to={to} className="underline-offset-4 hover:text-ink hover:underline">{label}</Link>)}
            <a href="#how-it-works" className="underline-offset-4 hover:text-ink hover:underline">How it works</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default App;
