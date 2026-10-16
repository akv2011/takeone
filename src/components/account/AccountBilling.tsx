import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/convexApi';
import { button } from '../../lib/ui';

export default function AccountBilling() {
  const me = useQuery(api.users.currentUser) as { credits: number } | null | undefined;
  const hasPurchasedCredits = (me?.credits ?? 0) > 0;

  return (
    <section className="max-w-xl text-ink">
      <h2 className="text-base font-semibold">Current plan</h2>

      <div className="mt-5 flex items-center justify-between gap-6 border-b border-line pb-5">
        <div>
          <p className="text-sm font-semibold">
            {me === undefined ? 'Loading plan…' : hasPurchasedCredits ? 'Pay as you go' : 'Free'}
          </p>
          {me !== undefined && (
            <p className="mt-1 text-sm leading-5 text-muted">
              {hasPurchasedCredits
                ? 'Use your video credits whenever you create.'
                : 'Create with TakeOne before choosing a paid plan.'}
            </p>
          )}
        </div>

        <Link
          to="/pricing"
          className={`${button('secondary', 'sm')} shrink-0`}
        >
          {hasPurchasedCredits ? 'View plans' : 'Upgrade'}
        </Link>
      </div>

      <p className="mt-5 text-xs leading-5 text-muted">
        TakeOne plans use one-time credit packs. There is no recurring subscription.
      </p>
    </section>
  );
}
