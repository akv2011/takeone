// A slate on take 1: a hatched clapstick over an ink board with a "1" cut out.
export default function TakeOneLogo({ className = "w-8 h-8 text-ink" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <g transform="rotate(-11 3 12)">
        <rect x="3" y="6" width="26" height="6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        {[0, 1, 2, 3].map(i => <path key={i} d={`M${5 + i * 6.5} 12 L${9 + i * 6.5} 6 L${11.6 + i * 6.5} 6 L${7.6 + i * 6.5} 12Z`} fill="currentColor" />)}
      </g>
      <path fill="currentColor" fillRule="evenodd" d="M3 13H29V29.5H3ZM14.6 16.4H18.6V27H15.4V20.3L12.9 21.6V18.3Z" />
    </svg>
  );
}

// Mark plus name. Set the size with a text-* class; the mark scales with the type.
export function TakeOneWordmark({ className = "text-2xl text-ink" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] ${className}`}>
      <TakeOneLogo className="h-[1.05em] w-[1.05em]" />
      <span translate="no" className="font-display leading-none tracking-[-0.01em]">TakeOne</span>
    </span>
  );
}
