import { reviewTime } from "../lib/reviewTime";
export interface ReviewNote { id: string; name: string; text: string; at: number; createdAt: number; resolved: boolean }
export function ReviewNotes({ notes, onSeek, onResolve, busy }: { notes: ReviewNote[]; onSeek(at: number): void; onResolve?(note: ReviewNote): void; busy?: boolean }) {
  return <ol aria-label="Timestamped feedback" className="space-y-3">
    {[...notes].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt).map(note => <li key={note.id} className="rounded-xl border border-black/10 bg-white p-4 text-ink">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => onSeek(note.at)} className="rounded-md bg-cue/10 px-2 py-1 font-mono font-bold text-cueInk focus-visible:outline-2" aria-label={`Seek to ${reviewTime(note.at)}`}>{reviewTime(note.at)}</button>
        <span className="font-semibold break-words">{note.name}</span><span className="text-muted">{note.resolved ? 'Resolved' : 'Open'}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">{note.text}</p>
      {onResolve && <button type="button" disabled={busy} onClick={() => onResolve(note)} className="mt-3 text-xs font-semibold underline disabled:opacity-50">{note.resolved ? 'Reopen note' : 'Mark resolved'}</button>}
    </li>)}
  </ol>;
}
