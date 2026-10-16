import { containsReviewCapability, isPublicReviewPath } from "./reviewPrivacy";
import posthog from "posthog-js";

// PostHog product analytics (US Cloud). Autocaptures pageviews + clicks.
export function initPostHog() {
  if (typeof window === "undefined" || isPublicReviewPath(window.location.pathname)) return;
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  const host = (import.meta.env.VITE_POSTHOG_HOST as string) || "https://us.i.posthog.com";
  if (!key) return;
  posthog.init(key, { api_host: host, capture_pageview: true, capture_pageleave: true, person_profiles: "identified_only", before_send: event => isPublicReviewPath(window.location.pathname) || containsReviewCapability(event?.properties) ? null : event });
}

export { default as posthog } from "posthog-js";
