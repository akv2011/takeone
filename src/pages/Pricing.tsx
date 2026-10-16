import { openCheckout } from "../lib/openCheckout";
import { PAYMENT_ACTION_COPY } from '../../convex/paymentStates';
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SignedIn, SignedOut, SignInButton, useUser } from "@clerk/clerk-react";
import { useAction, useQuery, useConvexAuth, usePaginatedQuery } from "convex/react";
import { api } from "../lib/convexApi";
import TakeOneLogo from "../components/TakeOneLogo";
import TakeOneUserButton from "../components/account/TakeOneUserButton";
import { useProductCapabilities } from "../hooks/useProductCapabilities";

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
    <button disabled={busy} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
      if (lock.current) return;
      lock.current = true; setBusy(true); setMessage('');
      try { const result = await refresh({ orderId }) as { status: string }; setMessage(PAYMENT_ACTION_COPY[result.status] ?? (result.status === 'expired' ? 'This checkout expired without a payment. You can start a new checkout from the pack buttons.' : result.status === 'dispute_review' ? 'This purchase needs dispute review. No additional credits were granted.' : result.status === 'paid' ? 'Payment verified. Your credits are available.' : ['refunded', 'partially_refunded'].includes(result.status) ? 'Refund verified. Your credit balance has been adjusted.' : 'Status checked. No confirmed payment credits were added.')); }
      catch (error) { const code = (error as { data?: string }).data; setMessage(code === 'REFRESH_TOO_SOON' ? 'Please wait a minute before checking again.' : code === 'CHECKOUT_NEEDS_REVIEW' ? 'This checkout needs support review. Please keep this order reference: ' + orderId : 'Could not verify payment. Please wait and check again; this did not start another checkout.'); }
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
  return <div><button disabled={busy} className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" onClick={async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { const { url } = await resume({ orderId }) as { url: string }; if (active.current) openCheckout(url); }
    catch (error) { if (!active.current) return; setMessage((error as { data?: string }).data === 'REFRESH_TOO_SOON' ? 'Please wait a minute after checking before continuing checkout.' : 'This checkout could not be reopened. Check its latest payment status before starting another purchase.'); }
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
    <div className="border-b border-black/10 pb-4">
      <h2 id="purchases-heading" className="font-display text-xl font-bold">Purchase history</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Credits appear after payment confirmation. A started checkout is not a charge.</p>
    </div>
    <ul className="divide-y divide-black/10">
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
    {(history.status === 'CanLoadMore' || history.status === 'LoadingMore') && <button type="button" disabled={history.status === 'LoadingMore'} onClick={() => history.loadMore(20)} className="mt-4 rounded-lg border border-black/15 bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50">{history.status === 'LoadingMore' ? 'Loading older purchases…' : 'Load older purchases'}</button>}
  </section>;
}

