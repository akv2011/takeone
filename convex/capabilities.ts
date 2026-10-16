import { queryGeneric as query } from "convex/server";
declare const process: { env: Record<string, string | undefined> };

export type CapabilityState = {
  available: boolean;
  reason?: string;
};

export type ProductCapabilities = {
  rendering: CapabilityState;
  stockVideo: CapabilityState;
  youtubeClips: CapabilityState;
  aiVideo: CapabilityState;
  telegram: CapabilityState & { username?: string };
  payments: CapabilityState;
  music: CapabilityState;
};

type Environment = Record<string, string | undefined>;

const present = (env: Environment, names: string[]) => names.every(name => Boolean(env[name]?.trim()));
const httpsOrigin = (value: string | undefined) => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
};

export function configuredTelegramUsername(env: Environment): string | undefined {
  const name = env.TELEGRAM_BOT_USERNAME;
  return name && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name) && /bot$/i.test(name) &&
    present(env, ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"]) && httpsOrigin(env.APP_URL)
    ? name : undefined;
}

export function productCapabilities(env: Environment): ProductCapabilities {
  const paused = env.MANAGED_RENDERING_PAUSED === "true";
  const renderingConfigured = present(env, ["DISPATCH_SECRET", "WORKER_SECRET"]) && httpsOrigin(env.DISPATCH_URL);
  const rendering = paused
    ? { available: false, reason: "Video rendering is temporarily paused." }
    : renderingConfigured
      ? { available: true }
      : { available: false, reason: "Video rendering is being connected." };
  const requiresRendering = (enabled: boolean, unavailable: string): CapabilityState =>
    !rendering.available ? { available: false, reason: rendering.reason } : enabled ? { available: true } : { available: false, reason: unavailable };
  const telegramUsername = configuredTelegramUsername(env);
  const telegramConfigured = Boolean(telegramUsername);
  const paymentProducts = ["STARTER", "CREATOR", "PRO"].every(pack => Boolean(env[`DODO_PRODUCT_${pack}`]?.trim()));
  const paymentsConfigured = env.DODO_CHECKOUT_ENABLED === "true" && paymentProducts && ["test", "live"].includes(env.DODO_ENVIRONMENT ?? "") && httpsOrigin(env.APP_URL) &&
    present(env, ["DODO_API_KEY", "DODO_WEBHOOK_SECRET", "DODO_BUSINESS_ID", "DODO_ENVIRONMENT", "APP_URL"]);

  return {
    rendering,
    stockVideo: requiresRendering(env.STOCK_VIDEO_ENABLED === "true", "Stock video generation is being connected."),
    youtubeClips: requiresRendering(env.YOUTUBE_INGEST_ENABLED === "true", "YouTube clipping is being connected."),
    aiVideo: requiresRendering(env.AI_VIDEO_ENABLED === "true", "AI video generation is being connected."),
    telegram: telegramConfigured
      ? { available: true, username: telegramUsername }
      : { available: false, reason: "Telegram is being connected." },
    payments: paymentsConfigured ? { available: true } : { available: false, reason: "Checkout is not open yet." },
    music: requiresRendering(env.MUSIC_CATALOG_ENABLED === "true", "Soundtracks are being connected."),
  };
}

export const current = query({ args: {}, handler: () => productCapabilities(process.env) });
