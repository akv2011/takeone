import { Link } from "react-router-dom";

const modes = [
  { input: "A prompt", output: "A narrated short cut from stock footage, with captions timed to the voice." },
  { input: "Your own video", output: "The same footage trimmed, sped up or reframed to 9:16 from one plain instruction, with captions added." },
  { input: "A long video link", output: "The moment you mark with timestamps, or one TakeOne picks, cut out as a captioned vertical short." },
];

export default function ProductModes() {
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-6 border-y border-line bg-surface px-4 py-20 sm:px-6 md:px-12 md:py-24">
      <div className="mx-auto max-w-7xl">
        <h2 id="how-heading" className="text-balance font-display text-5xl font-extrabold leading-[0.9] text-ink md:text-6xl">Start with what you have.</h2>
        <dl className="mt-12 border-b border-line">
          <div className="hidden border-t border-line py-3 text-sm text-muted md:grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8">
            <span>You bring</span>
            <span>You get back</span>
          </div>
          {modes.map((mode) => (
            <div key={mode.input} className="grid gap-2 border-t border-line py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:items-baseline md:gap-8 md:py-8">
              <dt className="font-display text-[34px] font-extrabold leading-[0.95] text-ink md:text-[44px]">{mode.input}</dt>
              <dd className="max-w-xl text-lg leading-8 text-ink2">{mode.output}</dd>
            </div>
          ))}
        </dl>
        <Link to="/create" className="mt-8 inline-block text-base font-semibold text-ink underline decoration-line decoration-2 underline-offset-[6px] transition-colors hover:decoration-ink">Choose a starting point</Link>
      </div>
    </section>
  );
}
