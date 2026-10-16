import { Link } from "react-router-dom";

const modes = [
  { label: "Edit your footage", detail: "Upload a video, then ask for a trim, crop, speed change, captions, or music." },
  { label: "Clip a YouTube video", detail: "Paste a link you can use and choose the moment, or let TakeOne find one." },
  { label: "Create from a topic", detail: "Turn an idea into a narrated short assembled from matching footage." },
];

export default function ProductModes() {
  return (
    <section id="how-it-works" className="border-y border-black/10 bg-white px-6 py-20 md:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Three ways to begin</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-[-0.04em] text-ink md:text-5xl">Start with what you have.</h2>
        </div>
        <div className="mt-12 grid border-y border-black/10 md:grid-cols-3">
          {modes.map((mode, index) => (
            <article key={mode.label} className={`py-7 md:px-7 ${index < modes.length - 1 ? 'border-b border-black/10 md:border-b-0 md:border-r' : ''} ${index === 0 ? 'md:pl-0' : ''}`}>
              <h3 className="text-base font-semibold text-ink">{mode.label}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-muted">{mode.detail}</p>
            </article>
          ))}
        </div>
        <Link to="/create" className="mt-7 inline-block text-sm font-semibold underline decoration-black/25 underline-offset-4">Choose a starting point</Link>
      </div>
    </section>
  );
}
