import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/convexApi';
import { button } from '../../lib/ui';

export default function AccountBilling() {
  const me = useQuery(api.users.currentUser) as { credits: number } | null | undefined;
  const hasPurchasedCredits = (me?.credits ?? 0) > 0;

  return (
    <section className="max-w-xl text-ink">
      <h2 className="eyebrow">Current plan</h2>

      <div className="mt-3 flex items-center justify-between gap-6 border-b border-ink pb-5">
        <div>
          {me === undefined
            ? <p className="pat-dots h-8 w-40 opacity-20 motion-safe:animate-pulse"><span className="sr-only">Loading plan…</span></p>
            : <p className="display text-4xl">{hasPurchasedCredits ? 'Pay as you go' : 'Free'}</p>}
          {me !== undefined && (
            <p className="mt-2 text-sm leading-5 text-ink2">
              {hasPurchasedCredits
                ? 'Use your video credits whenever you create.'
                : 'Create with TakeOne before choosing a paid plan.'}
            </p>
          )}
        </div>

        <Link
          to="/pricing"
          className={`${button(hasPurchasedCredits ? 'secondary' : 'primary', 'sm')} shrink-0`}
        >
          {hasPurchasedCredits ? 'View plans' : 'Upgrade'}
        </Link>
      </div>

      <p className="mt-4 font-mono text-[11px] uppercase leading-5 tracking-[0.06em] text-muted">
        TakeOne plans use one-time credit packs. There is no recurring subscription.
      </p>
    </section>
  );
}
