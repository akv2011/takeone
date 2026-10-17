import { CreditCard, SlidersHorizontal, UserCircle, X } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'framer-motion';
import { memo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GuestNotice, signOutUser, useAuth } from '../../lib/auth';
import { button } from '../../lib/ui';
import AccountBilling from './AccountBilling';
import AccountPreferences from './AccountPreferences';

function AccountPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const leave = async () => {
    if (user?.isGuest && !window.confirm('Signing out of a guest session removes access to its videos. Sign out anyway?')) return;
    await signOutUser();
    navigate('/');
  };
  return <section className="text-ink">
    {user?.isGuest ? <p className="font-display text-[22px] font-semibold tracking-[-0.02em]">Guest</p> : <>
      {user?.name && <p className="font-display text-[22px] font-semibold tracking-[-0.02em]">{user.name}</p>}
      {user?.email && <p className="mt-0.5 text-sm text-ink2">{user.email}</p>}
    </>}
    <GuestNotice className="mt-3" />
    <button type="button" onClick={() => void leave()} className={`${button('secondary', 'md')} mt-6`}>Sign out</button>
  </section>;
}

const PAGES = [
  { id: 'account', label: 'Account', Icon: UserCircle, Panel: AccountPage },
  { id: 'preferences', label: 'Preferences', Icon: SlidersHorizontal, Panel: AccountPreferences },
  { id: 'billing', label: 'Billing', Icon: CreditCard, Panel: AccountBilling },
] as const;

const TakeOneUserButton = memo(function TakeOneUserButton() {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pageId, setPageId] = useState<(typeof PAGES)[number]['id']>('account');
  const { Panel } = PAGES.find(page => page.id === pageId)!;
  const initial = (user?.name || user?.email || 'Guest')[0].toUpperCase();
  const reduced = useReducedMotion();
  return <>
    <button type="button" aria-label="Account" onClick={() => { setOpen(true); dialog.current?.showModal(); }}
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_rgba(20,19,17,.14)] transition-[transform,box-shadow] duration-150 ease-paper hover:shadow-[inset_0_0_0_1px_rgba(20,19,17,.3)] active:scale-[.97]">
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initial}
    </button>
    <dialog ref={dialog} aria-label="Account settings" onClose={() => setOpen(false)}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto rounded-card bg-surface p-5 text-ink shadow-lift backdrop:bg-ink/30 backdrop:backdrop-blur-[2px] sm:p-7">
      {/* Mounted only while open so the account panels do not query Convex on every page. */}
      {open && <>
        <div className="flex items-center justify-between gap-3">
          <nav aria-label="Account pages" className="inline-flex rounded-control bg-paper2/70 p-1">
            {PAGES.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pageId === id ? 'page' : undefined} onClick={() => setPageId(id)}
              className={`relative inline-flex h-9 items-center gap-2 rounded-[8px] px-2.5 text-sm font-medium sm:px-3 transition-colors ${pageId === id ? 'text-ink' : 'text-ink2 hover:text-ink'}`}>
              {pageId === id && <motion.span layoutId="account-tab" aria-hidden="true" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 42 }} className="absolute inset-0 rounded-[8px] bg-surface shadow-card" />}
              <Icon aria-hidden="true" size={18} className="relative hidden sm:block" /><span className="relative">{label}</span>
            </button>)}
          </nav>
          <button type="button" autoFocus aria-label="Close" onClick={() => dialog.current?.close()} className={`${button('ghost', 'md')} w-10 px-0!`}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="mt-6"><Panel /></div>
      </>}
    </dialog>
  </>;
});

export default TakeOneUserButton;
