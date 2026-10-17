import { useReducedMotion } from "framer-motion";
import { Reveal } from "../../lib/motion";
import { SectionHead, shell } from "./Section";
import shortEn from "../../assets/landing/short-en.mp4";
import shortEnPoster from "../../assets/landing/short-en.jpg";
import shortHi from "../../assets/landing/short-hi.mp4";
import shortHiPoster from "../../assets/landing/short-hi.jpg";

// Both files are real 1080x1920 renders from one 45-second test upload, scaled down for the page.
const SHORTS = [
  { label: "English captions", src: shortEn, poster: shortEnPoster },
  { label: "Hindi captions", src: shortHi, poster: shortHiPoster },
];

export default function ProofRow() {
  const reduced = useReducedMotion();
  return (
    <section aria-labelledby="proof-heading" className={`${shell} py-24 md:py-32`}>
      <div className="grid items-center gap-12 lg:grid-cols-12">
        <SectionHead
          id="proof-heading"
          className="lg:col-span-5"
          title="Same cut, two audiences."
          sub="One 45-second test upload, rendered with English captions and again with Hindi. Real output, unedited."
        />
        <div className="flex justify-center gap-5 sm:gap-8 lg:col-span-7 lg:justify-end">
          {SHORTS.map((short, i) => (
            <Reveal key={short.label} delay={i * 0.08}>
              <figure>
                <div className="w-[min(42vw,236px)] rounded-[26px] bg-film p-[7px] shadow-film">
                  <video
                    src={short.src}
                    poster={short.poster}
                    muted
                    loop
                    playsInline
                    autoPlay={!reduced}
                    controls={!!reduced}
                    preload="metadata"
                    aria-label={`Finished short with ${short.label.toLowerCase()}`}
                    className="block aspect-[9/16] w-full rounded-[20px] bg-film object-cover"
                  />
                </div>
                <figcaption className="mt-4 text-center text-[13px] font-medium text-ink2">{short.label}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
