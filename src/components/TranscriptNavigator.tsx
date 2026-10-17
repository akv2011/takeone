import { TextAlignLeft } from "@phosphor-icons/react";
import { HelpNote, PanelState } from "./StudioWorkspace";
import { useEffect, useMemo, useRef, useState } from 'react';
import { button, field, label, panel } from '../lib/ui';

type Cue = { start: number; end: number; text: string };
type Props = {
  jobId: string;
  accountKey: string;
  available: boolean;
  playbackDisabled: boolean;
  currentTime: number;
  duration?: number;
  loadCues(): Promise<Cue[]>;
  onSeek(seconds: number): void;
  onPreview(start: number, end: number, speed: number): void;
};
const PAGE_SIZE = 20;
const time = (seconds: number) => {
  const milliseconds = Math.round(seconds * 1000);
  return `${Math.floor(milliseconds / 60000).toString().padStart(2, '0')}:${((milliseconds % 60000) / 1000).toFixed(3).padStart(6, '0')}`;
};
function validatedCues(value: unknown): Cue[] {
  if (!Array.isArray(value) || value.length > 10000 || new TextEncoder().encode(JSON.stringify(value)).byteLength > 512 * 1024) throw Error('Invalid transcript');
  let previous = -1;
  return value.map(cue => {
    if (!cue || !Number.isFinite(cue.start) || !Number.isFinite(cue.end) || cue.start < 0 || cue.start < previous || cue.end <= cue.start || cue.end > 300.1 || typeof cue.text !== 'string' || !cue.text.trim() || cue.text.length > 4000) throw Error('Invalid transcript');
    previous = cue.start;
    return { start: cue.start, end: cue.end, text: cue.text };
  });
}
/** Saved captions only. Navigation never transcribes or submits an edit. */
export function TranscriptNavigator(props: Props) {
  return <section aria-label="Transcript navigation" className={`${panel} min-w-0 p-4`}>
    <h2 className="eyebrow flex items-center gap-2"><TextAlignLeft size={16} aria-hidden="true" />Transcript</h2>
    <div className="mt-2"><HelpNote>Find a phrase and jump to it. Search and playback are free. Caption wording stays unchanged.</HelpNote></div>
    {!props.available ? <div className="mt-3"><PanelState>This version has no saved transcript.</PanelState></div>
      : <SavedTranscript key={`${props.accountKey}:${props.jobId}`} {...props} />}
  </section>;
}
function SavedTranscript({ loadCues, currentTime, duration, playbackDisabled, onSeek, onPreview }: Props) {
  const [cues, setCues] = useState<Cue[]>();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (cues ?? []).map((cue, index) => ({ cue, index })).filter(({ cue }) => !needle || cue.text.toLocaleLowerCase().includes(needle));
  }, [cues, query]);
  const timingInvalid = useMemo(() => duration !== undefined && (!Number.isFinite(duration) || duration <= 0 || (cues ?? []).some(cue => cue.end > duration + 0.1)), [cues, duration]);
  const active = cues?.findIndex(cue => currentTime >= cue.start && currentTime < cue.end) ?? -1;
  async function load() {
    if (locked.current) return;
    locked.current = true; setLoading(true); setError(false); setCues(undefined);
    try { const result = validatedCues(await loadCues()); if (alive.current) { setCues(result); setPage(0); } }
    catch { if (alive.current) setError(true); }
    finally { if (alive.current) { setLoading(false); locked.current = false; } }
  }
  return <>
    {(!cues || timingInvalid) && <button type="button" disabled={loading} onClick={() => void load()} className={`${button('secondary', 'sm')} mt-3`}>{loading ? 'Loading transcript…' : timingInvalid ? 'Reload transcript · free' : 'Load transcript · free'}</button>}
    {loading && <PanelState loading>Loading saved transcript…</PanelState>}
    {error && <p role="alert" className="mt-2 text-[13px] text-warn">Could not load this transcript. Try again. No generation was used.</p>}
    {timingInvalid && <p role="alert" className="mt-2 text-[13px] text-warn">Saved cue timing does not match this video. Reload the transcript to try again. No generation was used.</p>}
    {cues && !timingInvalid && <>
      {cues.length === 0 ? <p className="mt-3 text-[13px] text-ink2">There are no saved speech cues in this version.</p> : <>
        <label className={`mt-3 block ${label}`}>Search transcript<input type="search" maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Find a word or phrase…" className={`${field} mt-1 block w-full min-w-0`} /></label>
        <p role="status" className="mt-2 text-[13px] text-ink2">{matches.length} {matches.length === 1 ? 'cue' : 'cues'}{query.trim() ? ' found' : ' saved'}{playbackDisabled ? ' · Video playback is unavailable.' : ''}</p>
        {!matches.length ? <p className="mt-3 text-sm">No matching phrases. Try another search.</p> : <>
          <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-label="Transcript cues">
            {matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ cue, index }) => <li key={index} className={`flex min-w-0 items-start gap-2 rounded-control border ${active === index ? 'border-transparent bg-surface shadow-[inset_2px_0_var(--grease)]' : 'border-transparent'}`}>
              <button type="button" disabled={playbackDisabled || (duration !== undefined && cue.start >= duration)} aria-current={active === index ? 'true' : undefined} onClick={() => onSeek(cue.start)} className="flex min-w-0 flex-1 items-start gap-3  p-2 text-left text-sm hover:bg-paper disabled:opacity-50">
                <span className="shrink-0 pt-0.5 font-mono text-[13px] text-ink2">{time(cue.start)}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{cue.text}</span>
              </button>
              <button type="button" disabled={playbackDisabled || (duration !== undefined && cue.start >= duration)} aria-label={`Preview cue ${index + 1}`} onClick={() => onPreview(cue.start, Math.min(cue.end, duration ?? cue.end), 1)} className={`${button("secondary", "sm")} m-1 shrink-0`}>Play</button>
            </li>)}
          </ol>
          {matches.length > PAGE_SIZE && <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
            <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className={button('secondary', 'sm')}>Previous cues</button>
            <span>Page {page + 1} of {Math.ceil(matches.length / PAGE_SIZE)}</span>
            <button type="button" disabled={(page + 1) * PAGE_SIZE >= matches.length} onClick={() => setPage(value => value + 1)} className={button('secondary', 'sm')}>Next cues</button>
          </div>}
        </>}
      </>}
    </>}
  </>;
}
