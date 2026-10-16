import { reviewTime } from "../lib/reviewTime";
import { useAction, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, convexEnabled } from '../lib/convexApi';
import { ReviewNotes, type ReviewNote } from '../components/ReviewNotes';
import { button, field, label, panel } from '../lib/ui';

interface ReviewData { expiresAt: number; durationSec: number; comments: ReviewNote[] }
function Unavailable() { return <main className="min-h-screen bg-paper px-6 py-24 text-center text-ink"><h1 className="font-display text-4xl font-extrabold">Review unavailable</h1><p className="mt-4 text-muted">This link is invalid, expired or was revoked. Ask the creator for a new link.</p></main>; }
export default function Review() {
  const { hash } = useLocation();
  const token = hash.slice(1);
  if (!convexEnabled || !/^[a-f0-9]{64}$/.test(token)) return <Unavailable />;
  return <ReviewContent key={token} token={token} />;
}
export function ReviewContent({ token }: { token: string }) {
  const data = useQuery(api.reviews.get, { token }) as ReviewData | null | undefined;
  const sign = useAction(api.reviews.playback), add = useMutation(api.reviews.addComment);
  const video = useRef<HTMLVideoElement>(null), epoch = useRef(0), signing = useRef(0);
  const resume = useRef<{ at: number; playing: boolean } | undefined>(undefined);
  const [now, setNow] = useState(Date.now);
  const [media, setMedia] = useState<{ url: string; expiresAt: number }>();
  const [mediaError, setMediaError] = useState(''), [feedbackError, setFeedbackError] = useState('');
  const [current, setCurrent] = useState(0), [duration, setDuration] = useState(0);
  const [name, setName] = useState(''), [text, setText] = useState(''), [at, setAt] = useState('0');
  const [sending, setSending] = useState(false);
  const request = useRef<{ content: string; id: string } | undefined>(undefined);
  const invalidate = useCallback(() => { epoch.current++; }, []);
  const live = !!data && data.expiresAt > now;
  const refresh = useCallback(async () => {
    const view = epoch.current, attempt = ++signing.current;
    try {
      const result = await sign({ token }) as { url: string; expiresAt: number };
      if (!result.url.startsWith('https://')) throw Error('invalid');
      if (view === epoch.current && attempt === signing.current) {
        if (video.current && Number.isFinite(video.current.duration)) resume.current = { at: video.current.currentTime, playing: !video.current.paused };
        setMedia(result); setMediaError('');
      }
    } catch { if (view === epoch.current && attempt === signing.current) setMediaError('Playback is unavailable. The link may have expired, or too many viewers requested playback. Try again in a minute.'); }
  }, [sign, token]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); invalidate(); };
  }, [invalidate]);
  useEffect(() => {
    if (!live) { epoch.current++; setMedia(undefined); return; }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 90_000);
    return () => { invalidate(); window.clearInterval(timer); };
  }, [live, refresh, invalidate]);
  const seek = (time: number) => {
    if (!video.current || !Number.isFinite(video.current.duration)) return;
    video.current.pause(); video.current.currentTime = Math.max(0, Math.min(time, video.current.duration)); setCurrent(video.current.currentTime);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!live || sending) return;
    const timestamp = Number(at), max = Math.min(data!.durationSec, duration || data!.durationSec);
    if (!at.trim() || !Number.isFinite(timestamp) || timestamp < 0 || timestamp > max) { setFeedbackError('Choose a timestamp within this video.'); return; }
    const payload = { token, name: name.trim(), text: text.trim(), at: timestamp };
    const content = JSON.stringify(payload);
    if (request.current?.content !== content) request.current = { content, id: crypto.randomUUID() };
    const view = epoch.current;
    setSending(true); setFeedbackError('');
    try {
      await add({ ...payload, requestId: request.current.id });
      if (view === epoch.current) { setText(''); request.current = undefined; }
    } catch (error) {
      if (view === epoch.current) {
        const code = (error as { data?: string }).data;
        setFeedbackError(code === 'COMMENT_RATE_LIMIT' ? 'This review is receiving many notes. Try again in a minute.' : code === 'REVIEW_FULL' ? 'This review has reached its 200-note limit. Ask the creator for a new review link.' : 'Your note could not be saved. Check that the link is still active and try again.');
      }
    } finally { if (view === epoch.current) setSending(false); }
  };
  if (data === undefined) return <main className="min-h-screen bg-paper p-12 text-ink" role="status">Loading review…</main>;
  if (!live) return <Unavailable />;
  return <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:px-8 ph-no-capture">
    <header className="mx-auto mb-8 flex max-w-7xl flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-muted">TakeOne review</p><h1 className="mt-1 font-display text-4xl font-extrabold">Watch. Leave a note.</h1></div><p className="text-sm text-muted">Expires {new Date(data.expiresAt).toLocaleString()}</p></header>
    <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
      <section aria-label="Review video" className="min-w-0">
        <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl bg-ink p-3">
          {media && media.expiresAt > now ? <video ref={video} src={media.url} controls playsInline preload="metadata" className="max-h-[70vh] w-full focus-visible:outline-cue" onTimeUpdate={e => setCurrent(e.currentTarget.currentTime)} onSeeked={e => setCurrent(e.currentTarget.currentTime)} onLoadedMetadata={e => {
            setDuration(e.currentTarget.duration);
            const previous = resume.current; resume.current = undefined;
            if (previous) {
              e.currentTarget.currentTime = Math.min(previous.at, e.currentTarget.duration);
              if (previous.playing) void e.currentTarget.play().catch(() => {});
            }
          }} onError={() => setMediaError('The video could not be loaded. Refresh playback to try again.')} /> : <p className="p-8 text-sm text-line" role="status">{mediaError || 'Preparing playback…'}</p>}
        </div>
        {mediaError && <p role="alert" className="mt-3 text-sm text-warn">{mediaError}</p>}
        <div className="mt-3 flex items-center justify-between gap-3"><span className="font-mono text-sm">Playhead {reviewTime(current)}</span><button type="button" onClick={() => void refresh()} className="text-sm font-semibold underline underline-offset-4">Refresh playback</button></div>
        <p className="mt-4 text-xs leading-relaxed text-muted">This link opens one video version. Notes and guest names are visible to everyone with the link. Guest names are not verified.</p>
      </section>
      <section aria-label="Review feedback" className="min-w-0">
        <h2 className="text-lg font-semibold">Feedback <span className="font-normal text-muted">{data.comments.length}/200</span></h2>
        <form onSubmit={submit} className={`${panel} my-4 space-y-3 p-4`}>
          <label className={`block ${label}`}>Your name<input required maxLength={60} value={name} onChange={e => setName(e.target.value)} className={`${field} mt-1 block w-full`} autoComplete="off" /></label>
          <div className="flex flex-wrap items-end gap-3"><label className={`min-w-0 flex-1 ${label}`}>Timestamp (seconds)<input required type="number" min={0} max={Math.min(data.durationSec, duration || data.durationSec)} step="0.001" value={at} onChange={e => setAt(e.target.value)} className={`${field} mt-1 block w-full`} /></label><button type="button" onClick={() => { const value = video.current?.currentTime ?? 0; seek(value); setAt(value.toFixed(3)); }} className={button('secondary', 'sm')}>Use playhead</button></div>
          <label className={`block ${label}`}>Your note<textarea required maxLength={1000} value={text} onChange={e => setText(e.target.value)} rows={3} className={`${field} mt-1 block w-full resize-y`} /></label>
          {feedbackError && <p role="alert" className="text-sm text-warn">{feedbackError}</p>}
          <button type="submit" disabled={sending || data.comments.length >= 200} className={`${button('primary')} w-full`}>{sending ? 'Saving note…' : 'Add timestamped note'}</button>
        </form>
        {data.comments.length ? <ReviewNotes notes={data.comments} onSeek={seek} /> : <p className="py-6 text-sm text-muted">No notes yet. Pause the video where you want to comment.</p>}
      </section>
    </div>
  </main>;
}
