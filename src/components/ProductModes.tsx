import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LinkSimple, PencilSimple, UploadSimple, type Icon } from "@phosphor-icons/react";
import { Stagger, StaggerItem } from "../lib/motion";
import { createHref } from "./HeroSection";
import { SectionHead, shell } from "./landing/Section";
import nasaSource from "../assets/landing/nasa-source.jpg";
import veoRocket from "../assets/landing/veo-rocket.jpg";

const well = "relative h-[224px] overflow-hidden rounded-[12px] bg-paper2/70 shadow-[inset_0_0_0_1px_rgba(20,19,17,.06)]";

function LinkVisual() {
  const moments = [["3:45", "4:17", 19.3, 2.7], ["5:35", "6:20", 28.8, 3.9], ["16:40", "17:18", 85.9, 3.3]] as const;
  return (
    <div className={`${well} flex flex-col justify-center gap-3 px-5`}>
      <p className="truncate rounded-[9px] bg-surface px-3 py-2 text-[13px] text-ink shadow-[inset_0_0_0_1px_rgba(20,19,17,.1)]">youtube.com/watch?v=iG9CE55wbtY</p>
      <div className="relative h-1.5 rounded-full bg-ink/10">
        {moments.map(([start, , left, width]) => <span key={start} className="absolute inset-y-0 rounded-full bg-grease" style={{ left: `${left}%`, width: `${width}%` }} />)}
      </div>
      <ul className="space-y-1 font-mono text-[12px] tabular-nums text-ink2">
        {moments.map(([start, end]) => <li key={start}>{start} to {end}</li>)}
      </ul>
    </div>
  );
}

function UploadVisual() {
  return (
    <div className={`${well} grid place-items-center px-5`}>
      <figure className="w-full">
        <img src={nasaSource} alt="A frame from the 98-second NASA upload" width={318} height={180} className="mx-auto aspect-video h-[148px] w-auto max-w-full rounded-[8px] object-cover" />
        <figcaption className="mt-2.5 flex justify-between text-[13px] text-ink2"><span>NASA radiation explainer</span><span className="font-mono tabular-nums">1:38</span></figcaption>
      </figure>
    </div>
  );
}

function PromptVisual() {
  return (
    <div className={`${well} flex items-center gap-4 px-5`}>
      <p className="flex-1 text-[15px] leading-snug text-ink">“An orange paper rocket launches across a blue desk.”</p>
      <img src={veoRocket} alt="A frame from the Veo clip made from that prompt" width={360} height={640} className="h-[176px] w-auto rounded-[8px] object-cover shadow-card" />
    </div>
  );
}

const ways: { mode: "link" | "upload" | "prompt"; icon: Icon; title: string; line: string; visual: ReactNode }[] = [
  { mode: "link", icon: LinkSimple, title: "Paste a link", line: "Gemini finds up to three moments.", visual: <LinkVisual /> },
  { mode: "upload", icon: UploadSimple, title: "Upload a video", line: "It picks the best part, or follows your edit.", visual: <UploadVisual /> },
  { mode: "prompt", icon: PencilSimple, title: "Describe one", line: "Veo 3.1 makes an 8-second clip.", visual: <PromptVisual /> },
];

export default function ProductModes() {
  return (
    <section aria-labelledby="modes-heading" className={`${shell} py-24 md:py-32`}>
      <SectionHead id="modes-heading" title="Start with what you have." />
      <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
        {ways.map(({ mode, icon: ModeIcon, title, line, visual }) => (
          <StaggerItem key={mode}>
            <Link to={createHref(mode, "")} className="group sheet flex h-full flex-col p-3 transition-[transform,box-shadow] duration-150 ease-paper hover:-translate-y-0.5 hover:shadow-lift active:scale-[.99]">
              {visual}
              <span className="flex items-start gap-3 px-2 pb-2 pt-5">
                <ModeIcon aria-hidden="true" size={20} className="mt-0.5 flex-none text-ink" />
                <span>
                  <span className="block text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
                  <span className="mt-1 block text-[15px] text-ink2">{line}</span>
                </span>
              </span>
            </Link>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