export default function Pricing() {
  const { user } = useUser();
  // An account change must invalidate outstanding redirects and UI locks.
  return <PricingContent key={user?.id ?? 'signed-out'} />;
}
function PricingContent() {
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
      setError(code === 'CHECKOUT_RETRY_ALLOWED' ? 'Your previous checkout expired without a payment. Click the pack again to start a new checkout.' : code === 'CHECKOUT_PENDING' ? 'Your checkout is still being confirmed. Wait before retrying; we will reuse the same attempt.' : code === 'CHECKOUT_EXPIRED' ? 'This saved checkout is too old to reopen. Check its payment status in your purchase history. If it is still unresolved, keep the order reference for support.' : code === 'CHECKOUT_ALREADY_PAID' ? 'This checkout is already paid. Check your purchase history and balance before buying another pack.' : 'We could not open checkout. Please check your purchase history before retrying.');
      submitting.current = false; setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex h-[72px] items-center justify-between border-b border-black/10 px-6 md:px-8">
        <Link to="/" className="flex items-center gap-2.5" aria-label="TakeOne home">
          <TakeOneLogo className="h-8 w-8 text-ink" />
          <span className="font-display text-xl font-bold tracking-tight">takeone</span>
        </Link>
        <div className="flex items-center gap-4">
          <SignedIn>
            {balance && <span className="hidden rounded-full border border-black/10 bg-white px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:inline">
              {(balance.credits ?? 0) > 0 ? `${balance.credits} credits` : `${balance.freeRemaining ?? 0} free left`}
            </span>}
          </SignedIn>
          <Link to="/create" className="text-sm font-semibold text-ink2 transition-opacity hover:opacity-60">Dashboard</Link>
          <SignedIn><TakeOneUserButton /></SignedIn>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-14 md:px-8 md:pt-20">
        <div className="max-w-3xl text-left">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">One-time video credits</p>
          <h1 className="mt-4 text-balance font-display text-4xl font-extrabold leading-[0.98] tracking-[-0.045em] md:text-6xl">Buy what you need.<br />Create when you want.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted">
            Every account starts with <strong className="font-semibold text-ink">3 free generations</strong>. Paid credits remove the TakeOne watermark and stay ready for your next video.
          </p>
        </div>

        {error && <p role="alert" className="mt-8 border-l-2 border-red-700 pl-4 text-sm text-red-700">{error}</p>}
        {capabilities && !capabilities.payments.available && <p role="status" className="mt-8 border-l-2 border-black/30 pl-4 text-sm text-muted">{capabilities.payments.reason}{capabilities.rendering.available ? " You can still use your free videos." : ` ${capabilities.rendering.reason ?? "Video rendering is being connected."}`}</p>}
        {!!balance?.creditAdjustment && <p role="status" className="mt-8 border-l-2 border-[#8b2f2f] pl-4 text-sm leading-6">Your account has a {balance.creditAdjustment}-credit adjustment from refunded credits already used. A new pack first covers this adjustment; only the remaining credits become available.</p>}
        {orderId && <p role="status" className="mt-8 border-l-2 border-black/30 pl-4 text-sm leading-6">
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
        <div className="mt-14 overflow-hidden rounded-[22px] border border-black/10 bg-white text-left shadow-[0_1px_0_rgba(0,0,0,0.02)]">
          <div className="grid md:grid-cols-2 lg:grid-cols-4">
          {/* Free */}
          <div className="flex min-h-[390px] flex-col border-b border-black/10 p-6 md:border-r md:p-7 lg:border-b-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#777]">Free</div>
            <div className="mt-5 font-display text-4xl font-extrabold tracking-tight">$0</div>
            <p className="mt-2 text-sm leading-5 text-muted">See how TakeOne fits your workflow.</p>
            <p className="mt-8 text-2xl font-bold">3 <span className="text-sm font-normal text-muted">videos</span></p>
            <ul className="mt-5 space-y-2.5 text-sm leading-5 text-muted">
              <li>All three creation modes</li>
              <li>HD export with watermark</li>
              <li>Failed jobs restore allowance</li>
            </ul>
            <Link to="/create" className="mt-auto block rounded-lg border border-black/15 px-3 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-black/[0.04]">Start free</Link>
          </div>

          {/* Paid packs */}
          {packs.map((p, i) => (
            <div key={p.id} className={`flex min-h-[390px] flex-col border-black/10 p-6 md:p-7 ${i === 0 ? 'border-b bg-[#f3f2ee] lg:border-b-0 lg:border-r' : i === 1 ? 'border-b md:border-b-0 md:border-r lg:border-r' : 'border-b md:border-b-0 lg:border-r-0'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#777]">{p.label}</div>
                {i === 0 && <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#666]">Start here</span>}
              </div>
              <div className="mt-5 font-display text-4xl font-extrabold tracking-tight">${p.amountUsd}</div>
              <p className="mt-2 text-sm leading-5 text-muted">{i === 0 ? 'For your first watermark-free exports.' : i === 1 ? 'For a regular publishing rhythm.' : 'For larger batches and campaigns.'}</p>
              <p className="mt-8 text-2xl font-bold">{p.credits} <span className="text-sm font-normal text-muted">videos</span></p>
              <ul className="mt-5 space-y-2.5 text-sm leading-5 text-muted">
                <li>No added TakeOne watermark</li>
                <li>One credit per finished video</li>
                <li>Failed jobs restore the credit</li>
              </ul>
              <SignedIn>
                <button disabled={busy || !capabilities?.payments.available} onClick={() => buy(p.id)} className={`mt-auto w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${i === 0 ? 'bg-ink text-white hover:bg-black/80' : 'border border-black/15 bg-white hover:bg-black/[0.04]'}`}>{!capabilities?.payments.available ? 'Checkout opening soon' : busy ? 'Opening checkout…' : `Buy ${p.credits} credits`}</button>
              </SignedIn>
              <SignedOut>
                <SignInButton mode="modal">
                  <button disabled={!capabilities?.payments.available} className={`mt-auto w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${i === 0 ? 'bg-ink text-white hover:bg-black/80' : 'border border-black/15 bg-white hover:bg-black/[0.04]'}`}>{capabilities?.payments.available ? 'Sign in to buy' : 'Checkout opening soon'}</button>
                </SignInButton>
              </SignedOut>
            </div>
          ))}
          </div>
          <div className="grid gap-px border-t border-black/10 bg-black/10 sm:grid-cols-3">
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">No subscription</strong><span className="mt-1 block text-xs text-muted">Buy credits only when you need them.</span></div>
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">One video, one credit</strong><span className="mt-1 block text-xs text-muted">A successful finished render uses one.</span></div>
            <div className="bg-paper px-6 py-4 text-sm"><strong className="font-semibold">Secure checkout</strong><span className="mt-1 block text-xs text-muted">{capabilities?.payments.available ? 'Payments are handled by Dodo.' : 'Checkout opens after provider verification.'}</span></div>
          </div>
        </div>
        <SignedIn><PurchaseHistory /></SignedIn>
        <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Prices in USD. Applicable tax is shown at checkout.</p>
      </main>
    </div>
  );
}
