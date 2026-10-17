import { Link } from "react-router-dom";
import { button } from "../lib/ui";
import { InkMark } from "../lib/motion";

export default function FinalCTA() {
  return (
    <section aria-labelledby="final-heading" className="relative overflow-hidden border-y border-ink px-4 py-24 sm:px-6 md:py-32">
      <div aria-hidden="true" className="cta-halftone pointer-events-none absolute inset-0" />
      <div className="sheet relative mx-auto flex max-w-2xl flex-col items-center px-6 py-14 text-center shadow-hard-lg sm:px-12">
        <p className="eyebrow">Start</p>
        <h2 id="final-heading" className="display mt-5 text-[clamp(44px,7vw,84px)] text-ink">Make your first short.</h2>
        <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">5 free videos · no card</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-5">
          <InkMark type="circle" delay={0.3}>
            <Link to="/create" className={`${button("primary")} px-6 py-3.5 text-base`}>Make a short</Link>
          </InkMark>
          <Link to="/pricing" className={`${button("secondary")} px-6 py-3.5 text-base`}>See pricing</Link>
        </div>
      </div>
    </section>
  );
}
