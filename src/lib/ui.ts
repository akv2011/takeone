// Shared class strings for app screens. Radius: controls 11px, cards 16px, video frames 12px.
const kinds = {
  primary: "bg-ink font-semibold text-surface hover:bg-[#2a2824] active:scale-[.98]",
  secondary: "bg-surface/80 font-medium text-ink shadow-[inset_0_0_0_1px_rgba(20,19,17,.14)] hover:bg-surface active:scale-[.98]",
  dark: "bg-ink font-semibold text-surface hover:bg-[#2a2824] active:scale-[.98]",
  accent: "bg-grease font-semibold text-white hover:bg-cueInk active:scale-[.98]",
  ghost: "font-medium text-ink2 hover:bg-ink/5 hover:text-ink",
} as const;
const sizes = { lg: "h-12 px-5 text-[15px]", md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-[13px]" } as const;

export const button = (kind: keyof typeof kinds, size: keyof typeof sizes = "md") =>
  `inline-flex items-center justify-center gap-2 rounded-control tracking-[-0.01em] transition-[transform,background-color,box-shadow] duration-150 ease-paper disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100 ${kinds[kind]} ${sizes[size]}`;

export const panel = "rounded-card bg-surface/90 shadow-card";
export const field = "h-10 rounded-control bg-surface px-3 text-[15px] text-ink shadow-[inset_0_0_0_1px_rgba(20,19,17,.14)] placeholder:text-muted hover:shadow-[inset_0_0_0_1px_rgba(20,19,17,.28)] focus:shadow-[inset_0_0_0_1.5px_#141311] focus:outline-none";
export const label = "text-[13px] font-medium text-ink2";
// Floated so the legend sits inside the panel like an h2 instead of on its border.
export const legend = "float-left mb-3 w-full p-0 font-display text-lg font-semibold tracking-[-0.02em]";
export const fieldsetPanel = "rounded-card bg-surface/90 p-5 shadow-card [&>legend+*]:clear-both";
