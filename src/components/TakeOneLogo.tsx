// A slate on take 1. The clapstick is the seven SMPTE colour bars; the board follows currentColor.
const BARS = ["fill-bar-white", "fill-bar-yellow", "fill-bar-cyan", "fill-bar-green", "fill-bar-magenta", "fill-bar-red", "fill-bar-blue"];

export default function TakeOneLogo({ className = "w-8 h-8 text-ink" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(-11 3 12)">
        {BARS.map((bar, i) => <rect key={bar} className={bar} x={3 + (i * 26) / 7} y="6" width={26 / 7 + 0.03} height="6" />)}
      </g>
      <path fill="currentColor" fillRule="evenodd" d="M5.5 13H26.5A2.5 2.5 0 0 1 29 15.5V27A2.5 2.5 0 0 1 26.5 29.5H5.5A2.5 2.5 0 0 1 3 27V15.5A2.5 2.5 0 0 1 5.5 13ZM14.6 16.4H18.6V27H15.4V20.3L12.9 21.6V18.3Z" />
    </svg>
  );
}

// Mark plus name. Set the size with a text-* class; the mark scales with the type.
export function TakeOneWordmark({ className = "text-2xl text-ink" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] ${className}`}>
      <TakeOneLogo className="h-[1.15em] w-[1.15em]" />
      <span translate="no" className="font-display font-extrabold leading-none tracking-[0.01em]">TakeOne</span>
    </span>
  );
}
