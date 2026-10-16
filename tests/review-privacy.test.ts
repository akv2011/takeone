// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
const analytics = vi.hoisted(() => ({ init: vi.fn() }));
vi.mock('posthog-js', () => ({ default: analytics }));
import { initPostHog } from '../src/lib/posthog';
import { isPublicReviewPath } from '../src/lib/reviewPrivacy';
afterEach(() => { window.history.replaceState(null, '', '/'); analytics.init.mockClear(); });
test('does not initialize analytics on a capability review URL, including its trailing slash', () => {
 for (const path of ['/review', '/review/', '/REVIEW', '/%72eview', '/review///']) {
  window.history.replaceState(null, '', `${path}#${'a'.repeat(64)}`);
  expect(isPublicReviewPath(window.location.pathname)).toBe(true);
  initPostHog();
 }
 expect(analytics.init).not.toHaveBeenCalled();
});
test('an already initialized analytics client drops events after navigation to a review', () => {
 window.history.replaceState(null, '', '/'); initPostHog();
 const options = analytics.init.mock.calls[0][1];
 const event = { event: '$pageview', properties: { $current_url: `https://takeone.web.app/review#${'a'.repeat(64)}` } };
 window.history.replaceState(null, '', '/review');
 expect(options.before_send(event)).toBeNull();
});

test('drops delayed events containing a capability after leaving the review route', () => {
 window.history.replaceState(null, '', '/'); initPostHog();
 const options = analytics.init.mock.calls[0][1];
 expect(options.before_send({ properties: { $referrer: `https://takeone.web.app/review#${'a'.repeat(64)}` } })).toBeNull();
 expect(options.before_send({ properties: { $current_url: 'https://takeone.web.app/create' } })).not.toBeNull();
});
