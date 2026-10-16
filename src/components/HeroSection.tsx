import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pause, Play } from "lucide-react";

const FPS = 30;
const CUE_GAP = 14;
const LINES = ["Rest the dough for ten minutes", "and it rolls out flat", "without shrinking back"];

// Word timings in frames, so one counter drives both the timecode and the highlight.
const CUES = (() => {
  let frame = 0;
  return LINES.map((line) => {
    const start = frame;
    const words = line.split(" ").map((text) => {
      const word = { text, end: frame + 7 + text.length * 2 };
      frame = word.end;
      return word;
    });
    frame += CUE_GAP;
    return { start, end: frame, words };
  });
})();
const LOOP = CUES[CUES.length - 1].end;
const STILL_FRAME = CUES[0].words[2].end - 4;
// The still frame reads 00:00:12:04, the same frame the share images show.
const CLIP_START = 12 * FPS + 4 - STILL_FRAME;

const timecode = (frames: number) =>
  [frames / (3600 * FPS), (frames / (60 * FPS)) % 60, (frames / FPS) % 60, frames % FPS]
    .map((n) => String(Math.floor(n)).padStart(2, "0"))
    .join(":");

function CaptionMonitor() {
  const [frame, setFrame] = useState(STILL_FRAME);
  const [playing, setPlaying] = useState(() => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % LOOP), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [playing]);

  const cue = CUES.find((c) => frame < c.end) ?? CUES[0];
  const active = cue.words.findIndex((w) => frame < w.end);

  return (
    <figure className="w-[248px] sm:w-[288px] lg:w-[312px]">
      <figcaption className="sr-only">Preview of a 9:16 short with captions that highlight each word as it is spoken.</figcaption>
      <div aria-hidden="true" className="relative aspect-[9/16] overflow-hidden rounded-[18px] bg-ink text-white">
        <svg viewBox="0 0 90 160" className="absolute inset-0 h-full w-full fill-ink2">
          <ellipse cx="45" cy="60" rx="12.5" ry="15.5" />
          <path d="M38.5 70H51.5L52.5 83C59 87 69 90 75 94C82 98.5 84.5 108 85.5 160H4.5C5.5 108 8 98.5 15 94C21 90 31 87 37.5 83Z" />
        </svg>
        <span className="absolute left-[10%] top-[10%] h-[7%] w-[12%] border-l-2 border-t-2 border-white/45" />
        <span className="absolute right-[10%] top-[10%] h-[7%] w-[12%] border-r-2 border-t-2 border-white/45" />
        <span className="absolute bottom-[10%] left-[10%] h-[7%] w-[12%] border-b-2 border-l-2 border-white/45" />
        <span className="absolute bottom-[10%] right-[10%] h-[7%] w-[12%] border-b-2 border-r-2 border-white/45" />
        <span className="absolute left-[calc(10%+10px)] top-[calc(10%+8px)] text-[11px] font-bold text-white/70">9:16</span>
        <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 bg-white/25" />
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-white/25" />
        <p className="absolute inset-x-[12%] bottom-[24%] text-[22px] font-bold leading-[1.3] sm:text-[25px] lg:text-[27px]">
          {cue.words.map((word, i) => (
            <span
              key={`${cue.start}-${i}`}
              className={`mr-[0.22em] inline-block rounded-[4px] ${i === active ? "cue-word-active bg-cue px-[0.14em] text-ink" : active === -1 || i < active ? "text-white" : "text-white/55"}`}
            >
              {word.text}
            </span>
          ))}
        </p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause caption preview" : "Play caption preview"}
          className="grid h-8 w-8 place-items-center rounded-md border border-line bg-surface text-ink transition-colors hover:border-ink"
        >
          {playing ? <Pause aria-hidden="true" className="h-3.5 w-3.5" /> : <Play aria-hidden="true" className="h-3.5 w-3.5" />}
        </button>
        <span className="font-mono text-[15px] font-medium tabular-nums text-ink">{timecode(CLIP_START + frame)}</span>
      </div>
    </figure>
  );
}

export default function HeroSection() {
  return (
    <section className="px-4 pb-20 pt-12 sm:px-6 md:px-12 lg:py-16">
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 lg:min-h-[calc(100svh-72px-128px)] lg:grid-cols-12 lg:gap-8">
        <div className="@container lg:col-span-7">
          <h1 className="whitespace-nowrap font-display text-[min(104px,13.4cqw)] font-black leading-[0.9] text-ink">
            One video in.<br />Captioned vertical<br />shorts out.
          </h1>
          <p className="mt-7 max-w-[34rem] text-pretty text-lg leading-8 text-muted">
            Upload footage you own, paste a link to a long video, or describe one in a prompt. TakeOne sends back a 9:16 cut with timed captions, and you can fix any word in Studio.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to="/create" className="inline-flex items-center rounded-md border border-transparent bg-cue px-6 py-3.5 text-base font-bold text-ink transition-colors hover:border-ink">Make a short</Link>
            <a href="#how-it-works" className="text-base font-semibold text-ink underline decoration-line decoration-2 underline-offset-[6px] transition-colors hover:decoration-ink">See how</a>
          </div>
          <p className="mt-5 text-sm text-muted">5 videos free. No card needed.</p>
        </div>

        <div className="flex lg:col-span-5 lg:justify-end">
          <CaptionMonitor />
        </div>
      </div>
    </section>
  );
}
