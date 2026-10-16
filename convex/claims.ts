import { v, type Infer } from 'convex/values';

const verdict = v.union(v.literal('supported'), v.literal('disputed'), v.literal('unverified'));
export const claimsCheckValidator = v.union(
  v.object({
    status: v.literal('checked'),
    claims: v.array(v.object({
      text: v.string(), verdict, reason: v.string(),
      sources: v.array(v.object({ url: v.string(), title: v.string() })),
      searches: v.array(v.string()),
    })),
  }),
  v.object({ status: v.literal('unavailable') }),
);
export type ClaimsCheck = Infer<typeof claimsCheckValidator>;

// Same limits as CLAIM_LIMITS in backend/src/claims.ts.
const text = (value: string, max: number) => value.trim().length > 0 && value.length <= max;
const https = (value: string) => {
  if (value.length > 2048) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const exact = (value: any, keys: string[]) => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join() === [...keys].sort().join();
const strings = (value: unknown, count: number, max: number): value is string[] =>
  Array.isArray(value) && value.length <= count && value.every(item => typeof item === 'string' && text(item, max));
/** Parses the worker's value instead of trusting the validator, so shape drift is stored as unavailable. */
function parseClaims(value: any): ClaimsCheck {
  if (exact(value, ['status']) && value.status === 'unavailable') return { status: 'unavailable' };
  const valid = exact(value, ['status', 'claims']) && value.status === 'checked' && Array.isArray(value.claims) && value.claims.length <= 5
    && value.claims.every((claim: any) => exact(claim, ['text', 'verdict', 'reason', 'sources', 'searches'])
      && typeof claim.text === 'string' && text(claim.text, 500) && typeof claim.reason === 'string' && text(claim.reason, 500)
      && ['supported', 'disputed', 'unverified'].includes(claim.verdict)
      && Array.isArray(claim.sources) && claim.sources.length <= 3 && claim.sources.every((source: any) => exact(source, ['url', 'title'])
        && typeof source.url === 'string' && https(source.url) && typeof source.title === 'string' && text(source.title, 300))
      && strings(claim.searches, 3, 300));
  return valid ? value : { status: 'unavailable' };
}

// Loose on purpose: a completeJob that throws here would leave a finished render unpublished.
export const completionExtrasArgs = { claims: v.optional(v.any()), coverStorageKey: v.optional(v.any()) };

/**
 * The worker's best-effort completion fields. Bad values are dropped or marked unavailable
 * instead of throwing, so they can never fail an otherwise finished render.
 */
export function completionExtras(jobId: string, leaseToken: string, args: { claims?: unknown; coverStorageKey?: unknown }) {
  return {
    ...(args.claims !== undefined ? { claims: parseClaims(args.claims) } : {}),
    ...(args.coverStorageKey === `videos/${jobId}/${leaseToken}-cover.png` ? { coverStorageKey: args.coverStorageKey } : {}),
  };
}
