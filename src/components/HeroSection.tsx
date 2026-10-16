import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import InteractiveWorkspace from "./InteractiveWorkspace";
import { useProductCapabilities } from "../hooks/useProductCapabilities";

export default function HeroSection() {
  const capabilities = useProductCapabilities();
  return (
    <section className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 pb-20 pt-14 md:px-12 lg:min-h-[calc(100vh-72px)] lg:grid-cols-12 lg:gap-8 lg:py-12">
      <div className="z-10 flex flex-col justify-center lg:col-span-7">
        <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          Video editing, from one prompt
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55 }}
          className="mt-5 max-w-4xl text-balance font-display text-[52px] font-extrabold leading-[0.92] tracking-[-0.055em] text-ink sm:text-[68px] lg:text-[78px]"
        >
          Make the video.<br />Skip the busywork.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.5 }}
          className="mt-7 max-w-xl text-base leading-7 text-muted md:text-lg"
        >
          Create from a topic, clip a YouTube video, or reshape your own footage. Describe the result and finish it in TakeOne Studio.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.5 }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <Link to="/create" className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-80">Create a video</Link>
          {capabilities?.telegram.available && capabilities.telegram.username && <a href={`https://t.me/${capabilities.telegram.username}`} target="_blank" rel="noreferrer" className="rounded-xl border border-black/15 bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-black/[0.04]">Open Telegram</a>}
        </motion.div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.13em] text-[#777]">3 videos free. No card needed.</p>
      </div>

      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.16, duration: 0.65 }} className="flex w-full items-center justify-center lg:col-span-5">
        <InteractiveWorkspace />
      </motion.div>
    </section>
  );
}
