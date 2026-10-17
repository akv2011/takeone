import type { ReactNode } from "react";
import { Reveal } from "../../lib/motion";

export const shell = "mx-auto w-full max-w-[1280px] px-5 sm:px-8 md:px-12";

export function SectionHead({ id, title, sub, className = "" }: { id: string; title: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <Reveal className={`max-w-[640px] ${className}`}>
      <h2 id={id} className="display ml-[-0.04em] text-[34px] text-ink md:text-[46px]">{title}</h2>
      {sub && <p className="mt-4 text-[17px] leading-relaxed text-ink2">{sub}</p>}
    </Reveal>
  );
}
