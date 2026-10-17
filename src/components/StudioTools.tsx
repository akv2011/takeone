import { ArrowsOut, ClockCounterClockwise, MusicNotes, Scissors, Subtitles, Tag } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
const tools = [
  { name: "Captions", detail: "Your words. In your style.", icon: Subtitles },
  { name: "Trim & speed", detail: "Keep the part that matters.", icon: Scissors },
  { name: "Reframe", detail: "One cut. Every format.", icon: ArrowsOut },
  { name: "Music", detail: "Set the tone. Keep the speech.", icon: MusicNotes },
  { name: "Brand kits", detail: "Your fonts, colours and mark.", icon: Tag },
  { name: "Versions", detail: "Every cut stays on the record.", icon: ClockCounterClockwise },
];
export default function StudioTools() {
  const reduced = useReducedMotion();
  return <section aria-labelledby="studio-heading" className="px-5 py-20 sm:px-8 md:px-12 md:py-24"><div className="mx-auto max-w-7xl"><motion.div initial={reduced ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}><p className="eyebrow">The editing room</p><h2 id="studio-heading" className="mt-4 max-w-xl font-display font-semibold text-5xl leading-none md:text-6xl">Finish the cut in Studio.</h2></motion.div><ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{tools.map((tool) => <li key={tool.name} className="glass rounded-card p-6 transition-shadow duration-150 hover:shadow-lift"><div className="flex items-center gap-3"><tool.icon size={20} weight="regular" aria-hidden="true" /><h3 className="font-display font-semibold text-xl">{tool.name}</h3></div><p className="mt-3 text-sm text-ink2">{tool.detail}</p></li>)}</ul></div></section>;
}
