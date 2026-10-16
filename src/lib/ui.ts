// Shared class strings for app screens. Radius hierarchy: controls 6px, panels 10px, video frames 12px.
const kinds = {
  primary: "border border-transparent bg-cue font-bold text-ink hover:border-ink",
  secondary: "border border-ink bg-surface font-semibold text-ink hover:bg-paper",
  dark: "border border-ink bg-ink font-semibold text-surface hover:bg-ink2",
} as const;
const sizes = { md: "px-4 py-2.5 text-sm", sm: "px-3 py-2 text-xs" } as const;

export const button = (kind: keyof typeof kinds, size: keyof typeof sizes = "md") =>
  `inline-flex items-center justify-center gap-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${kinds[kind]} ${sizes[size]}`;

export const panel = "rounded-[10px] border border-line bg-surface";
export const field = "rounded-md border border-line bg-surface px-3 py-2 text-sm font-normal text-ink placeholder:text-muted hover:border-muted";
export const label = "text-sm font-semibold text-muted";
// Floated so the legend sits inside the panel like an h2 instead of on its border.
export const legend = "float-left mb-3 w-full p-0 text-base font-semibold";
export const fieldsetPanel = "rounded-[10px] border border-line bg-surface p-4 [&>legend+*]:clear-both";
