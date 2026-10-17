import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { SectionHead, shell } from "./Section";
import nasaSource from "../../assets/landing/nasa-source.jpg";
import nasa63 from "../../assets/landing/nasa-63.jpg";
import nasa66 from "../../assets/landing/nasa-66.jpg";
import nasa69 from "../../assets/landing/nasa-69.jpg";
import nasa71 from "../../assets/landing/nasa-71.jpg";
import nasa74 from "../../assets/landing/nasa-74.jpg";

const ease = [0.2, 0.8, 0.2, 1] as const;
const mono = "font-mono text-[12px] tabular-nums";

function WatchLoupe() {
  return (
    <figure>
      <img src={nasaSource} alt="The 16:9 NASA source video" width={318} height={180} className="aspect-video w-full rounded-[10px] object-cover" />
      <div className="mt-4 h-1 rounded-full bg-ink/10"><div className="h-full w-full origin-left rounded-full bg-ink/70" /></div>
      <figcaption className={`mt-2 flex justify-between text-ink2 ${mono}`}><span>00:00</span><span>01:38</span></figcaption>
    </figure>
  );
}

function PickLoupe() {
  const at = (42 / 98) * 100;
  return (
    <div>
      <div className="relative mt-6 h-14 rounded-[10px] bg-film">
        <div className="absolute inset-y-2 rounded-[6px] bg-grease/90" style={{ left: `${at - 8}%`, width: "16%" }} />
        <span className="absolute -top-6 font-hand text-[19px] text-grease" style={{ left: `${at - 4}%` }}>0:42</span>
      </div>
      <div className={`mt-2 flex justify-between text-ink2 ${mono}`}><span>00:00</span><span>01:38</span></div>
      <p className="mt-6 text-[15px] text-ink">The moment, the hook and the reason it works.</p>
    </div>
  );
}

function CaptionLoupe() {
  return (
    <div className="flex items-center gap-6">
      <img src={nasa66} alt="A captioned frame from the NASA short" width={180} height={322} className="aspect-[9/16] w-[132px] rounded-[10px] object-cover" />
      <ul className="space-y-2 text-[15px]">
        {["Clean", "Bold pop", "Pop in"].map((style, i) => <li key={style} className={`whitespace-nowrap rounded-[9px] px-3 py-2 ${i === 0 ? "bg-ink text-surface" : "text-ink2 shadow-[inset_0_0_0_1px_rgba(20,19,17,.12)]"}`}>{style}</li>)}
      </ul>
    </div>
  );
}

function TranslateLoupe() {
  return (
    <ul className="divide-y divide-line">
      {[["English", "en", "A rocket moves"], ["Hindi", "hi", "एक रॉकेट चलता है"]].map(([name, lang, line]) => (
        <li key={lang} className="flex items-baseline justify-between gap-4 py-4 first:pt-0">
          <span lang={lang} className="text-[22px] font-medium tracking-[-0.01em] text-ink">{line}</span>
          <span className="text-[13px] text-ink2">{name}</span>
        </li>
      ))}
      <li className="pt-4 text-[13px] text-ink2">Plus Tamil, Telugu, Bengali, Marathi, Japanese, Korean, Chinese, Thai, Indonesian and Vietnamese.</li>
    </ul>
  );
}

const NOTES = [
  ["0:03", "The rocket explanation is clear and the captions are easy to read."],
  ["0:08", "This section feels slow. A tighter cut would keep my attention."],
  ["0:14", "The satellite section follows the rocket section. Please check the transition."],
];

