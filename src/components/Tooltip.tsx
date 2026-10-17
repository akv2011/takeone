import { cloneElement, isValidElement, useId, useState, type ReactNode } from 'react';

export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = isValidElement<{ className?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children, { 'aria-describedby': id })
    : children;
  return <span className="relative inline-flex max-w-full" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onClick={() => setOpen(true)} onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation(); } }}>
    {trigger}
    <span id={id} role="tooltip" className={`absolute left-0 z-40 w-64 max-w-[calc(100vw-4rem)] border border-ink bg-surface px-4 py-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-hard ${open ? 'block' : 'hidden'} ${side === 'bottom' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]'}`}>
      {label}
    </span>
  </span>;
}
