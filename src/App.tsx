import { guides } from './seo/guides';
import { useEffect } from "react";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import TakeOneLogo from "./components/TakeOneLogo";
import Integrations from "./components/Integrations";
import PromptPlayground from "./components/PromptPlayground";
import FinalCTA from "./components/FinalCTA";
import ProductModes from "./components/ProductModes";
import { Link } from "react-router-dom";

function App() {
  // Always start at the top on every page load/refresh
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="relative min-h-screen bg-paper selection:bg-black/10 selection:text-ink flex flex-col justify-between overflow-x-hidden">
      <Header />

      <main className="flex-1 w-full flex flex-col">
        <HeroSection />
        <ProductModes />
        <Integrations />
        <PromptPlayground />
        <section className="mx-auto w-full max-w-7xl px-6 py-16 md:px-12" aria-labelledby="guides-heading">
          <h2 id="guides-heading" className="font-display text-3xl font-bold">Video editing guides</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3">{guides.map(guide => <article key={guide.path}><h3 className="text-lg font-semibold"><Link className="underline decoration-black/20 underline-offset-4" to={guide.path}>{guide.title}</Link></h3><p className="mt-3 text-sm leading-6 text-muted">{guide.intro}</p></article>)}</div>
        </section>
        <FinalCTA />
      </main>

      <footer className="w-full bg-white border-t border-line py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Copyright details */}
          <div className="flex flex-col gap-1.5 items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-2">
              <TakeOneLogo className="w-5 h-5 text-ink" />
              <span className="font-display font-bold text-sm text-ink tracking-tight">
                takeone
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted">
              © {new Date().getFullYear()} takeone. All rights reserved.
            </span>
          </div>

          <nav aria-label="Footer" className="flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-3 text-xs font-mono text-muted">
            <Link to="/pricing" className="hover:text-ink">Pricing</Link>
            <Link to="/guides" className="hover:text-ink">Guides</Link>
            <Link to="/create" className="hover:text-ink">Dashboard</Link>
            <a href="#how-it-works" className="hover:text-ink">How it works</a>
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/acceptable-use" className="hover:text-ink">Acceptable use</Link>
            <Link to="/copyright" className="hover:text-ink">Copyright</Link>
            <Link to="/refund-policy" className="hover:text-ink">Refunds</Link>
          </nav>
        </div>
      </footer>

    </div>
  );
}

export default App;
