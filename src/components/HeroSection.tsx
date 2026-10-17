import { useId, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { LinkSimple, PencilSimple, UploadSimple, type Icon } from "@phosphor-icons/react";
import { InkMark } from "../lib/motion";
import { FREE_LIMIT } from "../../convex/config";
import { CAPTION_LANGUAGES } from "../../convex/captions";
import nasa63 from "../assets/landing/nasa-63.jpg";
import nasa66 from "../assets/landing/nasa-66.jpg";
import nasa69 from "../assets/landing/nasa-69.jpg";
import nasa71 from "../assets/landing/nasa-71.jpg";
import nasa74 from "../assets/landing/nasa-74.jpg";

const ease = [0.2, 0.8, 0.2, 1] as const;

type Mode = "link" | "upload" | "prompt";

const MODES: { id: Mode; label: string; icon: Icon; placeholder: string }[] = [
  { id: "link", label: "Link", icon: LinkSimple, placeholder: "youtube.com/watch?v=iG9CE55wbtY" },
  { id: "upload", label: "Upload", icon: UploadSimple, placeholder: "Choose a video you own, up to 50 MB" },
  { id: "prompt", label: "Prompt", icon: PencilSimple, placeholder: "An orange paper rocket launches across a blue desk" },
];

const looksLikeUrl = (text: string) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(text.trim());

// The Create page reads these params: mode=link&url=…, mode=prompt&q=…, or mode=upload.
export function createHref(mode: Mode, value: string) {
  const params = new URLSearchParams({ mode });
  const text = value.trim();
  if (text && mode === "link") params.set("url", text);
  if (text && mode === "prompt") params.set("q", text);
  return `/create?${params}`;
}

export function Composer({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("link");
  const [value, setValue] = useState("");
  const field = useRef<HTMLInputElement | HTMLButtonElement | null>(null);
  const id = useId();
  const current = MODES.find((m) => m.id === mode)!;
  const LeadIcon = current.icon;

  const choose = (next: Mode) => {
    setMode(next);
    if (next === "upload") setValue("");
    requestAnimationFrame(() => field.current?.focus());
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    navigate(createHref(mode, value));
  };
  // A pasted link in prompt mode is almost always meant as a link.
  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (mode === "prompt" && !value && looksLikeUrl(event.clipboardData.getData("text"))) setMode("link");
  };

  return (
    <div className={className}>
      <form onSubmit={submit} className="glass flex h-16 w-full max-w-[520px] items-center gap-3 rounded-card pl-[18px] pr-2 transition-shadow duration-200 ease-paper focus-within:shadow-[0_0_0_1.5px_#141311,0_8px_24px_-12px_rgba(20,19,17,.25)]">
        <LeadIcon aria-hidden="true" size={20} className="flex-none text-muted" />
        {mode === "upload" ? (
          <button ref={(el) => { field.current = el; }} type="submit" className="min-w-0 flex-1 truncate text-left text-base text-muted outline-none">
            {current.placeholder}
          </button>
        ) : (
          <input
            ref={(el) => { field.current = el; }}
            id={id}
            name={mode === "link" ? "url" : "q"}
            type="text"
            inputMode={mode === "link" ? "url" : "text"}
            autoComplete="off"
            spellCheck={mode === "prompt"}
            aria-label={mode === "link" ? "Link to a long video" : "Describe the video"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={paste}
            placeholder={current.placeholder}
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        )}
        <button type="submit" className="inline-flex h-12 flex-none items-center gap-2.5 whitespace-nowrap rounded-control bg-ink pl-5 pr-[18px] text-[15px] font-semibold tracking-[-0.01em] text-surface transition-[transform,background-color] duration-150 ease-paper hover:bg-[#2a2824] active:scale-[.98]">
          Make a short
          <kbd aria-hidden="true" className="hidden h-5 min-w-5 place-items-center rounded-[5px] bg-surface/15 px-1 font-sans text-[11px] text-surface/75 sm:inline-grid">↵</kbd>
        </button>
      </form>
      <div role="radiogroup" aria-label="Start from" className="mt-3.5 flex gap-1.5">
        {MODES.map(({ id: m, label, icon: ModeIcon }) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => choose(m)}
            className={`inline-flex h-10 items-center gap-1.5 rounded-[9px] px-3 text-[13.5px] font-medium transition-[transform,background-color,color] duration-150 ease-paper active:scale-[.98] sm:h-8 ${mode === m ? "bg-ink text-surface" : "bg-surface/55 text-ink2 shadow-[inset_0_0_0_1px_rgba(20,19,17,.12)] hover:bg-surface hover:text-ink"}`}
          >
            <ModeIcon aria-hidden="true" size={15} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

const FRAMES = [nasa63, nasa66, nasa69, nasa71, nasa74];
const PICKED = 2;
const EDGE = ["TAKEONE 5063", "▶ 12", "12A", "▶ 13", "13A"];

function FilmStrip() {
  const reduced = useReducedMotion();
  const draw = (delay: number) => (reduced ? { initial: false as const } : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 1, delay, ease } });
  return (
    <motion.div
      className="relative pt-14 lg:pb-10 lg:pt-[70px]"
      initial={reduced ? false : { opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 1.1, delay: 0.2, ease }}
    >
      <div className="film-strip shadow-film lg:mr-[-140px] lg:origin-left lg:[transform:perspective(1400px)_rotateY(-10deg)_rotate(-1.6deg)]">
        <div className="grid grid-cols-5 gap-[5px] sm:gap-[7px]">
          {FRAMES.map((src, i) => (
            <div key={src} className="relative">
              <img src={src} alt={i === PICKED ? "The frame Gemini picked from the NASA upload" : ""} width={180} height={322} className="block aspect-[9/16] w-full object-cover" />
              {i === PICKED && (
                <>
                  <svg aria-hidden="true" viewBox="0 0 96 200" preserveAspectRatio="none" className="pointer-events-none absolute -left-[24%] -top-[10%] z-10 h-[122%] w-[148%] overflow-visible">
                    <motion.path d="M50 6 C 12 4, 4 60, 8 110 C 12 168, 30 196, 54 192 C 86 186, 92 120, 88 70 C 84 22, 66 6, 40 12" fill="none" stroke="#c4321f" strokeWidth={3.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" {...draw(1.2)} />
                  </svg>
                  <motion.span
                    aria-hidden="true"
                    className="absolute bottom-[calc(100%+30px)] left-[-10%] z-10 whitespace-nowrap font-hand text-[21px] leading-none text-grease sm:text-[25px] lg:bottom-[calc(100%+34px)]"
                    style={{ rotate: -4 }}
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 2, ease }}
                  >
                    this one, 0:42
                  </motion.span>
                </>
              )}
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="edge-print flex justify-between px-1 pt-[7px] text-[9px] sm:text-[11px]">
          {EDGE.map((mark) => <span key={mark}>{mark}</span>)}
        </div>
      </div>
    </motion.div>
  );
}

// Real shorts drifting out of focus at the edges, like screens behind the page.
const FLOATS = [
  { src: nasa71, className: "-left-[34px] top-[560px] w-24 -rotate-[9deg] opacity-40 blur-[2.5px]" },
  { src: nasa66, className: "right-[2%] top-[110px] w-[88px] rotate-[8deg] opacity-35 blur-[3px]" },
  { src: nasa74, className: "left-[44%] -top-[60px] w-20 rotate-[14deg] opacity-30 blur-[3.5px]" },
];

function Floats() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
      {FLOATS.map(({ src, className }) => (
        <div key={src} className={`absolute rounded-[14px] bg-[#111] p-1 shadow-[0_30px_50px_-25px_rgba(30,40,60,.45)] saturate-[.85] ${className}`}>
          <img src={src} alt="" className="block aspect-[9/16] w-full rounded-[10px] object-cover" />
        </div>
      ))}
    </div>
  );
}

const rise = (delay: number, reduced: boolean | null) => (reduced ? { initial: false as const } : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay, ease } });

export default function HeroSection() {
  const reduced = useReducedMotion();
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-x-clip">
      <Floats />
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 md:px-12">
        <div className="grid items-center gap-x-10 pb-10 pt-6 lg:min-h-[calc(100svh-64px-64px)] lg:grid-cols-12 lg:pb-10 lg:pt-6">
          <h1 id="hero-heading" className="display ml-[-0.04em] text-[clamp(40px,10.4vw,62px)] leading-[1.02] text-ink lg:col-span-6 lg:row-start-1 lg:self-end lg:text-[clamp(40px,4.3vw,62px)]">
            <motion.span className="block" {...rise(0, reduced)}>Hand it the long cut.</motion.span>
            <motion.span className="block" {...rise(0.08, reduced)}>
              Keep the <InkMark type="underline" delay={0.9}>take</InkMark>
            </motion.span>
            <motion.span className="block" {...rise(0.16, reduced)}>that lands.</motion.span>
          </h1>

          <div className="-mx-5 sm:-mx-8 md:-mx-12 lg:col-span-6 lg:col-start-7 lg:row-span-2 lg:row-start-1 lg:mx-0">
            <FilmStrip />
          </div>

          <div className="min-w-0 lg:col-span-6 lg:row-start-2 lg:self-start">
            <motion.p className="mb-9 mt-6 max-w-[30ch] text-[18.5px] leading-normal text-ink2" {...rise(0.25, reduced)}>
              Gemini watches every frame, picks the moment, and hands back a captioned vertical short in {CAPTION_LANGUAGES.length} languages.
            </motion.p>
            <motion.div {...rise(0.35, reduced)}>
              <Composer />
            </motion.div>
            <motion.ul className="mt-9 flex max-w-[520px] flex-wrap gap-x-[22px] gap-y-2 border-t border-line pt-5" {...rise(0.55, reduced)}>
              {[[String(FREE_LIMIT), "free shorts"], [String(CAPTION_LANGUAGES.length), "caption languages"], ["~2 min", "to render"]].map(([value, label]) => (
                <li key={label} className="flex items-baseline gap-1.5 text-[13.5px] text-ink2">
                  <strong className="text-[15px] font-semibold tabular-nums text-ink">{value}</strong> {label}
                </li>
              ))}
            </motion.ul>
          </div>
        </div>
        <p className="flex h-16 items-center border-t border-line text-[13px] text-muted">
          <span>Real output from a 98-second NASA upload. <b className="font-semibold text-ink2">Unedited.</b></span>
        </p>
      </div>
    </section>
  );
}
