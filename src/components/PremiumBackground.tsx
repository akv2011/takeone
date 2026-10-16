import { useEffect } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function PremiumBackground() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth springs for high performance cursor parallax
  const springX = useSpring(x, { stiffness: 80, damping: 20 });
  const springY = useSpring(y, { stiffness: 80, damping: 20 });

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const { clientX, clientY } = event;
      const { innerWidth, innerHeight } = window;
      
      // Normalized coordinates from center (-1 to 1)
      const nx = (clientX - innerWidth / 2) / (innerWidth / 2);
      const ny = (clientY - innerHeight / 2) / (innerHeight / 2);

      // Map to max 3px displacement
      x.set(nx * -3);
      y.set(ny * -3);
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [x, y]);

  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] bg-paper overflow-hidden">
      {/* 1. Layout Grid Layer with radial mask fade-out and blue animated lines */}
      <motion.div
        style={{
          x: springX,
          y: springY,
          maskImage: "radial-gradient(circle at center, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 30%, transparent 80%)",
        }}
        className="absolute inset-[-10px] animate-blue-grid"
      >
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            {/* Repeating 80x80 grid pattern */}
            <pattern id="layout-grid-pattern" width="80" height="80" patternUnits="userSpaceOnUse">
              {/* Horizontal line: #2563EB (Electric Blue) */}
              <line x1="0" y1="0" x2="80" y2="0" stroke="#2563EB" strokeWidth="1" strokeOpacity="0.75" />
              {/* Vertical line: #2563EB (Electric Blue) */}
              <line x1="0" y1="0" x2="0" y2="80" stroke="#2563EB" strokeWidth="1" strokeOpacity="0.75" />
              {/* Intersection dot at grid crossing (0, 0) */}
              <circle cx="0" cy="0" r="2" fill="#2563EB" fillOpacity="0.9" />
            </pattern>
          </defs>
          {/* Fill screen with layout grid */}
          <rect width="100%" height="100%" fill="url(#layout-grid-pattern)" />
        </svg>
      </motion.div>

      {/* 2. Background Marquee Text (6% opacity, rotated 2deg, slow scroll) */}
      <div className="absolute inset-0 flex flex-col justify-around rotate-[2deg] scale-110 opacity-[0.06] select-none pointer-events-none z-[-2] overflow-hidden py-16">
        <div className="animate-marquee whitespace-nowrap font-display font-extrabold text-[12vh] tracking-[0.02em] uppercase leading-none text-ink">
          <span>EDIT • CAPTION • EXPORT • MUSIC • PREVIEW • SUBTITLE • TRIM • CREATE • SHARE •&nbsp;</span>
          <span>EDIT • CAPTION • EXPORT • MUSIC • PREVIEW • SUBTITLE • TRIM • CREATE • SHARE •&nbsp;</span>
        </div>
        <div className="animate-marquee whitespace-nowrap font-display font-extrabold text-[12vh] tracking-[0.02em] uppercase leading-none text-ink" style={{ animationDirection: "reverse", animationDuration: "120s" }}>
          <span>CREATE • SHARE • EDIT • CAPTION • EXPORT • MUSIC • PREVIEW • SUBTITLE • TRIM •&nbsp;</span>
          <span>CREATE • SHARE • EDIT • CAPTION • EXPORT • MUSIC • PREVIEW • SUBTITLE • TRIM •&nbsp;</span>
        </div>
      </div>

      {/* 3. Subtle Paper Grain Texture Overlay (2.5% opacity) */}
      <div 
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
}
