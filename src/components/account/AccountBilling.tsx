import { useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/convexApi';

export default function AccountBilling() {
  const me = useQuery(api.users.currentUser) as { credits: number } | null | undefined;
  const hasPurchasedCredits = (me?.credits ?? 0) > 0;

  return (
    <section className="max-w-xl text-[#151515]">
      <h2 className="text-base font-semibold">Current plan</h2>

      <div className="mt-5 flex items-center justify-between gap-6 border-b border-black/10 pb-5">
        <div>
          <p className="text-sm font-semibold">
            {me === undefined ? 'Loading plan...' : hasPurchasedCredits ? 'Pay as you go' : 'Free'}
          </p>
          {me !== undefined && (
            <p className="mt-1 text-sm leading-5 text-[#6c6c6c]">
              {hasPurchasedCredits
                ? 'Use your video credits whenever you create.'
                : 'Create with TakeOne before choosing a paid plan.'}
            </p>
          )}
        </div>

        <Link
          to="/pricing"
          className="shrink-0 rounded-lg border border-black/15 px-3 py-2 text-xs font-semibold transition-colors hover:bg-black/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          {hasPurchasedCredits ? 'View plans' : 'Upgrade'}
        </Link>
      </div>

      <p className="mt-5 text-xs leading-5 text-[#747474]">
        TakeOne plans use one-time credit packs. There is no recurring subscription.
      </p>
    </section>
  );
}
