import { Reveal } from "../../lib/motion";

// Real renders live in src/assets/proof as short-en.mp4 and short-hi.mp4 (posters as .jpg). Until both
// videos are there the row shows drawn frames and does not claim to be real output.
const files = import.meta.glob<string>("../../assets/proof/*.{mp4,webm,jpg,png}", { eager: true, query: "?url", import: "default" });
const asset = (name: string) => Object.entries(files).find(([path]) => path.split("/").pop()?.startsWith(name))?.[1];

const SHORTS = [
  { id: "short-en", lang: "en", label: "English captions", caption: ["Rest the", "dough", "for ten minutes"] },
  { id: "short-hi", lang: "hi", label: "Hindi captions", caption: ["आटे को", "दस मिनट", "आराम दें"] },
];

function Phone({ short, video, poster }: { short: (typeof SHORTS)[number]; video?: string; poster?: string }) {
  return (
    <figure className="flex flex-col items-center">
      <div className="w-[min(70vw,250px)] rounded-[30px] border border-ink bg-ink p-2.5 shadow-hard">
        <div className="relative aspect-[9/16] overflow-hidden rounded-[22px] bg-ink2">
          {video ? (
            <video src={video} poster={poster} className="h-full w-full object-cover" muted loop playsInline autoPlay controls preload="metadata" aria-label={`Finished short with ${short.label.toLowerCase()}`} />
          ) : (
            <div aria-hidden="true" className="absolute inset-0">
              <svg viewBox="0 0 90 160" className="absolute inset-0 h-full w-full">
                <rect width="90" height="160" fill="#262624" />
                <ellipse cx="45" cy="62" rx="13" ry="16" fill="#3a3a37" />
                <path d="M38 72H52L53 85C59 89 69 92 75 96C82 100 84.5 110 85.5 160H4.5C5.5 110 8 100 15 96C21 92 31 89 37 85Z" fill="#3a3a37" />
              </svg>
              <p lang={short.lang} className="absolute inset-x-4 bottom-[20%] text-center text-[19px] font-bold leading-snug text-surface">
                {short.caption[0]} <span className="bg-signal px-1">{short.caption[1]}</span> {short.caption[2]}
              </p>
            </div>
          )}
        </div>
      </div>
      <figcaption className="eyebrow mt-5">{short.label}</figcaption>
    </figure>
  );
}

export default function ProofRow() {
  const real = SHORTS.every((s) => asset(`${s.id}.mp4`) ?? asset(`${s.id}.webm`));
  return (
    <section aria-labelledby="proof-heading" className="border-y border-ink bg-paper2 px-4 py-24 sm:px-6 md:px-12 md:py-28">
      <div className="mx-auto grid max-w-[1360px] items-center gap-14 lg:grid-cols-12">
        <Reveal className="lg:col-span-4">
          <p className="eyebrow">Proof</p>
          <h2 id="proof-heading" className="display mt-4 text-[clamp(44px,5.4vw,76px)] text-ink">
            One take. <em>Two audiences.</em>
          </h2>
          <span className={`stamp mt-10 -rotate-6 ${real ? "text-signal" : "text-ink2"}`}>
            {real ? "Real output, unedited" : "Illustrated sample"}
          </span>
        </Reveal>
        <div className="relative flex flex-wrap justify-center gap-10 sm:gap-14 lg:col-span-8 lg:justify-end">
          {SHORTS.map((short, i) => (
            <Reveal key={short.id} delay={i * 0.12}>
              <Phone short={short} video={real ? asset(`${short.id}.mp4`) ?? asset(`${short.id}.webm`) : undefined} poster={asset(`${short.id}.jpg`) ?? asset(`${short.id}.png`)} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
