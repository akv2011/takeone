import { Link } from "react-router-dom";
import { Reveal } from "../lib/motion";
import { Composer } from "./HeroSection";
import { FREE_LIMIT } from "../../convex/config";

export default function FinalCTA() {
  return (
    <section aria-labelledby="final-heading" className="mx-auto w-full max-w-[1280px] px-5 py-24 sm:px-8 md:px-12 md:py-32">
      <Reveal className="glass mx-auto flex max-w-[760px] flex-col items-center rounded-[24px] px-6 py-14 text-center sm:px-12 md:py-16">
        <h2 id="final-heading" className="display text-[34px] text-ink md:text-[46px]">Find the short in your long video.</h2>
        <p className="mt-4 text-[17px] text-ink2">Your first {FREE_LIMIT} are free. No card needed.</p>
        <Composer className="mt-9 flex w-full max-w-[520px] flex-col items-center text-left" />
        <Link to="/pricing" className="mt-6 text-[14px] font-medium text-ink2 underline decoration-ink/25 underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">See pricing</Link>
      </Reveal>
    </section>
  );
}
