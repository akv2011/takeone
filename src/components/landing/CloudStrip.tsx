import { Stagger, StaggerItem } from "../../lib/motion";

const FLOW = [
  ["Gemini · Vertex AI", "Watch, pick"],
  ["Speech-to-Text Chirp 3", "Word timings"],
  ["Cloud Translation", "12 languages"],
  ["Cloud Run + Tasks", "Render 9:16"],
  ["Cloud Storage", "Private media"],
];

const ALSO = [
  ["Google Search", "Claims check"],
  ["Veo 3.1", "Prompt to video"],
  ["Firestore", "Live progress"],
  ["Firebase", "Sign-in, hosting"],
];

const mono = "font-mono text-[11px] uppercase tracking-[0.08em]";

export default function CloudStrip() {
  return (
    <section aria-labelledby="cloud-heading" className="px-4 py-24 sm:px-6 md:px-12 md:py-28">
      <div className="mx-auto max-w-[1360px]">
        <div className="rule-top grid gap-6 pt-6 md:grid-cols-12">
          <h2 id="cloud-heading" className="display text-[clamp(40px,5vw,68px)] text-ink md:col-span-8">
            Built on <em>Google Cloud.</em>
          </h2>
          <p className="eyebrow self-end md:col-span-4 md:text-right">Fig. 1 · the render path</p>
        </div>

        <div className="relative mt-12">
          <div aria-hidden="true" className="pat-hatch absolute left-[18px] top-0 h-full w-3 opacity-25 lg:left-0 lg:top-[38px] lg:h-3 lg:w-full" />
          <Stagger className="relative grid gap-4 lg:grid-cols-7 lg:gap-0">
            <StaggerItem className="flex items-center gap-4 lg:flex-col lg:items-start lg:gap-0">
              <span className="ml-[13px] h-6 w-6 shrink-0 rounded-full border border-ink bg-surface lg:ml-0 lg:mt-[32px]" />
              <span className={`${mono} text-ink lg:mt-4`}>Long video in</span>
            </StaggerItem>
            {FLOW.map(([name, role], i) => (
              <StaggerItem key={name} className="lg:pr-3">
                <div className="sheet ml-10 flex items-baseline gap-3 px-3 py-3 lg:ml-0 lg:block lg:min-h-[88px]">
                  <span className={`${mono} block text-ink2`}>0{i + 1}</span>
                  <span className="mt-1 block text-sm font-medium leading-tight text-ink">{name}</span>
                  <span className={`${mono} ml-auto block text-right text-ink2 lg:ml-0 lg:mt-2 lg:text-left`}>{role}</span>
                </div>
              </StaggerItem>
            ))}
            <StaggerItem className="flex items-center gap-4 lg:flex-col lg:items-end lg:gap-0">
              <span className="ml-[13px] h-6 w-6 shrink-0 bg-ink lg:ml-0 lg:mt-[32px]" />
              <span className={`${mono} text-ink lg:mt-4`}>Shorts out</span>
            </StaggerItem>
          </Stagger>
        </div>

        <ul className="mt-12 grid grid-cols-2 border-t border-ink md:grid-cols-4">
          {ALSO.map(([name, role]) => (
            <li key={name} className="border-b border-r border-dashed border-ink/40 px-4 py-4 last:border-r-0 max-md:[&:nth-child(2n)]:border-r-0">
              <span className="block text-sm font-medium text-ink">{name}</span>
              <span className={`${mono} mt-1 block text-ink2`}>{role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
