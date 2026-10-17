import { HelpNote, PanelState } from "./StudioWorkspace";
import { useAction, useQuery } from 'convex/react';
import { useState } from 'react';
import { api } from '../lib/convexApi';
import { reviewTime } from '../lib/reviewTime';
import { button } from '../lib/ui';
type Sentiment = 'positive' | 'mixed' | 'negative';
interface FeedbackSummary { sentiment: Sentiment; why: string; themes: string[]; notes: Array<{ id: string; at: number; sentiment: Sentiment }>; noteCount: number; createdAt: number }
const sentiments: Record<Sentiment, { label: string; text: string; mark: string }> = {
  positive: { label: 'Positive', text: 'text-go', mark: 'bg-go' },
  mixed: { label: 'Mixed', text: 'text-wait', mark: 'bg-wait' },
  negative: { label: 'Negative', text: 'text-warn', mark: 'bg-warn' },
};
const errors: Record<string, string> = {
  SUMMARY_RATE_LIMIT: 'Each version gets 3 summaries per hour. Try again later.',
  SUMMARY_NEEDS_NOTES: 'A summary needs at least 3 notes on this version.',
  SUMMARY_STALE: 'Notes changed while Gemini read them. Summarize again.',
};
const notesText = (count: number) => `${count} ${count === 1 ? 'note' : 'notes'}`;
export function FeedbackInsights({ jobId, noteCount, duration, onSeek }: { jobId: string; noteCount: number; duration?: number; onSeek(at: number): void }) {
  const result = useQuery(api.reviews.summary, { jobId }) as FeedbackSummary | null | undefined;
  const summarize = useAction(api.reviews.summarize);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { await summarize({ jobId }); } catch (e) { setError(errors[(e as { data?: string }).data ?? ''] ?? 'Gemini could not summarize these notes. Try again.'); } finally { setBusy(false); }
  };
  const length = duration && Number.isFinite(duration) ? duration : 0;
  const missing = result ? noteCount - result.noteCount : 0;
  return <section aria-label="Feedback summary" className="space-y-3 border-t border-line pt-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={busy || noteCount < 3} onClick={() => void run()} className={button('secondary', 'sm')}>{busy ? 'Summarizing feedback…' : 'Summarize feedback'}</button>
      {noteCount < 3 && <p className="text-xs text-ink2">This version has {notesText(noteCount)}. A summary needs at least 3.</p>}
    </div>
    {error && <p role="alert" className="text-sm text-warn">{error}</p>}
    {result === undefined && <PanelState loading>Loading feedback summary…</PanelState>}
    {result === null && <p className="text-xs text-ink2">A verdict appears after you summarize the notes.</p>}
    {result && <div className="space-y-3">
      <p className="break-words text-sm"><span className={`stamp mr-3 !px-2 !py-1 !text-[9px] ${sentiments[result.sentiment].text}`}>{sentiments[result.sentiment].label} overall.</span> {result.why}</p>
      <ul aria-label="Themes" className="flex flex-wrap gap-2">{result.themes.map((theme, index) => <li key={index} className="break-words  border border-line px-2 py-1 text-xs">{theme}</li>)}</ul>
      {length > 0 && <div>
        <div className=" border border-line bg-paper"><div role="group" aria-label="Note sentiment over the video" className="relative mx-3 h-8">
          {[...result.notes].sort((a, b) => a.at - b.at).map(note => {
            const name = `${sentiments[note.sentiment].label} note at ${reviewTime(note.at)}`;
            return <button key={note.id} type="button" onClick={() => onSeek(note.at)} aria-label={name} title={name} style={{ left: `${Math.min(100, note.at * 100 / length)}%` }} className="absolute top-1 flex h-6 w-6 -translate-x-1/2 justify-center "><span aria-hidden="true" className={`h-full w-3  border border-ink ${sentiments[note.sentiment].mark}`} /></button>;
          })}
        </div></div>
        <ul aria-label="Sentiment colors" className="mt-2 flex flex-wrap gap-4 text-xs text-ink2">{(Object.keys(sentiments) as Sentiment[]).map(key => <li key={key} className="flex items-center gap-1.5"><span aria-hidden="true" className={`h-3 w-3  border border-ink ${sentiments[key].mark}`} />{sentiments[key].label}</li>)}</ul>
      </div>}
      <p className="font-mono text-[10px] text-ink2">{notesText(result.noteCount)} · {new Date(result.createdAt).toLocaleString()}</p><HelpNote>{`Gemini generated this summary from ${notesText(result.noteCount)} on ${new Date(result.createdAt).toLocaleString()}. It can misread tone or sarcasm, so check the notes before you act on it.`}</HelpNote>
      {missing > 0 && <p className="text-xs text-ink2">{missing === 1 ? '1 note is' : `${missing} notes are`} not in this summary. Summarize again to include new notes.</p>}
    </div>}
  </section>;
}
