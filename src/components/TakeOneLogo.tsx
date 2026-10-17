// "The Cut": a 9:16 short pulled out of a 16:9 frame. Reads as a T and as a 1.
export default function TakeOneLogo({ className = "w-8 h-8", mono = false }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 74 64" className={className} aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <rect x="2.25" y="2.25" width="69.5" height="38.5" rx="3" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <rect x="26" y="9" width="22" height="53" rx="2" fill="currentColor" />
      {!mono && <rect x="26" y="9" width="22" height="32" rx="2" fill="#c4321f" />}
    </svg>
  );
}

// Mark plus name. Set the size with a text-* class; the mark scales with the type.
export function TakeOneWordmark({ className = "text-xl text-ink" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.42em] ${className}`}>
      <TakeOneLogo className="h-[1.05em] w-[1.2em]" />
      <span translate="no" className="font-display font-semibold leading-none tracking-[-0.03em]">TakeOne</span>
    </span>
  );
}
