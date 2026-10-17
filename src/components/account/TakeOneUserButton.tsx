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
    {user?.isGuest ? <p className="display text-3xl">Guest</p> : <>
      {user?.name && <p className="display text-3xl">{user.name}</p>}
      {user?.email && <p className="mt-1 font-mono text-xs text-muted">{user.email}</p>}
    </>}
    <GuestNotice className="mt-4" />
    <button type="button" onClick={() => void leave()} className={`${button('secondary', 'sm')} mt-5`}>Sign out</button>
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
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-ink bg-surface font-display text-lg text-ink transition-[transform,box-shadow] duration-200 ease-paper hover:-translate-y-px hover:shadow-hard-sm">
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover grayscale" /> : initial}
    </button>
    <dialog ref={dialog} aria-label="Account settings" onClose={() => setOpen(false)}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto border border-ink bg-surface p-4 text-ink shadow-hard-lg backdrop:bg-ink/40 sm:p-6">
      {/* Mounted only while open so the account panels do not query Convex on every page. */}
      {open && <>
        <div className="flex items-start justify-between gap-3 border-b border-ink">
          <nav aria-label="Account pages" className="flex flex-wrap">
            {PAGES.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pageId === id ? 'page' : undefined} onClick={() => setPageId(id)}
              className={`relative inline-flex items-center gap-1.5 px-3 py-2.5 text-sm ${pageId === id ? 'text-ink' : 'text-muted hover:text-ink'}`}>
              <Icon aria-hidden="true" size={16} weight={pageId === id ? 'regular' : 'light'} />{label}
              {pageId === id && <motion.span layoutId="account-ink" aria-hidden="true" transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 40 }} className="absolute inset-x-2 -bottom-px h-[3px] bg-ink" />}
            </button>)}
          </nav>
          <button type="button" autoFocus aria-label="Close" onClick={() => dialog.current?.close()} className="inline-flex size-9 items-center justify-center text-ink2 hover:bg-paper2 hover:text-ink">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="pt-6"><Panel /></div>
      </>}
    </dialog>
  </>;
});

export default TakeOneUserButton;
