import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';

export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const id = useId();
  const trigger = isValidElement<{ className?: string; 'aria-describedby'?: string }>(children)
    ? cloneElement(children as ReactElement<{ className?: string; 'aria-describedby'?: string }>, { className: `${children.props.className ?? ''} peer`, 'aria-describedby': id })
    : children;
  return <span className="relative inline-flex">
    {trigger}
    <span id={id} role="tooltip" className={`pointer-events-none absolute left-1/2 z-40 hidden w-max max-w-56 -translate-x-1/2 rounded-md bg-ink px-2.5 py-1.5 text-center text-xs font-medium leading-snug text-surface peer-hover:block peer-focus-visible:block ${side === 'bottom' ? 'top-[calc(100%+0.5rem)]' : 'bottom-[calc(100%+0.5rem)]'}`}>
      {label}
    </span>
  </span>;
}
