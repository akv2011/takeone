// Freemium: every user gets FREE_LIMIT generations, then must spend credits.
export const FREE_LIMIT = 3;
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
