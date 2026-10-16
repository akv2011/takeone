import { useQuery } from "convex/react";
import { api, convexEnabled } from "../lib/convexApi";
import type { ProductCapabilities } from "../lib/productCapabilities";

export function useProductCapabilities() {
  const value = useQuery(api.generate.capabilities, convexEnabled || import.meta.env.MODE === "test" ? {} : "skip") as ProductCapabilities | { aiVideo?: boolean } | undefined;
  if (!value) return undefined;
  if ("rendering" in value) return value;
  const setup = { available: false, reason: "Video services are being connected." };
  return {
    rendering: setup,
    stockVideo: setup,
    youtubeClips: setup,
    aiVideo: setup,
    telegram: { available: false, reason: "Telegram is being connected." },
    payments: { available: false, reason: "Checkout is not open yet." },
    music: setup,
  };
}
