import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "@phosphor-icons/react";
import { button } from "../lib/ui";
import { ease } from "../lib/motion";

const FPS = 30;
const CUE_GAP = 14;
// The 16:9 frame holds wide for this many frames, then folds to 9:16 before the first word.
const FOLD = 50;
const LINES = ["Rest the dough for ten minutes", "and it rolls out flat", "without shrinking back"];

// Word timings in frames, so one counter drives both the timecode and the highlight.
const CUES = (() => {
  let frame = FOLD;
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

const corner = "absolute h-[9%] w-[9%] border-surface/60";

function Scene() {
  return (
    <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <rect width="160" height="90" fill="#1d1d1b" />
      <rect x="10" y="12" width="34" height="40" fill="none" stroke="#3a3a37" strokeWidth="1.2" />
      <path d="M27 12V52M10 32H44" stroke="#3a3a37" strokeWidth="1.2" />
      <path d="M120 90V62H150V90M117 62H153" fill="none" stroke="#3a3a37" strokeWidth="1.2" />
      <circle cx="135" cy="54" r="6" fill="none" stroke="#3a3a37" strokeWidth="1.2" />
      <g fill="#4a4a46">
        <ellipse cx="80" cy="36" rx="8" ry="10" />
        <path d="M75.5 43H84.5L85.2 51C89.5 53.5 96 55.5 100 58C104.5 61 106 67 106.6 90H53.4C54 67 55.5 61 60 58C64 55.5 70.5 53.5 74.8 51Z" />
      </g>
    </svg>
  );
}

function FoldingFrame() {
  const reduced = useReducedMotion();
  const [frame, setFrame] = useState(STILL_FRAME);
  const [playing, setPlaying] = useState(() => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setFrame((f) => (f + 1) % LOOP), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [playing]);

  const tall = frame >= FOLD - 20;
  const cue = CUES.find((c) => frame < c.end) ?? CUES[0];
  const active = frame < FOLD ? -2 : cue.words.findIndex((w) => frame < w.end);

  return (
    <figure className="w-full max-w-[460px]">
      <figcaption className="sr-only">A 16:9 video frame folds into a 9:16 short, and captions highlight each word as it is spoken.</figcaption>
      <div aria-hidden="true" className="flex items-center justify-between pb-2 font-mono text-[10px] uppercase tracking-[0.1em] text-ink2">
        <span className={tall ? "text-muted line-through decoration-signal" : ""}>16:9 source</span>
        <span className={tall ? "" : "text-muted"}>9:16 short</span>
      </div>
      <div aria-hidden="true" className="relative grid aspect-[460/440] place-items-center border border-ink bg-surface pat-dots-soft">
        <motion.div
          className="relative overflow-hidden bg-ink shadow-hard"
          initial={false}
          animate={tall ? { width: "47%", height: "94%" } : { width: "94%", height: "52.9%" }}
          transition={reduced ? { duration: 0 } : { duration: 0.6, ease }}
        >
          <Scene />
          <motion.div
            className="absolute inset-y-0 left-1/2 w-[50%] -translate-x-1/2 border-x border-dashed border-signal"
            initial={false}
            animate={{ opacity: tall ? 0 : 1 }}
            transition={{ duration: reduced ? 0 : 0.2 }}
          />
          <span className={`${corner} left-[7%] top-[5%] border-l border-t`} />
          <span className={`${corner} right-[7%] top-[5%] border-r border-t`} />
          <span className={`${corner} bottom-[5%] left-[7%] border-b border-l`} />
          <span className={`${corner} bottom-[5%] right-[7%] border-b border-r`} />
          <span className="absolute left-[calc(7%+8px)] top-[calc(5%+6px)] font-mono text-[10px] text-surface/70">{tall ? "9:16" : "16:9"}</span>
          {tall && (
            <p className="absolute inset-x-[9%] bottom-[20%] font-sans text-[19px] font-bold leading-[1.3] text-surface sm:text-[22px]">
              {active > -2 && cue.words.map((word, i) => (
                <span
                  key={`${cue.start}-${i}`}
                  className={`mr-[0.22em] inline-block ${i === active ? "cue-word-active bg-signal px-[0.14em] text-surface" : active === -1 || i < active ? "text-surface" : "text-surface/45"}`}
                >
                  {word.text}
                </span>
              ))}
            </p>
          )}
        </motion.div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause caption preview" : "Play caption preview"}
          className="grid h-8 w-8 place-items-center border border-ink bg-surface text-ink transition-colors hover:bg-paper2"
        >
          {playing ? <Pause aria-hidden="true" weight="fill" size={13} /> : <Play aria-hidden="true" weight="fill" size={13} />}
        </button>
        <span className="font-mono text-[13px] tabular-nums text-ink">{timecode(CLIP_START + frame)}</span>
      </div>
    </figure>
  );
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-10 sm:px-6 md:px-12 lg:pb-24 lg:pt-14">
      <div aria-hidden="true" className="halftone pointer-events-none absolute left-1/2 top-[19%] aspect-square w-[min(118vw,980px)] lg:top-[46%] -translate-x-1/2 -translate-y-1/2 lg:left-[34%]" />
      <div className="relative mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-14 lg:min-h-[calc(100svh-64px-120px)] lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-7">
          <p className="eyebrow">Long video · Shorts · 12 caption languages</p>
          <h1 className="display mt-6 text-[clamp(52px,9.2vw,138px)] uppercase leading-[0.86] text-ink">
            One long video in.<br />Shorts out for every audience.
          </h1>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link to="/create" className={`${button("primary")} px-6 py-3.5 text-base`}>Make a short</Link>
            <a href="#how-it-works" className="font-mono text-xs uppercase tracking-[0.1em] text-ink underline decoration-ink/30 underline-offset-[6px] transition-colors hover:decoration-ink">See how</a>
          </div>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">5 videos free. No card needed.</p>
        </div>

        <div className="flex justify-center lg:col-span-5 lg:justify-end">
          <FoldingFrame />
        </div>
      </div>
    </section>
  );
}
