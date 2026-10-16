import { useAction, useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/convexApi';
import { ReviewNotes, type ReviewNote } from './ReviewNotes';
interface LinkInfo { id: string; createdAt: number; expiresAt: number; revokedAt?: number; commentCount: number }
export function ShareReview({ jobId, duration, onSeek }: { jobId: string; duration?: number; onSeek(at: number): void }) {
  const [open, setOpen] = useState(false), [days, setDays] = useState<1 | 7>(7), [url, setUrl] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>(), [notice, setNotice] = useState('');
  const lifetime = useRef(0);
  useEffect(() => () => { lifetime.current++; }, []);
  const links = useQuery(api.reviews.list, open ? { jobId } : 'skip') as LinkInfo[] | undefined;
  const active = selected ?? links?.[0]?.id;
  const notes = useQuery(api.reviews.feedback, open && active ? { reviewId: active } : 'skip') as ReviewNote[] | null | undefined;
  const create = useAction(api.reviews.create), revoke = useMutation(api.reviews.revoke), remove = useMutation(api.reviews.remove), resolve = useMutation(api.reviews.resolve);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    const view = lifetime.current; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) {
      if (view === lifetime.current) {
        const code = (e as { data?: string }).data;
        setError(code === 'REVIEW_CREATE_LIMIT' ? 'You can create five review links per hour. Try again later.' : code === 'REVIEW_HISTORY_FULL' ? 'Delete an inactive review history before creating another link.' : 'The review could not be updated. Try again.');
      }
    } finally { if (view === lifetime.current) setBusy(false); }
  };
  const createLink = () => run(async () => {
    setUrl('');
    const view = lifetime.current;
    const result = await create({ jobId, durationSec: duration, days }) as { id: string; token: string };
    if (view !== lifetime.current) return;
    setUrl(`${window.location.origin}/review#${result.token}`); setSelected(result.id);
  });
  return <section aria-label="Share video for review" className="mb-5 rounded-2xl border border-black/10 bg-white p-4 text-ink ph-no-capture">
    <button type="button" onClick={() => setOpen(value => !value)} className="font-semibold">{open ? 'Close sharing and feedback' : 'Share for review'}</button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-sm text-muted">Share this completed version with reviewers. Anyone with the link can watch and leave timestamped notes. Creating another link revokes the previous live link for this version.</p>
      <div className="flex flex-wrap items-end gap-3"><label className="text-xs font-semibold">Link expires<select value={days} onChange={e => setDays(Number(e.target.value) as 1 | 7)} className="ml-2 rounded-lg border border-black/20 p-2"><option value={1}>In 1 day</option><option value={7}>In 7 days</option></select></label><button type="button" disabled={busy || !duration || !Number.isFinite(duration)} onClick={() => void createLink()} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create review link</button></div>
      {!duration && <p className="text-xs text-muted">Load the video before creating a review link.</p>}
      {url && <div className="space-y-2"><label className="block text-xs font-semibold">Save this link now. It is shown only here.<input readOnly value={url} onFocus={e => e.currentTarget.select()} className="mt-1 block w-full rounded-lg border border-black/20 p-2 font-mono text-xs" /></label><button type="button" onClick={() => void navigator.clipboard.writeText(url).then(() => setNotice('Link copied.')).catch(() => setNotice('Select the link above and copy it.'))} className="text-sm font-semibold underline">Copy review link</button></div>}
      {notice && <p role="status" className="text-sm">{notice}</p>}{error && <p role="alert" className="text-sm">{error}</p>}
      <p className="text-xs leading-relaxed text-muted">Revocation or expiry stops new access and notes. Previously opened playback links can remain usable for up to two minutes; saved copies cannot be recalled.</p>
      {links?.length ? <><label className="block text-xs font-semibold">Review history<select value={active} onChange={e => { setSelected(e.target.value); setUrl(''); }} className="mt-1 block max-w-full rounded-lg border border-black/20 p-2">{links.map(link => <option value={link.id} key={link.id}>{new Date(link.createdAt).toLocaleString()} · {link.revokedAt !== undefined ? 'Revoked' : link.expiresAt <= Date.now() ? 'Expired' : 'Active'} · {link.commentCount} notes</option>)}</select></label>
        <div className="flex flex-wrap gap-4">{(() => {
          const link = links.find(item => item.id === active);
          if (!link) return null;
          return link.revokedAt === undefined && link.expiresAt > Date.now() ? <button type="button" disabled={busy} onClick={() => void run(async () => { await revoke({ reviewId: active }); setUrl(''); })} className="text-sm font-semibold underline">Revoke review link</button> : <button type="button" disabled={busy} onClick={() => { if (window.confirm('Delete this inactive review and all its feedback?')) void run(async () => { await remove({ reviewId: active }); setUrl(''); setSelected(undefined); }); }} className="text-sm font-semibold underline">Delete this review and feedback</button>;
        })()}</div>
        {notes?.length ? <ReviewNotes notes={notes} onSeek={onSeek} busy={busy} onResolve={note => void run(() => resolve({ commentId: note.id, resolved: !note.resolved }))} /> : <p className="text-sm text-muted">No feedback for this link yet.</p>}
      </> : <p className="text-sm text-muted">No review links for this version.</p>}
    </div>}
  </section>;
}
