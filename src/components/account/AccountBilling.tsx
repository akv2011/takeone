import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/convexApi';
import { button } from '../../lib/ui';

export default function AccountBilling() {
  const me = useQuery(api.users.currentUser) as { credits: number } | null | undefined;
  const hasPurchasedCredits = (me?.credits ?? 0) > 0;

  return (
    <section className="max-w-xl text-ink">
      <h2 className="text-[13px] font-medium text-ink2">Current plan</h2>

      <div className="mt-1 flex items-center justify-between gap-6 pb-5 hairline-bottom">
        <div>
          {me === undefined
            ? <p className="h-8 w-40 rounded-control bg-ink/5 motion-safe:animate-pulse"><span className="sr-only">Loading plan…</span></p>
            : <p className="font-display text-[26px] font-semibold tracking-[-0.03em]">{hasPurchasedCredits ? 'Pay as you go' : 'Free'}</p>}
          {me !== undefined && (
            <p className="mt-1 text-sm leading-5 text-ink2">
              {hasPurchasedCredits
                ? 'Use your video credits whenever you create.'
                : 'Create with TakeOne before choosing a paid plan.'}
            </p>
          )}
        </div>

        <Link
          to="/pricing"
          className={`${button(hasPurchasedCredits ? 'secondary' : 'primary', 'md')} shrink-0`}
        >
          {hasPurchasedCredits ? 'View plans' : 'Upgrade'}
        </Link>
      </div>

      <p className="mt-4 text-[13px] leading-5 text-muted">
        TakeOne plans use one-time credit packs. There is no recurring subscription.
      </p>
    </section>
  );
}
