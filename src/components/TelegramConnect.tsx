import { useState, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { TelegramLogo, X } from '@phosphor-icons/react';
import { api } from '../lib/convexApi';
import { Tooltip } from './Tooltip';
import { button } from '../lib/ui';
export default function TelegramConnect({ compact = false }: { compact?: boolean }) {
  const status = useQuery(api.telegram.status) as { linked: boolean; configured: boolean; botUsername?: string } | null | undefined;
  const lock = useRef(false);
  const createLink = useMutation(api.telegram.createLink);
  const unlink = useMutation(api.telegram.unlink);
  const [message, setMessage] = useState('');
  const [linkInstruction, setLinkInstruction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);
  const connect = async () => {
    if (lock.current) return; lock.current = true; setBusy(true);
    try {
      const { code, botUsername } = await createLink({}) as { code: string; botUsername: string };
      setLinkInstruction(true);
      setMessage(`Send /link ${code} to @${botUsername} in Telegram within 10 minutes. Keep this code private.`);
    } catch { setLinkInstruction(false); setMessage('The link code was not created. Try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!open) return <Tooltip label="Create and manage videos from the TakeOne Telegram bot" side="bottom"><button type="button" aria-label="Telegram" onClick={() => setOpen(true)} className={button('secondary', 'md')}><TelegramLogo aria-hidden="true" size={18} />Telegram</button></Tooltip>;
  return <div className={`${compact ? 'basis-full' : 'mt-5'} rounded-card bg-surface/95 p-5 text-sm shadow-card`}>
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 font-display text-[17px] font-semibold tracking-[-0.02em]"><TelegramLogo aria-hidden="true" size={20} />Telegram</p>
      {compact && <button type="button" aria-label="Close Telegram settings" onClick={() => setOpen(false)} className={`${button('ghost', 'md')} w-10 px-0!`}><X aria-hidden="true" size={18} /></button>}
    </div>
    <p className="mt-1 flex items-center gap-2 text-ink2" role="status">
      <span aria-hidden="true" className={`size-2 rounded-full ${status?.linked ? 'bg-go' : !status ? 'bg-ink/20 motion-safe:animate-pulse' : 'bg-ink/25'}`} />
      {!status ? "Checking connection…" : !status.configured ? "Unavailable in this environment." : status.linked ? `Connected to @${status.botUsername}.` : `Not connected to @${status.botUsername}.`}
    </p>
    {!status?.linked && <button disabled={busy || !status?.configured} onClick={() => void connect()} className={`${button('primary', 'md')} mt-4`}>Connect Telegram</button>}
    {status?.linked && <button disabled={busy} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setLinkInstruction(false);
      try { await unlink({}); setMessage('Telegram disconnected.'); }
      catch { setMessage('Could not disconnect. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }} className={`${button('ghost', 'md')} mt-3 -ml-4`}>Disconnect Telegram</button>}
    {message && (!linkInstruction || !status?.linked) && <p role="status" className={`mt-3 break-words ${linkInstruction ? 'rounded-control bg-paper px-3 py-2.5 text-ink' : 'text-ink2'}`}>{message}</p>}
  </div>;
}
