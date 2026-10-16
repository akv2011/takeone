// Freemium: every user gets FREE_LIMIT generations, then must spend credits.
export const FREE_LIMIT = 5;
// Waitlist members who sign in get founding-creator bonus credits.
export const FOUNDING_CREDITS = 0;

// One-time packs. One credit reserves one successfully delivered video.
export const PACKS = [
  { id: "starter", label: "Starter", credits: 25, amountUsd: 9.99 },
  { id: "creator", label: "Creator", credits: 100, amountUsd: 25 },
  { id: "pro", label: "Pro", credits: 500, amountUsd: 99.99 },
] as const;

export type PackId = (typeof PACKS)[number]["id"];
export const packById = (id: string) => PACKS.find((p) => p.id === id);

function dailyCap(raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ?? "";
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
}
export const freeDailyRenderCap = (env: Record<string, string | undefined>) => dailyCap(env.FREE_DAILY_RENDER_CAP, 150);
export const aiVideoDailyCap = (env: Record<string, string | undefined>) => dailyCap(env.AI_VIDEO_DAILY_CAP, 10);
