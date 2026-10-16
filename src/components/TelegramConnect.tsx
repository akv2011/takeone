import { useState, useRef } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { Send, X } from 'lucide-react';
import { api } from '../lib/convexApi';
import { Tooltip } from './Tooltip';
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
    } catch { setLinkInstruction(false); setMessage('Could not create a code. Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!open) return <Tooltip label="Create and manage videos from the TakeOne Telegram bot" side="bottom"><button type="button" aria-label="Telegram" onClick={() => setOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold shadow-sm transition-colors hover:border-ink/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"><Send className="h-4 w-4" aria-hidden="true" />Telegram</button></Tooltip>;
  return <div className={`${compact ? 'basis-full' : 'mt-5'} rounded-xl border border-black/10 bg-white p-4 text-sm`}>
    <div className="flex items-center justify-between gap-3"><p className="font-semibold">Telegram</p>{compact && <button type="button" aria-label="Close Telegram settings" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:bg-paper hover:text-ink"><X className="h-4 w-4" /></button>}</div>
    <p className="mt-1 text-xs text-muted" role="status">{!status ? "Checking connection…" : !status.configured ? "Unavailable in this environment." : status.linked ? `Connected to @${status.botUsername}.` : `Not connected to @${status.botUsername}.`}</p>
    {!status?.linked && <button disabled={busy || !status?.configured} onClick={() => void connect()} className="mt-3 rounded-lg bg-ink px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Connect Telegram</button>}
    {status?.linked && <button disabled={busy} onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setLinkInstruction(false);
      try { await unlink({}); setMessage('Telegram disconnected.'); }
      catch { setMessage('Could not disconnect. Try again.'); }
      finally { lock.current = false; setBusy(false); }
    }} className="mt-3 text-xs font-semibold text-muted">Disconnect Telegram</button>}
    {message && (!linkInstruction || !status?.linked) && <p role="status" className="mt-2 break-words">{message}</p>}
  </div>;
}
