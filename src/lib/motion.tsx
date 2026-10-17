import { motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import Lenis from "lenis";
import { annotate } from "rough-notation";
import { useEffect, useRef, type ReactNode } from "react";

export const ease = [0.22, 1, 0.36, 1] as const;

const rise: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};

export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "li" | "span" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={rise} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10% 0px" }} transition={{ delay }}>
      {children}
    </Tag>
  );
}

export function Stagger({ children, className, gap = 0.08 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div className={className} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-10% 0px" }} variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}>
      {children}
    </motion.div>
  );
}

export const StaggerItem = ({ children, className }: { children: ReactNode; className?: string }) => (
  <motion.div className={className} variants={rise}>{children}</motion.div>
);

// Words rise one after another, for display headings.
export function SplitWords({ text, className }: { text: string; className?: string }) {
  const words = text.split(" ");
  return (
    <motion.span className={className} aria-label={text} initial="hidden" whileInView="show" viewport={{ once: true }} variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true" className="inline-block overflow-hidden align-bottom">
          <motion.span className="inline-block" variants={{ hidden: { y: "105%" }, show: { y: 0, transition: { duration: 0.8, ease } } }}>
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}

type MarkType = "underline" | "circle" | "box" | "highlight" | "strike-through" | "bracket";

// Hand-drawn mark around inline text once it scrolls into view.
export function InkMark({ children, type = "underline", color = "#d8341f", delay = 0, className }: { children: ReactNode; type?: MarkType; color?: string; delay?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-15% 0px" });
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!inView || !ref.current) return;
    const a = annotate(ref.current, { type, color, strokeWidth: type === "highlight" ? 1 : 2, padding: type === "circle" ? 8 : 3, animate: !reduced, animationDuration: 700, iterations: 2 });
    const t = window.setTimeout(() => a.show(), delay * 1000);
    return () => { window.clearTimeout(t); a.remove(); };
  }, [inView, type, color, delay, reduced]);
  return <span ref={ref} className={className}>{children}</span>;
}

export function Marquee({ items, className = "" }: { items: string[]; className?: string }) {
  const row = items.map((item, i) => (
    <span key={i} className="flex shrink-0 items-center gap-8 pr-8">
      <span>{item}</span>
      <span aria-hidden="true">*</span>
    </span>
  ));
  return (
    <div className={`overflow-hidden bg-ink py-3 text-surface ${className}`} aria-label={items.join(", ")}>
      <div className="flex w-max animate-marquee font-display text-2xl" aria-hidden="true">{row}{row}</div>
    </div>
  );
}

// Smooth wheel scrolling for long marketing pages. Not used inside Studio.
export function useSmoothScroll(enabled = true) {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!enabled || reduced) return;
    const lenis = new Lenis({ duration: 1.1, easing: t => 1 - Math.pow(1 - t, 4) });
    let id = requestAnimationFrame(function raf(time) { lenis.raf(time); id = requestAnimationFrame(raf); });
    return () => { cancelAnimationFrame(id); lenis.destroy(); };
  }, [enabled, reduced]);
}
