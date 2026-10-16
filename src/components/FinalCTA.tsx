import { Link } from "react-router-dom";

export default function FinalCTA() {
  return (
    <section className="border-t border-black/10 bg-white px-6 py-24 md:px-12">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-8 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Ready when you are</p>
          <h2 className="mt-4 max-w-3xl text-balance font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.04em] text-ink sm:text-6xl">Your next cut starts with one prompt.</h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">Start in the browser and take each video from an idea to a finished export.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Link to="/create" className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80">Create a video</Link>
          <Link to="/pricing" className="rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold transition-colors hover:bg-black/[0.04]">View pricing</Link>
        </div>
      </div>
    </section>
  );
}
