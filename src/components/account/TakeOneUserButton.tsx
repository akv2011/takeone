import { CreditCard, SlidersHorizontal, UserRound, X } from 'lucide-react';
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
    {user?.isGuest ? <p className="font-semibold">Guest</p> : <>
      {user?.name && <p className="font-semibold">{user.name}</p>}
      {user?.email && <p className="text-sm text-muted">{user.email}</p>}
    </>}
    <GuestNotice className="mt-4" />
    <button type="button" onClick={() => void leave()} className={`${button('secondary', 'sm')} mt-5`}>Sign out</button>
  </section>;
}

const PAGES = [
  { id: 'account', label: 'Account', Icon: UserRound, Panel: AccountPage },
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
  return <>
    <button type="button" aria-label="Account" onClick={() => { setOpen(true); dialog.current?.showModal(); }}
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface text-sm font-bold text-ink hover:border-ink">
      {user?.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : initial}
    </button>
    <dialog ref={dialog} aria-label="Account settings" onClose={() => setOpen(false)}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto rounded-[10px] border border-line bg-surface p-4 text-ink backdrop:bg-ink/40 sm:p-6">
      {/* Mounted only while open so the account panels do not query Convex on every page. */}
      {open && <>
        <div className="flex items-start justify-between gap-3">
          <nav aria-label="Account pages" className="flex flex-wrap gap-1">
            {PAGES.map(({ id, label, Icon }) => <button key={id} type="button" aria-current={pageId === id ? 'page' : undefined} onClick={() => setPageId(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-semibold ${pageId === id ? 'bg-paper text-ink' : 'text-muted hover:text-ink'}`}>
              <Icon aria-hidden="true" size={16} />{label}
            </button>)}
          </nav>
          <button type="button" autoFocus aria-label="Close" onClick={() => dialog.current?.close()} className="rounded-md p-2 text-muted hover:bg-paper hover:text-ink">
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="mt-5 border-t border-line pt-5"><Panel /></div>
      </>}
    </dialog>
  </>;
});

export default TakeOneUserButton;
