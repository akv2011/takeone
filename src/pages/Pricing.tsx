import { openCheckout } from "../lib/openCheckout";
import { PAYMENT_ACTION_COPY } from '../../convex/paymentStates';
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SignedIn, SignedOut, saveWithGoogle, signInErrorMessage, signInWithGoogle, useAuth } from "../lib/auth";
import { useAction, useQuery, useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "../lib/convexApi";
import Header from "../components/Header";
import SiteFooter from "../components/SiteFooter";
import { useProductCapabilities } from "../hooks/useProductCapabilities";
import { button } from "../lib/ui";

import { FREE_LIMIT, PACKS } from "../../convex/config";

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
    {message && <p role="status" className="mt-1 max-w-sm text-xs text-ink2">{message}</p>}
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
  }}>{busy ? 'Verifying checkout…' : 'Continue checkout'}</button>{message && <p role="status" className="mt-1 max-w-sm text-xs text-ink2">{message}</p>}</div>;
}
function PurchaseHistory() {
  const { user } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const history = usePaginatedQuery(api.payments.listHistory, isAuthenticated && user?.id ? { accountKey: user.id } : 'skip', { initialNumItems: 20 });
  const orders = history.results as { id: string; canResume?: boolean; packId: string; credits: number; amountUsd: number; paidAmountUsd?: number; refundedAmountUsd?: number; refundedCredits?: number; status: string; disputeReview?: boolean; createdAt: number; environment: string }[] | undefined;
  if (!isAuthenticated) return null;
  if (history.status === 'LoadingFirstPage') return <p role="status" className="mt-12 h-24 animate-pulse rounded-card bg-surface/60 shadow-card"><span className="sr-only">Loading purchase history…</span></p>;
  if (!orders?.length) return null;
  return <section className="mt-16 text-left" aria-labelledby="purchases-heading">
    <div className="border-b border-line pb-4">
      <h2 id="purchases-heading" className="display text-[28px]">Purchase history</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink2">Credits appear after payment confirmation. A started checkout is not a charge.</p>
    </div>
    <ul className="divide-y divide-line">
      {orders.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
        <div><span className="font-medium">{order.credits} video credits · ${(order.paidAmountUsd ?? order.amountUsd).toFixed(2)} {order.paidAmountUsd === undefined ? "pack price" : "paid"}</span>
          <p className="text-[13px] text-ink2">{new Date(order.createdAt).toLocaleDateString()} · {order.environment === 'test' ? 'Test checkout' : 'Live checkout'}</p></div>
        <span className="text-[14px] font-medium text-ink">{order.disputeReview ? 'Dispute review required' : PAYMENT_STATUS[order.status] ?? 'Awaiting confirmation'}</span>
        {!order.disputeReview && PAYMENT_ACTION_COPY[order.status] && <p className="w-full text-xs leading-5 text-ink2">{PAYMENT_ACTION_COPY[order.status]} Order reference: {order.id}</p>}
        {order.disputeReview && <p className="w-full text-xs text-ink2">A payment dispute was reported. Additional credits from this purchase will not be granted until reviewed. Keep this order reference: {order.id}</p>}
        {!!order.refundedAmountUsd && <p className="w-full text-xs text-ink2">${order.refundedAmountUsd.toFixed(2)} refunded · {order.refundedCredits} credits removed</p>}
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
  const { user } = useAuth();
  // An account change must invalidate outstanding redirects and UI locks.
  return <PricingContent key={user?.id ?? 'signed-out'} auth />;
}
const Nothing = () => null;
// Without Firebase config there is no account to sign in to, so the page renders its signed-out view with checkout disabled.
function PricingContent({ auth }: { auth: boolean }) {
  const { user } = useAuth();
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

  const authenticate = async (action: () => Promise<void>) => {
    setError('');
    try { await action(); }
    catch (caught) { const message = signInErrorMessage(caught); if (message && active.current) setError(message); }
  };

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

  const note = "rounded-control px-4 py-3 text-sm leading-6";
  const notes = [
    ["No subscription", "Buy credits only when you need them."],
    ["One video, one credit", "A finished render uses one."],
    ["Secure checkout", capabilities?.payments.available ? "Payments are handled by Dodo." : "Checkout opens after provider verification."],
  ];
  const buyButton = (i: number) => `${button(i === 0 ? "primary" : "secondary", "lg")} mt-auto w-full`;

  return (
    <div className="flex min-h-screen flex-col text-ink">
      <Header />
      <main className="mx-auto w-full max-w-[1280px] flex-1 px-5 pb-24 pt-12 sm:px-8 md:px-12 md:pt-20">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <h1 className="display ml-[-0.04em] text-[40px] md:text-[56px]">Pay per short. No subscription.</h1>
            <p className="mt-4 text-[17px] leading-relaxed text-ink2">Every account starts with <strong className="font-semibold text-ink">{FREE_LIMIT} free generations</strong>. Paid credits remove the TakeOne watermark.</p>
          </div>
          <WhenSignedIn>
            {balance && <p className="glass rounded-control px-4 py-2.5 text-[15px] text-ink2">
              You have <strong className="font-semibold tabular-nums text-ink">{(balance.credits ?? 0) > 0 ? `${balance.credits} credits` : `${balance.freeRemaining ?? 0} free left`}</strong>
            </p>}
          </WhenSignedIn>
        </div>

        {error && <p role="alert" className={`${note} mt-8 bg-warnBg text-cueInk`}>{error}</p>}
        {capabilities && !capabilities.payments.available && <p role="status" className={`${note} mt-8 bg-surface/80 text-ink2 shadow-card`}>{capabilities.payments.reason}{capabilities.rendering.available ? " You can still use your free videos." : ` ${capabilities.rendering.reason ?? "Video rendering is being connected."}`}</p>}
        {!!balance?.creditAdjustment && <p role="status" className={`${note} mt-8 bg-warnBg text-ink`}>Your account has a {balance.creditAdjustment}-credit adjustment from refunded credits already used. A new pack first covers this adjustment; only the remaining credits become available.</p>}
        {orderId && <p role="status" className={`${note} mt-8 bg-surface/80 text-ink shadow-card`}>
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

        <div className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="sheet flex min-h-[380px] flex-col p-6">
            <p className="text-[15px] font-semibold text-ink">Free</p>
            <p className="display mt-5 text-[44px] tabular-nums">$0</p>
            <p className="mt-1 text-[15px] text-ink">{FREE_LIMIT} <span className="text-ink2">videos</span></p>
            <ul className="mt-6 space-y-2.5 border-t border-line pb-6 pt-5 text-[14px] text-ink2">
              <li>All three ways to start</li>
              <li>HD export with watermark</li>
              <li>Failed jobs restore allowance</li>
            </ul>
            <Link to="/create" className={`${button("secondary", "lg")} mt-auto w-full`}>Start free</Link>
          </div>

          {packs.map((p, i) => (
            <div key={p.id} className={`relative flex min-h-[380px] flex-col rounded-card p-6 ${i === 0 ? "bg-surface shadow-lift ring-[1.5px] ring-ink" : "sheet"}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-ink">{p.label}</p>
                {i === 0 && <span className="text-[13px] font-semibold text-grease">Start here</span>}
              </div>
              <p className="display mt-5 text-[44px] tabular-nums">${p.amountUsd}</p>
              <p className="mt-1 text-[15px] text-ink">{p.credits} <span className="text-ink2">videos · ${(p.amountUsd / p.credits).toFixed(2)} each</span></p>
              <ul className="mt-6 space-y-2.5 border-t border-line pb-6 pt-5 text-[14px] text-ink2">
                <li>No TakeOne watermark</li>
                <li>One credit per finished video</li>
                <li>Failed jobs restore the credit</li>
              </ul>
              <WhenSignedIn>
                {/* Paid credits on a guest account are lost with the browser data, so a guest saves with Google first. */}
                {user?.isGuest ? <button disabled={!capabilities?.payments.available} onClick={() => void authenticate(saveWithGoogle)} className={buyButton(i)}>{capabilities?.payments.available ? 'Save with Google to buy' : 'Checkout opening soon'}</button>
                  : <button disabled={busy || !capabilities?.payments.available} onClick={() => buy(p.id)} className={buyButton(i)}>{!capabilities?.payments.available ? 'Checkout opening soon' : busy ? 'Opening checkout…' : `Buy ${p.credits} credits`}</button>}
              </WhenSignedIn>
              <WhenSignedOut>
                {auth ? <button disabled={!capabilities?.payments.available} onClick={() => void authenticate(signInWithGoogle)} className={buyButton(i)}>{capabilities?.payments.available ? 'Sign in to buy' : 'Checkout opening soon'}</button>
                  : <button disabled className={buyButton(i)}>Checkout opening soon</button>}
              </WhenSignedOut>
            </div>
          ))}
        </div>

        <ul className="mt-12 grid gap-6 border-t border-line pt-8 sm:grid-cols-3">
          {notes.map(([title, detail]) => <li key={title}>
            <p className="text-[15px] font-semibold text-ink">{title}</p>
            <p className="mt-1 text-[14px] text-ink2">{detail}</p>
          </li>)}
        </ul>
        <WhenSignedIn><PurchaseHistory /></WhenSignedIn>
        <p className="mt-10 text-[13px] text-muted">Prices in USD. Applicable tax is shown at checkout.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
