import { openCheckout } from "../lib/openCheckout";
import { PAYMENT_ACTION_COPY } from '../../convex/paymentStates';
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import { useAction, useQuery, useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "../lib/convexApi";
import TakeOneLogo from "../components/TakeOneLogo";
import TakeOneUserButton from "../components/account/TakeOneUserButton";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { button, panel } from "../lib/ui";

import { PACKS } from "../../convex/config";

const PAYMENT_STATUS: Record<string, string> = {
  requires_customer_action: 'Your approval required', requires_payment_method: 'Payment method required', requires_confirmation: 'Awaiting confirmation', requires_merchant_action: 'Merchant review required', requires_capture: 'Awaiting capture', partially_captured: 'Partially captured', partially_captured_and_capturable: 'Partially captured',
  expired: 'Checkout expired · no payment found', refunded: 'Refunded', partially_refunded: 'Partially refunded', pending: 'Checkout started', processing: 'Payment processing', paid: 'Payment confirmed', failed: 'Payment failed', cancelled: 'Payment cancelled',
};
function RefreshPayment({ orderId }: { orderId: string }) {
  const refresh = useAction(api.payments.refreshStatus);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  return <div>
    <button disabled={busy} className={button("secondary", "sm")} onClick={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setMessage('');
      try { const result = await refresh({ orderId }) as { status: string }; setMessage(PAYMENT_ACTION_COPY[result.status] ?? (result.status === 'expired' ? 'This checkout expired without a payment. You can start a new checkout from the pack buttons.' : result.status === 'dispute_review' ? 'This purchase needs dispute review. No additional credits were granted.' : result.status === 'paid' ? 'Payment verified. Your credits are available.' : ['refunded', 'partially_refunded'].includes(result.status) ? 'Refund verified. Your credit balance has been adjusted.' : 'Status checked. No confirmed payment credits were added.')); }
      catch (error) { const code = (error as { data?: string }).data; setMessage(code === 'REFRESH_TOO_SOON' ? 'Wait a minute, then check again.' : code === 'CHECKOUT_NEEDS_REVIEW' ? 'This checkout needs support review. Keep this order reference: ' + orderId : 'Payment could not be verified yet. Wait a minute and check again. This did not start another checkout.'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Checking payment…' : 'Check payment status'}</button>
    {message && <p role="status" className="mt-1 max-w-sm text-xs text-muted">{message}</p>}
  </div>;
}
function useActivePage() {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  return active;
}
function ResumeCheckout({ orderId }: { orderId: string }) {
  const active = useActivePage();
  const resume = useAction(api.payments.resumeCheckout);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  return <div><button disabled={busy} className={button("secondary", "sm")} onClick={async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { const { url } = await resume({ orderId }) as { url: string }; if (active.current) openCheckout(url); }
    catch (error) { if (!active.current) return; setMessage((error as { data?: string }).data === 'REFRESH_TOO_SOON' ? 'Wait a minute after checking, then continue checkout.' : 'This checkout could not be reopened. Check its latest payment status before starting another purchase.'); }
    finally { lock.current = false; if (active.current) setBusy(false); }
  }}>{busy ? 'Verifying checkout…' : 'Continue checkout'}</button>{message && <p role="status" className="mt-1 max-w-sm text-xs text-muted">{message}</p>}</div>;
}
function PurchaseHistory() {
  const { user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const history = usePaginatedQuery(api.payments.listHistory, isAuthenticated && user?.id ? { accountKey: user.id } : 'skip', { initialNumItems: 20 });
  const orders = history.results as { id: string; canResume?: boolean; packId: string; credits: number; amountUsd: number; paidAmountUsd?: number; refundedAmountUsd?: number; refundedCredits?: number; status: string; disputeReview?: boolean; createdAt: number; environment: string }[] | undefined;
  if (!isAuthenticated) return null;
  if (history.status === 'LoadingFirstPage') return <p role="status" className="mt-12 text-sm text-muted">Loading purchase history…</p>;
  if (!orders?.length) return null;
  return <section className="mt-16 text-left" aria-labelledby="purchases-heading">
    <div className="border-b border-line pb-4">
      <h2 id="purchases-heading" className="text-xl font-semibold">Purchase history</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Credits appear after payment confirmation. A started checkout is not a charge.</p>
    </div>
    <ul className="divide-y divide-line">
      {orders.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
        <div><span className="font-semibold">{order.credits} video credits · ${(order.paidAmountUsd ?? order.amountUsd).toFixed(2)} {order.paidAmountUsd === undefined ? "pack price" : "paid"}</span>
          <p className="text-xs text-muted">{new Date(order.createdAt).toLocaleDateString()} · {order.environment === 'test' ? 'Test checkout' : 'Live checkout'}</p></div>
        <span>{order.disputeReview ? 'Dispute review required' : PAYMENT_STATUS[order.status] ?? 'Awaiting confirmation'}</span>
        {!order.disputeReview && PAYMENT_ACTION_COPY[order.status] && <p className="w-full text-xs leading-5 text-muted">{PAYMENT_ACTION_COPY[order.status]} Order reference: {order.id}</p>}
        {order.disputeReview && <p className="w-full text-xs text-muted">A payment dispute was reported. Additional credits from this purchase will not be granted until reviewed. Keep this order reference: {order.id}</p>}
        {!!order.refundedAmountUsd && <p className="w-full text-xs text-muted">${order.refundedAmountUsd.toFixed(2)} refunded · {order.refundedCredits} credits removed</p>}
        {<RefreshPayment orderId={order.id} />}
        {order.canResume && <ResumeCheckout orderId={order.id} />}
      </li>)}
    </ul>
    {(history.status === 'CanLoadMore' || history.status === 'LoadingMore') && <button type="button" disabled={history.status === 'LoadingMore'} onClick={() => history.loadMore(20)} className={`${button("secondary", "sm")} mt-4`}>{history.status === 'LoadingMore' ? 'Loading older purchases…' : 'Load older purchases'}</button>}
  </section>;
}

export default function Pricing({ auth = true }: { auth?: boolean }) {
  return auth ? <SignedInPricing /> : <PricingContent auth={false} />;
}
function SignedInPricing() {
  const { user } = useUser();
  // An account change must invalidate outstanding redirects and UI locks.
  return <PricingContent key={user?.id ?? 'signed-out'} auth />;
}
const Nothing = () => null;
// Without ClerkProvider the Clerk components throw, so the page renders its signed-out view directly.
function PricingContent({ auth }: { auth: boolean }) {
  const WhenSignedIn = auth ? SignedIn : Nothing;
  const WhenSignedOut = auth ? SignedOut : Fragment;
  const capabilities = useProductCapabilities();
  const active = useActivePage();
  const packs = PACKS;
  const createCheckout = useAction(api.payments.createCheckout);
  const balance = useQuery(api.users.currentUser) as { credits?: number; freeRemaining?: number; creditAdjustment?: number } | null | undefined;

  const [search] = useSearchParams();
  const orderId = search.get('order');
  const order = useQuery(api.payments.orderStatus, orderId && /^[a-z0-9]{20,40}$/.test(orderId) ? { orderId } : 'skip') as { disputeReview?: boolean; status: string; credits: number; packId: string; requestId?: string } | null | undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const checkoutAttempts = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!orderId || !order?.requestId || !PACKS.some(pack => pack.id === order.packId) || !['paid', 'refunded', 'partially_refunded', 'failed', 'cancelled', 'expired'].includes(order.status)) return;
    const key = `takeone-checkout-${order.packId}`;
    try {
      if (sessionStorage.getItem(key) === order.requestId) sessionStorage.removeItem(key);
    } catch { /* Storage may be disabled. */ }
    if (checkoutAttempts.current[order.packId] === order.requestId) delete checkoutAttempts.current[order.packId];
  }, [orderId, order?.requestId, order?.packId, order?.status]);

  const buy = async (packId: string) => {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try {
      let requestId = checkoutAttempts.current[packId];
      if (!requestId) {
        try { requestId = sessionStorage.getItem(`takeone-checkout-${packId}`) ?? ''; } catch { /* Use memory when storage is disabled. */ }
        requestId ||= crypto.randomUUID();
        checkoutAttempts.current[packId] = requestId;
        try { sessionStorage.setItem(`takeone-checkout-${packId}`, requestId); } catch { /* The in-memory retry ID remains stable. */ }
      }
      const { url } = (await createCheckout({ packId, requestId, returnUrl: window.location.origin + "/create" })) as { url: string };
      if (active.current) openCheckout(url);
    } catch (error) {
      if (!active.current) return;
      const code = (error as { data?: string })?.data;
      if (code === 'CHECKOUT_RETRY_ALLOWED') {
        const retired = checkoutAttempts.current[packId];
        try { if (sessionStorage.getItem(`takeone-checkout-${packId}`) === retired) sessionStorage.removeItem(`takeone-checkout-${packId}`); } catch { /* In-memory retry remains available. */ }
        delete checkoutAttempts.current[packId];
      }
      setError(code === 'CHECKOUT_RETRY_ALLOWED' ? 'Your previous checkout expired without a payment. Click the pack again to start a new checkout.' : code === 'CHECKOUT_PENDING' ? 'Your checkout is still being confirmed. Wait before retrying; we will reuse the same attempt.' : code === 'CHECKOUT_EXPIRED' ? 'This saved checkout is too old to reopen. Check its payment status in your purchase history. If it is still unresolved, keep the order reference for support.' : code === 'CHECKOUT_ALREADY_PAID' ? 'This checkout is already paid. Check your purchase history and balance before buying another pack.' : 'Checkout did not open. Check your purchase history, then try again.');
      submitting.current = false; setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex h-16 items-center justify-between border-b border-line bg-surface px-4 sm:px-6 md:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="TakeOne home">
          <TakeOneLogo className="h-8 w-8 text-ink" />
          <span className="font-display text-xl font-bold">TakeOne</span>
        </Link>
        <div className="flex items-center gap-4">
          <WhenSignedIn>
            {balance && <span className="hidden rounded-md border border-line bg-paper px-2.5 py-1 text-sm font-semibold sm:inline">
              {(balance.credits ?? 0) > 0 ? `${balance.credits} credits` : `${balance.freeRemaining ?? 0} free left`}
            </span>}
          </WhenSignedIn>
          <Link to="/create" className="text-sm font-semibold underline-offset-4 hover:underline">Dashboard</Link>
          <WhenSignedIn><TakeOneUserButton /></WhenSignedIn>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-12 sm:px-6 md:px-8 md:pt-20">
        <div className="max-w-3xl text-left">
          <p className="text-sm font-semibold text-muted">One-time video credits</p>
          <h1 className="mt-3 text-balance font-display text-5xl font-extrabold leading-[0.95] md:text-7xl">Buy what you need.<br />Create when you want.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            Every account starts with <strong className="font-semibold text-ink">3 free generations</strong>. Paid credits remove the TakeOne watermark and stay ready for your next video.
          </p>
        </div>

        {error && <p role="alert" className="mt-8 border-l-4 border-warn pl-4 text-sm text-warn">{error}</p>}
        {capabilities && !capabilities.payments.available && <p role="status" className="mt-8 border-l-4 border-muted pl-4 text-sm text-muted">{capabilities.payments.reason}{capabilities.rendering.available ? " You can still use your free videos." : ` ${capabilities.rendering.reason ?? "Video rendering is being connected."}`}</p>}
        {!!balance?.creditAdjustment && <p role="status" className="mt-8 border-l-4 border-warn pl-4 text-sm leading-6">Your account has a {balance.creditAdjustment}-credit adjustment from refunded credits already used. A new pack first covers this adjustment; only the remaining credits become available.</p>}
        {orderId && <p role="status" className="mt-8 border-l-4 border-ink pl-4 text-sm leading-6">
          {order?.disputeReview ? 'This purchase needs dispute review. See the order reference in your purchase history.' : order?.status === 'paid' ? `Payment confirmed. ${order.credits} credits added to your account.` :
            ['refunded', 'partially_refunded'].includes(order?.status ?? '') ? 'Your refund is recorded and your credit balance has been adjusted. See your purchase history below.' :
            PAYMENT_ACTION_COPY[order?.status ?? ''] ? PAYMENT_ACTION_COPY[order!.status] :
            order?.status === 'expired' ? 'This checkout expired without a payment. Choose a pack to start a new checkout.' :
            order?.status === 'failed' ? 'Payment failed. No credits were added. You can try a new checkout.' :
            order?.status === 'cancelled' ? 'Payment was cancelled. No credits were added.' :
            order === null ? 'Sign in with the account that started this checkout to see its status.' :
            search.get('cancelled') ? 'Checkout closed. Credits are added only when payment is confirmed.' :
            'Waiting for payment confirmation. Your balance will update automatically after verification.'}
        </p>}
        <div className={`${panel} mt-12 overflow-hidden text-left`}>
          <div className="grid md:grid-cols-2 lg:grid-cols-4">
          <div className="flex min-h-[390px] flex-col border-b border-line p-6 md:border-r md:p-7 lg:border-b-0">
            <div className="text-sm font-semibold text-muted">Free</div>
            <div className="mt-5 text-4xl font-bold">$0</div>
            <p className="mt-2 min-h-10 text-sm leading-5 text-muted">See how TakeOne fits your workflow.</p>
            <p className="mt-8 text-2xl font-bold">3 <span className="text-sm font-normal text-muted">videos</span></p>
            <ul className="mt-5 space-y-2.5 pb-6 text-sm leading-5 text-muted">
              <li>All three creation modes</li>
              <li>HD export with watermark</li>
              <li>Failed jobs restore allowance</li>
            </ul>
            <Link to="/create" className={`${button("secondary")} mt-auto w-full`}>Start free</Link>
          </div>

          {packs.map((p, i) => (
            <div key={p.id} className={`relative flex min-h-[390px] flex-col border-line p-6 md:p-7 ${i === 0 ? 'border-b lg:border-b-0 lg:border-r' : i === 1 ? 'border-b md:border-b-0 md:border-r lg:border-r' : 'border-b md:border-b-0 lg:border-r-0'}`}>
              {i === 0 && <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-cue" />}
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-muted">{p.label}</div>
                {i === 0 && <span className="rounded-md bg-cue px-2 py-0.5 text-xs font-bold text-ink">Start here</span>}
              </div>
              <div className="mt-5 text-4xl font-bold">${p.amountUsd}</div>
              <p className="mt-2 min-h-10 text-sm leading-5 text-muted">{i === 0 ? 'For your first watermark-free exports.' : i === 1 ? 'For a regular publishing rhythm.' : 'For larger batches and campaigns.'}</p>
              <p className="mt-8 text-2xl font-bold">{p.credits} <span className="text-sm font-normal text-muted">videos</span></p>
              <ul className="mt-5 space-y-2.5 pb-6 text-sm leading-5 text-muted">
                <li>No added TakeOne watermark</li>
                <li>One credit per finished video</li>
                <li>Failed jobs restore the credit</li>
              </ul>
              <WhenSignedIn>
                <button disabled={busy || !capabilities?.payments.available} onClick={() => buy(p.id)} className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>{!capabilities?.payments.available ? 'Checkout opening soon' : busy ? 'Opening checkout…' : `Buy ${p.credits} credits`}</button>
              </WhenSignedIn>
              <WhenSignedOut>
                {auth ? <SignInButton mode="modal">
                  <button disabled={!capabilities?.payments.available} className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>{capabilities?.payments.available ? 'Sign in to buy' : 'Checkout opening soon'}</button>
                </SignInButton> : <button disabled className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>Checkout opening soon</button>}
              </WhenSignedOut>
            </div>
          ))}
          </div>
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-3">
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">No subscription</strong><span className="mt-1 block text-xs text-muted">Buy credits only when you need them.</span></div>
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">One video, one credit</strong><span className="mt-1 block text-xs text-muted">A successful finished render uses one.</span></div>
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">Secure checkout</strong><span className="mt-1 block text-xs text-muted">{capabilities?.payments.available ? 'Payments are handled by Dodo.' : 'Checkout opens after provider verification.'}</span></div>
          </div>
        </div>
        <WhenSignedIn><PurchaseHistory /></WhenSignedIn>
        <p className="mt-10 text-sm text-muted">Prices in USD. Applicable tax is shown at checkout.</p>
      </main>
    </div>
  );
}
