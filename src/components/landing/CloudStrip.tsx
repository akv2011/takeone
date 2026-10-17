import { Stagger, StaggerItem } from "../../lib/motion";
import { SectionHead, shell } from "./Section";

const PATH = [
  ["Gemini on Vertex AI", "Watches and picks"],
  ["Speech-to-Text Chirp 3", "Times every word"],
  ["Cloud Translation", "12 languages"],
  ["Cloud Run", "Renders the 9:16 cut"],
  ["Cloud Storage", "Keeps it private"],
];

const ALSO = [
  ["Veo 3.1", "prompt to video"],
  ["Google Search", "claim checks"],
  ["Firestore", "live progress"],
  ["Firebase", "sign-in and hosting"],
];

export default function CloudStrip() {
  return (
    <section aria-labelledby="cloud-heading" className={`${shell} py-24 md:py-32`}>
      <SectionHead id="cloud-heading" title="What runs underneath." sub="Each short takes one path through Google Cloud." />
      <Stagger className="relative mt-12 grid gap-3 lg:grid-cols-5 lg:gap-0">
        <span aria-hidden="true" className="absolute bottom-6 left-[19px] top-6 w-px bg-line lg:bottom-auto lg:left-5 lg:right-[calc(20%-20px)] lg:top-[19px] lg:h-px lg:w-auto" />
        {PATH.map(([name, role], i) => (
          <StaggerItem key={name} className="relative flex items-center gap-4 lg:block lg:pr-6">
            <span className="relative z-10 grid h-10 w-10 flex-none place-items-center rounded-full bg-surface font-mono text-[12px] text-ink shadow-card">{i + 1}</span>
            <span className="block lg:mt-5">
              <span className="block text-[15px] font-semibold tracking-[-0.01em] text-ink">{name}</span>
              <span className="mt-0.5 block text-[14px] text-ink2">{role}</span>
            </span>
          </StaggerItem>
        ))}
      </Stagger>
      <ul className="mt-12 flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-6 text-[14px] text-ink2">
        {ALSO.map(([name, role]) => <li key={name}><b className="font-semibold text-ink">{name}</b> {role}</li>)}
      </ul>
    </section>
  );
}
