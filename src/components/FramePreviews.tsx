import { useEffect, useRef, useState } from 'react';
import { extractVideoFrames, type VideoFrame } from '../lib/videoFrames';

export function FramePreviews({ url, disabled, onSeek }: { url: string; disabled: boolean; onSeek(time: number): void }) {
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, []);
  const load = async () => {
    if (disabled || active.current) return;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(false);
    try {
      const result = await extractVideoFrames(url, AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]));
      if (!controller.signal.aborted) setFrames(result);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setBusy(false); if (active.current === controller) active.current = null; }
  };
  return <section aria-label="Video frame previews" className="mb-3 min-w-0 max-w-full">
    {frames.length === 0 && <button type="button" disabled={disabled || busy} onClick={() => void load()} className="rounded-lg border bg-white px-3 py-2 text-xs disabled:opacity-50">{busy ? 'Loading frames…' : 'Load frame previews · free'}</button>}
    {busy && <button type="button" onClick={() => { active.current?.abort(); active.current = null; setBusy(false); }} className="ml-2 text-xs underline">Cancel frame previews</button>}
    {error && <p role="status" className="mt-2 text-xs text-muted">Frame previews unavailable. You can still seek and trim using the player. Try loading again or refresh the video link.</p>}
    {frames.length > 0 && <><p className="mb-2 text-xs text-muted">Select a frame to seek. These are sampled previews; use the player to fine-tune your cut.</p><div className="flex gap-2 overflow-x-auto pb-2">{frames.map(frame => <button type="button" key={frame.time} disabled={disabled} aria-label={`Seek to ${frame.time.toFixed(3)} seconds`} onClick={() => onSeek(frame.time)} className="w-32 shrink-0 overflow-hidden rounded border border-black/10 bg-ink text-white disabled:opacity-50"><img src={frame.image} alt="" className="aspect-video w-full object-contain" /><span className="block py-1 font-mono text-[9px]">{frame.time.toFixed(1)}s</span></button>)}</div></>}
  </section>;
}
