import { useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../lib/convexApi';
export default function TelegramDeliveryStatus({ jobId, status }: { jobId: string; status?: string }) {
  const retry = useMutation(api.telegramDelivery.retry);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  if (!status) return null;
  return <div className="w-full rounded-xl border border-black/10 bg-white p-3 text-xs">
    <p>{status === 'sent' ? 'Delivered to Telegram.' : status === 'failed' ? 'Telegram delivery failed. Your video is saved here; retrying delivery uses no generation.' : 'Telegram delivery is queued or in progress. Your video is saved here.'}</p>
    {status === 'failed' && <button type="button" disabled={busy} className="mt-2 rounded border px-3 py-2" onClick={async () => {
      if (lock.current) return; lock.current = true; setBusy(true); setMessage('');
      try { await retry({ jobId }); setMessage('Delivery retry queued. No generation used.'); }
      catch (error) { const code = (error as { data?: string }).data; setMessage(code === 'TELEGRAM_LINK_CHANGED' ? 'The original Telegram account is no longer linked. Download the video here or reconnect that account.' : code === 'DELIVERY_RETRY_TOO_SOON' ? 'Please wait a minute before retrying delivery.' : 'Could not retry delivery. Your video remains available here.'); }
      finally { lock.current = false; setBusy(false); }
    }}>{busy ? 'Queuing delivery…' : 'Retry Telegram delivery · free'}</button>}
    {message && <p role="status" className="mt-2">{message}</p>}
  </div>;
}
