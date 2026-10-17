import { useEffect } from "react";
import Header from "./components/Header";
import HeroSection from "./components/HeroSection";
import ProductModes from "./components/ProductModes";
import FinalCTA from "./components/FinalCTA";
import SiteFooter from "./components/SiteFooter";
import HowItWorks from "./components/landing/HowItWorks";
import ProofRow from "./components/landing/ProofRow";
import CloudStrip from "./components/landing/CloudStrip";
import { useSmoothScroll } from "./lib/motion";

function App() {
  useSmoothScroll();
  // Always start at the top on every page load/refresh
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip">
      <a href="#main" className="fixed -top-20 left-4 z-50 rounded-control bg-ink px-4 py-2 text-sm font-medium text-surface focus:top-4">Skip to content</a>
      <Header />
      <main id="main" className="flex w-full flex-1 flex-col">
        <HeroSection />
        <ProductModes />
        <HowItWorks />
        <ProofRow />
        <CloudStrip />
        <FinalCTA />
      </main>
      <SiteFooter home />
    </div>
  );
}

export default App;