function ReviewLoupe() {
  return (
    <div>
      <ul className="space-y-3">
        {NOTES.map(([time, note]) => (
          <li key={time} className="flex gap-3 text-[15px] text-ink">
            <span className={`mt-0.5 flex-none text-grease ${mono}`}>{time}</span>
            {note}
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-line pt-4 text-[15px] text-ink2"><b className="font-semibold text-ink">Mixed overall.</b> Clear explanations, slow pacing.</p>
    </div>
  );
}

const STEPS: { title: string; line: string; frame: string; loupe: ReactNode }[] = [
  { title: "Watch", line: "Gemini reads every frame and listens to the audio.", frame: nasa63, loupe: <WatchLoupe /> },
  { title: "Pick the moment", line: "It marks the strongest part and says why.", frame: nasa69, loupe: <PickLoupe /> },
  { title: "Caption", line: "Words land on the beat of the voice.", frame: nasa66, loupe: <CaptionLoupe /> },
  { title: "Translate", line: "The same cut, captioned for another audience.", frame: nasa71, loupe: <TranslateLoupe /> },
  { title: "Review", line: "Share a link. Notes land on the timeline.", frame: nasa74, loupe: <ReviewLoupe /> },
];

function Strip({ active }: { active: number }) {
  const reduced = useReducedMotion();
  return (
    <div className="film-strip shadow-film">
      <div className="overflow-hidden">
      <motion.div className="grid grid-cols-5 gap-[7px]" animate={{ x: reduced ? 0 : `${(2 - active) * 1.5}%` }} transition={{ duration: 0.6, ease }}>
        {STEPS.map((step, i) => (
          <div key={step.title} className="relative">
            <img src={step.frame} alt="" className={`block aspect-[9/16] w-full object-cover transition-opacity duration-500 ease-paper ${i === active ? "opacity-100" : "opacity-45"}`} />
            {i === active && (
              <motion.svg layoutId="grease-ring" aria-hidden="true" viewBox="0 0 96 200" preserveAspectRatio="none" className="pointer-events-none absolute -left-[22%] -top-[8%] z-10 h-[116%] w-[144%] overflow-visible" transition={{ duration: reduced ? 0 : 0.5, ease }}>
                <path d="M50 6 C 12 4, 4 60, 8 110 C 12 168, 30 196, 54 192 C 86 186, 92 120, 88 70 C 84 22, 66 6, 40 12" fill="none" stroke="#c4321f" strokeWidth={3.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              </motion.svg>
            )}
          </div>
        ))}
      </motion.div>
      </div>
      <div aria-hidden="true" className="edge-print flex justify-between px-1 pt-[7px]">
        {STEPS.map((step, i) => <span key={step.title} className={i === active ? "" : "opacity-50"}>▶ {i + 1}{i === 0 ? "  TAKEONE 5063" : ""}</span>)}
      </div>
    </div>
  );
}

function Loupe({ step }: { step: (typeof STEPS)[number] }) {
  return <div className="sheet p-6">{step.loupe}</div>;
}

function StepBlock({ index, onActive }: { index: number; onActive(i: number): void }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => { if (inView) onActive(index); }, [inView, index, onActive]);
  const step = STEPS[index];
  return (
    <li ref={ref} className="py-8 lg:flex lg:min-h-[62vh] lg:flex-col lg:justify-center lg:py-0">
      <p className={`text-grease ${mono}`}>0{index + 1}</p>
      <h3 className="display mt-2 text-[30px] text-ink md:text-[38px]">{step.title}</h3>
      <p className="mt-3 max-w-[34ch] text-[17px] leading-relaxed text-ink2">{step.line}</p>
      <div className="mt-6 lg:hidden">
        <Loupe step={step} />
      </div>
    </li>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();
  return (
    <section id="how-it-works" aria-labelledby="how-heading" className={`${shell} scroll-mt-16 py-24 md:py-32`}>
      <SectionHead id="how-heading" title="One long video, one pass." sub="Five steps from upload to a short you can share." />
      <div className="mt-8 lg:grid lg:grid-cols-12 lg:gap-12">
        <ol className="lg:col-span-5">
          {STEPS.map((step, i) => <StepBlock key={step.title} index={i} onActive={setActive} />)}
        </ol>
        <div aria-hidden="true" className="hidden lg:col-span-7 lg:block">
          <div className="sticky top-[16vh] space-y-8 py-8">
            <Strip active={active} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={active} initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.4, ease }}>
                <Loupe step={STEPS[active]} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
