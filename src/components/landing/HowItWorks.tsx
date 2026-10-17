import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { ease } from "../../lib/motion";

type Step = { label: string; line: string; tilt: number; card: ReactNode; shadow: string; dark?: boolean };

const mono = "font-mono text-[11px] uppercase tracking-[0.08em]";

function CardHead({ left, right }: { left: string; right: string }) {
  return (
    <div className={`flex items-center justify-between border-b border-current/20 pb-3 ${mono}`}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

const FRAMES = ["M8 30H40M14 22H34", "M24 10V38M10 24H38", "M10 34L22 18L30 28L38 20", "M12 14H36V34H12Z", "M24 12A12 12 0 1 1 23.9 12", "M10 20H38M10 28H30"];

function WatchCard() {
  const reduced = useReducedMotion();
  return (
    <>
      <CardHead left="Gemini on Vertex AI" right="Watching" />
      <div className="relative mt-6 grid grid-cols-6 gap-1 border-y-[6px] border-ink bg-ink p-1">
        {FRAMES.map((d) => (
          <svg key={d} viewBox="0 0 48 48" className="aspect-[4/5] w-full bg-ink2">
            <path d={d} fill="none" stroke="#a9a69e" strokeWidth="1.5" />
          </svg>
        ))}
        <motion.span
          className="absolute -bottom-3 -top-3 w-0.5 bg-signal"
          initial={{ left: "8%" }}
          animate={reduced ? { left: "62%" } : { left: ["8%", "92%"] }}
          transition={reduced ? { duration: 0 } : { duration: 4, ease: "linear", repeat: Infinity }}
        />
      </div>
      <ul className={`mt-6 grid grid-cols-3 gap-2 text-center ${mono}`}>
        {["Frames", "Audio", "Speech"].map((item) => (
          <li key={item} className="border border-ink/30 py-2">{item}</li>
        ))}
      </ul>
    </>
  );
}

const BARS = [4, 7, 5, 9, 6, 3, 8, 10, 6, 4, 7, 11, 13, 12, 9, 14, 12, 8, 5, 6, 9, 7, 4, 6, 8, 5, 3, 6, 7, 4];

function PickCard() {
  return (
    <>
      <CardHead left="Best moment" right="1 of 3" />
      <div className="relative mt-6">
        <div className="flex h-16 items-center gap-[3px]">
          {BARS.map((h, i) => (
            <span key={i} className={`flex-1 ${i >= 11 && i <= 18 ? "bg-ink" : "bg-ink/25"}`} style={{ height: `${h * 7}%` }} />
          ))}
        </div>
        <div className="pat-hatch absolute inset-y-0 left-[36%] w-[27%] opacity-15" />
        <div className="absolute inset-y-[-6px] left-[36%] w-[27%] border-x-2 border-signal" />
        <div className={`mt-3 flex justify-between ${mono} text-ink2`}>
          <span>0:00</span><span className="text-cueInk">12:04 to 12:41</span><span>18:20</span>
        </div>
      </div>
      <p className="mt-6 font-serif text-2xl italic leading-tight">“Rest the dough for ten minutes.”</p>
      <p className={`mt-3 ${mono} text-ink2`}>Hook · a complete tip in 37 s</p>
    </>
  );
}

function CaptionCard() {
  return (
    <>
      <CardHead left="Captions" right="Word timed" />
      <div className="mt-6 flex items-end gap-6">
        <div className="relative aspect-[9/16] w-28 shrink-0 border border-surface/40 bg-ink2">
          <p className="absolute inset-x-2 bottom-[22%] text-[11px] font-bold leading-tight">
            Rest the <span className="bg-signal px-0.5">dough</span> <span className="text-surface/45">for ten</span>
          </p>
        </div>
        <ul className={`grid flex-1 gap-2 ${mono}`}>
          {["Clean", "Bold pop", "Pop in"].map((style, i) => (
            <li key={style} className={`border px-3 py-2 ${i === 1 ? "border-surface bg-surface text-ink" : "border-surface/30"}`}>{style}</li>
          ))}
        </ul>
      </div>
      <p className={`mt-6 ${mono} text-surface/75`}>Speech-to-Text Chirp 3 · fix any word in Studio</p>
    </>
  );
}

const TRANSLATIONS = [
  ["EN", "Rest the dough for ten minutes"],
  ["HI", "आटे को दस मिनट आराम दें"],
  ["JA", "生地を10分休ませる"],
  ["TA", "மாவை பத்து நிமிடம் ஊற விடுங்கள்"],
];

function TranslateCard() {
  return (
    <>
      <CardHead left="Translate" right="12 languages" />
      <ul className="mt-4">
        {TRANSLATIONS.map(([code, text]) => (
          <li key={code} className="flex items-baseline gap-4 border-b border-ink/15 py-3 last:border-0">
            <span className={`${mono} w-6 text-ink2`}>{code}</span>
            <span lang={code.toLowerCase()} className="text-lg leading-snug">{text}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-4 ${mono} text-ink2`}>Cloud Translation · Noto fonts for each script</p>
    </>
  );
}

const NOTES = [
  ["0:03", "Open on the dough, not the bowl", "fix"],
  ["0:11", "Caption covers her hands", "fix"],
  ["0:19", "Great ending, keep it", "good"],
];

function ReviewCard() {
  return (
    <>
      <CardHead left="Review link" right="3 notes" />
      <ul className="mt-4">
        {NOTES.map(([time, note, kind]) => (
          <li key={time} className="flex items-baseline gap-4 border-b border-ink/15 py-3 last:border-0">
            <span className="font-mono text-xs text-cueInk">{time}</span>
            <span className="flex-1">{note}</span>
            <span className={`${mono} border px-1.5 ${kind === "good" ? "border-go text-go" : "border-ink/40 text-ink2"}`}>{kind}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center justify-between border-t border-ink pt-4">
        <span className={mono}>Summary</span>
        <span className="font-serif text-xl italic">Mostly positive, 2 fixes</span>
      </div>
    </>
  );
}

const STEPS: Step[] = [
  { label: "Watch.", line: "Gemini watches the frames and hears the audio.", tilt: -2, shadow: "shadow-hard", card: <WatchCard /> },
  { label: "Pick the moment.", line: "The strongest moments, each with a hook and a reason.", tilt: 1.5, shadow: "shadow-hard-lg", card: <PickCard /> },
  { label: "Caption.", line: "Words timed to the voice, styled your way.", tilt: -1, shadow: "shadow-[10px_10px_0_0_#d8341f]", dark: true, card: <CaptionCard /> },
  { label: "Translate.", line: "The same short for every audience.", tilt: 2, shadow: "shadow-hard", card: <TranslateCard /> },
  { label: "Review.", line: "Share a link. Get notes pinned to the second.", tilt: -1.5, shadow: "shadow-hard-lg", card: <ReviewCard /> },
];

function StepCard({ step, index }: { step: Step; index: number }) {
  return (
    <div className={`w-full max-w-[500px] border border-ink p-6 sm:p-7 ${step.shadow} ${step.dark ? "bg-ink text-surface" : "bg-surface text-ink"}`}>
      {step.card}
      <p className={`mt-6 text-right ${mono} ${step.dark ? "text-surface/60" : "text-ink2"}`}>Nº 0{index + 1}</p>
    </div>
  );
}

function StepBlock({ step, index, onActive }: { step: Step; index: number; onActive(i: number): void }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => { if (inView) onActive(index); }, [inView, index, onActive]);
  return (
    <li ref={ref} className="flex flex-col justify-center py-10 lg:min-h-[72vh] lg:py-0">
      <div className="rule-top pt-5">
        <p className={`${mono} text-ink2`}>Step 0{index + 1} / 05</p>
        <h3 className="display mt-4 text-[clamp(48px,6.4vw,96px)] text-ink">{step.label}</h3>
        <p className="mt-4 max-w-sm text-lg leading-7 text-ink2">{step.line}</p>
      </div>
      <div className="rule-bottom mt-8 lg:hidden" />
      <div className="mt-10 flex justify-center lg:hidden">
        <StepCard step={step} index={index} />
      </div>
    </li>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  const step = STEPS[active];
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16 px-4 py-24 sm:px-6 md:px-12 md:py-32">
      <div className="mx-auto max-w-[1360px]">
        <div className="rule-top grid gap-6 pt-6 md:grid-cols-12">
          <h2 id="how-heading" className="display text-[clamp(44px,6vw,80px)] text-ink md:col-span-8">
            How one take becomes <em>many.</em>
          </h2>
          <p className="eyebrow self-end md:col-span-4 md:text-right">Five steps · one pass</p>
        </div>
        <div className="mt-6 grid lg:grid-cols-12 lg:gap-10">
          <ol className="lg:col-span-5">
            {STEPS.map((s, i) => <StepBlock key={s.label} step={s} index={i} onActive={setActive} />)}
          </ol>
          <div aria-hidden="true" className="hidden lg:col-span-7 lg:block">
            <div className="sticky top-[14vh] flex h-[72vh] flex-col items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active}
                  className="flex w-full justify-center"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 28, rotate: step.tilt + 3 }}
                  animate={{ opacity: 1, y: 0, rotate: reduced ? 0 : step.tilt }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, y: -18, rotate: step.tilt - 2 }}
                  transition={{ duration: reduced ? 0.01 : 0.35, ease }}
                >
                  <StepCard step={step} index={active} />
                </motion.div>
              </AnimatePresence>
              <div className="mt-12 flex w-full max-w-[500px] gap-1.5">
                {STEPS.map((s, i) => (
                  <span key={s.label} className="h-1 flex-1 bg-ink/15">
                    <motion.span className="block h-full origin-left bg-ink" initial={false} animate={{ scaleX: i <= active ? 1 : 0 }} transition={{ duration: reduced ? 0 : 0.4, ease }} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
