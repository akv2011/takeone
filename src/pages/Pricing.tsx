import { openCheckout } from "../lib/openCheckout";
import { PAYMENT_ACTION_COPY } from '../../convex/paymentStates';
import { Fragment, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SignedIn, SignedOut, saveWithGoogle, signInErrorMessage, signInWithGoogle, useAuth } from "../lib/auth";
import { useAction, useQuery, useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "../lib/convexApi";
import { TakeOneWordmark } from "../components/TakeOneLogo";
import SiteFooter from "../components/SiteFooter";
import TakeOneUserButton from "../components/account/TakeOneUserButton";
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
  if (history.status === 'LoadingFirstPage') return <p role="status" className="pat-dots mt-12 h-24 opacity-20"><span className="sr-only">Loading purchase history…</span></p>;
  if (!orders?.length) return null;
  return <section className="mt-16 text-left" aria-labelledby="purchases-heading">
    <div className="border-b border-ink pb-4">
      <h2 id="purchases-heading" className="display text-4xl">Purchase history</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-ink2">Credits appear after payment confirmation. A started checkout is not a charge.</p>
    </div>
    <ul className="divide-y divide-line">
      {orders.map(order => <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 py-5 text-sm">
        <div><span className="font-medium">{order.credits} video credits · ${(order.paidAmountUsd ?? order.amountUsd).toFixed(2)} {order.paidAmountUsd === undefined ? "pack price" : "paid"}</span>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">{new Date(order.createdAt).toLocaleDateString()} · {order.environment === 'test' ? 'Test checkout' : 'Live checkout'}</p></div>
        <span className="border border-ink px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em]">{order.disputeReview ? 'Dispute review required' : PAYMENT_STATUS[order.status] ?? 'Awaiting confirmation'}</span>
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

  const note = "border-l-2 pl-4 text-sm leading-6";
  const notes = [
    ["No subscription", "Buy credits only when you need them."],
    ["One video, one credit", "A successful finished render uses one."],
    ["Secure checkout", capabilities?.payments.available ? "Payments are handled by Dodo." : "Checkout opens after provider verification."],
  ];

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-ink bg-paper/90 px-4 backdrop-blur-sm sm:px-6 md:px-12">
        <Link to="/" aria-label="TakeOne home"><TakeOneWordmark className="text-[28px] text-ink" /></Link>
        <div className="flex items-center gap-5">
          <WhenSignedIn>
            {balance && <span className="hidden border border-ink px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] sm:inline">
              {(balance.credits ?? 0) > 0 ? `${balance.credits} credits` : `${balance.freeRemaining ?? 0} free left`}
            </span>}
          </WhenSignedIn>
          <Link to="/create" className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink2 underline-offset-4 hover:text-ink hover:underline">Dashboard</Link>
          <WhenSignedIn><TakeOneUserButton /></WhenSignedIn>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-24 pt-14 sm:px-6 md:px-12 md:pt-20">
        <div className="rule-top grid gap-6 pt-6 md:grid-cols-12">
          <div className="md:col-span-8">
            <p className="eyebrow">One-time video credits</p>
            <h1 className="display mt-4 text-[clamp(52px,8vw,112px)]">Buy what you need.<br /><em>Create when you want.</em></h1>
          </div>
          <p className="self-end text-base leading-7 text-ink2 md:col-span-4">
            Every account starts with <strong className="font-medium text-ink">{FREE_LIMIT} free generations</strong>. Paid credits remove the TakeOne watermark and stay ready for your next video.
          </p>
        </div>

        {error && <p role="alert" className={`${note} mt-8 border-warn text-warn`}>{error}</p>}
        {capabilities && !capabilities.payments.available && <p role="status" className={`${note} mt-8 border-ink2 text-ink2`}>{capabilities.payments.reason}{capabilities.rendering.available ? " You can still use your free videos." : ` ${capabilities.rendering.reason ?? "Video rendering is being connected."}`}</p>}
        {!!balance?.creditAdjustment && <p role="status" className={`${note} mt-8 border-warn`}>Your account has a {balance.creditAdjustment}-credit adjustment from refunded credits already used. A new pack first covers this adjustment; only the remaining credits become available.</p>}
        {orderId && <p role="status" className={`${note} mt-8 border-ink`}>
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

        <div className="mt-14 grid gap-8 md:grid-cols-2 xl:grid-cols-4">
          <div className="sheet flex min-h-[400px] flex-col p-6 shadow-hard-sm">
            <p className="eyebrow">Free</p>
            <p className="display mt-6 text-7xl">$0</p>
            <p className="mt-2 min-h-10 text-sm leading-5 text-ink2">See how TakeOne fits your workflow.</p>
            <p className="mt-6 border-t border-ink pt-4 font-mono text-sm">{FREE_LIMIT} <span className="text-ink2">videos</span></p>
            <ul className="mt-4 space-y-2 pb-6 text-sm leading-5 text-ink2">
              <li>All three creation modes</li>
              <li>HD export with watermark</li>
              <li>Failed jobs restore allowance</li>
            </ul>
            <Link to="/create" className={`${button("secondary")} mt-auto w-full`}>Start free</Link>
          </div>

          {packs.map((p, i) => (
            <div key={p.id} className={`sheet relative flex min-h-[400px] flex-col p-6 ${i === 0 ? 'shadow-hard-lg' : 'shadow-hard'}`}>
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{p.label}</p>
                {i === 0 && <span className="stamp -rotate-6 px-2 py-1 text-[10px] text-signal">Start here</span>}
              </div>
              <p className="display mt-6 text-7xl">${p.amountUsd}</p>
              <p className="mt-2 min-h-10 text-sm leading-5 text-ink2">{i === 0 ? 'For your first watermark-free exports.' : i === 1 ? 'For a regular publishing rhythm.' : 'For larger batches and campaigns.'}</p>
              <p className="mt-6 border-t border-ink pt-4 font-mono text-sm">{p.credits} <span className="text-ink2">videos</span></p>
              <ul className="mt-4 space-y-2 pb-6 text-sm leading-5 text-ink2">
                <li>No added TakeOne watermark</li>
                <li>One credit per finished video</li>
                <li>Failed jobs restore the credit</li>
              </ul>
              <WhenSignedIn>
                {/* Paid credits on a guest account are lost with the browser data, so a guest saves with Google first. */}
                {user?.isGuest ? <button disabled={!capabilities?.payments.available} onClick={() => void authenticate(saveWithGoogle)} className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>{capabilities?.payments.available ? 'Save with Google to buy' : 'Checkout opening soon'}</button>
                  : <button disabled={busy || !capabilities?.payments.available} onClick={() => buy(p.id)} className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>{!capabilities?.payments.available ? 'Checkout opening soon' : busy ? 'Opening checkout…' : `Buy ${p.credits} credits`}</button>}
              </WhenSignedIn>
              <WhenSignedOut>
                {auth ? <button disabled={!capabilities?.payments.available} onClick={() => void authenticate(signInWithGoogle)} className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>{capabilities?.payments.available ? 'Sign in to buy' : 'Checkout opening soon'}</button>
                  : <button disabled className={`${button(i === 0 ? "primary" : "secondary")} mt-auto w-full`}>Checkout opening soon</button>}
              </WhenSignedOut>
            </div>
          ))}
        </div>

        <ul className="mt-14 grid border-t border-ink sm:grid-cols-3">
          {notes.map(([title, detail]) => <li key={title} className="border-b border-line py-4 sm:border-b-0 sm:pr-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em]">{title}</p>
            <p className="mt-1 text-sm text-ink2">{detail}</p>
          </li>)}
        </ul>
        <WhenSignedIn><PurchaseHistory /></WhenSignedIn>
        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.08em] text-ink2">Prices in USD. Applicable tax is shown at checkout.</p>
      </main>
      <SiteFooter />
    </div>
  );
}
