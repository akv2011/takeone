import { useEffect, useMemo, useRef, useState } from 'react';

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
  return <section aria-label="Transcript navigation" className="mt-4 min-w-0 rounded-2xl border border-black/10 bg-white p-4">
    <h2 className="text-sm font-semibold">Transcript</h2>
    <p className="mt-1 text-xs text-muted">Find a phrase and jump to it. Searching and playback are free; caption wording stays unchanged.</p>
    {!props.available ? <p className="mt-3 text-xs text-muted">This version has no saved transcript. Videos with saved captions support transcript navigation.</p>
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
    {(!cues || timingInvalid) && <button type="button" disabled={loading} onClick={() => void load()} className="mt-3 rounded-lg border border-ink/15 px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50">{loading ? 'Loading transcript…' : timingInvalid ? 'Reload transcript · free' : 'Load transcript · free'}</button>}
    {error && <p role="alert" className="mt-2 text-xs text-red-600">Could not load this transcript. Try again. No generation was used.</p>}
    {timingInvalid && <p role="alert" className="mt-2 text-xs text-red-600">Saved cue timing does not match this video. Reload the transcript to try again. No generation was used.</p>}
    {cues && !timingInvalid && <>
      {cues.length === 0 ? <p className="mt-3 text-xs text-muted">There are no saved speech cues in this version.</p> : <>
        <label className="mt-3 block text-xs">Search transcript<input type="search" maxLength={200} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Find a word or phrase" className="mt-1 block w-full min-w-0 rounded-lg border border-black/15 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink" /></label>
        <p role="status" className="mt-2 text-xs text-muted">{matches.length} {matches.length === 1 ? 'cue' : 'cues'}{query.trim() ? ' found' : ' saved'}{playbackDisabled ? ' · Video playback is unavailable.' : ''}</p>
        {!matches.length ? <p className="mt-3 text-sm">No matching phrases. Try another search.</p> : <>
          <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto" aria-label="Transcript cues">
            {matches.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(({ cue, index }) => <li key={index} className={`flex min-w-0 items-start gap-2 rounded-lg border ${active === index ? 'border-ink/40 bg-cue/10' : 'border-transparent'}`}>
              <button type="button" disabled={playbackDisabled || (duration !== undefined && cue.start >= duration)} aria-current={active === index ? 'true' : undefined} onClick={() => onSeek(cue.start)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg p-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50">
                <span className="shrink-0 pt-0.5 font-mono text-[10px] text-muted">{time(cue.start)}</span><span className="min-w-0 break-words [overflow-wrap:anywhere]">{cue.text}</span>
              </button>
              <button type="button" disabled={playbackDisabled || (duration !== undefined && cue.start >= duration)} aria-label={`Preview cue ${index + 1}`} onClick={() => onPreview(cue.start, Math.min(cue.end, duration ?? cue.end), 1)} className="m-1 shrink-0 rounded-md border border-black/10 px-2 py-2 text-[10px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-50">Play</button>
            </li>)}
          </ol>
          {matches.length > PAGE_SIZE && <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)} className="rounded border px-2 py-2 disabled:opacity-40">Previous cues</button>
            <span>Page {page + 1} of {Math.ceil(matches.length / PAGE_SIZE)}</span>
            <button type="button" disabled={(page + 1) * PAGE_SIZE >= matches.length} onClick={() => setPage(value => value + 1)} className="rounded border px-2 py-2 disabled:opacity-40">Next cues</button>
          </div>}
        </>}
      </>}
    </>}
  </>;
}
