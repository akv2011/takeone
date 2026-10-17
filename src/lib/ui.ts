// Shared class strings for app screens. Square corners and ink borders, as on paper.
const kinds = {
  primary: "border border-ink bg-ink font-medium text-surface shadow-hard-sm hover:-translate-x-px hover:-translate-y-px hover:shadow-hard active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
  secondary: "border border-ink bg-surface font-medium text-ink hover:bg-paper2",
  dark: "border border-ink bg-ink font-medium text-surface hover:bg-ink2",
  accent: "border border-signal bg-signal font-medium text-surface hover:bg-cueInk",
} as const;
const sizes = { md: "px-4 py-2.5 text-sm", sm: "px-3 py-2 text-xs" } as const;

export const button = (kind: keyof typeof kinds, size: keyof typeof sizes = "md") =>
  `inline-flex items-center justify-center gap-2 transition-[transform,box-shadow,background-color] duration-200 ease-paper disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:translate-x-0 disabled:translate-y-0 ${kinds[kind]} ${sizes[size]}`;

export const panel = "border border-ink bg-surface";
export const field = "border border-ink/30 bg-surface px-3 py-2 text-sm font-normal text-ink placeholder:text-faint hover:border-ink focus:border-ink focus:outline-none";
export const label = "font-mono text-[11px] uppercase tracking-[0.08em] text-ink2";
// Floated so the legend sits inside the panel like an h2 instead of on its border.
export const legend = "float-left mb-3 w-full p-0 font-display text-2xl leading-none";
export const fieldsetPanel = "border border-ink bg-surface p-4 [&>legend+*]:clear-both";
