import "./App.css";
import { guides } from './seo/guides';
import { useEffect } from "react";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import TakeOneLogo from "./components/TakeOneLogo";
import PromptPlayground from "./components/PromptPlayground";
import FinalCTA from "./components/FinalCTA";
import ProductModes from "./components/ProductModes";
import HowItWorks from "./components/landing/HowItWorks";
import ProofRow from "./components/landing/ProofRow";
import CloudStrip from "./components/landing/CloudStrip";
import { Marquee, useSmoothScroll } from "./lib/motion";
import { Link } from "react-router-dom";

const capabilities = [
  "12 caption languages", "Claims checked with Google Search", "Veo 3.1 prompt to video",
  "YouTube moments without downloading", "Review links with timed notes",
];

const footerColumns = [
  ["Product", [["/create", "Dashboard"], ["/pricing", "Pricing"], ["/guides", "Guides"], ["#how-it-works", "How it works"]]],
  ["Policies", [["/privacy", "Privacy"], ["/terms", "Terms"], ["/acceptable-use", "Acceptable use"], ["/copyright", "Copyright"], ["/refund-policy", "Refunds"]]],
] as const;

const footLink = "font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline";

function App() {
  useSmoothScroll();
  // Always start at the top on every page load/refresh
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-paper">
      <a href="#main" className="fixed -top-20 left-4 z-50 bg-ink px-4 py-2 text-sm font-medium text-surface focus:top-4">Skip to content</a>
      <Header />

      <main id="main" className="flex w-full flex-1 flex-col">
        <HeroSection />
        <Marquee items={capabilities} />
        <ProductModes />
        <HowItWorks />
        <ProofRow />
        <PromptPlayground />
        <CloudStrip />
        <section className="px-4 pb-24 sm:px-6 md:px-12" aria-labelledby="guides-heading">
          <div className="mx-auto max-w-[1360px]">
            <div className="rule-top flex flex-wrap items-end justify-between gap-4 pt-6">
              <h2 id="guides-heading" className="display text-[clamp(40px,5vw,68px)] text-ink">Video editing <em>guides.</em></h2>
              <Link to="/guides" className={footLink}>All guides</Link>
            </div>
            <ol className="mt-8 border-t border-line">
              {guides.map((guide, i) => (
                <li key={guide.path} className="border-b border-line">
                  <Link to={guide.path} className="group flex items-baseline gap-6 py-5 transition-colors hover:bg-paper2/60">
                    <span className="font-mono text-[11px] text-ink2">0{i + 1}</span>
                    <span className="flex-1 font-serif text-2xl leading-tight text-ink md:text-3xl">{guide.title}</span>
                    <span aria-hidden="true" className="font-mono text-sm text-ink2 transition-transform duration-300 ease-paper group-hover:translate-x-1">→</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <FinalCTA />
      </main>

      <footer className="w-full bg-paper px-4 pt-14 sm:px-6 md:px-12">
        <div className="mx-auto grid max-w-[1360px] gap-10 md:grid-cols-12">
          <div className="flex items-center gap-2 md:col-span-6">
            <TakeOneLogo className="h-6 w-6 text-ink" />
            <span className={footLink}>© {new Date().getFullYear()} TakeOne</span>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 md:col-span-6">
            {footerColumns.map(([title, links]) => (
              <div key={title} className="border-t border-ink pt-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{title}</p>
                <ul className="mt-3 space-y-2">
                  {links.map(([to, label]) => (
                    <li key={to}>{to.startsWith("#") ? <a href={to} className={footLink}>{label}</a> : <Link to={to} className={footLink}>{label}</Link>}</li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <p aria-hidden="true" translate="no" className="display mx-auto mt-16 max-w-[1360px] select-none overflow-hidden whitespace-nowrap text-[clamp(96px,22vw,330px)] leading-[0.78] text-ink">TakeOne</p>
      </footer>
    </div>
  );
}

export default App;
