import { expect, test } from "vitest";
import { productCapabilities } from "../convex/capabilities";

const complete = {
  DISPATCH_URL: "https://dispatcher.example",
  DISPATCH_SECRET: "dispatch",
  WORKER_SECRET: "worker",
  STOCK_VIDEO_ENABLED: "true",
  YOUTUBE_INGEST_ENABLED: "true",
  AI_VIDEO_ENABLED: "true",
  MUSIC_CATALOG_ENABLED: "true",
  TELEGRAM_BOT_TOKEN: "token",
  TELEGRAM_WEBHOOK_SECRET: "webhook",
  TELEGRAM_BOT_USERNAME: "takeone_test_bot",
  APP_URL: "https://takeone.web.app",
  DODO_CHECKOUT_ENABLED: "true",
  DODO_API_KEY: "key",
  DODO_WEBHOOK_SECRET: "dodo-webhook",
  DODO_BUSINESS_ID: "business",
  DODO_ENVIRONMENT: "test",
  DODO_PRODUCT_STARTER: "starter",
  DODO_PRODUCT_CREATOR: "creator",
  DODO_PRODUCT_PRO: "pro",
};

test("an empty environment advertises no external capability", () => {
  const result = productCapabilities({});
  expect(Object.values(result).every(capability => !capability.available)).toBe(true);
  expect(result.rendering.reason).toMatch(/connected/);
});

test("complete configuration exposes capabilities without exposing credentials", () => {
  const result = productCapabilities(complete);
  expect(Object.values(result).every(capability => capability.available)).toBe(true);
  expect(result.telegram.username).toBe("takeone_test_bot");
  expect(JSON.stringify(result)).not.toContain("dispatch");
  expect(JSON.stringify(result)).not.toContain("token");
});

test("a rendering pause disables every render-backed capability", () => {
  const result = productCapabilities({ ...complete, MANAGED_RENDERING_PAUSED: "true" });
  expect(result.rendering.available).toBe(false);
  expect(result.stockVideo.reason).toMatch(/paused/);
  expect(result.youtubeClips.reason).toMatch(/paused/);
  expect(result.aiVideo.reason).toMatch(/paused/);
  expect(result.telegram.available).toBe(true);
  expect(result.payments.available).toBe(true);
});

test("payments require every bound product and a deliberate enable flag", () => {
  expect(productCapabilities({ ...complete, DODO_PRODUCT_PRO: undefined }).payments.available).toBe(false);
  expect(productCapabilities({ ...complete, DODO_CHECKOUT_ENABLED: "false" }).payments.available).toBe(false);
});

test("invalid origins, environments and bot usernames never appear configured", () => {
  expect(productCapabilities({ ...complete, DISPATCH_URL: "http://dispatcher.example" }).rendering.available).toBe(false);
  expect(productCapabilities({ ...complete, APP_URL: "https://user@example.com" }).payments.available).toBe(false);
  expect(productCapabilities({ ...complete, DODO_ENVIRONMENT: "production" }).payments.available).toBe(false);
  expect(productCapabilities({ ...complete, TELEGRAM_BOT_USERNAME: "bad name" }).telegram.available).toBe(false);
});

test.each(["takeone_user", "1takeone_bot", "@takeone_test_bot", " takeone_test_bot "])("Telegram hides invalid configured bot %s", username => {
  expect(productCapabilities({ ...complete, TELEGRAM_BOT_USERNAME: username }).telegram.available).toBe(false);
});
