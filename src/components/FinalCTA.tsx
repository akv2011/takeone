import { Link } from "react-router-dom";

export default function FinalCTA() {
  return (
    <section aria-labelledby="final-heading" className="border-t border-line bg-surface px-4 py-20 sm:px-6 md:px-12 md:py-24">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div>
          <h2 id="final-heading" className="text-balance font-display text-5xl font-black leading-[0.9] text-ink md:text-7xl">Make your first short.</h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">Sign in, pick what you are starting from, and get a captioned 9:16 cut back. Your first 5 videos are free.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <Link to="/create" className="inline-flex items-center rounded-md border border-transparent bg-cue px-6 py-3.5 text-base font-bold text-ink transition-colors hover:border-ink">Make a short</Link>
          <Link to="/pricing" className="inline-flex items-center rounded-md border border-ink bg-surface px-6 py-3.5 text-base font-semibold text-ink transition-colors hover:bg-paper">See pricing</Link>
        </div>
      </div>
    </section>
  );
}
