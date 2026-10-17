import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [open]);
  const trigger = isValidElement<{
    className?: string;
    "aria-describedby"?: string;
  }>(children)
    ? cloneElement(children, { "aria-describedby": id })
    : children;
  return (
    <span
      className="relative inline-flex max-w-full"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.stopPropagation();
        }
      }}
    >
      {trigger}
      <span
        id={id}
        role="tooltip"
        className={`before:absolute before:inset-x-0 before:h-2 before:content-[''] absolute left-0 z-40 w-64 max-w-[calc(100vw-4rem)] rounded-card bg-surface px-4 py-3 text-left text-[13px] font-normal normal-case leading-relaxed tracking-normal text-ink shadow-card ${open ? "block" : "hidden"} ${side === "bottom" ? "top-[calc(100%+0.5rem)] before:bottom-full" : "bottom-[calc(100%+0.5rem)] before:top-full"}`}
      >
        {label}
      </span>
    </span>
  );
}
