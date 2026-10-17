import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Reveal, Stagger, StaggerItem } from "../lib/motion";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "square" as const };

const PromptIcon = () => (
  <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
    <rect x="5" y="9" width="38" height="30" {...stroke} />
    <path d="M11 18H31M11 24H37M11 30H23" {...stroke} />
    <path d="M27 27V33" {...stroke} stroke="#d8341f" />
  </svg>
);

const UploadIcon = () => (
  <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
    <rect x="5" y="12" width="38" height="26" {...stroke} />
    <path d="M5 17H43M5 33H43M11 12V17M19 12V17M27 12V17M35 12V17M11 33V38M19 33V38M27 33V38M35 33V38" {...stroke} />
    <path d="M24 29V21M20.5 24.5L24 21L27.5 24.5" {...stroke} stroke="#d8341f" />
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden="true">
    <path d="M5 34H43" {...stroke} />
    <path d="M5 30V38M43 30V38M14 32V36M23 32V36M32 32V36" {...stroke} />
    <rect x="20" y="31" width="9" height="6" fill="#d8341f" />
    <path d="M18 16L14.5 19.5A4.95 4.95 0 0 0 21.5 26.5L25 23M23 14L26.5 10.5A4.95 4.95 0 0 1 33.5 17.5L30 21M20 20L28 12" {...stroke} />
  </svg>
);

const modes: { icon: ReactNode; label: string; eyebrow: string; example: ReactNode }[] = [
  {
    icon: <PromptIcon />,
    eyebrow: "01 · Prompt",
    label: "Type an idea",
    example: <span className="block truncate border border-ink/25 bg-paper px-2 py-1.5 font-mono text-[11px] text-ink2">A 30s explainer on monsoon rain<span className="ml-px inline-block h-3 w-px translate-y-0.5 animate-pulse bg-signal" /></span>,
  },
  {
    icon: <UploadIcon />,
    eyebrow: "02 · Upload",
    label: "Bring your own video",
    example: <span className="flex items-center justify-between border border-ink/25 bg-paper px-2 py-1.5 font-mono text-[11px] text-ink2"><span className="truncate">interview_take3.mp4</span><span>14:02</span></span>,
  },
  {
    icon: <LinkIcon />,
    eyebrow: "03 · Link",
    label: "Paste a long video link",
    example: <span className="flex items-center justify-between border border-ink/25 bg-paper px-2 py-1.5 font-mono text-[11px] text-ink2"><span className="truncate">youtube.com/watch?v=…</span><span className="text-cueInk">12:04 to 12:41</span></span>,
  },
];

export default function ProductModes() {
  return (
    <section aria-labelledby="modes-heading" className="px-4 py-24 sm:px-6 md:px-12 md:py-32">
      <div className="mx-auto max-w-[1360px]">
        <Reveal className="rule-top grid gap-6 pt-6 md:grid-cols-12">
          <h2 id="modes-heading" className="display text-[clamp(44px,6vw,80px)] text-ink md:col-span-8">
            Start with <em>what you have.</em>
          </h2>
          <p className="eyebrow self-end md:col-span-4 md:text-right">Three ways in · one 9:16 short out</p>
        </Reveal>
        <Stagger className="mt-14 grid gap-6 md:grid-cols-3 md:gap-8">
          {modes.map((mode) => (
            <StaggerItem key={mode.label}>
              <Link
                to="/create"
                className="group sheet flex h-full flex-col gap-8 p-6 shadow-hard-sm transition-[transform,box-shadow] duration-300 ease-paper hover:-translate-y-0.5 hover:shadow-hard"
              >
                <span className="flex items-start justify-between text-ink">
                  {mode.icon}
                  <span className="eyebrow">{mode.eyebrow}</span>
                </span>
                <span className="display text-[34px] leading-none text-ink">{mode.label}</span>
                <span className="mt-auto">{mode.example}</span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
