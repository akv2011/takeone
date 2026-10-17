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
  if (!open) return <Tooltip label="Create and manage videos from the TakeOne Telegram bot" side="bottom"><button type="button" aria-label="Telegram" onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 border border-ink bg-surface px-3 text-sm text-ink transition-colors hover:bg-paper2"><TelegramLogo aria-hidden="true" size={16} weight="regular" />Telegram</button></Tooltip>;
  return <div className={`${compact ? 'basis-full' : 'mt-5'} sheet p-4 text-sm`}>
    <div className="flex items-center justify-between gap-3">
      <p className="inline-flex items-center gap-2 font-display text-2xl leading-none"><TelegramLogo aria-hidden="true" size={20} weight="light" />Telegram</p>
      {compact && <button type="button" aria-label="Close Telegram settings" onClick={() => setOpen(false)} className="inline-flex size-9 items-center justify-center text-ink2 hover:bg-paper2 hover:text-ink"><X aria-hidden="true" size={16} /></button>}
    </div>
    <p className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-ink2" role="status">
      <span aria-hidden="true" className={`size-2 ${status?.linked ? 'bg-go' : !status ? 'pat-dots motion-safe:animate-pulse' : 'border border-ink'}`} />
      {!status ? "Checking connection…" : !status.configured ? "Unavailable in this environment." : status.linked ? `Connected to @${status.botUsername}.` : `Not connected to @${status.botUsername}.`}
    </p>
    {!status?.linked && <button disabled={busy || !status?.configured} onClick={() => void connect()} className={`${button('primary', 'sm')} mt-3`}>Connect Telegram</button>}
    {status?.linked && <button disabled={busy} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setLinkInstruction(false);
      try { await unlink({}); setMessage('Telegram disconnected.'); }
      catch { setMessage('Could not disconnect. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }} className="mt-3 text-sm text-ink2 underline underline-offset-4 hover:text-signal disabled:opacity-50">Disconnect Telegram</button>}
    {message && (!linkInstruction || !status?.linked) && <p role="status" className={`mt-3 break-words ${linkInstruction ? 'border border-dashed border-ink bg-paper px-3 py-2 font-mono text-xs' : 'border-l-2 border-ink pl-2'}`}>{message}</p>}
  </div>;
}
