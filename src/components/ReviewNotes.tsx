import { motion, useReducedMotion } from "framer-motion";
import { Check } from "@phosphor-icons/react";
import { reviewTime } from "../lib/reviewTime";
import "./StudioWorkspace.css";
export interface ReviewNote { id: string; name: string; text: string; at: number; createdAt: number; resolved: boolean }
export function ReviewNotes({ notes, onSeek, onResolve, busy }: { notes: ReviewNote[]; onSeek(at: number): void; onResolve?(note: ReviewNote): void; busy?: boolean }) {
  const reduced = useReducedMotion();
  return <ol aria-label="Timestamped feedback" className="space-y-3">
    {[...notes].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt).map(note => <motion.li key={note.id} initial={reduced ? false : { opacity: 0, y: 12, rotate: -0.5 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ duration: 0.2 }} className="review-card">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={() => onSeek(note.at)} className="review-note-time hover:bg-paper2" aria-label={`Seek to ${reviewTime(note.at)}`}>{reviewTime(note.at)}</button>
        <span className="min-w-0 break-words font-medium">{note.name}</span><span className={`ml-auto font-mono text-[9px] uppercase tracking-wider ${note.resolved ? 'text-go' : 'text-ink2'}`}>{note.resolved && <Check size={12} className="mr-1 inline" aria-hidden="true" />}{note.resolved ? 'Resolved' : 'Open'}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{note.text}</p>
      {onResolve && <button type="button" disabled={busy} onClick={() => onResolve(note)} className="mt-3 text-xs font-medium underline underline-offset-4 disabled:opacity-50">{note.resolved ? 'Reopen note' : 'Mark resolved'}</button>}
    </motion.li>)}
  </ol>;
}
